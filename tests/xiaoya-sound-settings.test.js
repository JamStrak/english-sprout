import test from 'node:test';
import assert from 'node:assert/strict';
import {SOUND_EVENTS, SOUND_ASSETS} from '../xiaoya/sound-catalog.js';
import {createMemoryStorage} from '../xiaoya/runtime.js';
import {SOUND_SETTINGS_KEY, SOUND_FILE_LIMIT, normalizeSoundSettings, createSoundSettingsStore} from '../xiaoya/sound-settings.js';

const eventId = SOUND_EVENTS[0].id;
const assetId = SOUND_ASSETS[1].id;
const custom = (id = 'custom-test', bytes = 12) => ({id,title:'本机样本.wav',url:`data:audio/wav;base64,${Buffer.alloc(bytes).toString('base64')}`,bytes,mime:'audio/wav'});

test('sound defaults cover every usage point and preserve intentional default-disabled feedback', () => {
  const defaults = normalizeSoundSettings();
  assert.equal(defaults.enabled,true); assert.equal(defaults.volume,.65);
  assert.equal(Object.keys(defaults.events).length,SOUND_EVENTS.length);
  for (const event of SOUND_EVENTS) {
    assert.deepEqual(defaults.events[event.id],{enabled:event.enabled !== false,assetId:event.assetId,volume:event.volume});
  }
  assert.equal(defaults.events['record-stop'].enabled,false);
  const broken = normalizeSoundSettings({volume:'0.2',events:{[eventId]:{volume:Infinity,assetId:'missing'},intruder:{assetId}},customAssets:{'custom-url':{url:'https://example.com/clip.mp3'}}});
  assert.equal(broken.volume,.65); assert.deepEqual(broken.events[eventId],defaults.events[eventId]);
  assert.equal(broken.events.intruder,undefined); assert.deepEqual(broken.customAssets,{});
});

test('partial changes persist independently, including deletion, replacement, volume and reset', () => {
  const storage = createMemoryStorage(), store = createSoundSettingsStore({storage});
  assert.equal(store.save({enabled:false,volume:.25,events:{[eventId]:{enabled:false,assetId,volume:.32}}}).ok,true);
  assert.equal(store.save({events:{[eventId]:{assetId:null}}}).ok,true);
  const second = createSoundSettingsStore({storage});
  assert.deepEqual(second.get().events[eventId],{enabled:false,assetId:null,volume:.32});
  assert.equal(second.get().volume,.25); assert.equal(second.get().enabled,false);
  assert.equal(second.resetEvent(eventId).ok,true);
  assert.deepEqual(second.get().events[eventId],normalizeSoundSettings().events[eventId]);
  assert.equal(second.get().enabled,false);
  assert.equal(second.resetAll().ok,true); assert.deepEqual(second.get(),normalizeSoundSettings());
});

test('storage failures preserve both last saved state and observer state', () => {
  const base = createMemoryStorage(); let fail = false, updates = 0;
  const storage = {getItem:key => base.getItem(key),setItem(key,value) { if (fail) throw Object.assign(new Error('full'),{name:'QuotaExceededError'}); base.setItem(key,value); }};
  const store = createSoundSettingsStore({storage}), unsubscribe = store.subscribe(() => updates++);
  store.subscribe(() => { throw new Error('consumer bug'); });
  assert.equal(store.save({volume:.4}).ok,true); assert.equal(updates,1);
  const before = store.get(), persisted = base.getItem(SOUND_SETTINGS_KEY); fail = true;
  const rejected = store.save({volume:.9});
  assert.equal(rejected.ok,false); assert.match(rejected.error,/未保存/);
  assert.deepEqual(store.get(),before); assert.equal(base.getItem(SOUND_SETTINGS_KEY),persisted); assert.equal(updates,1);
  unsubscribe(); fail = false; assert.equal(store.save({volume:.3}).ok,true); assert.equal(updates,1);
});

test('custom assets are embedded once, reference checked, and can be removed after unbinding', () => {
  const store = createSoundSettingsStore({storage:createMemoryStorage()}), asset = custom();
  assert.equal(store.save({customAssets:{[asset.id]:asset},events:{[eventId]:{assetId:asset.id}}}).ok,true);
  const saved = store.get().customAssets[asset.id];
  assert.equal(saved.url,asset.url); assert.equal(saved.bytes,12); assert.equal(saved.dataUrl,undefined);
  assert.equal(store.save({customAssets:{[asset.id]:null}}).ok,false);
  assert.equal(store.get().events[eventId].assetId,asset.id);
  assert.equal(store.resetAll().ok,true);
  assert.equal(store.get().customAssets[asset.id].url,asset.url);
  assert.equal(store.get().events[eventId].assetId,SOUND_EVENTS[0].assetId);
  assert.equal(store.save({events:{[eventId]:{assetId:asset.id}}}).ok,true);
  assert.equal(store.save({customAssets:{[asset.id]:null},events:{[eventId]:{assetId:null}}}).ok,true);
  assert.equal(store.get().customAssets[asset.id],undefined);
});

test('external URLs, unsupported data, invalid references and oversized assets fail without applying', () => {
  const store = createSoundSettingsStore({storage:createMemoryStorage()}), initial = store.get();
  for (const url of ['https://example.com/music.mp3','javascript:alert(1)','data:text/html;base64,AAAA','data:audio/wav;base64,!!','data:audio/wav;base64,AAA']) {
    assert.equal(store.save({customAssets:{'custom-bad':{url}}}).ok,false);
    assert.deepEqual(store.get(),initial);
  }
  assert.equal(store.save({events:{[eventId]:{assetId:'missing'}}}).ok,false);
  assert.equal(store.save({events:{unknown:{assetId}}}).ok,false);
  assert.equal(store.save({customAssets:{'custom-large':custom('custom-large',SOUND_FILE_LIMIT + 1)}}).ok,false);
  const large = custom('custom-a',SOUND_FILE_LIMIT);
  assert.equal(store.save({customAssets:{'custom-a':large}}).ok,true);
  const before = store.get();
  assert.equal(store.save({customAssets:{'custom-b':{...large,id:'custom-b'}}}).ok,false);
  assert.deepEqual(store.get(),before);
});

test('reading and exporting are defensive and corrupt saved values are never rewritten on load', () => {
  const storage = createMemoryStorage({[SOUND_SETTINGS_KEY]:'{invalid'}), store = createSoundSettingsStore({storage});
  assert.deepEqual(store.get(),normalizeSoundSettings()); assert.equal(storage.getItem(SOUND_SETTINGS_KEY),'{invalid');
  const snapshot = store.get(); snapshot.events[eventId].assetId = null; snapshot.enabled = false;
  const exported = store.export(); exported.events[eventId].volume = 0;
  assert.deepEqual(store.get(),normalizeSoundSettings());
  assert.equal(store.save({volume:2,events:{[eventId]:{volume:-1}}}).ok,true);
  assert.equal(store.get().volume,1); assert.equal(store.get().events[eventId].volume,0);
});
