/** Bounded fetching of user-authorized ChatGPT file references. No persistence. */
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const ATTACHMENT_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 2;
const GENERIC_MIMES = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/zip', 'application/x-zip-compressed']);
const MIME_FORMATS = new Map([
  ['text/plain', 'txt'],
  ['application/pdf', 'pdf'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
]);

export class AttachmentError extends Error {
  constructor(message, code = 'INVALID_ATTACHMENT') {
    super(message);
    this.name = 'AttachmentError';
    this.code = code;
  }
}
const fail = (message, code) => { throw new AttachmentError(message, code); };

function fileObject(file) {
  if (!file || typeof file !== 'object' || Array.isArray(file) || Object.keys(file).some(key => !['download_url', 'file_id', 'mime_type', 'file_name'].includes(key))) fail('Передайте файл, прикреплённый к этому чату.');
  if (typeof file.download_url !== 'string' || !file.download_url || file.download_url.length > 16384 || file.download_url.trim() !== file.download_url) fail('Ссылка на вложение отсутствует или некорректна. Прикрепите файл заново.');
  if (typeof file.file_id !== 'string' || !file.file_id || file.file_id.length > 512 || /\s|[\u0000-\u001f\u007f]/u.test(file.file_id)) fail('Идентификатор вложения отсутствует или некорректен. Прикрепите файл заново.');
  if (file.mime_type !== undefined && (typeof file.mime_type !== 'string' || file.mime_type.length > 200)) fail('Некорректный тип вложения.');
  if (file.file_name !== undefined && (typeof file.file_name !== 'string' || !file.file_name.trim() || [...file.file_name].length > 255 || /[\\/\u0000-\u001f\u007f]/u.test(file.file_name))) fail('Имя вложения должно содержать от 1 до 255 символов без пути и управляющих символов.');
}

/** Every initial URL and redirect is checked before any request is issued. */
function allowedUrl(value, base) {
  let url;
  try { url = new URL(value, base); } catch { fail('Некорректная ссылка на вложение.', 'INVALID_URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) fail('Для вложений поддерживаются только защищённые ссылки ChatGPT.', 'INVALID_URL');
  const host = url.hostname.toLowerCase();
  const contentHost = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+oaiusercontent\.com$/u.test(host);
  const fileHost = host === 'files.openai.com';
  // These are the OpenAI file-storage prefixes advertised by this runtime.
  // Do not broaden this to arbitrary Azure accounts or arbitrary HTTPS URLs.
  const storageHost = /^(?:oaisdmntpr|oaisdsorpr|sdmntpr)[a-z0-9]+\.blob\.core\.windows\.net$/u.test(host);
  const chatFile = host === 'chatgpt.com' && (url.pathname === '/backend-api/estuary/content' || url.pathname.startsWith('/backend-api/estuary/content/'));
  if (!contentHost && !fileHost && !storageHost && !chatFile) fail('Этот адрес вложения пока не поддерживается. Прикрепите файл через ChatGPT или откройте его кнопкой выбора файла в плагине.', 'UNSUPPORTED_HOST');
  return url;
}

function mimeFormat(value) {
  const mime = (value || '').split(';', 1)[0].trim().toLowerCase();
  if (GENERIC_MIMES.has(mime)) return null;
  const format = MIME_FORMATS.get(mime);
  if (!format) fail('Поддерживаются только TXT, DOCX и PDF с текстовым слоем.', 'UNSUPPORTED_TYPE');
  return format;
}

function namedFormat(name) {
  if (!name) return null;
  const extension = /\.([^.]+)$/u.exec(name)?.[1].toLowerCase();
  if (!extension) return null;
  if (!['txt', 'docx', 'pdf'].includes(extension)) fail('Поддерживаются только файлы .txt, .docx и .pdf.', 'UNSUPPORTED_TYPE');
  return extension;
}

function detectFormat(bytes, docxHint) {
  const prefix = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  if (/%PDF-\d\.\d/u.test(prefix)) return 'pdf';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    // ZIP alone is ambiguous. Without a DOCX name/MIME require both package
    // entry names. The existing DOCX importer performs full ZIP/XML validation.
    if (!docxHint) {
      const archive = new TextDecoder('latin1').decode(bytes);
      if (!archive.includes('[Content_Types].xml') || !archive.includes('word/document.xml')) fail('Не удалось определить DOCX внутри архива. Прикрепите исходный файл .docx.', 'UNSUPPORTED_TYPE');
    }
    return 'docx';
  }
  let text;
  try { text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes); }
  catch { fail('Файл не соответствует TXT, DOCX или PDF. Для TXT требуется UTF-8.', 'TYPE_MISMATCH'); }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) fail('Вложение содержит двоичные данные вместо поддерживаемого документа.', 'TYPE_MISMATCH');
  return 'txt';
}

