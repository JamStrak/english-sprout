import {ALL_FLOWERS,nextAction,pendingRewards,hasUnlimitedResources,flowerForSeed,ownedSeeds,pendingChallengeSeeds} from './garden-meadow.js';
import {meadowPlantArt} from './meadow-art.js';
import {shellArt,dropArt,canArt,packArt,seedArt,seedArtForFlower} from './garden-art.js';
import {icon} from './art.js';
import {getEconomySettings} from './economy-settings.js';


export function meadowView({state,header,balance,feedback,tool,backgroundUrl=null,challengeEntry='',specialPending=false}) {
  const unlimited=hasUnlimitedResources(state),canWater=unlimited||state.water>0;
  const next=nextAction(state),seed=state.pendingSeed,thirsty=state.plants.find(p=>p.waterings<flowerForSeed(p).waterNeeded);
  const flower=seed&&flowerForSeed(seed),collected=new Set(state.plants.filter(p=>p.waterings===flowerForSeed(p).waterNeeded).map(p=>p.flowerId));
  const largestScale=Math.max(1,...state.plants.map(p=>flowerForSeed(p).scale));
  const lowestSeedPrice=Math.min(getEconomySettings().packPrice,...[state.shop?.offer?.price,state.shop?.reserved?.price].filter(Number.isFinite));
  return `${header}<main class="meadow-view" data-garden-next="${next}" data-guidance="${state.plants.length>=3?'quiet':'new'}" data-tool="${tool||''}">
    <div class="meadow-top">${balance}${pendingRewards(state).length?`<button class="icon-button" data-action="collect-reward" aria-label="领取还没选的小礼物">${icon('star',28)}</button>`:''}${challengeEntry}<button class="meadow-collection-button" data-action="meadow-collection" aria-label="看我的花朵收藏">${icon('star',24)}<b>${collected.size}<small> / ${ALL_FLOWERS.length}</small></b></button></div>
    <div class="meadow-field ${tool?'has-tool':''} ${backgroundUrl?'has-paper':''}" ${backgroundUrl?'data-picture-id="garden-background"':''} style="--largest-plant-scale:${largestScale};${backgroundUrl?`--meadow-picture:url('${backgroundUrl}')`:''}" data-meadow-field role="group" aria-label="自由播种的小花园，先拿起种子再点草地" tabindex="0">
      <div class="meadow-sky" aria-hidden="true"><i></i><i></i><span>☀</span></div><div class="meadow-path" aria-hidden="true"></div>
      ${Array.from({length:16},(_,i)=>`<i class="meadow-grass" aria-hidden="true" style="left:${5+(i*37)%90}%;top:${30+(i*19)%62}%"></i>`).join('')}
      ${state.plants.map(p=>{const f=flowerForSeed(p),bloom=p.waterings===f.waterNeeded;return `<button class="meadow-plant ${bloom?'is-bloom':'is-growing'} ${f.giant?'is-giant':''} ${feedback?.plantId===p.id?'just-watered':''} ${tool==='can'&&!bloom&&canWater?'can-water':''}" data-meadow-plant="${p.id}" data-waterings="${p.waterings}" data-needed="${f.waterNeeded}" style="--soil-x:${p.x*100}%;--soil-y:${p.y*100}%;--scale:${f.scale};z-index:${Math.round(p.y*100)}" aria-label="${f.name}，已浇${p.waterings}次，共需${f.waterNeeded}次${bloom?'，已经开花':''}">${meadowPlantArt(f,p.waterings)}${!bloom?`<span class="meadow-drops" aria-hidden="true">${Array.from({length:f.waterNeeded},(_,i)=>`<i class="${i<p.waterings?'filled':''}"></i>`).join('')}</span>`:''}${feedback?.plantId===p.id&&!feedback.motion?`<span class="meadow-splash" aria-hidden="true">${bloom?'✦':dropArt()}</span>`:''}</button>`;}).join('')}
      ${tool==='can'?`<div class="meadow-water-layer" data-water-layer><svg class="meadow-water-links" aria-hidden="true"></svg>${state.plants.filter(p=>p.waterings<flowerForSeed(p).waterNeeded).map(p=>`<button class="meadow-water-target ${feedback?.plantId===p.id?'just-watered':''}" data-water-plant="${p.id}" aria-label="给${flowerForSeed(p).name}浇一滴水，还需${flowerForSeed(p).waterNeeded-p.waterings}滴" ${canWater?'':'aria-disabled="true"'}><span data-feedback-body>${dropArt()}</span></button>`).join('')}</div>`:''}
      ${tool==='seed'?'<span class="meadow-landing" aria-hidden="true"><i></i></span>':!state.plants.length?'<span class="meadow-empty-mark" aria-hidden="true">✧</span>':''}
    </div>
    <div class="meadow-tools">
      <button class="meadow-tool inventory-tool ${['seeds','challenge-seed'].includes(next)?'inviting':''}" data-action="meadow-inventory" aria-label="打开种子背包，选择已拥有的种子"><span class="inventory-bag-art">${packArt()}${seedArt()}</span><span class="tool-caption">种子</span><span class="inventory-count">${ownedSeeds(state).length+pendingChallengeSeeds(state).length}</span></button>
      ${seed?`<button class="meadow-tool seed-tool ${tool==='seed'?'selected':''} ${next==='plant'?'inviting':''}" data-action="meadow-seed" data-meadow-tool="seed" aria-pressed="${tool==='seed'}" aria-label="拿起${flower.name}种子，放到草地上">${seedArtForFlower(flower)}${flower.giant||flower.special?'<span class="giant-badge" aria-hidden="true">✦</span>':''}</button>`:''}
      <button class="meadow-tool shop-tool ${next==='pack'?'inviting':''}" data-action="shop" aria-label="打开种子商店，可以买种子或留下一包喜欢的种子">${shellArt()}<span class="tool-caption">商店</span><span class="meadow-cost">${lowestSeedPrice}+</span></button>
      <button class="meadow-tool can-tool ${tool==='can'?'selected':''} ${next==='water'?'inviting':''}" data-action="meadow-can" data-meadow-tool="can" aria-pressed="${tool==='can'}" aria-label="点水壶，再点小苗进度条旁边的水滴浇水">${canArt()}<span class="meadow-cost">${dropArt()}${unlimited?'∞':state.water}</span></button>
      <button class="meadow-tool play-tool ${next==='learn'?'inviting':''}" data-primary data-action="next-event" aria-label="再玩一个故事，选择贝壳或水">${icon('play',40)}</button>
    </div>
  </main>`;
}

