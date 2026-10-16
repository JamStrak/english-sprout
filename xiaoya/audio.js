// Audio is local to this session. Recordings never enter storage or a request.
let playback = null;
let capture = null;
let captureGeneration = 0;
let clip = null;
let speechModule = null;
let preparing = null;
let preparationStatus = '';
const preparationListeners = new Set();
let ready = false;
let recognition = null;
let speechGeneration = 0;
const absolute = file => new URL(file, document.baseURI).href;
// Keep in step with sw.template.js when replacing bytes at existing audio URLs.
const AUDIO_CACHE = 'xiaoya-audio-v3';
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

function closeCapture(current, closeContext = true) {
  clearInterval(current.interval); clearTimeout(current.timeout); clearTimeout(current.readyTimeout);
  current.stream?.getTracks().forEach(track => track.stop());
  if (closeContext && current.context) {
    try { Promise.resolve(current.context.close()).catch(() => {}); } catch {}
  }
}

export function cancelRecording() {
  captureGeneration++;
  const old = capture; capture = null;
  if (old) {
    if (old.recorder) {
      old.recorder.onstart = old.recorder.ondataavailable = old.recorder.onstop = old.recorder.onerror = null;
      try { if (old.recorder.state !== 'inactive') old.recorder.stop(); } catch {}
    }
    old.settleReady(false);
    closeCapture(old);
  }
}

export function finishRecording() {
  if (!capture) return;
  if (!capture.started) { cancelRecording(); return; }
  clearInterval(capture.interval); clearTimeout(capture.timeout);
  try { if (capture.recorder.state !== 'inactive') capture.recorder.stop(); }
  finally { capture?.stream.getTracks().forEach(track => track.stop()); }
}

async function recordedVoice(current, blob) {
  if (current.voiced >= 200) return {hasVoice:true, voiceActivityAvailable:true};
  if (!current.context || !blob.size) return {hasVoice:false, voiceActivityAvailable:false};
  // The analyser may have resumed after the child's first words. Check the
  // complete local clip before calling that recording silent; never score it.
  let timer;
  try {
    const decoded = await Promise.race([
      blob.arrayBuffer().then(bytes => new Promise((resolve, reject) => current.context.decodeAudioData(bytes, resolve, reject))),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Voice check timed out')), 1800); })
    ]);
    let voiced = 0;
    const step = Math.max(1, Math.round(decoded.sampleRate * .04));
    const channels = Array.from({length:decoded.numberOfChannels}, (_, i) => decoded.getChannelData(i));
    for (let offset = 0; offset < decoded.length; offset += step) {
      const end = Math.min(decoded.length, offset + step);
      let sum = 0;
      for (let i = offset; i < end; i++) {
        let sample = 0;
        for (const channel of channels) sample += channel[i] / channels.length;
        sum += sample * sample;
      }
      if (Math.sqrt(sum / (end - offset)) > .022) voiced += (end - offset) / decoded.sampleRate * 1000;
      if (voiced >= 200) return {hasVoice:true, voiceActivityAvailable:true};
    }
    return {hasVoice:false, voiceActivityAvailable:true};
  // Quiet meter samples can miss the first words while AudioContext resumes.
  // Without a complete decode, silence is unknown even if the meter did run.
  } catch { return {hasVoice:false, voiceActivityAvailable:false}; }
  finally { clearTimeout(timer); }
}

function watchVoice(current, onLevel) {
  if (!current.context) return;
  // Meter startup is optional and must never delay the recorder or ready cue.
  current.contextReady.then(resumed => {
    if (!resumed || capture !== current || !current.started || current.recorder.state !== 'recording') return;
    try {
      const source = current.context.createMediaStreamSource(current.stream), analyser = current.context.createAnalyser();
      analyser.fftSize = 512; source.connect(analyser);
      const values = new Uint8Array(analyser.fftSize);
      current.interval = setInterval(() => {
        if (capture !== current || current.recorder.state !== 'recording') return;
        analyser.getByteTimeDomainData(values); current.samples++;
        const rms = Math.sqrt(values.reduce((n,x)=>n+((x-128)/128)**2,0)/values.length);
        const now = performance.now(); onLevel(Math.min(1, rms*8));
        if (rms > .022) { current.lastVoice=now; current.voiced+=80; }
        const elapsed = now-current.start;
        if ((current.voiced>=200 && elapsed>2800 && now-current.lastVoice>2000) || (!current.lastVoice && elapsed>8000)) finishRecording();
      }, 80);
    } catch { /* The recorder and manual finish still work without a meter. */ }
  });
}

