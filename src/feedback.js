const FEEDBACK_MS=600;
const MAX_FEEDBACK=6;
let installedCleanup=null;

// Capture the click before a button handler replaces the current screen.
export function installInteractionFeedback(){
  if(installedCleanup)return installedCleanup;
  const layers=new Map(),bursts=new Map(),targets=new Map();
  let active=true;

  function getLayer(target){
    // A modal dialog is in the top layer, above every body z-index. Keep its
    // feedback inside that dialog so taps remain visible without blocking it.
    const host=target.closest('dialog[open]')||document.body||document.documentElement;
    let layer=layers.get(host);
    if(!layer?.isConnected){
      layer=document.createElement('div');
      layer.className='interaction-feedback-layer';
      layer.setAttribute('aria-hidden','true');
      host.append(layer);
      layers.set(host,layer);
    }
    return {host,layer};
  }

  function removeBurst(burst){
    const entry=bursts.get(burst);
    clearTimeout(entry?.timer);
    bursts.delete(burst);
    burst.remove();
    if(entry&&!entry.layer.childElementCount){
      entry.layer.remove();
      if(layers.get(entry.host)===entry.layer)layers.delete(entry.host);
    }
  }
  function releaseTarget(target){
    clearTimeout(targets.get(target));
    targets.delete(target);
    target.classList.remove('interaction-feedback-active');
  }
  function onClick(event){
    const origin=event.target?.nodeType===1?event.target:event.target?.parentElement;
    const target=origin?.closest('button,a[href],[data-feedback-target]');
    if(!target||target.matches(':disabled,[disabled],[aria-disabled="true"]')||target.closest('[inert]'))return;
    const rect=target.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    const keyboard=event.detail===0;
    const x=keyboard?rect.left+rect.width/2:event.clientX;
    const y=keyboard?rect.top+rect.height/2:event.clientY;
    if(!Number.isFinite(x)||!Number.isFinite(y))return;

    while(bursts.size>=MAX_FEEDBACK)removeBurst(bursts.keys().next().value);
    const {host,layer}=getLayer(target),bounds=layer.getBoundingClientRect();
    // Normal fixed layers use viewport coordinates. Deriving from the actual
    // bounds also handles a translated/scaled dialog containing block.
    const scaleX=layer.clientWidth?bounds.width/layer.clientWidth:1;
    const scaleY=layer.clientHeight?bounds.height/layer.clientHeight:1;
    const burst=document.createElement('span');
    burst.className='interaction-feedback-burst';
    burst.style.left=`${(x-bounds.left)/(scaleX||1)}px`;
    burst.style.top=`${(y-bounds.top)/(scaleY||1)}px`;
    const ring=document.createElement('span');
    ring.className='interaction-feedback-ring';
    burst.append(ring);
    for(let i=0;i<3;i++){
      const star=document.createElement('span');
      star.className=`interaction-feedback-star interaction-feedback-star-${i+1}`;
      star.textContent='✦';
      burst.append(star);
    }
    layer.append(burst);
    bursts.set(burst,{host,layer,timer:setTimeout(()=>removeBurst(burst),FEEDBACK_MS)});

    releaseTarget(target);
    while(targets.size>=MAX_FEEDBACK)releaseTarget(targets.keys().next().value);
    target.classList.add('interaction-feedback-active');
    targets.set(target,setTimeout(()=>releaseTarget(target),FEEDBACK_MS));
  }

  document.addEventListener('click',onClick,true);
  installedCleanup=()=>{
    if(!active)return;
    active=false;
    document.removeEventListener('click',onClick,true);
    for(const burst of bursts.keys())removeBurst(burst);
    for(const target of targets.keys())releaseTarget(target);
    for(const layer of layers.values())layer.remove();
    layers.clear();
    installedCleanup=null;
  };
  return installedCleanup;
}
