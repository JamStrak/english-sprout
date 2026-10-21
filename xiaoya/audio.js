import {prepareSamples} from './speech-signal.js';
// Audio is local to this session. Recordings never enter storage or a request.
let playback = null;
let capture = null;
let captureGeneration = 0;
let preparedCapture = null;
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
  // The worker serves and saves the same request. A second page fetch races
  // native playback and doubles cold requests without improving readiness.
  if (navigator.serviceWorker?.controller) return;
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

// Fade only the captured voice. Navigation or a newer voice can still stop it
// immediately, and its timer must never touch a replacement playback.
export function fadeOutSound(duration = 180) {
  return playback ? playback.fadeOut(duration) : Promise.resolve();
}

export function playSound(file, onState = () => {}) {
  stopSound();
  return new Promise((resolve, reject) => {
    const audio = new Audio(absolute(file));
    audio.preload = 'auto';
    let timer, fadeTimer, fadePromise, resolveFade, started = false, finished = false, lastProgress = 0;
    const current = {audio, finish(ok, error) {
      if (finished) return; finished = true;
      clearTimeout(timer); clearTimeout(fadeTimer); audio.onended = audio.onerror = audio.onplaying = audio.ontimeupdate = null;
      audio.pause(); audio.removeAttribute('src'); audio.load();
      if (playback === current) playback = null;
      resolveFade?.();
      onState(error ? 'error' : 'idle'); error ? reject(error) : resolve(ok);
    }, fadeOut(duration) {
      if (fadePromise) return fadePromise;
      if (!started || !(duration > 0)) { current.finish(false); return Promise.resolve(); }
      fadePromise = new Promise(resolve => { resolveFade = resolve; });
      const start = performance.now(), volume = audio.volume;
      const tick = () => {
        if (finished) return;
        const progress = Math.min(1, (performance.now() - start) / duration);
        audio.volume = volume * (1 - progress);
        if (progress >= 1) current.finish(false);
        else fadeTimer = setTimeout(tick, Math.min(16, duration * (1 - progress)));
      };
      tick();
      return fadePromise;
    }};
    playback = current;
    onState('loading');
    const watchProgress = () => {
      clearTimeout(timer);
      timer = setTimeout(() => current.finish(false, new Error('本地声音读取超时，请家长双击「启动小芽英语」，在家长区检查声音准备状态。')), 15000);
    };
    audio.onplaying = () => { started = true; watchProgress(); onState('playing'); };
    audio.ontimeupdate = () => {
      if (audio.currentTime > lastProgress) { lastProgress = audio.currentTime; watchProgress(); }
    };
    audio.onended = () => { cachePublicSound(file); current.finish(true); };
    audio.onerror = () => current.finish(false, new Error('这段内置声音暂时无法读取，请家长双击「启动小芽英语」，在家长区检查声音准备状态。'));
    watchProgress();
    audio.play().catch(error => { if (playback === current) current.finish(false, error.name === 'NotAllowedError' ? Object.assign(new Error('浏览器还没有允许播放声音，请点一下示范按钮。'),{name:'NotAllowedError'}) : error); });
  });
}

