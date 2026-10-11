import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { VOICE_STORAGE_KEY, readVoicePreference, saveVoicePreference, voiceAudioPath, englishAudioFiles } from '../src/voices.js';

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalRecorder = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder');
const originalAudio = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalCreateURL = URL.createObjectURL;
const originalRevokeURL = URL.revokeObjectURL;
let instances, blobs, revoked, streams, constructorFailure, startFailure, audioInstances, audioPlayResult;
let playFile, stopAudio, preloadAudio, isAudioLoading, setPlaybackRate, startRecording, stopRecording, clearRecording, recordingSupported;
let moduleGeneration=0;

function stream() {
  const tracks = [{ stops: 0, stop() { this.stops += 1; } }];
  const value = { tracks, getTracks: () => tracks };
  streams.push(value);
  return value;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function restoreGlobal(name, descriptor) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else delete globalThis[name];
}

beforeEach(async () => {
  instances = []; blobs = new Map(); revoked = []; streams = [];
  constructorFailure = false; startFailure = false;
  audioInstances = []; audioPlayResult = null;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { baseURI: 'https://example.test/english-sprout/' } });
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: class extends EventTarget {
    constructor(url) { super(); this.src = url ? String(url) : ''; this.paused = true; this.currentTime = 0; this.loadCalls = 0; this.playCalls = 0; audioInstances.push(this); }
    play() { this.playCalls += 1; this.paused = false; if(audioPlayResult)return audioPlayResult(this);this.dispatchEvent(new Event('playing'));return Promise.resolve(); }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
    load() { this.loadCalls += 1; }
    removeAttribute(name) { if(name === 'src') this.src = ''; }
  } });
  const Recorder = class {
    static isTypeSupported() { return true; }
    constructor(input, options) {
      if (constructorFailure) throw new Error('Recorder initialization failed');
      this.input = input;
      this.mimeType = options?.mimeType || 'audio/webm';
      this.state = 'inactive';
      this.stopCalls = 0;
      instances.push(this);
    }
    start() {
      if (startFailure) throw new Error('Recorder start failed');
      this.state = 'recording';
    }
    stop() { this.state = 'inactive'; this.stopCalls += 1; }
    emitData(text) { this.ondataavailable?.({ data: new Blob([text]) }); }
    emitStop() { this.state = 'inactive'; this.onstop?.(); }
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true, MediaRecorder: Recorder } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => stream() } } });
  Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: Recorder });
  URL.createObjectURL = blob => { const url = `blob:test-${blobs.size}`; blobs.set(url, blob); return url; };
  URL.revokeObjectURL = url => revoked.push(url);
  // Each browser document owns its own warm pool; isolate that document per test.
  ({playFile,stopAudio,preloadAudio,isAudioLoading,setPlaybackRate,startRecording,stopRecording,clearRecording,recordingSupported}=await import(`../src/media.js?test=${++moduleGeneration}`));
});

afterEach(() => {
  stopAudio();
  clearRecording();
  URL.createObjectURL = originalCreateURL;
  URL.revokeObjectURL = originalRevokeURL;
  restoreGlobal('navigator', originalNavigator);
  restoreGlobal('window', originalWindow);
  restoreGlobal('MediaRecorder', originalRecorder);
  restoreGlobal('Audio', originalAudio);
  restoreGlobal('document', originalDocument);
});

test('English voice paths map both complete courses without altering guidance or local recordings', () => {
  const lessons = Array.from({length:120}, (_, i) => ({audio:`audio/lesson-${i + 1}.mp3`}));
  const files = englishAudioFiles(lessons);
  assert.equal(files.length, 360); assert.equal(new Set(files).size, 360);
  assert.equal(voiceAudioPath('audio/hello-01.mp3', 'aiden'), 'audio/hello-01.mp3');
  assert.equal(voiceAudioPath('audio/hello-01.mp3', 'ryan'), 'audio/ryan/hello-01.mp3');
  assert.equal(voiceAudioPath('audio/hello-01.mp3', 'pip'), 'audio/characters/pip/hello-01.mp3');
  assert.equal(voiceAudioPath('audio/hello-01.mp3', 'unknown'), 'audio/hello-01.mp3');
  for (const path of ['audio/ui/listen.mp3', 'blob:local-recording', 'audio/ryan/hello-01.mp3', 'audio/characters/pip/hello-01.mp3']) assert.equal(voiceAudioPath(path, 'ryan'), path);
});

