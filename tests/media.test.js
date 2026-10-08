import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { playFile, stopAudio, startRecording, stopRecording, clearRecording, recordingSupported } from '../src/media.js';
import { VOICE_STORAGE_KEY, readVoicePreference, saveVoicePreference, voiceAudioPath, englishAudioFiles } from '../src/voices.js';

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalRecorder = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder');
const originalAudio = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalCreateURL = URL.createObjectURL;
const originalRevokeURL = URL.revokeObjectURL;
let instances, blobs, revoked, streams, constructorFailure, startFailure, audioInstances, audioPlayResult;

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

beforeEach(() => {
  instances = []; blobs = new Map(); revoked = []; streams = [];
  constructorFailure = false; startFailure = false;
  audioInstances = []; audioPlayResult = null;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { baseURI: 'https://example.test/english-sprout/' } });
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: class {
    constructor(url) { this.src = String(url); this.paused = true; audioInstances.push(this); }
    play() { this.paused = false; return audioPlayResult ? audioPlayResult(this) : Promise.resolve(); }
    pause() { this.paused = true; }
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
  assert.equal(files.length, 240); assert.equal(new Set(files).size, 240);
  assert.equal(voiceAudioPath('audio/hello-01.mp3', 'aiden'), 'audio/hello-01.mp3');
  assert.equal(voiceAudioPath('audio/hello-01.mp3', 'ryan'), 'audio/ryan/hello-01.mp3');
  assert.equal(voiceAudioPath('audio/hello-01.mp3', 'unknown'), 'audio/hello-01.mp3');
  for (const path of ['audio/ui/listen.mp3', 'blob:local-recording', 'audio/ryan/hello-01.mp3']) assert.equal(voiceAudioPath(path, 'ryan'), path);
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

test('Switching voice during pending playback ignores only the interrupted sample failure', async () => {
  const interrupted = deferred(); audioPlayResult = () => interrupted.promise;
  const first = playFile('audio/hello-01.mp3'); audioPlayResult = null;
  await playFile('audio/ryan/hello-01.mp3'); interrupted.reject(new DOMException('Playback interrupted', 'AbortError')); await first;
  assert.equal(audioInstances[0].paused, true); assert.equal(audioInstances[1].paused, false);
  audioPlayResult = () => Promise.reject(new Error('Missing audio'));
  await assert.rejects(playFile('audio/missing.mp3'), /Missing audio/);
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