export function beginRecording({onReady = () => {}, onLevel = () => {}, onFinish = () => {}} = {}) {
  if (!supportsRecording()) return Promise.reject(new Error('当前浏览器不能录音。可继续亲子互动；手机录音需要 HTTPS 网页。'));
  cancelRecording(); stopSound(); clearClip();
  const generation = captureGeneration;
  const current = {recorder:null,stream:null,chunks:[],started:false,start:0,lastVoice:0,voiced:0,samples:0,context:null,interval:null,timeout:null,readyTimeout:null};
  let readySettled = false;
  const started = new Promise((resolve, reject) => {
    current.settleReady = (value, error) => {
      if (readySettled) return;
      readySettled = true; clearTimeout(current.readyTimeout);
      error ? reject(error) : resolve(value);
    };
  });
  capture = current;
  // Resume from the user gesture, in parallel with the permission request.
  // MediaRecorder does not depend on Web Audio being present or resumed.
  const Context = window.AudioContext || window.webkitAudioContext;
  if (Context) {
    try {
      current.context = new Context();
      current.contextReady = Promise.resolve(current.context.resume()).then(() => true, () => false);
    } catch { current.contextReady = Promise.resolve(false); }
  }
  const failed = error => {
    if (capture !== current || generation !== captureGeneration) return;
    current.settleReady(false, error);
    const wasStarted = current.started;
    cancelRecording();
    if (wasStarted) onFinish({url:null,hasVoice:false,voiceActivityAvailable:false,error:'录音没有完成，可重试或请家长观察。'});
  };
  (async () => {
    const stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation:true, noiseSuppression:true}});
    if (generation !== captureGeneration || capture !== current) { stream.getTracks().forEach(t => t.stop()); return; }
    current.stream = stream;
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, type ? {mimeType:type} : {});
    current.recorder = recorder;
    recorder.ondataavailable = e => { if (capture === current && e.data.size) current.chunks.push(e.data); };
    recorder.onstart = () => {
      if (capture !== current || generation !== captureGeneration || current.started) return;
      current.started = true; current.start = performance.now();
      current.timeout = setTimeout(() => { if (capture === current) finishRecording(); }, 12000);
      watchVoice(current, onLevel);
      try { onReady(); current.settleReady(true); } catch (error) { failed(error); }
    };
    recorder.onstop = async () => {
      if (capture !== current || generation !== captureGeneration) return;
      if (!current.started) { failed(new Error('话筒没有启动，请再试一次。')); return; }
      closeCapture(current, false);
      const blob = new Blob(current.chunks, {type:recorder.mimeType});
      const duration = (performance.now()-current.start)/1000;
      const voice = await recordedVoice(current, blob);
      if (capture !== current || generation !== captureGeneration) return;
      capture = null; closeCapture(current);
      if (blob.size) clip = URL.createObjectURL(blob);
      // Voice activity is only capture feedback, never a correctness decision.
      onFinish({url:clip,...voice,duration});
    };
    recorder.onerror = () => failed(new Error('录音没有完成，可重试或请家长观察。'));
    current.readyTimeout = setTimeout(() => failed(new Error('话筒启动较慢，请再试一次。')), 10000);
    recorder.start(200);
  })().catch(failed);
  return started;
}

async function localSpeech() {
  if (!speechModule) speechModule = await import('../src/speech-local.js');
  return speechModule;
}
export function speechReady() { return ready; }
export function prepareRecognition(onStatus = () => {}) {
  if (ready) { onStatus('小耳朵准备好了'); return Promise.resolve(true); }
  preparationListeners.add(onStatus);
  if (preparationStatus) onStatus(preparationStatus);
  if (!preparing) {
    const generation = speechGeneration;
    const status = value => {
      if (generation !== speechGeneration) return;
      preparationStatus = value;
      for (const listener of preparationListeners) try { listener(value); } catch {}
    };
    const task = (async () => {
      const module = await localSpeech();
      await module.prepareSpeech({onStatus:status,background:true});
      if (generation !== speechGeneration) throw new DOMException('已取消这次跟读。','AbortError');
      ready = true; status('小耳朵准备好了'); return true;
    })().catch(error=>{if(generation===speechGeneration)ready=false;throw error;}).finally(()=>{
      if (preparing === task) { preparing=null; preparationStatus=''; }
    });
    preparing = task;
  }
  return preparing.finally(()=>preparationListeners.delete(onStatus));
}
export function cancelRecognition() {
  if (recognition) {
    speechGeneration++; ready=false;
    recognition.abort(); preparing=null; preparationStatus='';
  }
  recognition=null;
}
export async function recognize(url, accepted) {
  if (!ready || !url) return null;
  cancelRecognition(); const controller = new AbortController(); recognition=controller;
  const checkCurrent = () => {
    if (controller.signal.aborted || recognition !== controller) throw new DOMException('已取消这次跟读。','AbortError');
  };
  try {
    const module = await localSpeech();
    checkCurrent();
    const result = await module.assessRecording(url, accepted[0], {signal:controller.signal});
    checkCurrent();
    const {scoreSpeech} = await import('../src/speech-match.js');
    checkCurrent();
    const scores = accepted.map(variant => ({...scoreSpeech(variant,result.heard),variant}));
    scores.sort((a,b)=>Number(b.matched)-Number(a.matched)||b.stars-a.stars||b.coverage-a.coverage||b.precision-a.precision||b.matchedWords-a.matchedWords);
    const best = scores[0] || {...scoreSpeech('',result.heard),variant:null};
    // Ordered word matching only: these are not phoneme/pronunciation grades.
    return {...best,variant:best.matched ? best.variant : null};
  } finally { if (recognition===controller) recognition=null; }
}
export function releaseAudioSession() {
  stopSound(); cancelRecording(); cancelRecognition(); clearClip();
}
