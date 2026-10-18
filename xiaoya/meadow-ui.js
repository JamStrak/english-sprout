import {FLOWERS,nextAction} from './garden-meadow.js';
import {meadowPlantArt} from './meadow-art.js';
import {shellArt,dropArt,canArt,packArt,seedArt} from './garden-art.js';
import {icon} from './art.js';

const flowerFor=id=>FLOWERS.find(f=>f.id===id);
export function meadowView({state,header,balance,feedback,tool,backgroundUrl=null}) {
  const next=nextAction(state),seed=state.pendingSeed,thirsty=state.plants.find(p=>p.waterings<flowerFor(p.flowerId).waterNeeded);
  const flower=seed&&flowerFor(seed.flowerId),collected=new Set(state.plants.filter(p=>p.waterings===flowerFor(p.flowerId).waterNeeded).map(p=>p.flowerId));
  return `${header}<main class="meadow-view" data-garden-next="${next}" data-guidance="${state.plants.length>=3?'quiet':'new'}" data-tool="${tool||''}">
    <div class="meadow-top">${balance}<button class="meadow-collection-button" data-action="meadow-collection" aria-label="看我的花朵收藏">${icon('star',24)}<b>${collected.size}<small> / ${FLOWERS.length}</small></b></button></div>
    <div class="meadow-field ${tool?'has-tool':''} ${backgroundUrl?'has-paper':''}" ${backgroundUrl?`data-picture-id="garden-background" style="--meadow-picture:url('${backgroundUrl}')"`:''} data-meadow-field role="group" aria-label="自由播种的小花园，先拿起种子再点草地" tabindex="0">
      <div class="meadow-sky" aria-hidden="true"><i></i><i></i><span>☀</span></div><div class="meadow-path" aria-hidden="true"></div>
      ${Array.from({length:16},(_,i)=>`<i class="meadow-grass" aria-hidden="true" style="left:${5+(i*37)%90}%;top:${30+(i*19)%62}%"></i>`).join('')}
      ${state.plants.map(p=>{const f=flowerFor(p.flowerId),bloom=p.waterings===f.waterNeeded;return `<button class="meadow-plant ${bloom?'is-bloom':'is-growing'} ${f.giant?'is-giant':''} ${feedback?.plantId===p.id?'just-watered':''} ${tool==='can'&&!bloom&&state.water?'can-water':''}" data-meadow-plant="${p.id}" data-waterings="${p.waterings}" data-needed="${f.waterNeeded}" style="--soil-x:${p.x*100}%;--soil-y:${p.y*100}%;--scale:${f.scale};z-index:${Math.round(p.y*100)}" aria-label="${f.name}，已浇${p.waterings}次，共需${f.waterNeeded}次${bloom?'，已经开花':''}">${meadowPlantArt(f,p.waterings)}${!bloom?`<span class="meadow-drops" aria-hidden="true">${Array.from({length:f.waterNeeded},(_,i)=>`<i class="${i<p.waterings?'filled':''}"></i>`).join('')}</span>`:''}${feedback?.plantId===p.id?`<span class="meadow-splash" aria-hidden="true">${bloom?'✦':dropArt()}</span>`:''}</button>`;}).join('')}
      ${tool==='seed'?`<span class="meadow-landing" aria-hidden="true">${icon('tap',40)}<i></i></span>`:!state.plants.length?'<span class="meadow-empty-mark" aria-hidden="true">✧</span>':''}
    </div>
    <div class="meadow-tools">
      ${seed?`<button class="meadow-tool seed-tool ${tool==='seed'?'selected':''} ${next==='plant'?'inviting':''}" data-action="meadow-seed" data-meadow-tool="seed" aria-pressed="${tool==='seed'}" aria-label="拿起${flower.giant?'巨型花':''}种子，放到草地上">${seedArt()}${flower.giant?'<span class="giant-badge" aria-hidden="true">✦</span>':''}</button>`:`<button class="meadow-tool ${next==='pack'?'inviting':''}" data-action="pack" ${state.shells<3?'disabled':''} aria-label="用三枚贝壳买一袋种子">${packArt()}<span class="meadow-cost">${shellArt()}3</span></button>`}
      <button class="meadow-tool can-tool ${tool==='can'?'selected':''} ${next==='water'?'inviting':''}" data-action="meadow-can" data-meadow-tool="can" aria-pressed="${tool==='can'}" aria-label="拿起水壶，再点小苗浇水">${canArt()}<span class="meadow-cost">${dropArt()}${state.water}</span></button>
      <button class="meadow-tool play-tool ${next==='learn'?'inviting':''}" data-primary data-action="next-event" aria-label="再玩一个故事，带回贝壳和水">${icon('play',40)}</button>
    </div>
  </main>`;
}

