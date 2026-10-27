import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeadow,validateMeadow,setMeadowBalance,rewardRound,openSeedPack,plantSeed,waterPlant} from '../xiaoya/garden-meadow.js';

const clone=value=>JSON.parse(JSON.stringify(value));

test('setting real balances preserves earlier history and later garden spending',()=>{
  const original=rewardRound(createMeadow(),{roundId:'first',eventId:'food-water',date:'2026-10-17'});
  const snapshot=clone(original);
  let state=setMeadowBalance(original,{shells:10,water:7});
  assert.deepEqual(original,snapshot);
  assert.equal(state.schemaVersion,7);
  assert.deepEqual(state.balanceAdjustments,{shells:8,water:4});
  state=openSeedPack(state,0,.99);
  state=plantSeed(state,{x:.5,y:.5});
  state=waterPlant(state,state.plants[0].id);
  assert.deepEqual([state.shells,state.water],[8,6]);
  state=setMeadowBalance(clone(state),{shells:1,water:0});
  assert.deepEqual([state.shells,state.water],[1,0]);
  assert.deepEqual(state.balanceAdjustments,{shells:1,water:-2});
  assert.equal(state.rounds.length,1);
  assert.equal(state.plants[0].waterings,1);
  assert.deepEqual(validateMeadow(clone(state)),state);
  assert.strictEqual(setMeadowBalance(state,{shells:1,water:0}),state);
});

test('invalid amounts and inconsistent adjustment records are rejected without mutating the original',()=>{
  const original=createMeadow(),snapshot=clone(original);
  for(const bad of [-1,1.5,NaN,Infinity,'2',1000000001,Number.MAX_SAFE_INTEGER]) {
    assert.throws(()=>setMeadowBalance(original,{shells:bad,water:0}),/数量/);
    assert.throws(()=>setMeadowBalance(original,{shells:0,water:bad}),/数量/);
  }
  for(const value of [{shells:1},{shells:1,water:1,extra:0},null]) assert.throws(()=>setMeadowBalance(original,value));
  assert.deepEqual(original,snapshot);
  const adjusted=setMeadowBalance(original,{shells:10,water:10});
  assert.throws(()=>validateMeadow({...adjusted,shells:11}),/余额/);
  assert.throws(()=>validateMeadow({...adjusted,balanceAdjustments:{shells:1.1,water:10}}),/调整/);
});
