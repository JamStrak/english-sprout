import test from 'node:test';
import assert from 'node:assert/strict';
import {waterTargetHeight,waterTargetLayout} from '../xiaoya/meadow-ui.js';

function checkTargets(positions,width,height){
  assert.equal(new Set(positions.map(p=>p.id)).size,positions.length);
  for(const p of positions){assert.ok(p.x>=24&&p.x<=width-24);assert.ok(p.y>=24&&p.y<=height-24);}
  for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++){
    const a=positions[i],b=positions[j];assert.ok(Math.abs(a.x-b.x)>=48||Math.abs(a.y-b.y)>=48,`${a.id} overlaps ${b.id}`);
  }
}

test('overlapping seedlings each retain a distinct 48px touch target on narrow and wide meadows',()=>{
  for(const width of [270,300,370,748,920]){
    const anchors=Array.from({length:12},(_,i)=>({id:`plant-${i}`,x:width/2,y:180}));
    const height=Math.max(258,waterTargetHeight(anchors.length,width));
    const positions=waterTargetLayout(anchors,width,height);
    assert.equal(positions.length,anchors.length);checkTargets(positions,width,height);
  }
});

test('edge-clamped plants and a full 181-plant garden never lose or overlap targets',()=>{
  for(const width of [270,370,748]){
    const anchors=Array.from({length:181},(_,i)=>({id:`plant-${i}`,x:i%2?width:-10,y:i%3?9000:-10}));
    const height=Math.max(258,waterTargetHeight(anchors.length,width));
    const positions=waterTargetLayout(anchors,width,height);
    assert.equal(positions.length,181);checkTargets(positions,width,height);
  }
});

test('watering and blooming do not move other targets under the child’s next tap',()=>{
  const anchors=Array.from({length:8},(_,i)=>({id:`plant-${i}`,x:150,y:150}));
  const first=waterTargetLayout(anchors,300,400);
  const changed=anchors.filter((_,i)=>i!==2).map(p=>({...p,y:100}));
  const next=waterTargetLayout(changed,300,400,first);
  for(const p of next){const old=first.find(q=>q.id===p.id);assert.deepEqual([p.x,p.y],[old.x,old.y]);}
  checkTargets(next,300,400);
});

test('resizing recalculates targets within the new meadow without dropping plants',()=>{
  const anchors=Array.from({length:42},(_,i)=>({id:`plant-${i}`,x:700,y:200}));
  const first=waterTargetLayout(anchors,748,400);
  const height=waterTargetHeight(42,270),narrow=waterTargetLayout(anchors,270,height,first);
  assert.equal(narrow.length,42);checkTargets(narrow,270,height);
  assert.throws(()=>waterTargetLayout(anchors,270,258),RangeError);
});