export function clearClip() { if (clip) URL.revokeObjectURL(clip); clip = null; }
export function hasClip() { return Boolean(clip); }
export function replayClip() { return clip ? playSound(clip) : Promise.resolve(false); }
export function supportsRecording() {
  return Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

const microphone = () => navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
const liveStream = stream => stream?.getTracks().some(track => track.readyState === 'live');
function stopStream(stream) { stream?.getTracks().forEach(track => { if (track.readyState !== 'ended') track.stop(); }); }
function releasePrepared(current = preparedCapture) {
  if (!current) return;
  if (preparedCapture === current) preparedCapture = null;
  current.cancelled = true; clearTimeout(current.timeout); stopStream(current.stream);
}

// Open the device only after both the parent's opt-in (caller) and an existing
// browser grant. No recorder, audio buffer or recognition starts during warmup.
export function prepareRecording() {
  if (!supportsRecording() || document.hidden || !navigator.permissions?.query || capture) return Promise.resolve(false);
  if (preparedCapture) return preparedCapture.promise.then(stream => Boolean(stream));
  const current = {stream:null,requested:false,cancelled:false,timeout:null,promise:null};
  preparedCapture = current;
  current.timeout = setTimeout(() => releasePrepared(current), 20000);
  current.promise = (async () => {
    try {
      const permission = await navigator.permissions.query({name:'microphone'});
      if (current.cancelled || document.hidden || permission.state !== 'granted') return null;
      current.requested = true;
      const stream = await microphone();
      if (current.cancelled || document.hidden) { stopStream(stream); return null; }
      current.stream = stream;
      return stream;
    } catch { return null; }
  })().then(stream => {
    if (!stream) releasePrepared(current);
    return stream;
  });
  return current.promise.then(stream => Boolean(stream));
}

function cancelMeterStart(current) {
  clearTimeout(current.meterTimer);
  if (current.meterFrame !== null) window.cancelAnimationFrame?.(current.meterFrame);
  current.meterTimer = current.meterFrame = null;
}

function closeCapture(current, closeContext = true) {
  cancelMeterStart(current);
  clearInterval(current.interval); clearTimeout(current.timeout); clearTimeout(current.readyTimeout);
  releasePrepared(current.warming); stopStream(current.stream);
  if (closeContext && current.context) {
    try { Promise.resolve(current.context.close()).catch(() => {}); } catch {}
  }
}

export function cancelRecording({keepPrepared = false} = {}) {
  if (!keepPrepared) releasePrepared();
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
  cancelMeterStart(capture);
  clearInterval(capture.interval); clearTimeout(capture.timeout);
  try { if (capture.recorder.state !== 'inactive') capture.recorder.stop(); }
  finally { stopStream(capture?.stream); }
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
    const {quality} = prepareSamples(decoded);
    return {hasVoice:quality.hasVoice, voiceActivityAvailable:true,quality};
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
      const floating = typeof analyser.getFloatTimeDomainData === 'function';
      const values = floating ? new Float32Array(analyser.fftSize) : new Uint8Array(analyser.fftSize);
      let floor = Infinity;
      current.interval = setInterval(() => {
        if (capture !== current || current.recorder.state !== 'recording') return;
        if (floating) analyser.getFloatTimeDomainData(values); else analyser.getByteTimeDomainData(values);
        current.samples++;
        const rms = Math.sqrt(values.reduce((n,x)=>n+(floating ? x : (x-128)/128)**2,0)/values.length);
        floor = Math.min(floor,rms);
        const now = performance.now(); onLevel(Math.min(1, rms*8));
        if (rms > Math.max(.0015,Math.min(.022,floor*2.2))) { current.lastVoice=now; current.voiced+=80; }
        const elapsed = now-current.start;
        if ((current.voiced>=200 && elapsed>2800 && now-current.lastVoice>2000) || (!current.lastVoice && elapsed>8000)) finishRecording();
      }, 80);
    } catch { /* The recorder and manual finish still work without a meter. */ }
  });
}

function scheduleVoiceMeter(current, onLevel) {
  const Context = window.AudioContext || window.webkitAudioContext;
  const active = () => capture === current && current.started && current.recorder.state === 'recording';
  if (!Context || !active()) return;
  const start = () => {
    current.meterTimer = null;
    if (!active()) return;
    try {
      const context = new Context();
      if (!active()) { Promise.resolve(context.close()).catch(() => {}); return; }
      current.context = context;
      // A delayed resume may remain suspended without user activation. The
      // meter is optional; recording and whole-clip decoding never await it.
      current.contextReady = Promise.resolve(context.resume()).then(() => true, () => false);
      watchVoice(current, onLevel);
    } catch { /* Capture and recognition still work without a live meter. */ }
  };
  const afterPaint = () => {
    current.meterFrame = null;
    if (active()) current.meterTimer = setTimeout(start, 0);
  };
  // Some devices synchronously block in new AudioContext(). Give the ready
  // cue a paint opportunity before constructing this optional analyser.
  if (window.requestAnimationFrame) current.meterFrame = window.requestAnimationFrame(afterPaint);
  else current.meterTimer = setTimeout(start, 0);
}

