# Compare These Texts 0.35.6 — комплект для магазина

Подготовлено 20 октября 2026. Это кандидат из PR #11: комплект не означает
слияние, публикацию сайта, отправку на модерацию или наличие действующей
карточки Chrome Web Store.

## Что куда загружать

Распакуйте `ctt-0.35.6-store-kit.zip`. В поле загрузки расширения выбирайте
только вложенный `ctt-chrome-0.35.6.zip`, где `manifest.json` лежит в корне.
Весь комплект материалов и архив Firefox в это поле не подходят.

| Поле / назначение | Файл в комплекте |
| --- | --- |
| Расширение Chrome / Edge для ручной проверки | `ctt-chrome-0.35.6.zip` |
| Отдельная сборка Firefox для временной установки | `ctt-firefox-0.35.6.zip` |
| Названия и краткие описания — 22 локали | `localizations.json` |
| Полное описание — английский | `descriptions/en.txt` |
| Полные описания — остальные языки | `descriptions/<locale>.txt` |
| Сравнение документов — 1280×800 | `screenshot-documents-1280x800.png` |
| Сравнение таблиц — 1280×800 | `screenshot-tables-1280x800.png` |
| Welcome page — 1280×800 | `screenshot-welcome-1280x800.png` |
| Малое промо — 440×280 | `promo-440x280.png` |
| Дополнительное промо — 1400×560 | `promo-1400x560.png` |
| Иконка карточки — 128×128 | `icons/icon-store-128.png` |
| Иконки расширения — 16/32/48/64 | `icons/` |
| Ключевые слова и исторические оценки | `KEYWORDS.md` |
| Проверка состава по буткемпу | `BOOTCAMP-CHECKLIST-RU.md` |
| Порядок добавления локалей | `LOCALIZATION-RU.md`, `CWS-LOCALIZATIONS.md` |

Для локальной проверки Chrome распакуйте установочный ZIP в отдельную папку,
откройте `chrome://extensions`, включите Developer mode и выберите Load unpacked.
В Firefox временно загрузите `manifest.json` распакованной Firefox-сборки через
`about:debugging` → This Firefox → Load Temporary Add-on.

## Карточка по умолчанию

**Name**

Compare These Texts — Compare & Edit BETA

**Short description** — 122 символа

Compare Word, PDF, text and Excel files side by side. Edit differences and save the result. Works locally in your browser.

**Full description**

Скопировать `descriptions/en.txt` целиком. Это согласованный текст для текущего
набора функций. Для остальных локалей взять соответствующие TXT; не переводить
интерфейс приложения в описании как уже готовую функцию.

- Homepage: https://comparethesetexts.com/
- Support: https://comparethesetexts.com/support/
- Privacy policy: https://comparethesetexts.com/privacy/
- Language: English; дополнительные карточки — по `LOCALIZATION-RU.md`.
- Category: Productivity, если такое значение доступно в текущем кабинете.

Если карточка CTT уже существует, обновляйте её, сохраняя идентификатор
расширения. Для новой beta можно выбрать Unlisted и сначала проверить установку
по прямой ссылке. Это рекомендация, настройка ещё не применена. Видимость
Unlisted не отменяет проверку магазина.

## Privacy practices — готовые формулировки

**Single purpose description**

Compare and edit supported text documents and spreadsheets locally, review
differences between two versions, and download or print the result.

**Remote code**

No, I am not using remote code.

**Пояснение к данным и локальной обработке**

The extension processes only files and text that the user explicitly chooses
to open, paste or edit. Document names, contents, tables and supported images
are processed locally using bundled code. They are not uploaded to the
developer, a comparison server or an external AI service. The extension does
not collect browsing history, analytics or diagnostic telemetry and does not
read other tabs or automatically access files on the computer.

The app can save comparison and single-document drafts separately in local
browser storage, including original files, edits, supported history and view
settings. Saved work expires after seven days without opening or saving it;
expired work is removed when the app is next opened. Users can delete saved
work in the app. Website and extension drafts are separate and do not sync.
Downloads remain on the user's device until the user deletes them.

Opening an external website or support link is a user action. GitHub receives
feedback only if the user chooses to submit it there. There is no account,
payment or external service required for document processing.

**Permissions**

Manifest не запрашивает API permissions или host permissions. Не добавляйте
разрешения ради заполнения формы. Welcome page и открытие собственной вкладки
не требуют доступа к чужим страницам или документам.

**Data usage**

Сверьте определения полей текущей формы с этим описанием и публичной privacy
policy. Документы обрабатываются и могут сохраняться локально; отсутствие
передачи разработчику не означает отсутствие локальной обработки. Не указывайте
«данные никогда не сохраняются»: у CTT есть сохранённые черновики.

## Reviewer instructions

No account, login, credentials, payment, API key or external AI service is
required. The editor and welcome page are in English.

1. Install the extension. Its local welcome page opens on first installation.
   Select Open comparison. On updates, open Getting started from the editor
   to revisit the guide.
2. On the home screen, select Try document editing. Review the synthetic
   documents side by side, select a highlighted change or use Next difference,
   and make a supported edit. Use Undo, then download the revised document.
3. Select CSV / Excel example on the home screen to inspect a synthetic table
   comparison. Review changed or missing rows and the selected comparison
   fields; edit a supported value and download the result.
4. Optionally open a small supported document in Edit & export. For a PDF,
   use a file with selectable text. Printed blank lines can accept text;
   interactive PDF form fields, scans and OCR are outside this workflow.
5. Wait for Saved in this browser before closing. Reopen and use the resume
   control to verify a saved draft. Use Delete saved work to remove it.
6. Repeat local comparison with the network offline. Website or GitHub links
   are optional external navigation and are not needed to process files.

Files are limited to 2 MiB each. Two-file spreadsheet comparison needs a single
header row, no merged cells and values instead of formulas. Images, formatting
and legal meaning are not compared. Word/PDF appearance can vary by document;
preview the result before relying on it. Some helper answers and draft emails
refer to the original comparison: reopen the revised download to compare again.

## Финальная ручная проверка

- Проверить установку именно Chrome ZIP и кнопки welcome page.
- Убедиться, что загружаемые изображения показывают эту версию и синтетические
  данные, а полные описания вставлены в правильные языковые карточки.
- Сверить privacy policy и ответы формы с фактической локальной обработкой
  и сохранением черновиков.
- Проверить карточку в предпросмотре. Отправка на модерацию выполняется отдельно.

Официальные инструкции:
https://developer.chrome.com/docs/webstore/cws-dashboard-listing
https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
https://developer.chrome.com/docs/webstore/cws-dashboard-distribution
