import {FLOWERS,nextAction,pendingRewards} from './garden-meadow.js';
import {meadowPlantArt} from './meadow-art.js';
import {shellArt,dropArt,canArt,packArt,seedArt} from './garden-art.js';
import {icon} from './art.js';

const flowerFor=id=>FLOWERS.find(f=>f.id===id);
export function meadowView({state,header,balance,feedback,tool,backgroundUrl=null}) {
  const next=nextAction(state),seed=state.pendingSeed,thirsty=state.plants.find(p=>p.waterings<flowerFor(p.flowerId).waterNeeded);
  const flower=seed&&flowerFor(seed.flowerId),collected=new Set(state.plants.filter(p=>p.waterings===flowerFor(p.flowerId).waterNeeded).map(p=>p.flowerId));
  return `${header}<main class="meadow-view" data-garden-next="${next}" data-guidance="${state.plants.length>=3?'quiet':'new'}" data-tool="${tool||''}">
    <div class="meadow-top">${balance}${pendingRewards(state).length?`<button class="icon-button" data-action="collect-reward" aria-label="领取还没选的小礼物">${icon('star',28)}</button>`:''}<button class="meadow-collection-button" data-action="meadow-collection" aria-label="看我的花朵收藏">${icon('star',24)}<b>${collected.size}<small> / ${FLOWERS.length}</small></b></button></div>
    <div class="meadow-field ${tool?'has-tool':''} ${backgroundUrl?'has-paper':''}" ${backgroundUrl?`data-picture-id="garden-background" style="--meadow-picture:url('${backgroundUrl}')"`:''} data-meadow-field role="group" aria-label="自由播种的小花园，先拿起种子再点草地" tabindex="0">
      <div class="meadow-sky" aria-hidden="true"><i></i><i></i><span>☀</span></div><div class="meadow-path" aria-hidden="true"></div>
      ${Array.from({length:16},(_,i)=>`<i class="meadow-grass" aria-hidden="true" style="left:${5+(i*37)%90}%;top:${30+(i*19)%62}%"></i>`).join('')}
      ${state.plants.map(p=>{const f=flowerFor(p.flowerId),bloom=p.waterings===f.waterNeeded;return `<button class="meadow-plant ${bloom?'is-bloom':'is-growing'} ${f.giant?'is-giant':''} ${feedback?.plantId===p.id?'just-watered':''} ${tool==='can'&&!bloom&&state.water?'can-water':''}" data-meadow-plant="${p.id}" data-waterings="${p.waterings}" data-needed="${f.waterNeeded}" style="--soil-x:${p.x*100}%;--soil-y:${p.y*100}%;--scale:${f.scale};z-index:${Math.round(p.y*100)}" aria-label="${f.name}，已浇${p.waterings}次，共需${f.waterNeeded}次${bloom?'，已经开花':''}">${meadowPlantArt(f,p.waterings)}${!bloom?`<span class="meadow-drops" aria-hidden="true">${Array.from({length:f.waterNeeded},(_,i)=>`<i class="${i<p.waterings?'filled':''}"></i>`).join('')}</span>`:''}${feedback?.plantId===p.id?`<span class="meadow-splash" aria-hidden="true">${bloom?'✦':dropArt()}</span>`:''}</button>`;}).join('')}
      ${tool==='can'?`<div class="meadow-water-layer" data-water-layer><svg class="meadow-water-links" aria-hidden="true"></svg>${state.plants.filter(p=>p.waterings<flowerFor(p.flowerId).waterNeeded).map(p=>`<button class="meadow-water-target ${feedback?.plantId===p.id?'just-watered':''}" data-water-plant="${p.id}" aria-label="给${flowerFor(p.flowerId).name}浇一滴水，还需${flowerFor(p.flowerId).waterNeeded-p.waterings}滴" ${state.water?'':'aria-disabled="true"'}><span>${dropArt()}</span></button>`).join('')}</div>`:''}
      ${tool==='seed'?`<span class="meadow-landing" aria-hidden="true">${icon('tap',40)}<i></i></span>`:!state.plants.length?'<span class="meadow-empty-mark" aria-hidden="true">✧</span>':''}
    </div>
    <div class="meadow-tools">
      ${seed?`<button class="meadow-tool seed-tool ${tool==='seed'?'selected':''} ${next==='plant'?'inviting':''}" data-action="meadow-seed" data-meadow-tool="seed" aria-pressed="${tool==='seed'}" aria-label="拿起${flower.giant?'巨型花':''}种子，放到草地上">${seedArt()}${flower.giant?'<span class="giant-badge" aria-hidden="true">✦</span>':''}</button>`:`<button class="meadow-tool ${next==='pack'?'inviting':''}" data-action="shop" aria-label="打开种子商店，可以买种子或留下一包喜欢的种子">${packArt()}<span class="meadow-cost">${shellArt()}2+</span></button>`}
      <button class="meadow-tool can-tool ${tool==='can'?'selected':''} ${next==='water'?'inviting':''}" data-action="meadow-can" data-meadow-tool="can" aria-pressed="${tool==='can'}" aria-label="点水壶，让小苗头上出现水滴，再点水滴浇水">${canArt()}<span class="meadow-cost">${dropArt()}${state.water}</span></button>
      <button class="meadow-tool play-tool ${next==='learn'?'inviting':''}" data-primary data-action="next-event" aria-label="再玩一个故事，选择贝壳或水">${icon('play',40)}</button>
    </div>
  </main>`;
}

