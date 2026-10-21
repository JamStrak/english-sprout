import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryStorage} from '../xiaoya/runtime.js';
import {DEFAULT_ECONOMY_SETTINGS,ECONOMY_SETTINGS_KEY} from '../xiaoya/economy-settings.js';
import {GROWTH_SETTINGS_KEY} from '../xiaoya/growth-settings.js';
import {config} from '../xiaoya/growth-core.js';
import {GROWTH_FLOWERS} from '../xiaoya/growth-catalog.js';
import {normalizeSoundSettings,SOUND_SETTINGS_KEY} from '../xiaoya/sound-settings.js';
import {exportTuningBackup,restoreTuningBackup,validateTuningBackup,PREFERENCES_KEY} from '../xiaoya/tuning-backup.js';

const ids=GROWTH_FLOWERS.map(f=>f.id);
function fixture(){
  const growth=config({defaults:{totalWater:12,scales:[.3,.5,.7,.9,1.2]},motion:{sway:16,bounce:18},overrides:{[ids[0]]:{totalWater:15,scales:[.4,.6,.8,1,1.4]}}},ids);
  const sounds=normalizeSoundSettings({volume:.13,customAssets:{'custom-chime':{title:'我的音效',url:'data:audio/mpeg;base64,AQIDBA=='}}});
  const first=Object.keys(sounds.events)[0];sounds.events[first].assetId='custom-chime';sounds.events[first].volume=.31;
  return createMemoryStorage({[ECONOMY_SETTINGS_KEY]:JSON.stringify({...DEFAULT_ECONOMY_SETTINGS,packPrice:8,giantChance:.42}),[GROWTH_SETTINGS_KEY]:JSON.stringify(growth),[SOUND_SETTINGS_KEY]:JSON.stringify(sounds),[PREFERENCES_KEY]:JSON.stringify({welcome:true,mic:true,gardenMusic:{enabled:false,volume:.03}}),'child-learning':'do-not-export','child-garden':'private','wallet':'123'});
}
function snapshot(storage){return Object.fromEntries(Array.from({length:storage.length},(_,i)=>storage.key(i)).sort().map(key=>[key,storage.getItem(key)]));}

test('all settings export/import round trip preserves overrides, motion, sounds and music, without child records',()=>{
  const source=fixture(),backup=exportTuningBackup({storage:source});
  const serialized=JSON.stringify(backup);
  assert(!serialized.includes('do-not-export'));assert(!serialized.includes('private'));assert(!serialized.includes('welcome'));assert(!serialized.includes('mic'));
  const destination=createMemoryStorage({[PREFERENCES_KEY]:JSON.stringify({welcome:false,mic:false,guideStep:'done'}),'child-learning':'keep-learning','wallet':'55'});
  const result=restoreTuningBackup(serialized,{storage:destination});assert.equal(result.ok,true,result.error);
  assert.deepEqual(exportTuningBackup({storage:destination}).settings,backup.settings);
  assert.deepEqual(JSON.parse(destination.getItem(PREFERENCES_KEY)),{welcome:false,mic:false,guideStep:'done',gardenMusic:{enabled:false,volume:.03}});
  assert.equal(destination.getItem('child-learning'),'keep-learning');assert.equal(destination.getItem('wallet'),'55');
  assert.equal(backup.settings.growth.overrides[ids[0]].totalWater,15);assert.equal(backup.settings.growth.motion.sway,16);
  assert.equal(backup.settings.sounds.customAssets['custom-chime'].bytes,4);
});
test('malformed, unknown version, out of range, foreign fields and invalid audio backups cause zero writes',()=>{
  const source=fixture(),base=exportTuningBackup({storage:source});
  const cases=['{bad', {...base,schema:'xiaoya-tuning-backup/v99'}, {...base,childData:{}},
    {...base,settings:{...base.settings,economy:{...base.settings.economy,giantChance:1.1}}},
    {...base,settings:{...base.settings,growth:{...base.settings.growth,motion:{...base.settings.growth.motion,sway:99}}}},
    {...base,settings:{...base.settings,growth:{...base.settings.growth,overrides:{unknown:{totalWater:5,scales:[.4,.5,.6,.8,1]}}}}},
    {...base,settings:{...base.settings,sounds:{...base.settings.sounds,customAssets:{'custom-chime':{url:'https://example.com/bad.mp3'}}}}},
    {...base,settings:{...base.settings,gardenMusic:{enabled:true,volume:-1}}}];
  for(const input of cases){let writes=0;const storage={getItem:()=>null,setItem(){writes++;},removeItem(){writes++;}};const result=restoreTuningBackup(input,{storage});assert.equal(result.ok,false);assert.equal(writes,0);}
});
test('mid-write storage failure rolls back all previous values, including missing keys',()=>{
  const backup=exportTuningBackup({storage:fixture()});
  for(const existing of [false,true])for(const failureAt of [1,2,3,4]){
    const storage=existing?fixture():createMemoryStorage({[PREFERENCES_KEY]:'{"welcome":true}','wallet':'3'}),before=snapshot(storage);let count=0;
    const adapter={getItem:storage.getItem,removeItem:storage.removeItem,setItem(key,value){if(++count===failureAt)throw Error('simulated quota');storage.setItem(key,value);}};
    backup.settings.economy.packPrice=11;
    const result=restoreTuningBackup(backup,{storage:adapter});assert.equal(result.ok,false);assert.deepEqual(result.rollbackErrors,[]);assert.deepEqual(snapshot(storage),before);
  }
});
test('a second storage failure during rollback is explicitly reported',()=>{
  const storage=fixture(),backup=exportTuningBackup({storage});let count=0;
  backup.settings.economy.packPrice=22;
  const adapter={getItem:storage.getItem,removeItem:storage.removeItem,setItem(key,value){if(++count>=2)throw Error('storage unavailable');storage.setItem(key,value);}};
  const result=restoreTuningBackup(backup,{storage:adapter});
  assert.equal(result.ok,false);assert.equal(result.rollbackErrors.length,1);assert.match(result.error,/未能回滚/);
  assert.equal(JSON.parse(storage.getItem(ECONOMY_SETTINGS_KEY)).packPrice,22);
});
test('defaults can be exported, and corrupt saved JSON is never silently replaced during backup',()=>{
  assert.doesNotThrow(()=>validateTuningBackup(exportTuningBackup({storage:createMemoryStorage()})));
  const storage=createMemoryStorage({[ECONOMY_SETTINGS_KEY]:'not-json'});
  assert.throws(()=>exportTuningBackup({storage}),/无法读取/);assert.equal(storage.getItem(ECONOMY_SETTINGS_KEY),'not-json');
});
