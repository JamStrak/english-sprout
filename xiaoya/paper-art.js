// Optional art: the complete vector stays visible until this SVG image loads.
// URLs are relative to the document's project-root <base>, not the JS release.
const ROOT='xiaoya/paper/v1/';
const FLOWER_IDS=['daisy','tulip','sunflower','bellflower','poppy','violet','bow-pink','bow-blue','bow-yellow','bow-purple','giant-daisy','giant-sunflower'];
export const PAPER_ASSETS=Object.freeze(Object.fromEntries([
  ...['buddy-welcome','seed-pack','seed','watering-can','shell','water-drop','seed-in-soil','sprout','bud'].map(key=>[key,`${ROOT}${key}.webp`]),
  ...FLOWER_IDS.map(id=>[`flower-${id}`,`${ROOT}flowers/${id}.webp`]),
]));

/** Keep the existing SVG root/viewBox and put only its replaceable body here. */
export function paperLayer(key,fallback,{x=0,y=0,width=160,height=180,align='xMidYMid meet'}={}) {
  if(!Object.prototype.hasOwnProperty.call(PAPER_ASSETS,key))return fallback;
  if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)return fallback;
  const position=align==='xMidYMax meet'?align:'xMidYMid meet';
  return `<g data-paper-art="${key}" data-paper-state="loading" pointer-events="none"><g data-paper-fallback>${fallback}</g><image data-paper-image href="${PAPER_ASSETS[key]}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="${position}" opacity="0" pointer-events="none" aria-hidden="true"/></g>`;
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
  if(!Observer)return ()=>{}; // Without enhancement, all original art survives.
  const bound=new WeakMap();
  const saved=new Set();
  const document=root.ownerDocument||root;
  let active=true;
  const selector='image[data-paper-image]';
  function remember(path) {
    // On the very first visit an image may load before the worker controls us.
    // Read its HTTP-cached response once; never delay visible art on persistence.
    const build=document.querySelector?.('meta[name="xiaoya-build"]')?.content;
    if(!/^[a-f0-9]{12}$/.test(build||'')||!view.caches||typeof view.fetch!=='function')return;
    let url;
    try {url=new URL(path,document.baseURI);if(url.origin!==view.location.origin)return;}catch{return;}
    if(saved.has(url.href))return;
    saved.add(url.href);
    Promise.resolve().then(async()=>{
      const cache=await view.caches.open(`xiaoya-core-${build}`);
      if(await cache.match(url.href))return;
      const response=await view.fetch(url.href,{cache:'force-cache',mode:'same-origin'});
      if(response.status===200)await cache.put(url.href,response);
    }).catch(()=>{});
  }
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
      layer.setAttribute('data-paper-state',ready?'ready':'fallback');
    };
    const load=()=>{show(true);if(active)remember(PAPER_ASSETS[key]);},error=()=>show(false);
    bound.set(image,{load,error});
    image.addEventListener('load',load);
    image.addEventListener('error',error);
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
  const dispose=()=>{
    if(!active)return;
    active=false;observer.disconnect();
    for(const image of root.querySelectorAll(selector)) {
      const listeners=bound.get(image);
      if(listeners)for(const name of ['load','error'])image.removeEventListener(name,listeners[name]);
    }
    installed.delete(root);
  };
  installed.set(root,dispose);
  return dispose;
}