export function beginRecording({onReady = () => {}, onLevel = () => {}, onFinish = () => {}} = {}) {
  if (!supportsRecording()) return Promise.reject(new Error('当前浏览器不能录音。可继续亲子互动；手机录音需要 HTTPS 网页。'));
  cancelRecording({keepPrepared:true}); stopSound(); clearClip();
  const warming = preparedCapture;
  preparedCapture = null;
  if (warming) {
    clearTimeout(warming.timeout);
    // A slow/unsupported permission query must not delay an explicit click.
    if (!warming.requested) releasePrepared(warming);
  }
  const generation = captureGeneration;
  const current = {recorder:null,stream:null,warming,chunks:[],started:false,start:0,lastVoice:0,voiced:0,samples:0,context:null,meterFrame:null,meterTimer:null,interval:null,timeout:null,readyTimeout:null};
  let readySettled = false;
  const started = new Promise((resolve, reject) => {
    current.settleReady = (value, error) => {
      if (readySettled) return;
      readySettled = true; clearTimeout(current.readyTimeout);
      error ? reject(error) : resolve(value);
    };
  });
  capture = current;
  const failed = error => {
    if (capture !== current || generation !== captureGeneration) return;
    current.settleReady(false, error);
    const wasStarted = current.started;
    cancelRecording();
    if (wasStarted) onFinish({url:null,hasVoice:false,voiceActivityAvailable:false,error:'录音没有完成，可重试或请家长观察。'});
  };
  // Cover device acquisition too: getUserMedia can remain pending forever.
  current.readyTimeout = setTimeout(() => failed(new Error('话筒启动较慢，请再试一次。')), 10000);
  (async () => {
    let stream = warming?.requested && !warming.cancelled ? await warming.promise : null;
    if (generation !== captureGeneration || capture !== current) { stopStream(stream); return; }
    if (!liveStream(stream)) { stopStream(stream); stream = await microphone(); }
    if (generation !== captureGeneration || capture !== current) { stopStream(stream); return; }
    current.stream = stream;
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, type ? {mimeType:type} : {});
    current.recorder = recorder;
    recorder.ondataavailable = e => { if (capture === current && e.data.size) current.chunks.push(e.data); };
    recorder.onstart = () => {
      if (capture !== current || generation !== captureGeneration || current.started) return;
      current.started = true; current.start = performance.now();
      current.timeout = setTimeout(() => { if (capture === current) finishRecording(); }, 12000);
      try {
        onReady(); current.settleReady(true);
        scheduleVoiceMeter(current, onLevel);
      } catch (error) { failed(error); }
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
    recorder.start(200);
  })().catch(failed);
  return started;
}

async function localSpeech() {
  if (!speechModule) speechModule = await import('./speech-local.js');
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
// Xiaoya's practice candidate policy is local to this app; the older product's
// matcher and its lexical metrics are unchanged. ASR may insert one article in
// an otherwise complete phrase (Pip's "I need water" can become "I need a water").
// Do not put that transcript in the catalogue as a phrase taught to children.
function scoreCandidate(expected, heard, matcher) {
  const score = matcher.scoreSpeech(expected, heard);
  const target = matcher.speechWords(expected), actual = matcher.speechWords(heard);
  const articles = new Set(['a','an','the']);
  const optional = new Set(['a','an','the','some','please']);
  const same = (left,right) => left.length===right.length && left.every((word,index)=>word===right[index]);
  const articleInsertion = target.length>=2 && actual.length===target.length+1 && actual.some((word,index)=>
    index>0 && index<actual.length-1 && articles.has(word) && same(target,actual.filter((_,position)=>position!==index))
  );
  // Keep content words, pronouns, word order and negation intact. In particular,
  // an 80% lexical match must not accept open/close, wet/dry or a dropped "not".
  // The existing longer-phrase allowance can still omit "some" or "please".
  const semanticMatch = same(target.filter(word=>!optional.has(word)),actual.filter(word=>!optional.has(word)));
  const matched = articleInsertion || (score.matched && actual.length<=target.length && semanticMatch);
  const stars = matched ? 3 : score.coverage>=.5 && score.precision>=.5 ? 2 : actual.length ? 1 : 0;
  return {...score,matched,stars};
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
    const matcher = await import('../src/speech-match.js');
    checkCurrent();
    const scores = accepted.map(variant => ({...scoreCandidate(variant,result.heard,matcher),variant}));
    scores.sort((a,b)=>Number(b.matched)-Number(a.matched)||b.stars-a.stars||b.coverage-a.coverage||b.precision-a.precision||b.matchedWords-a.matchedWords);
    const best = scores[0] || {...matcher.scoreSpeech('',result.heard),variant:null};
    // Ordered word matching only: these are not phoneme/pronunciation grades.
    return {...best,variant:best.matched ? best.variant : null,engine:result.engine,quality:result.quality};
  } finally { if (recognition===controller) recognition=null; }
}
export function releaseAudioSession() {
  stopSound(); cancelRecording(); cancelRecognition(); clearClip();
}
