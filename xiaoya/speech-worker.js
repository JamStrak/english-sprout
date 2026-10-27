// The worker receives verified, immutable assets, never a target phrase.
let recognizer = null;
let busy = false;
const objectURLs = [];
const nativeFetch = globalThis.fetch.bind(globalThis);

// Older WebKit releases can run WASM but lack Array.prototype.at.
for (const prototype of [Array.prototype, Object.getPrototypeOf(Float32Array.prototype)]) {
  if (!prototype.at) Object.defineProperty(prototype, 'at', {value(index) {
    const offset = Math.trunc(index) || 0;
    return this[offset < 0 ? this.length + offset : offset];
  }, configurable:true, writable:true});
}

async function initialize({base, assets}) {
  const origin = new URL(base).origin;
  const available = new Map(assets.map(asset => [asset.url, asset]));
  const response = input => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, base);
    if (url.origin !== origin) throw new Error('Speech assets must stay on this device origin.');
    const asset = available.get(url.href);
    return asset ? new Response(asset.blob, {headers:{'Content-Type':asset.type, 'Content-Length':String(asset.blob.size)}}) : new Response(null, {status:404});
  };
  // No network fallback: the only fetches allowed here are our verified bytes
  // and blob URLs created below. A library default cannot contact a CDN.
  globalThis.fetch = (input, options) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    return url.startsWith('blob:') && objectURLs.includes(url) ? nativeFetch(input, options) : Promise.resolve(response(input));
  };
  const blobURL = (path, type) => {
    const asset = available.get(new URL(path, base).href);
    if (!asset) throw new Error('A verified speech asset is missing.');
    const url = URL.createObjectURL(asset.blob.slice(0, asset.blob.size, type));
    objectURLs.push(url);
    return url;
  };
  const library = blobURL('runtime/transformers-4.3.1.min.js', 'text/javascript');
  const runtime = blobURL('runtime/ort-wasm-simd-threaded.mjs', 'text/javascript');
  const wasm = blobURL('runtime/ort-wasm-simd-threaded.wasm', 'application/wasm');
  const {pipeline, env} = await import(library);
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  // Transformers 4.3.1 checks processor existence only for path-style local
  // models when remote models are disabled. An absolute HTTP base skips that
  // check and silently constructs ASR without its feature extractor.
  env.localModelPath = new URL(base).pathname;
  env.useBrowserCache = false;
  env.useCustomCache = false;
  env.useWasmCache = false;
  env.fetch = async input => response(input);
  env.backends.onnx.wasm.wasmPaths = {mjs:runtime, wasm};
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
  recognizer = await pipeline('automatic-speech-recognition', 'model', {
    device:'wasm', dtype:{encoder_model:'fp32', decoder_model_merged:'q8'},
  });
}

self.onmessage = async ({data}) => {
  const {id, type} = data || {};
  try {
    if (type === 'init') {
      if (recognizer || busy) throw new Error('Speech worker is already starting.');
      busy = true;
      try { await initialize(data); } finally { busy = false; }
      self.postMessage({id, type:'ready'});
      return;
    }
    if (type !== 'transcribe' || !recognizer || busy) throw new Error('Speech worker is not ready.');
    const samples = data.samples;
    if (!(samples instanceof Float32Array) || !samples.length || samples.length > 20 * 16000) throw new Error('Invalid recording.');
    busy = true;
    try {
      const result = await recognizer(samples, {max_new_tokens:48, return_timestamps:false, do_sample:false});
      self.postMessage({id, type:'result', heard:typeof result.text === 'string' ? result.text.trim() : ''});
    } finally { busy = false; }
  } catch {
    self.postMessage({id, type:'error', message:type === 'init' ? '这个浏览器暂时没有打开小耳朵，请再试一次。' : '这次没有听清，可以听一遍示范后再试。'});
  }
};
