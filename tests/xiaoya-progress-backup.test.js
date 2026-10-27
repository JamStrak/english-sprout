import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryStorage} from '../xiaoya/runtime.js';
import {createState,STORAGE_KEY} from '../xiaoya/learning.js';
import {createMeadow,MEADOW_KEY} from '../xiaoya/garden-meadow.js';
import {createPracticePlan,PRACTICE_KEY} from '../xiaoya/practice-plan.js';
import {createChallenges,CHALLENGE_KEY} from '../xiaoya/challenges.js';
import {LEGACY_GARDEN_KEY} from '../xiaoya/garden-history.js';
import {VOICE_KEY} from '../xiaoya/voices.js';
import {createProgressBackup,parseProgressBackup,snapshotProgress,restoreProgress,PREFERENCES_KEY,RESTORE_KEY} from '../xiaoya/progress-backup.js';
const str=JSON.stringify;
function fixture(){return createMemoryStorage({[STORAGE_KEY]:str(createState()),[MEADOW_KEY]:str(createMeadow()),[PRACTICE_KEY]:str(createPracticePlan()),[CHALLENGE_KEY]:str(createChallenges()),[PREFERENCES_KEY]:str({mic:false,shopSeen:true}),[VOICE_KEY]:'pip',[LEGACY_GARDEN_KEY]:str({schemaVersion:1,product:'xiaoya-english-garden',rounds:[]})});}
test('portable backup preserves complete records and replaces target exactly',()=>{
  const source=fixture(),target=createMemoryStorage({'xiaoya-english:guidance:v1':str({visited:true,seen:['old']})});
  const backup=parseProgressBackup(str(createProgressBackup(source)));
  restoreProgress(target,backup,snapshotProgress(target));
  assert.deepEqual(snapshotProgress(target),snapshotProgress(source));assert.equal(target.getItem(RESTORE_KEY),null);
});
test('v0.27 export keeps raw historic garden and validates every required record',()=>{
  const storage=fixture();const old={product:'xiaoya-english',exported:'2026-10-27',state:createState(),rawGarden:storage.getItem(LEGACY_GARDEN_KEY),meadow:createMeadow(),practice:createPracticePlan(),challenges:createChallenges(),preferences:{mic:false},voice:'pip'};
  const parsed=parseProgressBackup(str(old));assert.equal(parsed.records[LEGACY_GARDEN_KEY],old.rawGarden);
  for(const malformed of [{...old,rawGarden:'bad'}, {...old,meadow:null},{...old,testing:{mode:'gm-simulation'}},{problem:'broken',rawState:'bad'}])assert.throws(()=>parseProgressBackup(str(malformed)));
});
test('damaged, newer, simulation and oversized backups never alter storage',()=>{
  const storage=fixture(),before=snapshotProgress(storage),backup=createProgressBackup(storage);
  for(const damaged of [{...backup,mode:'gm-simulation'},{...backup,schemaVersion:2},{...backup,records:{...backup.records,[MEADOW_KEY]:'{"shells":900}'}},{...backup,records:{}}])assert.throws(()=>parseProgressBackup(str(damaged)));
  assert.throws(()=>parseProgressBackup('x'.repeat(10*1024*1024+1)));assert.deepEqual(snapshotProgress(storage),before);
});
test('oversized local progress is rejected before creating an unusable backup',()=>{
  const storage=fixture();storage.setItem(PREFERENCES_KEY,str({note:'x'.repeat(10*1024*1024)}));
  assert.throws(()=>createProgressBackup(storage),/大小上限/);
});
test('stale preview is rejected; a failed write rolls back every record',()=>{
  const source=fixture(),base=fixture();const backup=parseProgressBackup(str(createProgressBackup(source))),stale=snapshotProgress(base);
  base.setItem(PREFERENCES_KEY,str({mic:true}));assert.throws(()=>restoreProgress(base,backup,stale),/发生变化/);
  const before=snapshotProgress(base);let failed=false;
  const faulty={getItem:key=>base.getItem(key),removeItem:key=>base.removeItem(key),setItem(key,value){if(key===MEADOW_KEY&&!failed){failed=true;throw Error('quota');}base.setItem(key,value);}};
  assert.throws(()=>restoreProgress(faulty,backup,before),/已回滚/);assert.deepEqual(snapshotProgress(base),before);assert.equal(base.getItem(RESTORE_KEY),null);
});
test('reports failed rollback and refuses existing restore marker',()=>{
  const source=fixture(),target=fixture(),backup=parseProgressBackup(str(createProgressBackup(source))),before=snapshotProgress(target);
  target.setItem(RESTORE_KEY,'other');assert.throws(()=>restoreProgress(target,backup,before),/另一页面/);target.removeItem(RESTORE_KEY);
  const faulty={getItem:key=>target.getItem(key),removeItem:key=>target.removeItem(key),setItem(key,value){if(key===MEADOW_KEY)throw Error('permanent');target.setItem(key,value);}};
  assert.throws(()=>restoreProgress(faulty,backup,before),/未能完全回滚/);
});