export function meadowCollection(state) {
  const grown=new Set(state.plants.filter(p=>p.waterings===flowerFor(p.flowerId).waterNeeded).map(p=>p.flowerId));
  return `<div class="meadow-collection">${FLOWERS.map(f=>`<div class="flower-stamp ${grown.has(f.id)?'collected':''}" aria-label="${grown.has(f.id)?f.name:'尚未种出的花'}">${grown.has(f.id)?meadowPlantArt(f,f.waterNeeded):'<span aria-hidden="true">?</span>'}</div>`).join('')}</div>`;
}

const WATER_SIZE=48,WATER_PITCH=56,WATER_EDGE=8;
const waterColumns=width=>Math.max(1,Math.floor((width-2*WATER_EDGE+WATER_PITCH-WATER_SIZE)/WATER_PITCH));
export function waterTargetHeight(count,width){return count?Math.ceil(count/waterColumns(width))*WATER_PITCH+2*WATER_EDGE-(WATER_PITCH-WATER_SIZE):0;}

// Targets get their own non-overlapping spaces, independent of flower paint order.
// Keep existing assignments during watering so a second tap still means the same plant.
export function waterTargetLayout(anchors,width,height,previous=[]){
  const cols=waterColumns(width),rows=Math.max(1,Math.floor((height-2*WATER_EDGE+WATER_PITCH-WATER_SIZE)/WATER_PITCH));
  if(cols*rows<anchors.length)throw new RangeError('Expand the meadow before placing water targets');
  const x0=(width-(cols-1)*WATER_PITCH)/2,y0=WATER_EDGE+WATER_SIZE/2;
  const slots=Array.from({length:cols*rows},(_,i)=>({x:x0+(i%cols)*WATER_PITCH,y:y0+Math.floor(i/cols)*WATER_PITCH}));
  const assigned=new Map(),occupied=new Set();
  for(const anchor of anchors){const old=previous.find(p=>p.id===anchor.id);if(!old)continue;const index=slots.findIndex(p=>p.x===old.x&&p.y===old.y);if(index>=0&&!occupied.has(index)){assigned.set(anchor.id,slots[index]);occupied.add(index);}}
  for(const anchor of anchors){if(assigned.has(anchor.id))continue;let nearest=-1,distance=Infinity;slots.forEach((slot,index)=>{if(occupied.has(index))return;const d=Math.hypot(slot.x-anchor.x,slot.y-anchor.y);if(d<distance){nearest=index;distance=d;}});assigned.set(anchor.id,slots[nearest]);occupied.add(nearest);}
  return anchors.map(anchor=>({id:anchor.id,...assigned.get(anchor.id),anchorX:anchor.x,anchorY:anchor.y}));
}

