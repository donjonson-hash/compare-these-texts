"""Use the worker already bundled in the Firefox offline PDF.js reader."""
from hashlib import sha256


def use_bundled_pdf_reader(files):
    name = "pdf-reader-vendor.mjs"
    reader = files[name]
    if sha256(reader).hexdigest() != "d325ee650371101ecad33a941117b3b28965aa377b48c5bdf55815c5fefb9701":
        raise ValueError("Review Firefox offline loader changes for this PDF.js version")

    # The application runs its own worker. PDF.js supplies an in-process
    # worker handler in this same ESM file. Use it without consulting a URL.
    def replace_once(source, before, after):
        if source.count(before) != 1:
            raise ValueError("Unexpected PDF.js reader structure: " + before[:60].decode())
        return source.replace(before, after)

    worker_start = reader.index(b'#c(){if(n.#r||n.#f)')
    worker_end = reader.index(b'#u(){n.#r||', worker_start)
    reader = reader[:worker_start] + reader[worker_end:]
    reader = replace_once(reader, b'}else this.#c()}get promise()', b'}else this.#u()}get promise()')

    # Remove the now-unused upstream logic for constructing a CDN worker.
    cdn_start = reader.index(b',this._isSameOrigin=(e,t)=>')
    cdn_end = reader.index(b'}constructor({name:e=null,port:t=null', cdn_start)
    reader = reader[:cdn_start] + reader[cdn_end:]
    reader = replace_once(reader,
        b'(async()=>this.#f?this.#f:(await import(this.workerSrc)).WorkerMessageHandler)()',
        b'Promise.resolve(Kl)')
    if b'globalThis.pdfjsWorker={WorkerMessageHandler:Kl}' not in reader:
        raise ValueError("The bundled PDF.js worker handler is missing")

    # The extension does not ship the optional PDF.js no-WASM codecs.
    # Preserve the upstream result for a missing codec (null), which the
    # individual decoder handles. Ordinary image decoders stay in the bundle.
    reader = replace_once(reader,
        b'async#o(e){let t=null;try{t=(await import(`${n.#i}${this._noWasmFilename}`)).default()}catch(s){R(`#getJsModule: ${s}`)}e(t)}',
        b'#o(e){e(null)}')
    files[name] = reader
