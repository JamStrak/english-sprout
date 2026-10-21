import {gardenMusicSettings} from '../xiaoya/garden-music.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as content from '../xiaoya/content.js';
import * as learning from '../xiaoya/learning.js';
import * as curriculum from '../xiaoya/curriculum.js';
import * as stories from '../xiaoya/stories.js';
import * as storyArt from '../xiaoya/story-art.js';
import * as storyPictures from '../xiaoya/story-pictures.js';
import * as meadow from '../xiaoya/garden-meadow.js';
import * as meadowArt from '../xiaoya/meadow-art.js';
import * as meadowUI from '../xiaoya/meadow-ui.js';
import * as seedShop from '../xiaoya/seed-shop.js';
import * as gardenHistory from '../xiaoya/garden-history.js';
import * as voices from '../xiaoya/voices.js';
import * as art from '../xiaoya/art.js';
import * as gardenArt from '../xiaoya/garden-art.js';
import * as practicePlan from '../xiaoya/practice-plan.js';
import * as challenge from '../xiaoya/challenges.js';
import * as challengeUI from '../xiaoya/challenge-ui.js';
import * as matcher from '../src/speech-match.js';
import {prepareSamples} from '../xiaoya/speech-signal.js';
import {PHRASE_PACK_V015_EVENT_IDS} from '../xiaoya/phrase-pack-v015.js';
import {createWelcomeGreetings} from '../xiaoya/welcome-greetings.js';