export function meadowCollection(state) {
  const grown=new Set(state.plants.filter(p=>p.waterings===flowerFor(p.flowerId).waterNeeded).map(p=>p.flowerId));
  return `<div class="meadow-collection">${FLOWERS.map(f=>`<div class="flower-stamp ${grown.has(f.id)?'collected':''}" aria-label="${grown.has(f.id)?f.name:'尚未种出的花'}">${grown.has(f.id)?meadowPlantArt(f,f.waterNeeded):'<span aria-hidden="true">?</span>'}</div>`).join('')}</div>`;
}

// One pointer gesture has one outcome. The synthetic click after a drag is consumed.
// Taps and keyboard activation use the same callbacks as dragging; no HTML drag API.
export function bindMeadowInteractions(root,{read,onSelect,onPlant,onWater,onTouch}) {
  let drag=null,ghost=null,suppressUntil=0;
  const active=()=>read().active;
  const clear=()=>{ghost?.remove();ghost=null;const old=drag;drag=null;if(old&&root.hasPointerCapture?.(old.id))root.releasePointerCapture(old.id);};
  function position(event) {
    const field=root.querySelector('[data-meadow-field]');if(!field)return null;
    const rect=field.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
    return x>=0&&x<=1&&y>=0&&y<=1?{x:Math.max(.07,Math.min(.93,x)),y:Math.max(.26,Math.min(.94,y))}:null;
  }
  function plantAt(event) {
    const hit=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-meadow-plant]');
    if(hit)return hit.dataset.meadowPlant;
    const field=root.querySelector('[data-meadow-field]');if(!field||!position(event))return null;
    let closest=null,distance=70;
    for(const p of read().state.plants){const f=flowerFor(p.flowerId);if(p.waterings>=f.waterNeeded)continue;const rect=field.querySelector(`[data-meadow-plant="${p.id}"]`)?.getBoundingClientRect();if(!rect)continue;const d=Math.hypot(rect.left+rect.width/2-event.clientX,rect.top+rect.height*.65-event.clientY);if(d<distance){closest=p.id;distance=d;}}
    return closest;
  }
  root.addEventListener('pointerdown',event=>{
    if(!active()||event.isPrimary===false||event.button>0)return;
    suppressUntil=0;
    const button=event.target.closest('[data-meadow-tool]');if(!button||button.disabled)return;
    drag={id:event.pointerId,tool:button.dataset.meadowTool,x:event.clientX,y:event.clientY,moved:false};
    root.setPointerCapture?.(event.pointerId);
  });
  root.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId||!active())return;
    if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<8)return;
    drag.moved=true;event.preventDefault();
    if(!ghost){ghost=document.createElement('div');ghost.className='meadow-drag-ghost';ghost.innerHTML=drag.tool==='seed'?seedArt():canArt();document.body.append(ghost);}
    ghost.style.left=`${event.clientX}px`;ghost.style.top=`${event.clientY}px`;
  });
  root.addEventListener('pointerup',event=>{
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
    if(Date.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();return;}
    if(!active())return;
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