let waterObserver=null,waterLayoutFrame=null,waterPositions=[],waterDimensions='',waterLayoutWidth=0,waterMinimum=0;
export function layoutMeadowWatering(root){
  waterObserver?.disconnect();waterObserver=null;
  if(waterLayoutFrame!==null){cancelAnimationFrame(waterLayoutFrame);waterLayoutFrame=null;}
  const field=root.querySelector('[data-meadow-field]'),layer=field?.querySelector('[data-water-layer]');
  if(!layer){waterPositions=[];waterDimensions='';waterLayoutWidth=0;waterMinimum=0;return;}
  const targets=[...layer.querySelectorAll('[data-water-plant]')],baseMinimum=parseFloat(getComputedStyle(field).minHeight)||0;
  function place(){
    if(!field.isConnected)return;
    const width=field.clientWidth,borders=field.offsetHeight-field.clientHeight;
    const required=waterTargetHeight(targets.length,width),minHeight=Math.max(baseMinimum,required+borders,width===waterLayoutWidth?waterMinimum:0);
    // Keep this watering session's space when a plant blooms. Shrinking a row
    // would put a different seedling beneath the child's next tap.
    waterLayoutWidth=width;waterMinimum=minHeight;
    // A full garden can contain any number of plants. Let the page grow instead
    // of hiding targets or silently capping the number of waterable seedlings.
    const wanted=`${minHeight}px`;if(field.style.minHeight!==wanted)field.style.minHeight=wanted;
    const height=field.clientHeight,rect=field.getBoundingClientRect(),dimensions=`${width}:${height}`;
    const anchors=targets.map(button=>{const plant=field.querySelector(`[data-meadow-plant="${button.dataset.waterPlant}"]`),box=plant.getBoundingClientRect();return {id:button.dataset.waterPlant,x:box.left-rect.left-field.clientLeft+box.width/2,y:box.top-rect.top-field.clientTop-10};});
    waterPositions=waterTargetLayout(anchors,width,height,dimensions===waterDimensions?waterPositions:[]);waterDimensions=dimensions;
    targets.forEach((button,i)=>{button.style.left=`${waterPositions[i].x}px`;button.style.top=`${waterPositions[i].y}px`;});
    layer.querySelector('svg').innerHTML=waterPositions.map(p=>`<path d="M ${p.x} ${p.y+18} L ${p.anchorX} ${Math.max(8,p.anchorY+30)}"/>`).join('');
    field.classList.toggle('has-water-overflow',minHeight>Math.min(530,window.innerHeight*.52));
    layer.classList.add('is-ready');
  }
  place();waterObserver=new ResizeObserver(()=>{
    // A narrow/full meadow may need a taller field. Apply its height outside
    // observer delivery so resizing the observed element cannot loop there.
    if(waterLayoutFrame!==null)return;
    waterLayoutFrame=requestAnimationFrame(()=>{waterLayoutFrame=null;place();});
  });waterObserver.observe(field);
}