function base64(bytes) {
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 16384) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 16384)));
  return btoa(chunks.join(''));
}

async function readBounded(response, signal) {
  const length = response.headers.get('Content-Length');
  if (length && /^\d+$/u.test(length) && Number(length) > MAX_ATTACHMENT_BYTES) {
    await response.body?.cancel().catch(() => {});
    fail('Размер вложения превышает 2 МиБ. Загрузите меньший документ.', 'TOO_LARGE');
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader(), chunks = [];
  let total = 0;
  const cancelled = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancelled, {once: true});
  try {
    while (true) {
      if (signal.aborted) fail('Загрузка вложения заняла слишком много времени. Попробуйте ещё раз.', 'DOWNLOAD_TIMEOUT');
      const {value, done} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_ATTACHMENT_BYTES) {
        await reader.cancel().catch(() => {});
        fail('Размер вложения превышает 2 МиБ. Загрузите меньший документ.', 'TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally { signal.removeEventListener('abort', cancelled); reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

/** File URLs are host-scoped, short lived, and never returned or logged. */
export async function fetchAttachment(file, {fetchImpl = fetch} = {}) {
  fileObject(file);
  const initial = allowedUrl(file.download_url);
  const nameType = namedFormat(file.file_name), declaredType = mimeFormat(file.mime_type);
  if (nameType && declaredType && nameType !== declaredType) fail('Расширение и тип вложения не совпадают. Прикрепите исходный документ заново.', 'TYPE_MISMATCH');
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new AttachmentError('Загрузка вложения заняла слишком много времени. Попробуйте ещё раз.', 'DOWNLOAD_TIMEOUT'));
      controller.abort();
    }, ATTACHMENT_TIMEOUT_MS);
  });
  const download = async () => {
    let url = initial;
    for (let redirects = 0;; redirects++) {
      const response = await fetchImpl(url.href, {
        method: 'GET', redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer',
        signal: controller.signal,
        headers: {Accept: 'application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/plain, application/octet-stream'},
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel().catch(() => {});
        if (redirects >= MAX_REDIRECTS) fail('Ссылка на вложение содержит слишком много перенаправлений. Прикрепите файл заново.', 'REDIRECT_LIMIT');
        const location = response.headers.get('Location');
        if (!location) fail('Не удалось получить вложение. Прикрепите файл заново.', 'DOWNLOAD_FAILED');
        url = allowedUrl(location, url);
        continue;
      }
      if ([401, 403, 404, 410].includes(response.status)) {
        await response.body?.cancel().catch(() => {});
        fail('Ссылка на вложение истекла или файл недоступен. Прикрепите документ к сообщению заново.', 'EXPIRED_FILE');
      }
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => {});
        fail('Не удалось загрузить вложение. Попробуйте ещё раз.', 'DOWNLOAD_FAILED');
      }
      let responseType;
      try { responseType = mimeFormat(response.headers.get('Content-Type')); }
      catch (error) { await response.body?.cancel().catch(() => {}); throw error; }
      const bytes = await readBounded(response, controller.signal);
      const format = detectFormat(bytes, [nameType, declaredType, responseType].includes('docx'));
      if ([nameType, declaredType, responseType].some(value => value && value !== format)) fail('Содержимое вложения не соответствует его расширению или типу. Прикрепите исходный документ заново.', 'TYPE_MISMATCH');
      const name = file.file_name ? (nameType ? file.file_name : `${file.file_name}.${format}`) : `attachment.${format}`;
      if ([...name].length > 255) fail('Имя документа слишком длинное. Сократите его и прикрепите файл заново.');
      return {name, data: base64(bytes)};
    }
  };
  try { return await Promise.race([download(), timeout]); }
  catch (error) {
    if (error instanceof AttachmentError) throw error;
    if (controller.signal.aborted) fail('Загрузка вложения заняла слишком много времени. Попробуйте ещё раз.', 'DOWNLOAD_TIMEOUT');
    // Fetch errors may contain signed URLs. Never propagate their message/cause.
    fail('Не удалось загрузить вложение. Попробуйте прикрепить файл заново.', 'DOWNLOAD_FAILED');
  } finally { clearTimeout(timer); controller.abort(); }
}
