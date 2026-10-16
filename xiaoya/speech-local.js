import {downloadSpeechAsset} from '../src/speech-download.js';
import {prepareSamples} from './speech-signal.js';
import {SPEECH_ASSETS, SPEECH_BASE, SPEECH_BYTES, SPEECH_ENGINE} from './speech-assets.js';

const DOWNLOAD_CACHE = 'english-sprout-speech-v1';
const assetRoot = () => new URL(SPEECH_BASE, document.baseURI).href;
const assetURL = asset => new URL(asset.path, document.baseURI).href;
const verified = new Map();
const listeners = new Set();
const pending = new Map();
let worker = null, ready = false, preparing = null, controller = null;
let sequence = 0, generation = 0, latestStatus = '';
const abortError = () => new DOMException('已取消这次跟读。', 'AbortError');
const check = signal => { if (signal?.aborted) throw abortError(); };
function status(message) {
  latestStatus = message;
  for (const listener of listeners) try { listener(message); } catch {}
}

function stopWorker(error = abortError()) {
  worker?.terminate(); worker = null; ready = false;
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
  pending.clear();
}
export function disposeSpeechAssessment() {
  generation++;
  controller?.abort(); controller = null; preparing = null;
  stopWorker(); latestStatus = '';
}

function waitFor(work, {signal, timeout = 120000, cancelOnTimeout = true} = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel); fn(value);
    };
    const cancel = () => { finish(reject, abortError()); disposeSpeechAssessment(); };
    const timer = setTimeout(() => {
      finish(reject, new Error('小耳朵还在准备，可以稍后再试。'));
      if (cancelOnTimeout) disposeSpeechAssessment();
    }, timeout);
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener('abort', cancel, {once:true});
    Promise.resolve(work).then(value => finish(resolve, value), error => finish(reject, error));
  });
}

function request(type, payload = {}, transfer = []) {
  return new Promise((resolve, reject) => {
    if (!worker) { reject(new Error('小耳朵还没有准备好。')); return; }
    const id = ++sequence;
    const timer = setTimeout(() => stopWorker(new Error('小耳朵暂时没有回应，请再试一次。')), type === 'init' ? 120000 : 60000);
    pending.set(id, {resolve, reject, timer});
    try { worker.postMessage({id, type, ...payload}, transfer); }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
}

async function eraseCorruptAsset(url) {
  try {
    const cache = await caches.open(DOWNLOAD_CACHE);
    const keys = await cache.keys();
    await Promise.all(keys.filter(key => key.url === url || key.url.startsWith(`${url}?sprout-`)).map(key => cache.delete(key)));
  } catch {}
}

async function downloadVerified(asset, signal, completed) {
  const url = assetURL(asset);
  if (verified.has(url)) return verified.get(url);
  for (let attempt = 0; attempt < 2; attempt++) {
    check(signal);
    const response = await downloadSpeechAsset(url, {
      signal, expectedBytes:asset.bytes, useRanges:asset.ranges,
      onProgress:({loaded}) => {
        const bytes = Math.min(SPEECH_BYTES, completed + loaded);
        status(`小耳朵下载中 ${Math.min(99, Math.floor(bytes / SPEECH_BYTES * 100))}% · ${(bytes / 1000000).toFixed(1)}/${(SPEECH_BYTES / 1000000).toFixed(1)}MB`);
      },
      onState:value => { if (value.phase === 'retrying') status('连接慢，正在接着下载小耳朵…'); },
    });
    const blob = await response.blob(); check(signal);
    status('正在检查小耳朵的文件…');
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()); check(signal);
    const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    if (hash === asset.sha256 && blob.size === asset.bytes) {
      const result = {url, blob, type:asset.type}; verified.set(url, result); return result;
    }
    await eraseCorruptAsset(url); check(signal);
  }
  throw new Error('小耳朵的文件不完整，请重新准备。');
}

export async function prepareSpeech({onStatus = () => {}, background = false, signal} = {}) {
  check(signal);
  if (ready) { onStatus('小耳朵准备好了'); return {ready:true, engine:SPEECH_ENGINE}; }
  if (!globalThis.WebAssembly || !globalThis.Worker || !globalThis.crypto?.subtle || !(globalThis.AudioContext || globalThis.webkitAudioContext)) {
    throw new Error('这个浏览器暂时不能听懂跟读，可以继续听示范或照顾花园。');
  }
  listeners.add(onStatus);
  try { onStatus(latestStatus || `首次准备小耳朵约${Math.round(SPEECH_BYTES / 1000000)}MB，之后可在这台设备离线使用。`); } catch {}
  const current = generation;
  if (!preparing) {
    const active = new AbortController(); controller = active;
    const task = (async () => {
      const assets = []; let completed = 0;
      for (const asset of SPEECH_ASSETS) {
        assets.push(await downloadVerified(asset, active.signal, completed));
        completed += asset.bytes;
      }
      check(active.signal); if (current !== generation) throw abortError();
      status('下载完成，正在打开小耳朵…');
      worker = new Worker(new URL('./speech-worker.js', import.meta.url), {type:'module'});
      const activeWorker = worker;
      worker.onmessage = ({data}) => {
        if (worker !== activeWorker) return;
        const item = pending.get(data.id); if (!item) return;
        pending.delete(data.id); clearTimeout(item.timer);
        if (data.type === 'error') item.reject(new Error(data.message)); else item.resolve(data);
      };
      worker.onerror = () => {
        if (worker === activeWorker) stopWorker(new Error('小耳朵暂时没有打开，请再试一次。'));
      };
      await request('init', {base:assetRoot(), assets});
      check(active.signal); if (current !== generation) throw abortError();
      ready = true; status('小耳朵准备好了');
      return {ready:true, engine:SPEECH_ENGINE};
    })();
    preparing = task;
    task.catch(() => { if (preparing === task) stopWorker(); }).finally(() => {
      if (preparing === task) { preparing = null; controller = null; }
    });
  }
  try { return await waitFor(preparing, {signal, timeout:background ? 1800000 : 15000, cancelOnTimeout:background}); }
  finally { listeners.delete(onStatus); }
}

async function decodeRecording(url, signal) {
  if (typeof url !== 'string' || !url.startsWith('blob:') || new URL(url).origin !== location.origin) throw new Error('这次录音已经结束，请再录一次。');
  const response = await fetch(url, {signal});
  const bytes = await response.arrayBuffer(); check(signal);
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  const context = new Context();
  try { return await new Promise((resolve, reject) => context.decodeAudioData(bytes, resolve, reject)); }
  catch { throw new Error('这次录音没有听清，听一遍示范后再试试。'); }
  finally { await context.close().catch(() => {}); }
}

export async function assessRecording(url, _expected, {signal, onStatus = () => {}} = {}) {
  check(signal);
  const current = generation;
  // Decode and reject unusable audio before a first model download.
  const buffer = await waitFor(decodeRecording(url, signal), {signal, timeout:15000});
  check(signal); if (current !== generation) throw abortError();
  if (!buffer.length || buffer.duration > 20) throw new Error('请一次说一句，再试一次。');
  const {samples, quality} = prepareSamples(buffer);
  if (!quality.hasVoice) return {heard:'', engine:SPEECH_ENGINE, quality};
  await prepareSpeech({signal, onStatus});
  check(signal); if (current !== generation) throw abortError();
  onStatus('小耳朵正在听你说…');
  const result = await waitFor(request('transcribe', {samples}, [samples.buffer]), {signal, timeout:60000});
  check(signal); if (current !== generation) throw abortError();
  return {heard:result.heard, engine:SPEECH_ENGINE, quality};
}
