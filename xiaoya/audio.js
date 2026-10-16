// Audio is local to this session. Recordings never enter storage or a request.
let playback = null;
let capture = null;
let captureGeneration = 0;
let clip = null;
let speechModule = null;
let preparing = null;
let ready = false;
let recognition = null;
const absolute = file => new URL(file, document.baseURI).href;
// Keep in step with sw.template.js when replacing bytes at existing audio URLs.
const AUDIO_CACHE = 'xiaoya-audio-v2';
const caching = new Set();
function cachePublicSound(file) {
  const url = new URL(file, document.baseURI);
  if (url.origin !== location.origin || !url.pathname.endsWith('.mp3') || !('caches' in window) || caching.has(url.href)) return;
  caching.add(url.href);
  (async () => {
    const cache = await caches.open(AUDIO_CACHE);
    if (await cache.match(url.href)) return;
    const response = await fetch(url.href);
    if (response.status === 200) await cache.put(url.href,response);
  })().catch(()=>{}).finally(()=>caching.delete(url.href));
}

export function stopSound() {
  if (playback) { const old = playback; playback = null; old.finish(false); }
}

export function playSound(file, onState = () => {}) {
  stopSound();
  cachePublicSound(file);
  return new Promise((resolve, reject) => {
    const audio = new Audio(absolute(file));
    audio.preload = 'auto';
    let timer;
    const current = {audio, finish(ok, error) {
      clearTimeout(timer); audio.onended = audio.onerror = audio.onplaying = null;
      audio.pause(); audio.removeAttribute('src'); audio.load();
      if (playback === current) playback = null;
      onState(error ? 'error' : 'idle'); error ? reject(error) : resolve(ok);
    }};
    playback = current;
    onState('loading');
    audio.onplaying = () => { clearTimeout(timer); onState('playing'); };
    audio.onended = () => current.finish(true);
    audio.onerror = () => current.finish(false, new Error('这段声音还没准备好，请联网后重试。'));
    timer = setTimeout(() => current.finish(false, new Error('声音加载较慢，请再点一次。')), 15000);
    audio.play().catch(error => { if (playback === current) current.finish(false, error); });
  });
}

export function clearClip() { if (clip) URL.revokeObjectURL(clip); clip = null; }
export function hasClip() { return Boolean(clip); }
export function replayClip() { return clip ? playSound(clip) : Promise.resolve(false); }
export function supportsRecording() {
  return Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

function closeCapture(current) {
  clearInterval(current.interval); clearTimeout(current.timeout);
  current.stream?.getTracks().forEach(track => track.stop());
  if (current.context) current.context.close().catch(() => {});
}

export function cancelRecording() {
  captureGeneration++;
  const old = capture; capture = null;
  if (old) {
    old.recorder.ondataavailable = old.recorder.onstop = old.recorder.onerror = null;
    try { if (old.recorder.state !== 'inactive') old.recorder.stop(); } catch {}
    closeCapture(old);
  }
}

export function finishRecording() {
  if (!capture) return;
  clearInterval(capture.interval); clearTimeout(capture.timeout);
  try { if (capture.recorder.state !== 'inactive') capture.recorder.stop(); }
  finally { capture?.stream.getTracks().forEach(track => track.stop()); }
}

export async function beginRecording({onLevel = () => {}, onFinish = () => {}} = {}) {
  if (!supportsRecording()) throw new Error('当前浏览器不能录音。可继续亲子互动；手机录音需要 HTTPS 网页。');
  cancelRecording(); stopSound(); clearClip();
  const generation = captureGeneration;
  const stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation:true, noiseSuppression:true}});
  if (generation !== captureGeneration) { stream.getTracks().forEach(t => t.stop()); return false; }
  const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
  let current;
  try {
    const recorder = new MediaRecorder(stream, type ? {mimeType:type} : {});
    current = {recorder,stream,chunks:[],start:performance.now(),lastVoice:0,voiced:0,context:null,interval:null,timeout:null};
    capture = current;
    recorder.ondataavailable = e => { if (capture === current && e.data.size) current.chunks.push(e.data); };
    recorder.onstop = () => {
      if (capture !== current || generation !== captureGeneration) return;
      capture = null; closeCapture(current);
      const blob = new Blob(current.chunks, {type:recorder.mimeType});
      if (blob.size) clip = URL.createObjectURL(blob);
      // Voice activity is only capture feedback, never a correctness decision.
      onFinish({url:clip,hasVoice:current.voiced >= 200,duration:(performance.now()-current.start)/1000});
    };
    recorder.onerror = () => {
      if (capture !== current) return;
      cancelRecording(); onFinish({url:null,hasVoice:false,error:'录音没有完成，可重试或请家长观察。'});
    };
    const Context = window.AudioContext || window.webkitAudioContext;
    if (Context) {
      try {
        current.context = new Context(); await current.context.resume();
        if (generation !== captureGeneration || capture !== current) { closeCapture(current); return false; }
        const source = current.context.createMediaStreamSource(stream), analyser = current.context.createAnalyser();
        analyser.fftSize = 512; source.connect(analyser);
        const values = new Uint8Array(analyser.fftSize);
        current.interval = setInterval(() => {
          if (capture !== current) return;
          analyser.getByteTimeDomainData(values);
          const rms = Math.sqrt(values.reduce((n,x)=>n+((x-128)/128)**2,0)/values.length);
          const now = performance.now(); onLevel(Math.min(1, rms*8));
          if (rms > .022) { current.lastVoice=now; current.voiced+=80; }
          const elapsed = now-current.start;
          if ((current.voiced>=200 && elapsed>2800 && now-current.lastVoice>2000) || (!current.lastVoice && elapsed>8000)) finishRecording();
        }, 80);
      } catch { /* Recording still has its time limit and a manual finish button. */ }
    }
    recorder.start(200);
    current.timeout = setTimeout(finishRecording, 12000);
    return true;
  } catch (error) { if(current) cancelRecording(); else stream.getTracks().forEach(t=>t.stop()); throw error; }
}

async function localSpeech() {
  if (!speechModule) speechModule = await import('../src/speech-local.js');
  return speechModule;
}
export function speechReady() { return ready; }
export function prepareRecognition(onStatus = () => {}) {
  if (!preparing) preparing = (async () => {
    const module = await localSpeech();
    await module.prepareSpeech({onStatus,background:true}); ready = true;
    return true;
  })().catch(error=>{ready=false;throw error;}).finally(()=>{preparing=null;});
  return preparing;
}
export function cancelRecognition() { if (recognition) { recognition.abort(); ready=false; } recognition=null; }
export async function recognize(url, accepted) {
  if (!ready || !url) return null;
  cancelRecognition(); const controller = new AbortController(); recognition=controller;
  try {
    const module = await localSpeech();
    const result = await module.assessRecording(url, accepted[0], {signal:controller.signal});
    const {scoreSpeech} = await import('../src/speech-match.js');
    const variant = accepted.find(phrase => scoreSpeech(phrase,result.heard).matched);
    return {heard:result.heard,matched:Boolean(variant),variant:variant||null};
  } finally { if (recognition===controller) recognition=null; }
}
export function releaseAudioSession() {
  stopSound(); cancelRecording(); cancelRecognition(); clearClip();
}
