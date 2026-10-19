// Static voices are prepared locally as a complete pack, never generated while
// a child is playing. No recording or learning data enters this preparation.
const build = document.querySelector('meta[name="xiaoya-build"]')?.content;
const listeners = new Set();
let status = {state:'preparing', done:0, total:0};
let registration = null, starting = null, listening = false;
export const audioPackStatus = () => ({...status});
export function onAudioPackChange(listener) {
  listeners.add(listener); listener(audioPackStatus());
  return () => listeners.delete(listener);
}
function publish(next) {
  status = {...status, ...next};
  for (const listener of listeners) listener(audioPackStatus());
}
function prepare(worker) {
  worker?.postMessage({type:'xiaoya-prepare-audio', build});
}
function watch(worker) {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    if (worker.state === 'activated') prepare(worker);
    if (worker.state === 'redundant' && status.state !== 'ready') publish({state:'error'});
  });
}
export function startAudioPack() {
  if (starting) return starting;
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') {
    publish({state:'unsupported'}); return Promise.resolve();
  }
  if (!listening) {
    listening = true;
    navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'xiaoya-audio-update' && event.data.requestedBuild === build && event.source === navigator.serviceWorker.controller) {
      // During installation the previous worker may still be active. Only a
      // controlled, newer release calls for a refresh; never reload a child's
      // activity automatically or revive the previous cached page in a loop.
      if (registration && !registration.installing && !registration.waiting) publish({state:'update'});
    }
    if (event.data?.type === 'xiaoya-audio-pack' && event.data.build === build) {
      if (event.data.state === 'ready' && (!navigator.serviceWorker.controller || event.source !== navigator.serviceWorker.controller)) return;
      publish(event.data);
    }
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => prepare(navigator.serviceWorker.controller));
  }
  starting = navigator.serviceWorker.register(new URL('xiaoya/sw.js', document.baseURI), {
    scope:new URL('xiaoya/', document.baseURI).pathname, updateViaCache:'none'
  }).then(value => {
    registration = window.xiaoyaWorker = value;
    registration.addEventListener('updatefound', () => watch(registration.installing));
    watch(registration.installing);
    prepare(registration.active);
    return registration;
  }).catch(() => { publish({state:'error'}); starting = null; });
  return starting;
}
export async function retryAudioPack() {
  if (status.state === 'update') { location.reload(); return; }
  publish({state:'preparing'});
  if (!registration) return startAudioPack();
  prepare(registration.active);
  try { await registration.update(); } catch { publish({state:'error'}); }
}
export function audioPackMessage() {
  if (status.state === 'ready') return '全部内置声音已准备好，三种英语音色均可离线播放。';
  if (status.state === 'error') return '声音尚未全部保存。请双击「启动小芽英语」保持本地服务运行，再点重新检查；不需要连接配音服务。';
  if (status.state === 'unsupported') return '当前浏览器无法保存离线声音，请保持本地服务运行。';
  if (status.state === 'update') return '新版声音已准备好，点重新检查刷新到最新版本；本机记录会保留。';
  return status.total ? `正在检查内置声音 ${status.done} / ${status.total}，首次准备完成后不必逐句下载。` : '正在准备内置声音，首次准备完成后不必逐句下载。';
}
