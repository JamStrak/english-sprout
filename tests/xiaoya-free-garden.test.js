import test from 'node:test';
import assert from 'node:assert/strict';
import {LEGACY_GARDEN_KEY,readGardenHistory} from '../xiaoya/garden-history.js';
import {createGarden,rewardRound as legacyReward,openSeedPack,plantSeed,waterPlant} from '../xiaoya/garden.js';
import {createMeadow,rewardRound as meadowReward} from '../xiaoya/garden-meadow.js';
import {createState} from '../xiaoya/learning.js';
import {createPracticePlan,getPracticePlan} from '../xiaoya/practice-plan.js';

const round={roundId:'legacy-completed-1',eventId:'food-water',date:'2026-10-01'};
const legacy=()=>waterPlant(plantSeed(openSeedPack(legacyReward(createGarden(),round))),'plant-1');

test('retired garden keeps its exact archive and independent practice history without moving its wallet',()=>{
  const stored=legacy(),raw=JSON.stringify(stored);
  const result=readGardenHistory(raw);
  assert.equal(LEGACY_GARDEN_KEY,'xiaoya-english:garden:v1');
  assert.deepEqual(result.archive,stored);
  assert.equal(JSON.stringify(result.archive),raw);
  assert.deepEqual(result.rounds,[round]);
  assert.notEqual(result.rounds,result.archive.rounds);
  assert.notEqual(result.rounds[0],result.archive.rounds[0]);
  result.rounds[0].date='2026-10-02';
  assert.equal(JSON.stringify(result.archive),raw,'Scheduling copies cannot mutate the archived garden');
  assert.deepEqual(readGardenHistory(null),{archive:null,rounds:[]});
});

test('old garden participation and current meadow participation preserve the same review schedule',()=>{
  const archive=legacy(),meadow=meadowReward(createMeadow(),{roundId:'current-1',eventId:'hello-goodbye',date:'2026-10-01'});
  const before=JSON.stringify({archive,meadow});
  const options={learningState:createState(),date:'2026-10-02'};
  const original=getPracticePlan(createPracticePlan(),{...options,rounds:[...archive.rounds,...meadow.rounds]});
  const current=getPracticePlan(createPracticePlan(),{...options,rounds:[...readGardenHistory(JSON.stringify(archive)).rounds,...meadow.rounds]});
  assert.deepEqual(current,original);
  assert.equal(current.cards.find(card=>card.eventId==='food-water').firstDate,round.date);
  assert.equal(current.cards.find(card=>card.eventId==='food-water').due,true);
  assert.equal(JSON.stringify({archive,meadow}),before);
});

test('invalid historical participation is rejected instead of inventing or discarding a child record',()=>{
  const archive=legacy();
  for(const invalid of [
    'not-json','null','[]',JSON.stringify({...archive,schemaVersion:2}),
    JSON.stringify({...archive,product:'other-product'}),
    JSON.stringify({...archive,rounds:[round,round]}),
    ...[
      {...round,eventId:'missing-event'},
      {...round,date:'2026-02-29'},
      {...round,date:'1999-12-31'},
      {...round,roundId:'__proto__'},
      {...round,reward:'shells'},
      {roundId:round.roundId,eventId:round.eventId},
    ].map(value=>JSON.stringify({...archive,rounds:[value]})),
  ]) assert.throws(()=>readGardenHistory(invalid),/历史花园记录无法读取/);
  assert.equal(JSON.stringify(archive),JSON.stringify(legacy()));
});