export function meadowCollection(state) {
  const grown=new Set(state.plants.filter(p=>p.waterings===flowerForSeed(p).waterNeeded).map(p=>p.flowerId));
  return `<div class="meadow-collection">${ALL_FLOWERS.map(f=>`<div class="flower-stamp ${grown.has(f.id)?'collected':''}" aria-label="${grown.has(f.id)?f.name:'尚未种出的花'}">${grown.has(f.id)?meadowPlantArt(f,f.waterNeeded):'<span aria-hidden="true">?</span>'}</div>`).join('')}</div>`;
}

const escapeText=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function inventorySeeds(state){
  return [...ownedSeeds(state).map(seed=>({...seed,key:`owned:${seed.id}`,source:'已拥有'})),...pendingChallengeSeeds(state).map(seed=>({...seed,key:`challenge:${seed.milestoneId}`,source:'挑战奖励'}))];
}
export function meadowInventory(state){
  const seeds=inventorySeeds(state);
  return `<p class="seed-inventory-help">选一颗，放到草地上。也可以直接拖出去种下。</p><div class="seed-inventory" role="group" aria-label="所有可种植的种子">${seeds.map(seed=>{const flower=flowerForSeed(seed),selected=seed.id&&seed.id===state.pendingSeed?.id;return `<button class="inventory-seed ${selected?'selected':''}" data-inventory-seed="${escapeText(seed.key)}" aria-label="选择${escapeText(flower.name)}种子${flower.giant?'，巨大型':''}" aria-pressed="${!!selected}"><span class="inventory-seed-art">${seedArtForFlower(flower)}</span><strong>${escapeText(flower.name)}</strong><small>${flower.giant?'巨大型 · ':''}${seed.source}</small>${selected?`<span class="inventory-picked" aria-hidden="true">${icon('check',20)}</span>`:''}</button>`;}).join('')}</div>${seeds.length?'':'<div class="inventory-empty">'+seedArt()+'<p>还没有种子，去商店挑一袋吧。</p><button data-action="inventory-shop">去种子商店</button></div>'}`;
}

