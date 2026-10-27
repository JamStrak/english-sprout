// Static voices are prepared locally as a complete pack, never generated while
// a child is playing. No recording or learning data enters this preparation.
const build = document.querySelector('meta[name="xiaoya-build"]')?.content;
const listeners = new Set();
const artListeners = new Set();
let status = {state:'preparing', done:0, total:0};
let artStatus = {state:'preparing', done:0, total:0};
let registration = null, starting = null, listening = false;
export const audioPackStatus = () => ({...status});
export const artPackStatus = () => ({...artStatus});
export function onArtPackChange(listener) {
  artListeners.add(listener); listener(artPackStatus());
  return () => artListeners.delete(listener);
}
function publishArt(next) {
  artStatus = {...artStatus, ...next};
  for (const listener of artListeners) listener(artPackStatus());
}
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
  worker?.postMessage({type:'xiaoya-prepare-art', build});
}
function watch(worker) {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    if (worker.state === 'activated') prepare(worker);
    if (worker.state === 'redundant') {
      if(status.state !== 'ready') publish({state:'error'});
      if(artStatus.state !== 'ready') publishArt({state:'error'});
    }
  });
}
export function startAudioPack() {
  if (starting) return starting;
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') {
    publish({state:'unsupported'}); publishArt({state:'unsupported'}); return Promise.resolve();
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
    if (event.data?.type === 'xiaoya-art-pack' && event.data.build === build) {
      if (event.data.state === 'ready' && (!navigator.serviceWorker.controller || event.source !== navigator.serviceWorker.controller)) return;
      publishArt(event.data);
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
  }).catch(async () => {
    // Registration checks the network even when an installed worker and its
    // complete packs work offline. Ask that worker before reporting failure.
    const existing=await navigator.serviceWorker.getRegistration(new URL('xiaoya/',document.baseURI)).catch(()=>null);
    if(existing?.active&&navigator.serviceWorker.controller){
      registration=window.xiaoyaWorker=existing;prepare(existing.active);return existing;
    }
    publish({state:'error'});publishArt({state:'error'});starting=null;
  });
  return starting;
}
export async function retryAudioPack() {
  if (status.state === 'update') { location.reload(); return; }
  publish({state:'preparing'});
  publishArt({state:'preparing'});
  if (!registration) return startAudioPack();
  prepare(registration.active);
  // A failed update request must not overwrite a successful offline pack check.
  try { await registration.update(); } catch { if(!registration.active){publish({state:'error'});publishArt({state:'error'});} }
}
export const retryArtPack=retryAudioPack;
export function artPackMessage() {
  if(artStatus.state==='ready')return '本版全部故事插画、角色和花园图片已完整校验并保存，可离线使用。';
  if(artStatus.state==='error')return '图片包尚未保存完整。请双击「启动小芽英语」保持本地服务运行，再点重新检查图片。';
  if(artStatus.state==='unsupported')return '当前浏览器不能保存离线图片，请保持本地服务运行。';
  return artStatus.total?`正在保存本版插画 ${artStatus.done} / ${artStatus.total}，完成后未看过的故事也能离线打开。`:'正在检查本版完整插画包，首次完成后支持离线。';
}
export function audioPackMessage() {
  if (status.state === 'ready') return '全部内置声音已准备好，三种英语音色均可离线播放。';
  if (status.state === 'error') return '声音尚未全部保存。请双击「启动小芽英语」保持本地服务运行，再点重新检查；不需要连接配音服务。';
  if (status.state === 'unsupported') return '当前浏览器无法保存离线声音，请保持本地服务运行。';
  if (status.state === 'update') return '新版声音已准备好，点重新检查刷新到最新版本；本机记录会保留。';
  return status.total ? `正在检查内置声音 ${status.done} / ${status.total}，首次准备完成后不必逐句下载。` : '正在准备内置声音，首次准备完成后不必逐句下载。';
}
