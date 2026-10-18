import test from 'node:test';
import assert from 'node:assert/strict';
import {bindMeadowInteractions} from '../xiaoya/meadow-ui.js';

function fixture(t){
  const listeners=new Map(),watered=[],drop={dataset:{waterPlant:'seed-1'},closest(selector){return selector==='[data-water-plant]'?this:null;}};
  const root={addEventListener(type,handler){listeners.set(type,handler);},hasPointerCapture(){return false;}};
  const previous=globalThis.document;globalThis.document={elementFromPoint(){return drop;}};
  t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
  const cancel=bindMeadowInteractions(root,{read:()=>({active:true,tool:'can'}),onTouch(){},onWater:id=>watered.push(id),onSelect(){},onPlant(){}});
  const send=(type,extra={})=>listeners.get(type)?.({target:drop,pointerId:1,isPrimary:true,button:0,clientX:100,clientY:100,detail:1,preventDefault(){},stopImmediatePropagation(){},...extra});
  return {send,cancel,watered};
}

for(const mode of ['session cancellation','pointer cancellation'])test(`${mode} discards a held water drop and its late compatibility click`,t=>{
  const {send,cancel,watered}=fixture(t);
  send('pointerdown');
  if(mode==='session cancellation')cancel();else send('pointercancel');
  send('pointerup');send('click');
  assert.deepEqual(watered,[]);
  send('pointerdown');send('pointerup');send('click');
  assert.deepEqual(watered,['seed-1'],'a fresh intentional tap still waters exactly once');
});

test('a fresh primary press discards an unfinished drop gesture',t=>{
  const {send,watered}=fixture(t);
  send('pointerdown');
  send('pointerdown',{target:{closest(){return null;}}});
  send('pointerup');
  assert.deepEqual(watered,[]);
});