// One pointer gesture has one outcome. The synthetic click after a drag is consumed.
// Taps and keyboard activation use the same callbacks as dragging; no HTML drag API.
export function bindMeadowInteractions(root,{read,onSelect,onPlant,onWater,onTouch}) {
  let drag=null,dropTap=null,ghost=null,suppressUntil=0;
  const active=()=>read().active;
  const clear=()=>{if(dropTap)suppressUntil=Date.now()+450;dropTap=null;ghost?.remove();ghost=null;const old=drag;drag=null;if(old&&root.hasPointerCapture?.(old.id))root.releasePointerCapture(old.id);};
  function position(event) {
    const field=root.querySelector('[data-meadow-field]');if(!field)return null;
    const rect=field.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
    return x>=0&&x<=1&&y>=0&&y<=1?{x:Math.max(.07,Math.min(.93,x)),y:Math.max(.26,Math.min(.94,y))}:null;
  }
  function plantAt(event) {
    const element=document.elementFromPoint(event.clientX,event.clientY),drop=element?.closest('[data-water-plant]');
    if(drop)return drop.dataset.waterPlant;
    const hit=element?.closest('[data-meadow-plant]');
    if(hit)return hit.dataset.meadowPlant;
    const field=root.querySelector('[data-meadow-field]');if(!field||!position(event))return null;
    let closest=null,distance=70;
    for(const p of read().state.plants){const f=flowerFor(p.flowerId);if(p.waterings>=f.waterNeeded)continue;const rect=field.querySelector(`[data-meadow-plant="${p.id}"]`)?.getBoundingClientRect();if(!rect)continue;const d=Math.hypot(rect.left+rect.width/2-event.clientX,rect.top+rect.height*.65-event.clientY);if(d<distance){closest=p.id;distance=d;}}
    return closest;
  }
  root.addEventListener('pointerdown',event=>{
    if(!active()||event.isPrimary===false||event.button>0)return;
    suppressUntil=0;dropTap=null;
    const drop=event.target.closest('[data-water-plant]');
    if(drop){dropTap={id:event.pointerId,plantId:drop.dataset.waterPlant,x:event.clientX,y:event.clientY,moved:false};return;}
    const button=event.target.closest('[data-meadow-tool]');if(!button||button.disabled)return;
    drag={id:event.pointerId,tool:button.dataset.meadowTool,x:event.clientX,y:event.clientY,moved:false};
    root.setPointerCapture?.(event.pointerId);
  });
  root.addEventListener('pointermove',event=>{
    if(dropTap?.id===event.pointerId&&Math.hypot(event.clientX-dropTap.x,event.clientY-dropTap.y)>=8)dropTap.moved=true;
    if(!drag||drag.id!==event.pointerId||!active())return;
    if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<8)return;
    drag.moved=true;event.preventDefault();
    if(!ghost){ghost=document.createElement('div');ghost.className='meadow-drag-ghost';ghost.innerHTML=drag.tool==='seed'?seedArt():canArt();document.body.append(ghost);}
    ghost.style.left=`${event.clientX}px`;ghost.style.top=`${event.clientY}px`;
  });
  root.addEventListener('pointerup',event=>{
    if(dropTap?.id===event.pointerId){
      const tap=dropTap;dropTap=null;
      // A touch drag can suppress the browser's next compatibility click.
      // Finish a genuine short press here; retain click for keyboard/AT only.
      suppressUntil=Date.now()+450;
      const hit=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-water-plant]');
      if(active()&&read().tool==='can'&&!tap.moved&&Math.hypot(event.clientX-tap.x,event.clientY-tap.y)<8&&hit?.dataset.waterPlant===tap.plantId){
        event.preventDefault();onTouch();onWater(tap.plantId);
      }
      return;
    }
    if(!drag||drag.id!==event.pointerId)return;
    const current=drag,point=active()&&position(event),target=active()&&plantAt(event);clear();
    suppressUntil=Date.now()+450;event.preventDefault();
    if(!current.moved){if(active()){onTouch();onSelect(current.tool);}return;}
    if(!active())return;
    onSelect(current.tool);onTouch();
    if(current.tool==='seed'&&point)onPlant(point);
    else if(current.tool==='can'&&target)onWater(target);
  });
  root.addEventListener('pointercancel',clear);
  root.addEventListener('lostpointercapture',()=>{if(drag)clear();});
  root.addEventListener('click',event=>{
    if(event.detail!==0&&Date.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();return;}
    if(!active())return;
    const drop=event.target.closest('[data-water-plant]');
    if(drop){event.preventDefault();event.stopImmediatePropagation();onTouch();onWater(drop.dataset.waterPlant);return;}
    const plant=event.target.closest('[data-meadow-plant]'),field=event.target.closest('[data-meadow-field]');
    if(!field)return;
    const {tool}=read();onTouch();
    if(tool==='seed'){const point=event.detail===0?{x:.5,y:.65}:position(event);if(point)onPlant(point);}
    else if(plant)onWater(plant.dataset.meadowPlant);
    else if(tool==='can'){const target=plantAt(event);if(target)onWater(target);}
  },true);
  root.addEventListener('keydown',event=>{if(active()&&event.target.matches?.('[data-meadow-field]')&&['Enter',' '].includes(event.key)){event.preventDefault();if(read().tool==='seed')onPlant({x:.5,y:.65});}});
  return clear;
}