const WATER_SIZE=48,WATER_PITCH=56,WATER_EDGE=8;
const waterColumns=width=>Math.max(1,Math.floor((width-2*WATER_EDGE+WATER_PITCH-WATER_SIZE)/WATER_PITCH));
export function waterTargetHeight(count,width){return count?Math.ceil(count/waterColumns(width))*WATER_PITCH+2*WATER_EDGE-(WATER_PITCH-WATER_SIZE):0;}

// Prefer an exact position beside the actual progress bar, not the transparent
// plant canvas. Reserve enough grid space for a crowded garden's remaining drops.
// Keep assignments during watering so a second tap still means the same plant.
export function waterTargetLayout(anchors,width,height,previous=[]){
  const cols=waterColumns(width),rows=Math.max(1,Math.floor((height-2*WATER_EDGE+WATER_PITCH-WATER_SIZE)/WATER_PITCH));
  if(cols*rows<anchors.length)throw new RangeError('Expand the meadow before placing water targets');
  const x0=(width-(cols-1)*WATER_PITCH)/2,y0=WATER_EDGE+WATER_SIZE/2;
  const slots=Array.from({length:cols*rows},(_,i)=>({x:x0+(i%cols)*WATER_PITCH,y:y0+Math.floor(i/cols)*WATER_PITCH}));
  const assigned=new Map(),occupied=new Set(),radius=WATER_SIZE/2;
  const overlaps=(a,b)=>Math.abs(a.x-b.x)<WATER_SIZE&&Math.abs(a.y-b.y)<WATER_SIZE;
  const inBounds=p=>p.x>=WATER_EDGE+radius&&p.x<=width-WATER_EDGE-radius&&p.y>=WATER_EDGE+radius&&p.y<=height-WATER_EDGE-radius;
  function accept(id,p){
    if(!inBounds(p)||[...assigned.values()].some(other=>overlaps(p,other)))return false;
    const blocked=slots.flatMap((slot,i)=>!occupied.has(i)&&overlaps(p,slot)?[i]:[]);
    if(slots.length-occupied.size-blocked.length<anchors.length-assigned.size-1)return false;
    assigned.set(id,{x:p.x,y:p.y});blocked.forEach(i=>occupied.add(i));return true;
  }
  const existing=anchors.map(a=>({id:a.id,p:previous.find(p=>p.id===a.id)})).filter(a=>a.p);
  // Old placements already form a feasible arrangement after removals. Preserve
  // the whole arrangement, including capacity, rather than greedily shifting it.
  if(existing.length===anchors.length&&existing.every(a=>inBounds(a.p))&&existing.every((a,i)=>existing.slice(i+1).every(b=>!overlaps(a.p,b.p)))){
    for(const a of existing)assigned.set(a.id,{x:a.p.x,y:a.p.y});
  }else{
    for(const a of existing)accept(a.id,a.p);
    for(const anchor of anchors){
      if(assigned.has(anchor.id))continue;
      const side=(anchor.halfWidth??22)+radius+8,y=Math.max(WATER_EDGE+radius,Math.min(height-WATER_EDGE-radius,anchor.y));
      const candidates=[{x:anchor.x+side,y},{x:anchor.x-side,y}];
      if(candidates.some(p=>accept(anchor.id,p)))continue;
      const nearest=slots.filter((_,i)=>!occupied.has(i)).sort((a,b)=>Math.hypot(a.x-anchor.x,a.y-anchor.y)-Math.hypot(b.x-anchor.x,b.y-anchor.y))[0];
      if(!accept(anchor.id,nearest))throw new RangeError('No reachable watering position');
    }
  }
  return anchors.map(anchor=>({id:anchor.id,...assigned.get(anchor.id),anchorX:anchor.x,anchorY:anchor.y,halfWidth:anchor.halfWidth??22,halfHeight:anchor.halfHeight??8}));
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
    const anchors=targets.map(button=>{const bar=field.querySelector(`[data-meadow-plant="${button.dataset.waterPlant}"] .meadow-drops`),box=bar.getBoundingClientRect();return {id:button.dataset.waterPlant,x:box.left-rect.left-field.clientLeft+box.width/2,y:box.top-rect.top-field.clientTop+box.height/2,halfWidth:box.width/2,halfHeight:box.height/2};});
    waterPositions=waterTargetLayout(anchors,width,height,dimensions===waterDimensions?waterPositions:[]);waterDimensions=dimensions;
    targets.forEach((button,i)=>{button.style.left=`${waterPositions[i].x}px`;button.style.top=`${waterPositions[i].y}px`;});
    layer.querySelector('svg').innerHTML=waterPositions.map(p=>{const dx=p.anchorX-p.x,dy=p.anchorY-p.y,d=Math.hypot(dx,dy)||1;return `<path d="M ${p.x+dx/d*24} ${p.y+dy/d*24} L ${Math.max(p.anchorX-p.halfWidth,Math.min(p.anchorX+p.halfWidth,p.x))} ${Math.max(p.anchorY-p.halfHeight,Math.min(p.anchorY+p.halfHeight,p.y))}"/>`;}).join('');
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
export function bindMeadowInteractions(root,{read,onSelect,onPlant,onWater,onTouch,onChooseSeed}) {
  let drag=null,dropTap=null,actionTap=null,ghost=null,cursor=null,suppressUntil=0;
  const active=()=>read().active;
  const hideCursor=()=>{cursor?.remove();cursor=null;root.querySelector?.('[data-meadow-field]')?.classList.remove('seed-cursor-active');};
  const clear=()=>{if(dropTap||actionTap||drag)suppressUntil=Date.now()+450;dropTap=null;actionTap=null;ghost?.remove();ghost=null;hideCursor();root.classList?.remove('inventory-dragging');const old=drag;drag=null;if(old&&root.hasPointerCapture?.(old.id))root.releasePointerCapture(old.id);};
  clear.sync=()=>{if(!active())actionTap=null;if(!active()||read().tool!=='seed'||!read().state.pendingSeed)hideCursor();};
  function moveCursor(event){
    const field=event.target.closest?.('[data-meadow-field]'),state=read();
    if(drag||event.pointerType!=='mouse'||!state.active||state.tool!=='seed'||!state.state.pendingSeed||!field){hideCursor();return;}
    if(!cursor){cursor=document.createElement('div');cursor.className='meadow-seed-cursor';cursor.setAttribute('aria-hidden','true');cursor.innerHTML=seedArtForFlower(flowerForSeed(state.state.pendingSeed));document.body.append(cursor);}
    cursor.style.left=`${event.clientX}px`;cursor.style.top=`${event.clientY}px`;field.classList.add('seed-cursor-active');
  }
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
    for(const p of read().state.plants){const f=flowerForSeed(p);if(p.waterings>=f.waterNeeded)continue;const rect=field.querySelector(`[data-meadow-plant="${p.id}"]`)?.getBoundingClientRect();if(!rect)continue;const d=Math.hypot(rect.left+rect.width/2-event.clientX,rect.top+rect.height*.65-event.clientY);if(d<distance){closest=p.id;distance=d;}}
    return closest;
  }
  root.addEventListener('pointerdown',event=>{
    if(event.isPrimary===false||event.button>0)return;
    // A fresh press is never the compatibility click from the preceding gesture,
    // including a quick press on a panel that the previous gesture just opened.
    suppressUntil=0;dropTap=null;actionTap=null;
    const inventory=event.target.closest('[data-inventory-seed]');
    if(inventory&&read().seedPicker&&!inventory.disabled){
      const seed=inventorySeeds(read().state).find(s=>s.key===inventory.dataset.inventorySeed);if(!seed)return;
      hideCursor();drag={id:event.pointerId,key:seed.key,seed,tool:'seed',x:event.clientX,y:event.clientY,moved:false};root.setPointerCapture?.(event.pointerId);return;
    }
    if(!active())return;
    const drop=event.target.closest('[data-water-plant]');
    if(drop){dropTap={id:event.pointerId,plantId:drop.dataset.waterPlant,x:event.clientX,y:event.clientY,moved:false};return;}
    const button=event.target.closest('[data-meadow-tool]');
    if(!button){
      const action=event.target.closest('button[data-action]');
      if(['touch','pen'].includes(event.pointerType)&&action&&!action.disabled&&action.getAttribute('aria-disabled')!=='true')actionTap={id:event.pointerId,button:action,x:event.clientX,y:event.clientY,moved:false};
      return;
    }
    if(button.disabled)return;
    drag={id:event.pointerId,tool:button.dataset.meadowTool,x:event.clientX,y:event.clientY,moved:false};
    root.setPointerCapture?.(event.pointerId);
  });
  root.addEventListener('pointermove',event=>{
    moveCursor(event);
    if(actionTap?.id===event.pointerId&&Math.hypot(event.clientX-actionTap.x,event.clientY-actionTap.y)>=8)actionTap.moved=true;
    if(dropTap?.id===event.pointerId&&Math.hypot(event.clientX-dropTap.x,event.clientY-dropTap.y)>=8)dropTap.moved=true;
    if(!drag||drag.id!==event.pointerId||!(active()||drag.key&&read().seedPicker))return;
    if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<8)return;
    drag.moved=true;event.preventDefault();
    if(drag.key)root.classList.add('inventory-dragging');
    if(!ghost){ghost=document.createElement('div');ghost.className='meadow-drag-ghost';ghost.setAttribute('aria-hidden','true');ghost.innerHTML=drag.tool==='seed'?seedArtForFlower(flowerForSeed(drag.seed||read().state.pendingSeed)):canArt();document.body.append(ghost);}
    ghost.style.left=`${event.clientX}px`;ghost.style.top=`${event.clientY}px`;
  });
  root.addEventListener('pointerup',event=>{
    if(actionTap?.id===event.pointerId){
      const tap=actionTap;actionTap=null;suppressUntil=Date.now()+450;
      const hit=document.elementFromPoint(event.clientX,event.clientY)?.closest('button[data-action]');
      // After a touch drag, Chromium can omit the next compatibility click.
      // Complete a short press once through the existing click action instead.
      // The detail-0 click also preserves keyboard/assistive activation semantics.
      if(active()&&!tap.moved&&Math.hypot(event.clientX-tap.x,event.clientY-tap.y)<8&&hit===tap.button&&!hit.disabled&&hit.getAttribute('aria-disabled')!=='true'){
        event.preventDefault();hit.click();
      }
      return;
    }
    if(dropTap?.id===event.pointerId){
      const tap=dropTap;dropTap=null;
      // A touch drag can suppress the browser's next compatibility click.
      // Finish a genuine short press here; retain click for keyboard/AT only.
      suppressUntil=Date.now()+450;
      const hit=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-water-plant]');
      if(active()&&read().tool==='can'&&!tap.moved&&Math.hypot(event.clientX-tap.x,event.clientY-tap.y)<8&&hit?.dataset.waterPlant===tap.plantId){
        event.preventDefault();onTouch(event,hit);onWater(tap.plantId);
      }
      return;
    }
    if(!drag||drag.id!==event.pointerId)return;
    if(drag.key){
      const current=drag,point=read().seedPicker&&position(event),valid=read().seedPicker;clear();suppressUntil=Date.now()+450;event.preventDefault();
      if(valid&&(!current.moved||point))onChooseSeed(current.key,current.moved?point:null);
      return;
    }
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
  root.addEventListener('pointerleave',()=>{hideCursor();if(actionTap){actionTap=null;suppressUntil=Date.now()+450;}});
  root.ownerDocument?.defaultView?.addEventListener('scroll',hideCursor,{passive:true,capture:true});
  root.addEventListener('click',event=>{
    if(event.detail!==0&&Date.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();return;}
    if(!active())return;
    const drop=event.target.closest('[data-water-plant]');
    if(drop){event.preventDefault();event.stopImmediatePropagation();onTouch(event,drop);onWater(drop.dataset.waterPlant);return;}
    const plant=event.target.closest('[data-meadow-plant]'),field=event.target.closest('[data-meadow-field]');
    if(!field)return;
    // This capture handler owns field feedback. Do not also bump the whole
    // positioning button in the app's generic click handler.
    event.stopImmediatePropagation();
    const {tool}=read();onTouch(event,plant);
    if(tool==='seed'){const point=event.detail===0?{x:.5,y:.65}:position(event);if(point)onPlant(point);}
    else if(plant)onWater(plant.dataset.meadowPlant);
    // Empty ground must not water an unrelated nearby seedling. The generous
    // nearest-plant fallback is only for dragging a watering can onto the field.
  },true);
  root.addEventListener('keydown',event=>{if(active()&&event.target.matches?.('[data-meadow-field]')&&['Enter',' '].includes(event.key)){event.preventDefault();if(read().tool==='seed')onPlant({x:.5,y:.65});}});
  return clear;
}