const added = PHRASE_PACK_V015_EVENT_IDS.map(id => content.EVENTS.find(event => event.id === id));
const copy = value => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setImmediate(resolve));
const controllerSource = 'const INTERNAL_BUILD=false,GM_SANDBOX=false,appStorage=localStorage;\n'+fs.readFileSync(new URL('../xiaoya/experience.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export const /gm,'const ');
const audioSource = fs.readFileSync(new URL('../xiaoya/audio.js', import.meta.url), 'utf8')
  .replace("import {prepareSamples} from './speech-signal.js';", '')
  .replace(/export (async )?function /g, '$1function ')
  .replace("import('./speech-local.js')", 'loadSpeech()')
  .replace("import('../src/speech-match.js')", 'loadMatcher()');

// Keep the real recognition adapter and lexical policy. Only the offline ASR
// engine's transcript is injected; these tests do not claim microphone accuracy.
function recognitionFixture() {
  let heard = '';
  const requests = [];
  const sandbox = {prepareSamples, AbortController, DOMException,
    loadSpeech: async () => ({prepareSpeech: async () => {}, assessRecording: async (url, expected) => {
      requests.push({url, expected}); return {heard, engine:'fixture-local', quality:{voiced:true}};
    }}), loadMatcher: async () => matcher};
  vm.runInNewContext(`${audioSource}\nglobalThis.api={prepareRecognition,recognize};`, sandbox);
  return {...sandbox.api, requests, setHeard(value) { heard = value; }};
}

// Run the actual controller and imported data/validators. DOM, playback, timers
// and ASR are controlled boundaries; no browser storage, microphone or network.
function controllerFixture({stored = new Map(), voice = 'pip', recognized, play = () => true} = {}) {
  let html = '', sequence = 0;
  const sounds = [], recognitionCalls = [], timers = new Map(), writes = [], images = [];
  const app = {addEventListener() {}, set innerHTML(value) { html = value; }, get innerHTML() { return html; }};
  const modalRoot = {innerHTML:''};
  const document = {baseURI:'https://fixture.invalid/app/', hidden:false,
    querySelector: selector => selector === '#app' ? app : selector === '#modal-root' ? modalRoot : null,
    querySelectorAll: () => [], addEventListener() {}, body:{append() {},addEventListener() {},dispatchEvent() {},classList:{add() {},remove() {}}},
    createElement: () => ({dataset:{},innerHTML:'',open:false,setAttribute() {},addEventListener() {},focus() {},remove() {},
      get firstElementChild() {return this.innerHTML?{}:null;},showModal() {this.open=true;},close() {this.open=false;},
      querySelector(selector) {return selector==='button'&&this.innerHTML.includes('<button')?{setAttribute() {},addEventListener() {},focus() {}}:null;}})};
  const localStorage = {getItem:key => stored.get(key) ?? null, setItem(key, value) {stored.set(key, value); writes.push({key, value});}};
  const audio = {onAudioActivity(listener) {listener({playing:false,recording:false}); return () => {};}, playSound: async file => {sounds.push(file); return play(file);}, stopSound() {},
    cancelRecording() {}, cancelRecognition() {}, releaseAudioSession() {},
    prepareRecording:async () => true, speechReady:() => true, prepareRecognition:async () => true,
    recognize:async (url, accepted) => {recognitionCalls.push({url, accepted:[...accepted]});
      return recognized ?? {matched:true, stars:3, heard:accepted[0]};},
    beginRecording:async () => true, finishRecording() {}, replayClip:async () => true};
  const soundPlayer = {play:async () => true,stop() {},setState() {},status:() => ({id:null}),resolve:() => null};
  const soundSettings = {subscribe:() => () => {},reload() {}};
  const sandbox = {soundPlayer,soundSettings,SOUND_SETTINGS_KEY:'xiaoya-english:sounds:v1',queueMicrotask,createWelcomeGreetings, ...content, ...learning, ...curriculum, ...stories, ...storyArt, ...storyPictures,
    ...meadowArt, ...meadowUI, ...seedShop, ...gardenHistory, ...voices, ...art, ...gardenArt,
    ...practicePlan, ...challengeUI, meadow, challenge, audio, document, localStorage,
    readVoice:() => voice, installPaperArt() {}, bindMeadowInteractions() {}, layoutMeadowWatering() {},
    gardenMusicSettings,createMeadowMotion:()=>({capture:()=>null,play:async()=>false,cancel(){}}),createGardenMusic:()=>({setState(){},retry(){},status(){return {playing:false,blocked:false};}}),createFeedback:() => ({prepare() {}, tap() {}, play() {}, setSilent() {}, cancel() {}}),
    startAudioPack() {}, retryAudioPack() {}, onAudioPackChange() {}, audioPackMessage:() => '',
    retryArtPack() {}, onArtPackChange() {}, artPackMessage:() => '',
    recordEvidence:(state, input) => learning.recordEvidence(state, copy(input)),
    recordPractice:(state, input) => practicePlan.recordPractice(state, copy(input)),
    // Imported strict validators and JSON storage share the host realm.
    meadow:{...meadow, rewardRound:(state, input) => meadow.rewardRound(state, copy(input)),
      rewardChallenge:(state, input) => meadow.rewardChallenge(state, copy(input))},
    challenge:{...challenge,
      recordChallengeAttempt:(state, input) => challenge.recordChallengeAttempt(state, copy(input)),
      recordChallengeHelp:(state, input) => challenge.recordChallengeHelp(state, copy(input))},
    location:{search:'?garden=b'}, JSON, URL, URLSearchParams, Event, Image:class {}, navigator:{},
    window:{addEventListener() {}, scrollTo() {}},performance:{now:()=>0},matchMedia:()=>({matches:false}),
    setTimeout(fn, delay) {const id = ++sequence; timers.set(id, {fn, delay}); return id;},
    clearTimeout(id) {timers.delete(id);}};
  sandbox.createPictureLoader = options => storyPictures.createPictureLoader({...options,
    createImage:() => {const image = new sandbox.Image(); images.push(image); return image;}, setTimer:sandbox.setTimeout, clearTimer:sandbox.clearTimeout});
  vm.runInNewContext(`${controllerSource}\nglobalThis.api={startEvent,storyContinue,teach,sample,assessClip,finish,startChallenge,retryChallengeStep,restoreChallengeRewards,practiceToday,navigate,
    actions,getSession:()=>session,getState:()=>state,getPractice:()=>practice,getMeadow:()=>meadowState,getChallenges:()=>challenges,challengeSummary,getModal:()=>modal};`, sandbox);
  return {...sandbox.api, sounds, recognitionCalls, stored, writes, images, html:() => html,
    async cueDelay() {const entry=[...timers].find(([,timer])=>timer.delay===320);
      assert.ok(entry,'Review speech should wait for its entry cue');timers.delete(entry[0]);entry[1].fn();await flush();},
    async storyDelay() {await flush(); const id = sandbox.api.getSession().storyTimer, timer = timers.get(id);
      assert.ok(timer, 'The active story frame should have a delay'); timers.delete(id); timer.fn(); await flush();}};
}

function studiedStore(events, date = learning.localDay()) {
  let plan = practicePlan.createPracticePlan();
  for (const event of events) plan = practicePlan.recordPractice(plan, {roundId:`studied:${event.id}`, eventId:event.id,
    date, attemptId:null, mode:'new', rewardVariant:null});
  return new Map([[practicePlan.PRACTICE_KEY, JSON.stringify(plan)], ['xiaoya-english:garden-variant:v1','b']]);
}

test('all 60 new IDs route string and object requests to three new voices while 55 old event paths stay unchanged', () => {
  assert.equal(added.length, 60);
  for (const event of added) for (const voice of voices.VOICES) {
    const expected = `xiaoya/audio/phrases-v015/${event.id}/${voice.id}.mp3`;
    for (const input of [event.id, event, {phraseId:event.id}]) assert.equal(voices.lessonAudio(input, voice.id), expected);
    assert.equal(new URL(expected, 'https://fixture.invalid/nested/').pathname,
      `/nested/xiaoya/audio/phrases-v015/${event.id}/${voice.id}.mp3`);
  }
  const old = content.EVENTS.filter(event => !PHRASE_PACK_V015_EVENT_IDS.includes(event.id));
  assert.equal(old.length, 55);
  for (const event of old) for (const [voice, directory] of [['aiden',''], ['ryan','ryan/'], ['pip','characters/pip/']]) {
    assert.equal(voices.lessonAudio(event, voice), `./audio/${directory}${event.lessonId}.mp3`);
    assert.equal(voices.lessonAudio(event.lessonId, voice), voices.lessonAudio(event, voice));
  }
  assert.equal(voices.lessonAudio(added[0], 'unknown'), voices.lessonAudio(added[0], 'pip'));
});

test('actual recognition adapter accepts exact transcripts for every new expression without accepting another sentence', async () => {
  const f = recognitionFixture(); await f.prepareRecognition();
  for (const [index, event] of added.entries()) {
    f.setHeard(event.english);
    const exact = await f.recognize('blob:fixture-only', event.accepted);
    assert.equal(exact.matched, true, event.english); assert.equal(exact.stars, 3, event.english);
    assert.equal(exact.variant, event.english); assert.equal(f.requests.at(-1).expected, event.english);
    f.setHeard(added[(index + 1) % added.length].english);
    assert.equal((await f.recognize('blob:fixture-only', event.accepted)).matched, false, event.english);
  }
});

test('new phrases retain content words and negation under the production matching policy', async () => {
  const f = recognitionFixture(); await f.prepareRecognition();
  let checked = 0;
  for (const event of added) {
    const words = matcher.speechWords(event.english);
    for (const word of ['not','your','my','open','close']) {
      if (!words.includes(word)) continue;
      f.setHeard(words.filter(token => token !== word).join(' '));
      assert.equal((await f.recognize('blob:fixture-only', event.accepted)).matched, false, `${event.english}: missing ${word}`);
      checked++;
    }
  }
  assert.ok(checked >= 5, 'Exercise meaningful pronoun, action and negation omissions');
});

test('all new review screens stay in their real single scene and do not reveal the answer before recall', async () => {
  const f = controllerFixture(); await flush();
  for (const event of added) {
    f.sounds.length = 0; f.startEvent(event, true); await flush();
    const session = f.getSession();
    assert.equal(session.phase, 'request'); assert.equal(session.context, event.contexts[0]);
    assert.equal(session.helped, false); assert.equal(session.recallReady, true);
    assert.deepEqual(f.sounds, []);await f.cueDelay();
    assert.deepEqual(f.sounds, ['xiaoya/audio/v3/flow-review-v13.mp3']);
    assert.doesNotMatch(f.html(), /data-alternate="true"/);
  }
});

test('new phrase help plays its own Chinese hint then the selected English voice and persists supported evidence', async () => {
  for (const voice of voices.VOICES) {
    const f = controllerFixture({voice:voice.id}); await flush();
    for (const event of [added[0], added[48], added[59]]) {
      f.startEvent(event, true); await flush(); f.sounds.length = 0;
      await f.teach();
      assert.deepEqual(f.sounds, [event.hintAudio, voices.lessonAudio(event, voice.id)]);
      const session = f.getSession(); await f.assessClip(session, 'blob:fixture-only', session.speechGeneration);
      assert.deepEqual(f.recognitionCalls.at(-1).accepted, event.accepted);
      const evidence = f.getState().evidence.at(-1);
      assert.equal(evidence.eventId, event.id); assert.equal(evidence.contextId, event.contexts[0].id);
      assert.equal(evidence.result, 'supported'); assert.equal(evidence.helped, true);
      assert.equal(evidence.source, 'machine'); assert.equal('heard' in evidence, false);
      assert.equal(learning.phraseStatus(f.getState(), event.id).retained, false);
    }
  }
});

test('unloaded new artwork still teaches meaning before English and failed hint playback cannot skip ahead', async () => {
  const event = added[0];
  for (const hintWorks of [true, false]) {
    const f = controllerFixture({play:file => file === event.hintAudio ? hintWorks : true}); await flush();
    f.startEvent(event); await f.storyDelay();
    assert.equal(f.sounds[0], event.hintAudio);
    assert.deepEqual(f.sounds, hintWorks ? [event.hintAudio, voices.lessonAudio(event, 'pip')] : [event.hintAudio]);
    assert.equal(f.getSession().storyReady, hintWorks); assert.equal(f.getSession().storyError, !hintWorks);
    assert.equal(f.getSession().storyRunning, false);
  }
});

test('failed teaching audio keeps the speaking entry closed until a successful full teaching retry', async () => {
  const event = added[0], english = voices.lessonAudio(event, 'pip');
  let englishWorks = false;
  const f = controllerFixture({play:file => file !== english || englishWorks}); await flush();
  f.startEvent(event); await f.storyDelay();
  assert.equal(f.getSession().storyReady, false); assert.equal(f.getSession().storyError, true);
  assert.doesNotMatch(f.html(), /data-action="story-continue"/);
  f.storyContinue(); assert.equal(f.getSession().phase, 'story', 'An unheard target cannot start recording');
  englishWorks = true; f.sounds.length = 0;
  const retry = f.actions['story-replay'](); await f.storyDelay(); await retry;
  assert.deepEqual(f.sounds, [event.hintAudio, english]);
  assert.equal(f.getSession().storyReady, true); assert.equal(f.getSession().storyError, false);
  assert.match(f.html(), /data-action="story-continue"/);
  f.sounds.length = 0; await f.actions['story-replay']();
  assert.deepEqual(f.sounds, [english], 'After successful teaching, replays keep the quick phrase-only path');
});

test('retrying a failed Chinese meaning hint replays the hint before English even if the picture arrives meanwhile', async () => {
  const event = added[0]; let hintWorks = false;
  const f = controllerFixture({play:file => file !== event.hintAudio || hintWorks}); await flush();
  f.startEvent(event); await f.storyDelay();
  assert.equal(f.getSession().storyReady, false);
  assert.deepEqual(f.sounds, [event.hintAudio]);
  assert.ok(f.images.length, 'The teaching picture is being loaded independently');
  for (const image of f.images) image.onload?.();
  hintWorks = true; f.sounds.length = 0;
  const retry = f.actions['story-replay'](); await f.storyDelay(); await retry;
  assert.deepEqual(f.sounds, [event.hintAudio, voices.lessonAudio(event, 'pip')]);
  assert.equal(f.getSession().phase, 'story'); assert.equal(f.getSession().storyReady, true);
});

test('multiple-day parent recall of every new phrase never invents scene transfer', () => {
  let state = learning.createState();
  for (const event of added) for (const [index, date] of ['2026-10-17','2026-10-19'].entries()) {
    const context = learning.phraseCheckupContext(state, event.id);
    assert.equal(context, event.contexts[0]);
    state = learning.recordEvidence(state, {attemptId:`new:${event.id}:${index}`, eventId:event.id, contextId:context.id,
      kind:'speech', result:'independent', source:'parent', helped:false, date});
    const status = learning.phraseStatus(state, event.id);
    assert.equal(status.independent, true); assert.equal(status.retained, false); assert.equal(status.passed, false);
  }
  assert.deepEqual(learning.validateState(copy(state)), state);
});

test('unit 21 uses real new phrase recognition, awards one first clear and restores a missing wallet receipt once', async () => {
  const unit = challenge.CHALLENGE_UNITS.at(-1);
  assert.equal(unit.id, 'challenge-21'); assert.equal(challenge.CHALLENGE_UNITS.length, 21);
  const events = unit.eventIds.map(id => content.EVENTS.find(event => event.id === id));
  const stored = studiedStore(events), f = controllerFixture({stored}); await flush();
  for (const event of events) {
    f.startChallenge(unit.id); const session = f.getSession(); assert.equal(session.event.id, event.id);
    await f.assessClip(session, 'blob:fixture-only', session.speechGeneration);
    assert.deepEqual(f.recognitionCalls.at(-1).accepted, event.accepted);
  }
  assert.equal(f.challengeSummary().units.at(-1).completed, true);
  const wallet = f.getMeadow(); assert.deepEqual([wallet.shells, wallet.water], [4,6]);
  assert.equal(wallet.challengeRewards.length, 1); assert.equal(wallet.rounds.length, 0);
  assert.deepEqual(meadow.pendingChallengeSeeds(wallet), []);
  assert.deepEqual(meadow.validateMeadow(copy(wallet)), wallet);
  assert.ok(f.getPractice().entries.slice(-4).every(entry => entry.mode === 'review' && entry.rewardVariant === null));
  f.startChallenge(unit.id); const replay = f.getSession(); await f.assessClip(replay, 'blob:fixture-only', replay.speechGeneration);
  assert.deepEqual(f.getMeadow(), wallet);
  stored.delete(meadow.MEADOW_KEY);
  const restored = controllerFixture({stored}); await flush(); await restored.restoreChallengeRewards();
  assert.deepEqual(restored.getMeadow(), wallet);
  const writes = restored.writes.length; await restored.restoreChallengeRewards(); await restored.restoreChallengeRewards();
  assert.equal(restored.writes.length, writes);
  assert.equal(restored.getPractice().entries.length, f.getPractice().entries.length);
});

test('new unit help persists across refresh: fresh retry clears game progress but remains after-practice evidence', async () => {
  const unit = challenge.CHALLENGE_UNITS[6];
  const events = unit.eventIds.map(id => content.EVENTS.find(event => event.id === id));
  const stored = studiedStore(events), f = controllerFixture({stored}); await flush();
  f.startChallenge(unit.id); await f.teach();
  const supported = f.getSession(); await f.assessClip(supported, 'blob:fixture-only', supported.speechGeneration);
  assert.equal(f.challengeSummary().units[6].completedCount, 0);
  assert.deepEqual([f.getMeadow().shells, f.getMeadow().water], [0,0]);
  const refreshed = controllerFixture({stored}); await flush(); refreshed.startChallenge(unit.id);
  const retry = refreshed.getSession(); assert.equal(retry.helped, false); assert.equal(retry.priorChallengeHelp, true);
  assert.equal(retry.retryAfterAttemptId, supported.attemptId);
  await refreshed.assessClip(retry, 'blob:fixture-only', retry.speechGeneration);
  const item = refreshed.challengeSummary().units[6].items[0];
  assert.equal(item.passed, true); assert.equal(item.passEvidence, 'after-practice');
  assert.equal(refreshed.getState().evidence.at(-1).result, 'supported');
  assert.equal(learning.phraseStatus(refreshed.getState(), retry.event.id).retained, false);
  assert.deepEqual([refreshed.getMeadow().shells, refreshed.getMeadow().water], [0,0]);
});

test('new ordinary lessons save v3 rewards and tomorrow reviews without treating rewards or machine scores as mastery', async () => {
  const f = controllerFixture({stored:new Map([['xiaoya-english:preferences:v1', JSON.stringify({mic:true})]])}); await flush();
  for (const event of added.slice(0,2)) {
    f.startEvent(event); await f.storyDelay(); f.storyContinue(); await flush();
    const session = f.getSession(); await f.assessClip(session, 'blob:fixture-only', session.speechGeneration);
    assert.equal(session.phase, 'resolved'); await f.finish();
    assert.equal(session.phase, 'reward');
    assert.equal(f.getPractice().entries.at(-1).eventId, event.id);
    assert.equal(f.getPractice().entries.at(-1).rewardVariant, 'b');
  }
  assert.equal(f.getModal(), null);
  const wallet = f.getMeadow();
  assert.deepEqual(wallet.rounds.map(round => [round.eventId, round.rewardVersion, round.amounts]), [
    [added[0].id, 3, {shells:2, water:3}], [added[1].id, 3, {shells:2, water:2}],
  ]);
  const today = learning.localDay(), tomorrow = practicePlan.addPracticeDays(today, 1);
  const earned = meadow.claimReward(wallet, wallet.rounds[1].roundId, 'water');
  assert.deepEqual([earned.shells, earned.water], [2,5]);
  const options = {date:tomorrow, learningState:f.getState()};
  const before = practicePlan.getPracticePlan(f.getPractice(), {...options, rounds:wallet.rounds});
  const after = practicePlan.getPracticePlan(f.getPractice(), {...options, rounds:earned.rounds});
  assert.deepEqual(after, before, 'Choosing a reward cannot alter recall due dates');
  assert.ok(added.slice(0,2).every(event => after.dueIds.includes(event.id)));
  for (const event of added.slice(0,2)) {
    const card = after.cards.find(item => item.eventId === event.id);
    assert.equal(card.lastOutcome, 'supported'); assert.equal(card.intervalDays, 1);
    assert.equal(card.dueDate, tomorrow);
    assert.equal(learning.phraseStatus(f.getState(), event.id).retained, false);
  }
  const event = added[0], attemptId = 'next-day-daily-recall';
  const state = learning.recordEvidence(f.getState(), {attemptId, eventId:event.id, contextId:event.contexts[0].id,
    date:tomorrow, kind:'speech', result:'independent', source:'machine', helped:false});
  const plan = practicePlan.recordPractice(f.getPractice(), {roundId:'next-day-daily-round', eventId:event.id,
    date:tomorrow, attemptId, mode:'review', rewardVariant:null});
  const revisited = practicePlan.getPracticePlan(plan, {date:tomorrow, learningState:state, rounds:earned.rounds});
  const card = revisited.cards.find(item => item.eventId === event.id);
  assert.equal(card.lastOutcome, 'machine-candidate'); assert.equal(card.intervalDays, 3);
  assert.equal(card.dueDate, practicePlan.addPracticeDays(tomorrow, 3));
  assert.equal(learning.phraseStatus(state, event.id).retained, false);
});
