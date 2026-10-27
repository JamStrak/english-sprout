import {appStorage} from './runtime.js';
import {createGrowthSettingsStore} from './growth-settings.js';
import {motionFrame} from './growth-motion.js';

const NS='http://www.w3.org/2000/svg', ROOT={x:80,y:164};
const element=(doc,name,attrs={})=>{const node=doc.createElementNS(NS,name);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));return node;};

// The silhouette stays outside the animated body, so both the root and the next
// tap target remain planted. Its painted height also excludes transparent art.
function paintedHeight(target) {
  const svg=target?.querySelector('svg[data-flower]'),hit=svg?.querySelector('[data-plant-hit="paper"]');
  try {
    const box=hit.getBBox(),matrix=svg.getCTM().inverse().multiply(hit.getCTM());
    const top=new DOMPoint(box.x,box.y).matrixTransform(matrix);
    const bottom=new DOMPoint(box.x+box.width,box.y+box.height).matrixTransform(matrix);
    if(Number.isFinite(bottom.y-top.y)&&bottom.y-top.y>0)return bottom.y-top.y;
  } catch { /* A detached/loading target may not expose SVG geometry yet. */ }
  return 40;
}

/** Real garden adapter for the same motion sampler used by the GM workbench. */
export function createMeadowMotion({storage=appStorage}={}) {
  const store=createGrowthSettingsStore({storage});
  let active=null;
  function capture(target) {
    const body=target?.querySelector('[data-plant-body]');
    if(!body)return null;
    const clone=body.cloneNode(true);
    for(const name of ['data-plant-body','data-feedback-body','data-feedback-kind'])clone.removeAttribute(name);
    clone.removeAttribute('class');clone.removeAttribute('style');
    return {body:clone,height:paintedHeight(target)};
  }
  function finish(run,completed) {
    if(active!==run)return;
    active=null;cancelAnimationFrame(run.frame);clearTimeout(run.timeout);
    run.outgoing.remove();run.effects.remove();
    run.body.removeAttribute('data-meadow-motion-incoming');
    if(run.previousStyle===null)run.body.removeAttribute('style');else run.body.setAttribute('style',run.previousStyle);
    delete run.target.dataset.meadowMotion;delete run.target.dataset.meadowMotionProgress;
    run.resolve(completed);
  }
  function cancel() {if(active)finish(active,false);}
  function play(target,before) {
    cancel();
    const body=target?.querySelector('[data-plant-body]'),svg=body?.ownerSVGElement;
    if(!body||!svg||!before?.body||!target.isConnected)return Promise.resolve(false);
    const motion=store.load().motion,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration=reduced?180:motion.duration,doc=target.ownerDocument;
    const outgoing=before.body.cloneNode(true),effects=element(doc,'g',{'data-meadow-motion-effects':'','pointer-events':'none','aria-hidden':'true'});
    outgoing.setAttribute('data-meadow-motion-outgoing','');outgoing.setAttribute('pointer-events','none');
    const drop=element(doc,'path',{d:'M0-11C-3-6-7-2-7 2a7 7 0 0 0 14 0C7-2 3-6 0-11Z',fill:'#9ad4df',stroke:'#eefcff','stroke-width':1.5});
    const ripple=element(doc,'ellipse',{cx:ROOT.x,cy:ROOT.y,rx:9,ry:4,fill:'none',stroke:'#d7edc0','stroke-width':3});
    const glow=element(doc,'ellipse',{cx:ROOT.x,cy:ROOT.y,rx:29,ry:9,fill:'#f9e7a2'});
    const particles=Array.from({length:12},(_,i)=>element(doc,i<6?'ellipse':'path',i<6?
      {cx:0,cy:0,rx:2.5,ry:4.5,fill:'#a3d7e0'}:
      {d:'M0-5L1.5-1.5 5 0 1.5 1.5 0 5-1.5 1.5-5 0-1.5-1.5Z',fill:i%2?'#ffe5a0':'#f8f2cd'}));
    effects.append(glow,ripple,drop,...particles);svg.append(effects);
    const previousStyle=body.getAttribute('style');
    body.setAttribute('data-meadow-motion-incoming','');body.style.opacity='0';
    body.before(outgoing);
    for(const layer of [body,outgoing]) {
      layer.style.transformBox='view-box';layer.style.transformOrigin=`${ROOT.x}px ${ROOT.y}px`;
      layer.style.willChange='transform, opacity';layer.style.animation='none';layer.style.scale='none';
    }
    effects.style.opacity='0';target.dataset.meadowMotion='loading';
    target.dataset.meadowMotionDuration=String(motion.duration);target.dataset.meadowMotionSway=String(motion.sway);
    const fromHeight=Math.max(1,before.height),toHeight=Math.max(1,paintedHeight(target));
    return new Promise(resolve=>{
      const run={target,body,outgoing,effects,previousStyle,resolve,frame:0,timeout:0};active=run;
      // Keep the outgoing painted picture visible until the new WebP is decoded.
      // Missing art retains the app's neutral loading state; it never shows SVG art.
      const image=body.querySelector('image[data-paper-image]'),preload=new Image();
      if(image)preload.src=new URL(image.getAttribute('href'),doc.baseURI).href;
      const ready=image?preload.decode():Promise.resolve();
      run.timeout=setTimeout(()=>finish(run,false),6000);
      ready.then(()=>{
        if(active!==run)return;
        clearTimeout(run.timeout);
        if(!target.isConnected||doc.hidden){finish(run,false);return;}
        const started=performance.now();effects.style.opacity='1';
        function tick(now) {
          if(active!==run)return;
          if(!target.isConnected||doc.hidden){finish(run,false);return;}
          const t=Math.min(1,(now-started)/duration),f=motionFrame(t,fromHeight,toHeight,motion,reduced);
          for(const [layer,height] of [[outgoing,fromHeight],[body,toHeight]]) {
            const scale=f.scale/height;
            layer.style.transform=`rotate(${f.angle}deg) skewX(${f.bend}deg) scale(${scale/Math.sqrt(f.stretch)},${scale*f.stretch})`;
          }
          outgoing.style.opacity=String(1-f.mix);body.style.opacity=String(f.mix);
          target.dataset.meadowMotion=f.phase;target.dataset.meadowMotionProgress=String(t);
          const crown=Math.max(20,fromHeight*.8),intensity=motion.particles/100;
          drop.setAttribute('transform',`translate(${ROOT.x} ${ROOT.y-crown-70+70*f.drop*f.drop}) scale(${.85+f.drop*.15})`);
          drop.style.opacity=String(reduced||f.drop>=1?0:1);
          ripple.setAttribute('rx',String(9+f.impact*34));ripple.setAttribute('ry',String(4+f.impact*11));
          ripple.style.opacity=String(reduced?0:Math.sin(Math.PI*f.impact)*.9);
          glow.style.opacity=String(reduced?0:Math.sin(Math.PI*f.spark)*.5);
          particles.forEach((particle,i)=>{
            const splash=i<6,p=splash?f.impact:f.spark,angle=i%6/6*Math.PI*2;
            const distance=(splash?28:42)*p*(.6+intensity*.4);
            particle.setAttribute('transform',`translate(${ROOT.x+Math.cos(angle)*distance} ${ROOT.y-(splash?crown:toHeight*.65)+Math.sin(angle)*distance*.6-18*Math.sin(Math.PI*p)}) rotate(${p*150}) scale(${.5+Math.sin(Math.PI*p)*.8})`);
            particle.style.opacity=String(reduced?0:Math.sin(Math.PI*p)*intensity);
          });
          if(t<1)run.frame=requestAnimationFrame(tick);else finish(run,true);
        }
        run.frame=requestAnimationFrame(tick);
      }).catch(()=>finish(run,false));
    });
  }
  return Object.freeze({capture,play,cancel});
}