test('Voice preference is separate from learning state and safely defaults when storage is unavailable', () => {
  const data = new Map([['english-sprout-state-v1', 'unchanged-progress']]);
  const storage = {getItem:key=>data.get(key), setItem:(key,value)=>data.set(key,value)};
  assert.equal(readVoicePreference(storage), 'aiden'); assert.equal(saveVoicePreference('ryan', storage), true);
  assert.equal(readVoicePreference(storage), 'ryan'); assert.equal(data.get('english-sprout-state-v1'), 'unchanged-progress');
  data.set(VOICE_STORAGE_KEY, 'corrupt'); assert.equal(readVoicePreference(storage), 'aiden');
  const blocked = {getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
  assert.equal(readVoicePreference(blocked), 'aiden'); assert.equal(saveVoicePreference('ryan', blocked), false);
});

test('Voice playback preserves pitch and stops the previous sample without mapping recorded blobs', async () => {
  await playFile(voiceAudioPath('audio/hello-01.mp3', 'aiden'));
  const aiden = audioInstances[0]; assert.equal(aiden.src, 'https://example.test/english-sprout/audio/hello-01.mp3'); assert.equal(aiden.playbackRate, 1);
  await playFile(voiceAudioPath('audio/hello-01.mp3', 'ryan'), true);
  const ryan = audioInstances[1]; assert.equal(aiden.paused, true); assert.equal(ryan.src, 'https://example.test/english-sprout/audio/ryan/hello-01.mp3'); assert.equal(ryan.playbackRate, 0.8); assert.equal(ryan.preservesPitch, true);
  await playFile('blob:local-recording'); assert.equal(ryan.paused, true); assert.equal(audioInstances[2].src, 'blob:local-recording');
});

test('Live numeric speed changes preserve pitch, position and stream without changing other playback', async () => {
  const file='audio/hello-01.mp3',audio=await playFile(file,.9);
  assert.equal(audio.playbackRate,.9);audio.currentTime=.6;
  for(const rate of [.75,1.15,1]){
    assert.equal(setPlaybackRate(rate,file),true);assert.equal(audio.playbackRate,rate);
    assert.equal(audio.preservesPitch,true);assert.equal(audio.currentTime,.6);
  }
  assert.equal(audio.playCalls,1);assert.equal(audio.loadCalls,0);assert.equal(audioInstances.length,1);
  assert.equal(setPlaybackRate(.75,'audio/ryan/hello-01.mp3'),false);
  assert.equal(setPlaybackRate(NaN,file),false);assert.equal(audio.playbackRate,1);
  audio.dispatchEvent(new Event('ended'));assert.equal(setPlaybackRate(.75,file),false);
  stopAudio();assert.equal(setPlaybackRate(.75,file),false);
  assert.equal((await playFile(file,true)).playbackRate,.8,'existing slow-listen remains compatible');
  assert.equal((await playFile(file,false)).playbackRate,1,'course defaults stay at normal speed');
  assert.equal((await playFile(file,10)).playbackRate,1.5);
  assert.equal((await playFile(file,NaN)).playbackRate,1);
});

test('Speed changes during loading keep repeated taps on the same pending request', async () => {
  const pending=deferred(),file='audio/hello-01.mp3';audioPlayResult=()=>pending.promise;
  const first=playFile(file,1);assert.equal(setPlaybackRate(.75,file),true);
  assert.equal(isAudioLoading(file,.75),true);assert.equal(isAudioLoading(file,1),false);
  const second=playFile(file,.75);assert.equal(audioInstances[0].playCalls,1);
  audioInstances[0].dispatchEvent(new Event('playing'));pending.resolve();
  assert.equal(await first,await second);assert.equal(audioInstances.length,1);
  assert.equal(audioInstances[0].playbackRate,.75);
});

test('Silent preload deduplicates URLs and playback reuses its warmed element without reloading', async () => {
  preloadAudio(['audio/hello-01.mp3','audio/hello-01.mp3','https://example.test/english-sprout/audio/hello-01.mp3']);
  assert.equal(audioInstances.length,1);const warmed=audioInstances[0];
  assert.equal(warmed.preload,'auto');assert.equal(warmed.loadCalls,1);assert.equal(warmed.playCalls,0);assert.equal(warmed.paused,true);
  preloadAudio(['audio/hello-01.mp3']);
  assert.equal(warmed.loadCalls,1,'repeated hints never restart the fetch');
  assert.equal(await playFile('audio/hello-01.mp3'),warmed);
  warmed.currentTime=1.2;stopAudio();
  assert.equal(warmed.src,'https://example.test/english-sprout/audio/hello-01.mp3');assert.equal(warmed.loadCalls,1);
  assert.equal(await playFile('audio/hello-01.mp3'),warmed);assert.equal(warmed.currentTime,0);assert.equal(warmed.playCalls,2);
});

test('Warm pool is bounded, ignores recordings and releases only the least recent inactive audio', async () => {
  preloadAudio(Array.from({length:20},(_,i)=>`audio/lesson-${i}.mp3`));
  assert.equal(audioInstances.length,6,'a large hint cannot download the whole curriculum');
  const active=await playFile('audio/lesson-0.mp3');
  preloadAudio(['blob:private-recording','data:audio/mp3;base64,AA==','audio/new.mp3']);
  assert.equal(audioInstances.length,7);assert.equal(audioInstances.filter(audio=>audio.src).length,6);
  assert.equal(active.paused,false);assert.equal(active.src,'https://example.test/english-sprout/audio/lesson-0.mp3');
  assert.equal(audioInstances[1].src,'');assert.equal(audioInstances[1].loadCalls,2,'eviction discards the unused buffer');
  preloadAudio(Array.from({length:6},(_,i)=>`audio/more-${i}.mp3`));
  assert.equal(audioInstances.filter(audio=>audio.src).length,6);assert.equal(active.paused,false);
});

test('Repeated taps while the same clip is pending share playback and still deliver actual events', async () => {
  const pending=deferred(),states=[],secondStates=[];audioPlayResult=()=>pending.promise;
  const first=playFile('audio/hello-01.mp3',false,state=>states.push(state));
  assert.equal(isAudioLoading('audio/hello-01.mp3'),true);
  assert.equal(isAudioLoading('audio/hello-01.mp3',true),false);
  assert.equal(isAudioLoading('audio/ryan/hello-01.mp3'),false);
  const second=playFile('audio/hello-01.mp3',false,state=>secondStates.push(state));
  assert.equal(audioInstances.length,1);assert.equal(audioInstances[0].playCalls,1);
  audioInstances[0].dispatchEvent(new Event('playing'));pending.resolve();
  assert.equal(await first,await second);assert.equal(isAudioLoading('audio/hello-01.mp3'),false);
  assert.deepEqual(states,['loading','playing']);assert.deepEqual(secondStates,['loading','playing']);
  audioInstances[0].dispatchEvent(new Event('waiting'));
  assert.equal(isAudioLoading('audio/hello-01.mp3'),true);
  await playFile('audio/hello-01.mp3');assert.equal(audioInstances[0].playCalls,1,'buffering taps do not restart playback');
});

test('Stopping and reusing the same warmed element detaches obsolete feedback callbacks', async () => {
  const firstStates=[],secondStates=[];
  const first=await playFile('audio/hello-01.mp3',false,state=>firstStates.push(state));
  const count=firstStates.length;
  const second=await playFile('audio/hello-01.mp3',false,state=>secondStates.push(state));
  assert.equal(first,second);
  second.dispatchEvent(new Event('pause'));second.ended=false;second.dispatchEvent(new Event('ended'));
  assert.deepEqual(secondStates,['loading','playing'],'queued pause/end from the previous turn cannot clear current playback');
  second.dispatchEvent(new Event('waiting'));second.dispatchEvent(new Event('playing'));
  assert.equal(firstStates.length,count);assert.deepEqual(secondStates,['loading','playing','loading','playing']);
  stopAudio();assert.equal(isAudioLoading('audio/hello-01.mp3'),false);
});

test('Failed preloads and failed playback are replaced, while temporary recorded audio is never pooled', async () => {
  preloadAudio(['audio/hello-01.mp3']);const broken=audioInstances[0];broken.dispatchEvent(new Event('error'));
  const retry=await playFile('audio/hello-01.mp3');assert.notEqual(retry,broken);
  audioPlayResult=()=>Promise.reject(new Error('Offline'));
  await assert.rejects(playFile('audio/missing.mp3'),/Offline/);const missing=audioInstances.at(-1);
  audioPlayResult=null;assert.notEqual(await playFile('audio/missing.mp3'),missing);
  const recorded=await playFile('blob:private-recording');stopAudio();
  assert.notEqual(await playFile('blob:private-recording'),recorded);
  assert.equal(await playFile('audio/hello-01.mp3'),retry,'recording playback does not evict warm course audio');
});

test('Switching voice during pending playback ignores only the interrupted sample failure', async () => {
  const interrupted = deferred(); audioPlayResult = () => interrupted.promise;
  const first = playFile('audio/hello-01.mp3'); audioPlayResult = null;
  await playFile('audio/ryan/hello-01.mp3'); interrupted.reject(new DOMException('Playback interrupted', 'AbortError')); await first;
  assert.equal(audioInstances[0].paused, true); assert.equal(audioInstances[1].paused, false);
  audioPlayResult = () => Promise.reject(new Error('Missing audio'));
  await assert.rejects(playFile('audio/missing.mp3'), /Missing audio/);
});

test('Playback feedback follows actual loading, playing, buffering and end events', async () => {
  const states=[];
  const audio=await playFile('audio/hello-01.mp3',false,state=>states.push(state));
  assert.deepEqual(states,['loading','playing']);
  audio.dispatchEvent(new Event('waiting'));audio.dispatchEvent(new Event('playing'));audio.dispatchEvent(new Event('ended'));
  assert.deepEqual(states,['loading','playing','loading','playing','idle']);
  await playFile('audio/ryan/hello-01.mp3');
  const count=states.length;audio.dispatchEvent(new Event('error'));audio.dispatchEvent(new Event('playing'));
  assert.equal(states.length,count,'stale media events cannot change the new clip feedback');
});

test('Rejected playback reports an error and a later user retry can play', async () => {
  const states=[];audioPlayResult=()=>Promise.reject(new Error('Network unavailable'));
  await assert.rejects(playFile('audio/hello-01.mp3',false,state=>states.push(state)),/Network unavailable/);
  assert.deepEqual(states,['loading','error']);audioPlayResult=null;
  await playFile('audio/hello-01.mp3',false,state=>states.push(state));
  assert.deepEqual(states,['loading','error','loading','playing']);
});

test('normal stop releases microphone immediately, returns only recorded audio and clear revokes it', async () => {
  let result;
  await startRecording(url => { result = url; });
  instances[0].emitData('hello');
  stopRecording();
  assert.equal(streams[0].tracks[0].stops, 1);
  assert.equal(instances[0].stopCalls, 1);
  assert.equal(result, undefined, 'wait for final recorder data before completing');
  instances[0].emitData(' world');
  instances[0].emitStop();
  assert.equal(await blobs.get(result).text(), 'hello world');
  assert.equal(streams[0].tracks[0].stops, 1, 'release each stream once');
  clearRecording();
  assert.deepEqual(revoked, [result]);
});

test('clear while permission is pending stops the late stream and never starts a recorder', async () => {
  const permission = deferred();
  navigator.mediaDevices.getUserMedia = () => permission.promise;
  let calls = 0;
  const started = startRecording(() => { calls += 1; });
  const rejected = assert.rejects(started, { name: 'AbortError' });
  clearRecording();
  const granted = stream();
  permission.resolve(granted);
  await rejected;
  assert.equal(granted.tracks[0].stops, 1);
  assert.equal(instances.length, 0);
  assert.equal(calls, 0);
});

test('an older delayed permission cannot stop a newer recording', async () => {
  const permissions = [deferred(), deferred()];
  let request = 0;
  navigator.mediaDevices.getUserMedia = () => permissions[request++].promise;
  const first = startRecording(() => assert.fail('old request must not complete'));
  const firstRejected = assert.rejects(first, { name: 'AbortError' });
  const second = startRecording(() => {});
  const currentStream = stream();
  permissions[1].resolve(currentStream);
  await second;
  const obsoleteStream = stream();
  permissions[0].resolve(obsoleteStream);
  await firstRejected;
  assert.equal(obsoleteStream.tracks[0].stops, 1);
  assert.equal(currentStream.tracks[0].stops, 0);
  assert.equal(instances[0].state, 'recording');
});

test('queued old data and stop callbacks cannot contaminate or terminate a fresh recording', async () => {
  let oldCompletions = 0, result;
  await startRecording(() => { oldCompletions += 1; });
  const oldData = instances[0].ondataavailable;
  const oldStop = instances[0].onstop;
  stopRecording();
  await startRecording(url => { result = url; });
  assert.equal(instances[0].ondataavailable, null, 'detach old data handlers');
  assert.equal(instances[0].onstop, null, 'detach old completion handlers');
  // Browsers may already have queued a callback even after handlers are detached.
  oldData({ data: new Blob(['OLD']) });
  oldStop();
  assert.equal(streams[1].tracks[0].stops, 0);
  assert.equal(instances[1].state, 'recording');
  instances[1].emitData('NEW');
  stopRecording();
  instances[1].emitStop();
  assert.equal(await blobs.get(result).text(), 'NEW');
  assert.equal(oldCompletions, 0);
});

test('clear during capture releases tracks, stops recorder and discards all callbacks and blobs', async () => {
  let calls = 0;
  await startRecording(() => { calls += 1; });
  const oldData = instances[0].ondataavailable;
  const oldStop = instances[0].onstop;
  instances[0].emitData('discard me');
  clearRecording();
  oldData({ data: new Blob(['late']) });
  oldStop();
  assert.equal(streams[0].tracks[0].stops, 1);
  assert.equal(instances[0].stopCalls, 1);
  assert.equal(calls, 0);
  assert.equal(blobs.size, 0);
});

test('MediaRecorder constructor failure releases granted tracks and allows a later retry', async () => {
  constructorFailure = true;
  await assert.rejects(startRecording(() => {}), /initialization failed/);
  assert.equal(streams[0].tracks[0].stops, 1);
  constructorFailure = false;
  await startRecording(() => {});
  assert.equal(instances[0].state, 'recording');
  assert.equal(streams[1].tracks[0].stops, 0);
});

test('MediaRecorder start failure releases tracks and detaches handlers', async () => {
  startFailure = true;
  await assert.rejects(startRecording(() => {}), /start failed/);
  assert.equal(streams[0].tracks[0].stops, 1);
  assert.equal(instances[0].ondataavailable, null);
  assert.equal(instances[0].onstop, null);
});

test('empty capture completes once with null and natural stop releases tracks', async () => {
  const results = [];
  await startRecording(url => results.push(url));
  const stopped = instances[0].onstop;
  instances[0].emitStop();
  stopped();
  assert.deepEqual(results, [null]);
  assert.equal(streams[0].tracks[0].stops, 1);
});

test('recorder failure stops capture and returns no partial or misleading clip', async () => {
  const results = [];
  await startRecording(url => results.push(url));
  const stopped = instances[0].onstop;
  instances[0].emitData('partial');
  instances[0].onerror(new Error('device disconnected'));
  stopped();
  assert.deepEqual(results, [null]);
  assert.equal(streams[0].tracks[0].stops, 1);
  assert.equal(instances[0].state, 'inactive');
  assert.equal(blobs.size, 0);
});

test('recording is optional on insecure or unsupported browsers and requests no microphone', async () => {
  window.isSecureContext = false;
  assert.equal(recordingSupported(), false);
  await assert.rejects(startRecording(() => {}), /HTTPS/);
  assert.equal(streams.length, 0);
});
