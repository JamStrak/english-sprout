import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {MEADOW_HIT_SHAPES} from '../xiaoya/meadow-hit-shapes.js';
import {PAPER_ASSETS,paperLayer,paperPlantLayer,installPaperArt} from '../xiaoya/paper-art.js';
import {shellArt,dropArt,canArt,packArt,seedArt,plantArt} from '../xiaoya/garden-art.js';
import {meadowPlantArt} from '../xiaoya/meadow-art.js';
import {FLOWERS} from '../xiaoya/garden-meadow.js';

class Node extends EventTarget {
  constructor(tag='g',attributes={}){super();this.tag=tag;this.attributes={...attributes};this.children=[];this.parentElement=null;}
  getAttribute(name){return this.attributes[name]??null;}
  setAttribute(name,value){this.attributes[name]=String(value);}
  append(node){node.parentElement=this;this.children.push(node);return node;}
  remove(node){this.children=this.children.filter(child=>child!==node);node.parentElement=null;}
  contains(node){return this===node||this.children.some(child=>child.contains(node));}
  matches(selector){return selector==='image[data-paper-image]'?this.tag==='image'&&'data-paper-image'in this.attributes:selector==='[data-paper-fallback]'&&'data-paper-fallback'in this.attributes;}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
function fixture({cached=false,failCache=false,observer=true,build='012345abcdef'}={}) {
  let onMutation;
  const calls={opened:[],fetch:[],put:[],observed:[],disconnected:0};
  const cache={match:async()=>cached?{status:200}:undefined,put:async(...args)=>calls.put.push(args)};
  const view={location:{origin:'https://example.test'},caches:{open:async name=>{calls.opened.push(name);if(failCache)throw Error('storage full');return cache;}},fetch:async(...args)=>{calls.fetch.push(args);return {status:200};}};
  if(observer)view.MutationObserver=class {constructor(fn){onMutation=fn;}observe(...args){calls.observed.push(args);}disconnect(){calls.disconnected++;}};
  const root=new Node('main');
  root.ownerDocument={defaultView:view,baseURI:'https://example.test/nested/',querySelector:()=>({content:build})};
  function add(key='shell',href=PAPER_ASSETS[key]) {
    const layer=new Node('g',{'data-paper-art':key,'data-paper-state':'loading'});
    const fallback=layer.append(new Node('g',{'data-paper-fallback':''}));
    fallback.append(new Node('path',{d:'M0 0L20 20'}));
    const image=layer.append(new Node('image',{'data-paper-image':'',href,opacity:'0',width:'160',height:'180'}));
    root.append(layer);onMutation?.([{addedNodes:[layer]}]);
    return {layer,fallback,image};
  }
  return {root,view,calls,add};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('plant hit outlines match the currently shipped art assets',()=>{
  const keys=['seed-in-soil','sprout','bud',...FLOWERS.map(f=>`flower-${f.id}`)];
  assert.deepEqual(Object.keys(MEADOW_HIT_SHAPES).sort(),keys.sort());
  for(const key of keys){
    const hash=createHash('sha256').update(fs.readFileSync(new URL(`../public/${PAPER_ASSETS[key]}`,import.meta.url))).digest('hex');
    assert.equal(MEADOW_HIT_SHAPES[key].sha256,hash,`${key}: regenerate hit outlines after replacing artwork`);
  }
});

test('paper map covers tools, three shared growth stages and twelve stable flowers with nested-host relative paths',()=>{
  assert.equal(Object.keys(PAPER_ASSETS).length,21);
  assert.ok(Object.isFrozen(PAPER_ASSETS));
  for(const stage of ['seed-in-soil','sprout','bud'])assert.equal(PAPER_ASSETS[stage],`xiaoya/paper/v1/${stage}.webp`);
  for(const flower of FLOWERS)assert.equal(PAPER_ASSETS[`flower-${flower.id}`],`xiaoya/paper/v1/flowers/${flower.id}.webp`);
  for(const path of Object.values(PAPER_ASSETS))assert.match(path,/^xiaoya\/paper\/v1\/(?:flowers\/)?[a-z-]+\.webp$/);
});

test('optional layer keeps complete visible fallback and fixed transparent image bounds before load',()=>{
  const fallback='<path d="M0 0L20 20"/>';
  const layer=paperLayer('shell',fallback,{x:2,y:3,width:100,height:120,align:'xMidYMax meet'});
  assert.match(layer,/<g data-paper-fallback><path d="M0 0L20 20"\/><\/g>/);
  assert.match(layer,/x="2" y="3" width="100" height="120"/);
  assert.match(layer,/preserveAspectRatio="xMidYMax meet" opacity="0" pointer-events="none"/);
  assert.doesNotMatch(layer,/visibility="hidden"|<svg|<script|onload=|tabindex=/);
  for(const key of ['unknown','__proto__','shell" onload="bad'])assert.equal(paperLayer(key,fallback),fallback);
  for(const options of [{width:0},{height:-1},{x:NaN},{y:Infinity},{width:'1"'}])assert.equal(paperLayer('shell',fallback,options),fallback);
});

test('plant image aligns its painted root in both wide and narrow viewports, not its transparent canvas bottom',()=>{
  for(const [width,height,anchorY] of [[160,166,.88],[60,166,.88],[160,210,396/512]]) {
    const art=paperPlantLayer('sprout','<path/>',{width,height,rootY:117,anchorY});
    const [,x,y]=art.match(/<image[^>]+ x="([^"]+)" y="([^"]+)"/);
    const paintedHeight=Math.min(height,width/(384/512));
    const root=Number(y)+height-paintedHeight+paintedHeight*anchorY;
    assert.ok(Math.abs(root-117)<1e-8);
    assert.equal(Number(x)+width/2,80);
  }
  for(const options of [{width:0},{height:-1},{rootY:NaN},{centerX:Infinity},{anchorY:-.1},{anchorY:1.1}])assert.equal(paperPlantLayer('sprout','fallback',options),'fallback');
});

test('garden tools keep SVG roots; plants preserve complete vectors and separate pot/soil at every stage',()=>{
  for(const [draw,key] of [[shellArt,'shell'],[dropArt,'water-drop'],[canArt,'watering-can'],[packArt,'seed-pack'],[seedArt,'seed']]) {
    const art=draw();assert.match(art,/^<svg viewBox="0 0 160 180"/);assert.match(art,new RegExp(`data-paper-art="${key}"`));assert.match(art,/<g data-paper-fallback>/);
  }
  for(const flower of FLOWERS) {
    const mature=meadowPlantArt(flower,flower.waterNeeded);
    assert.match(mature,new RegExp(`data-paper-art="flower-${flower.id}"`));
    assert.match(mature,/<ellipse data-feedback-anchor data-part="soil"[^>]+\/><g data-plant-body data-feedback-body><g data-paper-art=/);
    for(let count=0;count<flower.waterNeeded;count++) {
      const art=meadowPlantArt(flower,count);
      const key=count===0?'seed-in-soil':count/flower.waterNeeded<.5?'sprout':'bud';
      assert.match(art,new RegExp(`data-paper-art="${key}"`));
      assert.match(art,/<g data-paper-fallback><path data-part="stem"/);
      assert.match(art,/<ellipse data-feedback-anchor data-part="soil"[^>]+\/><g data-plant-body data-feedback-body(?: data-feedback-kind="seed")?><g data-paper-art=/);
    }
  }
  for(const [stage,key] of [[0,'seed-in-soil'],[1,'sprout'],[2,'flower-daisy']]) {
    const art=plantArt(FLOWERS[0],stage);
    assert.match(art,new RegExp(`data-paper-art="${key}"`));
    assert.match(art,/<g data-paper-fallback><path/);
    assert.match(art,/<\/g><path d="M44 120h72/); // Front pot covers the image's soil edge.
    const [,y,height]=art.match(/<image[^>]+ y="([^"]+)"[^>]+ height="([^"]+)"/);
    const anchor=stage===2?.88:396/512;
    assert.ok(Math.abs(Number(y)+Number(height)*anchor-117)<1e-8);
    if(stage<2) {
      // Real source pixels: seed starts at 372, sprout at 296; soil ends at451.
      const top=stage===0?372:296;
      assert.ok(117-(Number(y)+Number(height)*top/512)>=9,'a visible seed/leaf remains above the pot lip');
      assert.ok(Number(y)+Number(height)*451/512<160,'the soil mound ends within the existing front pot');
    }
  }
});

test('successful meadow bitmaps also grow on every pour while staying anchored at soil',()=>{
  for(const flower of FLOWERS) {
    let previousVisibleHeight=0;
    const stages=new Set();
    for(let count=0;count<=flower.waterNeeded;count++) {
      const art=meadowPlantArt(flower,count);
      const [,x,y,width,height]=art.match(/<image[^>]+ x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/);
      const paintedHeight=Math.min(Number(height),Number(width)/(384/512));
      assert.ok(Math.abs(Number(y)+Number(height)-paintedHeight+paintedHeight*.88-164)<1e-8);
      assert.equal(Math.round((Number(x)+Number(width)/2)*100),8000);
      const key=art.match(/data-paper-art="([^"]+)"/)[1];
      // The source alpha outline is independently tied to the asset hash above.
      // Transparent canvas growth must not pass as actual plant growth.
      const top=Math.min(...[...MEADOW_HIT_SHAPES[key].path.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(m=>Number(m[2])));
      const visibleHeight=paintedHeight*(512*.88-top)/512;
      assert.ok(visibleHeight-previousVisibleHeight>=7.9,`${flower.id} pour ${count}: visible height ${previousVisibleHeight} -> ${visibleHeight}`);
      previousVisibleHeight=visibleHeight;
      stages.add(key);
      if(count===0)assert.ok(paintedHeight*(451-372)/512>=18,'real seed/soil pixels remain legible');
    }
    assert.deepEqual([...stages],['seed-in-soil','sprout','bud',`flower-${flower.id}`]);
  }
});

test('one installation handles existing and subsequently rendered native image loads without changing dimensions',()=>{
  const {root,calls,add}=fixture();const first=add();
  const dispose=installPaperArt(root);assert.equal(installPaperArt(root),dispose);assert.equal(calls.observed.length,1);
  first.image.dispatchEvent(new Event('load'));
  assert.equal(first.layer.getAttribute('data-paper-state'),'ready');assert.equal(first.fallback.getAttribute('visibility'),'hidden');assert.equal(first.image.getAttribute('opacity'),'1');
  assert.equal(first.image.getAttribute('width'),'160');assert.equal(first.image.getAttribute('height'),'180');
  const next=add('seed');next.image.dispatchEvent(new Event('load'));assert.equal(next.layer.getAttribute('data-paper-state'),'ready');
  dispose();dispose();assert.equal(calls.disconnected,1);
});

test('broken image keeps its vector; removed or disposed nodes cannot receive a late visibility change',()=>{
  const {root,add}=fixture();const dispose=installPaperArt(root);
  const broken=add();broken.image.dispatchEvent(new Event('error'));
  assert.equal(broken.layer.getAttribute('data-paper-state'),'fallback');assert.equal(broken.fallback.getAttribute('visibility'),'visible');assert.equal(broken.image.getAttribute('opacity'),'0');
  const removed=add('seed');root.remove(removed.layer);removed.image.dispatchEvent(new Event('load'));assert.equal(removed.layer.getAttribute('data-paper-state'),'loading');
  const late=add('water-drop');dispose();late.image.dispatchEvent(new Event('load'));assert.equal(late.layer.getAttribute('data-paper-state'),'loading');
});

test('a previously loaded picture stays ready across redraws, but a real load error restores fallback',()=>{
  const {root,add}=fixture();const dispose=installPaperArt(root);
  const first=add('seed');first.image.dispatchEvent(new Event('load'));
  root.remove(first.layer);
  const redrawn=add('seed');
  assert.equal(redrawn.layer.getAttribute('data-paper-state'),'ready');
  assert.equal(redrawn.fallback.getAttribute('visibility'),'hidden');
  assert.equal(redrawn.image.getAttribute('opacity'),'1');
  // A stale detached image cannot invalidate the current picture.
  first.image.dispatchEvent(new Event('error'));
  assert.equal(add('seed').layer.getAttribute('data-paper-state'),'ready');
  redrawn.image.dispatchEvent(new Event('error'));
  assert.equal(redrawn.layer.getAttribute('data-paper-state'),'fallback');
  assert.equal(redrawn.fallback.getAttribute('visibility'),'visible');
  assert.equal(add('seed').layer.getAttribute('data-paper-state'),'loading');
  dispose();
  installPaperArt(root);
  assert.equal(add('seed').layer.getAttribute('data-paper-state'),'loading');
});

test('unrecognized or replaced image href is never enhanced or persisted',async()=>{
  const {root,add,calls}=fixture();const dispose=installPaperArt(root);
  for(const [key,href] of [['shell','https://other.test/shell.webp'],['unlisted','xiaoya/paper/v1/missing.webp']]) {
    const item=add(key,href);item.image.dispatchEvent(new Event('load'));assert.equal(item.layer.getAttribute('data-paper-state'),'loading');
  }
  await tick();assert.equal(calls.fetch.length,0);dispose();
});

test('first uncontrolled visit stores successful assets once per URL using existing HTTP cache',async()=>{
  const {root,add,calls}=fixture();const dispose=installPaperArt(root);
  for(let i=0;i<3;i++)add().image.dispatchEvent(new Event('load'));
  await tick();
  assert.deepEqual(calls.opened,['xiaoya-core-012345abcdef']);
  assert.deepEqual(calls.fetch,[['https://example.test/nested/xiaoya/paper/v1/shell.webp',{cache:'force-cache',mode:'same-origin'}]]);
  assert.equal(calls.put.length,1);assert.equal(calls.put[0][0],calls.fetch[0][0]);dispose();
});

test('already cached assets avoid fetch; error, missing build or denied storage never hide the fallback',async()=>{
  for(const options of [{cached:true},{failCache:true},{build:'__XIAOYA_BUILD__'}]) {
    const {root,add,calls}=fixture(options);const dispose=installPaperArt(root);const item=add();item.image.dispatchEvent(new Event('load'));await tick();
    assert.equal(calls.fetch.length,0);assert.equal(item.layer.getAttribute('data-paper-state'),'ready');dispose();
  }
  const {root,add,calls}=fixture();const dispose=installPaperArt(root);const broken=add();broken.image.dispatchEvent(new Event('error'));await tick();
  assert.equal(calls.fetch.length,0);assert.equal(broken.fallback.getAttribute('visibility'),'visible');dispose();
});

test('without DOM or MutationObserver the original art stays usable',()=>{
  assert.doesNotThrow(()=>installPaperArt(null)());
  const {root,add}=fixture({observer:false});const item=add();installPaperArt(root)();item.image.dispatchEvent(new Event('load'));
  assert.equal(item.image.getAttribute('opacity'),'0');assert.notEqual(item.fallback.getAttribute('visibility'),'hidden');
});
