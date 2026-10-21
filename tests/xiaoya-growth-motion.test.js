import test from 'node:test';
import assert from 'node:assert/strict';
import {MOTION_DEFAULTS, MOTION_PRESETS, motionConfig, motionFrame} from '../xiaoya/growth-motion.js';
import {config} from '../xiaoya/growth-core.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('motion settings sanitize corrupt saved data and bound imported numbers',()=>{
  for(const bad of [null,undefined,[],false,42,'bad'])assert.deepEqual(motionConfig(bad),MOTION_DEFAULTS);
  for(const bad of ['', ' ',null,true,[],{},NaN,Infinity])assert.equal(motionConfig({sway:bad}).sway,MOTION_DEFAULTS.sway);
  assert.deepEqual(motionConfig({duration:1,sway:999,flex:'42.6',bounce:-5,crossfade:999,particles:999,extra:1}),
    {duration:700,sway:18,flex:43,bounce:0,crossfade:350,particles:100});
  const old=config({defaults:{totalWater:14}});
  assert.equal(old.defaults.totalWater,14);
  assert.deepEqual(old.motion,MOTION_DEFAULTS);
  assert.equal(config({...old,motion:{sway:7}}).motion.sway,7);
});

test('all styles finish exactly at the next size with no remaining sway or effects',()=>{
  for(const preset of Object.values(MOTION_PRESETS)){
    const start=motionFrame(0,.4,.43,preset),end=motionFrame(1,.4,.43,preset);
    close(start.scale,.4);close(start.mix,0);close(start.angle,0);close(start.bend,0);
    close(end.scale,.43);close(end.angle,0);close(end.bend,0);close(end.stretch,1);close(end.mix,1);
    assert.equal(end.phase,'idle');close(end.impact,1);close(end.spark,1);
    assert.deepEqual(motionFrame(2,.4,.43,preset),end);
    assert.deepEqual(motionFrame(-1,.4,.43,preset),start);
  }
});

test('each drop has both sway directions, flexible follow through, blending and a growth bounce',()=>{
  const frames=Array.from({length:201},(_,i)=>motionFrame(i/200,.4,.43));
  assert.ok(frames.some(f=>f.angle>1));assert.ok(frames.some(f=>f.angle<-.5));
  assert.ok(frames.some(f=>Math.abs(f.bend)>1));
  assert.ok(frames.some(f=>f.mix>0&&f.mix<1));
  assert.ok(frames.some(f=>f.scale>.43));
  assert.ok(frames.some(f=>f.phase==='drop'));
  assert.ok(frames.some(f=>f.phase==='sway'));
  assert.ok(frames.some(f=>f.phase==='grow'));
  assert.ok(frames.some(f=>f.phase==='settle'));
  for(let i=1;i<frames.length;i++){
    assert.ok(frames[i].mix>=frames[i-1].mix);
    assert.ok(Math.abs(frames[i].scale-frames[i-1].scale)<.01,'no abrupt scale jump');
    assert.ok(Object.values(frames[i]).filter(v=>typeof v==='number').every(Number.isFinite));
  }
});

test('motion controls affect their intended feedback and reduced motion remains calm',()=>{
  for(const [duration,crossfade] of [[2400,120],[1400,600],[700,350]]){
    const motion={...MOTION_DEFAULTS,duration,crossfade};
    close(motionFrame(.48+crossfade/duration/2,.4,.5,motion).mix,.5);
    close(motionFrame(.48+crossfade/duration,.4,.5,motion).mix,1);
  }
  const soft=motionFrame(.4,.4,.5,{...MOTION_DEFAULTS,sway:0,flex:0,bounce:0});
  close(soft.angle,0);close(soft.bend,0);
  assert.ok(motionFrame(.6,.4,.5,{...MOTION_DEFAULTS,crossfade:120}).mix>
    motionFrame(.6,.4,.5,{...MOTION_DEFAULTS,crossfade:500}).mix);
  for(const t of [0,.2,.5,.8,1]){
    const reduced=motionFrame(t,.4,.5,MOTION_PRESETS.bouncy,true);
    for(const key of ['angle','bend','drop','impact','spark'])close(reduced[key],0);
    close(reduced.stretch,1);assert.ok(reduced.scale>=.4&&reduced.scale<=.5);
    assert.equal(reduced.phase,t===1?'idle':'grow');
  }
});
