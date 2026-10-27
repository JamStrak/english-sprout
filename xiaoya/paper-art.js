import {CHALLENGE_GROWTH_ASSETS} from './challenge-flowers.js';

// Release art has one identity. Loading/errors use a neutral placeholder;
// the previous vector characters and flowers must never reappear.
// URLs are relative to the document's project-root <base>, not the JS release.
const ROOT='xiaoya/paper/v1/';
const NEXT_ROOT='xiaoya/paper/v2/';
const FLOWER_IDS=['daisy','tulip','sunflower','bellflower','poppy','violet','bow-pink','bow-blue','bow-yellow','bow-purple','giant-daisy','giant-sunflower'];
export const PAPER_ASSETS=Object.freeze(Object.fromEntries([
  ...['buddy-welcome','gift-box','seed-pack','seed','watering-can','shell','water-drop','seed-in-soil','sprout','bud'].map(key=>[key,`${ROOT}${key}.webp`]),
  ...FLOWER_IDS.map(id=>[`flower-${id}`,`${ROOT}flowers/${id}.webp`]),
  ...['voice-aiden','voice-ryan','voice-pip','pot-front','challenge-flag','guide-hand'].map(key=>[key,`${NEXT_ROOT}${key}.webp`]),
  ...['bow-rainbow','bow-starlight'].map(id=>[`flower-${id}`,`${NEXT_ROOT}flowers/${id}.webp`]),
  ...Object.entries(CHALLENGE_GROWTH_ASSETS),
]));

/** Keep the existing SVG root/viewBox and put only its replaceable body here. */
export function paperLayer(key,fallback,{x=0,y=0,width=160,height=180,align='xMidYMid meet'}={}) {
  if(!Object.prototype.hasOwnProperty.call(PAPER_ASSETS,key))return fallback;
  if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)return fallback;
  const position=align==='xMidYMax meet'?align:'xMidYMid meet';
  return `<g data-paper-art="${key}" data-paper-state="loading" pointer-events="none"><g data-paper-fallback><ellipse cx="${x+width/2}" cy="${y+height*.72}" rx="${width*.15}" ry="${height*.055}" fill="currentColor" opacity=".12"/></g><image data-paper-image href="${PAPER_ASSETS[key]}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="${position}" opacity="0" pointer-events="none" aria-hidden="true"/></g>`;
}

/** The plant canvases are 384×512; their visible root is at (.5, .88). */
export function paperPlantLayer(key,fallback,{centerX=80,rootY=164,width=124.5,height=166,anchorY=.88}={}) {
  if(![centerX,rootY,width,height,anchorY].every(Number.isFinite)||width<=0||height<=0||anchorY<0||anchorY>1)return fallback;
  // YMax meet can letterbox either dimension. Align the painted root rather
  // than the canvas bottom, including when a caller supplies a narrow box.
  const imageHeight=Math.min(height,width/(384/512));
  return paperLayer(key,fallback,{x:centerX-width/2,y:rootY-height+(1-anchorY)*imageHeight,width,height,align:'xMidYMax meet'});
}

const installed=new WeakMap();
/**
 * Install once, before the first render. Native SVG image load needs a direct
 * listener in Edge; delegation alone can miss it. Observe added subtrees only,
 * never rescan the full app on each render or alter a button's geometry/focus.
 */
export function installPaperArt(root=globalThis.document) {
  if(!root||typeof root.querySelectorAll!=='function')return ()=>{};
  if(installed.has(root))return installed.get(root);
  const view=root.ownerDocument?.defaultView||root.defaultView||globalThis;
  const Observer=view.MutationObserver;
  if(!Observer)return ()=>{};
  const bound=new WeakMap();
  const loaded=new Set();
  let active=true;
  const selector='image[data-paper-image]';
  function bind(image) {
    if(bound.has(image))return;
    const layer=image.parentElement;
    const key=layer?.getAttribute('data-paper-art');
    if(!Object.prototype.hasOwnProperty.call(PAPER_ASSETS,key)||image.getAttribute('href')!==PAPER_ASSETS[key])return;
    const fallback=layer.querySelector('[data-paper-fallback]');
    if(!fallback)return;
    const show=ready=>{
      if(!active||!root.contains(image))return;
      image.setAttribute('opacity',ready?'1':'0');
      fallback.setAttribute('visibility',ready?'hidden':'visible');
      layer.setAttribute('data-paper-state',ready?'ready':'error');
    };
    const load=()=>{if(!active||!root.contains(image))return;loaded.add(key);show(true);root.dispatchEvent?.(new (view.Event||Event)('xiaoya-art-ready'));};
    const error=()=>{if(!active||!root.contains(image))return;loaded.delete(key);show(false);root.dispatchEvent?.(new (view.Event||Event)('xiaoya-art-error'));};
    bound.set(image,{load,error});
    image.addEventListener('load',load);
    image.addEventListener('error',error);
    // A garden tap redraws the same cached picture. Restore its known artwork
    // before paint so neither the picture nor its hit shape flashes to vector.
    // Native errors show only a neutral placeholder; a new installation is cold.
    if(loaded.has(key))show(true);
  }
  function scan(node) {
    if(node.matches?.(selector))bind(node);
    for(const image of node.querySelectorAll?.(selector)||[])bind(image);
  }
  const observer=new Observer(records=>{
    if(!active)return;
    for(const record of records)for(const node of record.addedNodes)scan(node);
  });
  observer.observe(root,{childList:true,subtree:true});
  scan(root);
  const retry=()=>{
    for(const image of root.querySelectorAll(selector))if(image.parentElement?.getAttribute('data-paper-state')==='error'){
      image.parentElement.setAttribute('data-paper-state','loading');
      const path=image.getAttribute('href');image.setAttribute('href','');image.setAttribute('href',path);
    }
  };
  root.addEventListener?.('xiaoya-retry-art',retry);
  const dispose=()=>{
    if(!active)return;
    active=false;observer.disconnect();root.removeEventListener?.('xiaoya-retry-art',retry);
    for(const image of root.querySelectorAll(selector)) {
      const listeners=bound.get(image);
      if(listeners)for(const name of ['load','error'])image.removeEventListener(name,listeners[name]);
    }
    installed.delete(root);
  };
  installed.set(root,dispose);
  return dispose;
}
