import test from 'node:test';
import assert from 'node:assert/strict';
import {pictureFor,pictureSequence,createPictureLoader} from '../xiaoya/story-pictures.js';

const base='http://127.0.0.1:24756/';
const story={id:'example',image:'main.webp',imageLayout:'single',introFrame:0,introImage:'intro.webp',cueFrame:1,teachingFrames:[0,1],alternateImages:{request:'request.webp',resolved:'resolved.webp'}};
const file=picture=>picture?.url.split('/').at(-1);

test('intro, main and alternate beats select their own single picture',()=>{
  assert.equal(file(pictureFor(story,{frame:0},base)),'intro.webp');
  assert.equal(file(pictureFor(story,{frame:1},base)),'main.webp');
  assert.equal(file(pictureFor(story,{alternate:true,phase:'request'},base)),'request.webp');
  assert.equal(file(pictureFor(story,{alternate:true,phase:'resolved'},base)),'resolved.webp');
  for(const options of [{frame:0},{frame:1},{alternate:true,phase:'resolved'}])assert.equal(pictureFor(story,options,base).layout,'single');
});

test('missing intro or alternate remains unavailable, never a different beat image',()=>{
  assert.equal(pictureFor({...story,introImage:null},{frame:0},base),null);
  assert.equal(pictureFor({...story,alternateImages:{request:'request.webp'}},{alternate:true,phase:'resolved'},base),null);
  assert.equal(pictureFor({...story,alternateImages:null},{alternate:true},base),null);
  assert.equal(pictureFor({...story,image:null},{frame:1},base),null);
});

test('legacy sprite sheets retain their grid and frame while new assets are single images',()=>{
  const legacy={...story,imageLayout:undefined};
  assert.deepEqual(pictureFor(legacy,{frame:3},base),{url:base+'xiaoya/stories/main.webp',layout:'grid',frame:3});
  assert.equal(pictureFor(legacy,{frame:0},base).layout,'single');
  assert.equal(pictureFor(legacy,{alternate:true},base).layout,'single');
});

test('preload is bounded to current and immediate next teaching beat',()=>{
  assert.deepEqual(pictureSequence(story,{frame:0,phase:'story'},base).map(file),['intro.webp','main.webp']);
  assert.deepEqual(pictureSequence(story,{frame:1,phase:'story'},base).map(file),['main.webp']);
  assert.deepEqual(pictureSequence(story,{frame:1,phase:'request'},base).map(file),['main.webp']);
  assert.deepEqual(pictureSequence(story,{alternate:true,phase:'request'},base).map(file),['request.webp','resolved.webp']);
  assert.deepEqual(pictureSequence(story,{alternate:true,phase:'resolved'},base).map(file),['resolved.webp']);
});

test('missing intro may preload its immediate successor, and shared URLs are deduplicated',()=>{
  assert.deepEqual(pictureSequence({...story,introImage:null},{frame:0,phase:'story'},base).map(file),['main.webp']);
  assert.equal(pictureSequence({...story,introImage:'main.webp'},{frame:0,phase:'story'},base).length,1);
  assert.equal(pictureSequence({...story,alternateImages:{request:'same.webp',resolved:'same.webp'}},{alternate:true,phase:'request'},base).length,1);
});

function harness(options={}){
  const images=[],timers=new Map(),changes=[],persisted=[];
  let id=0;
  const loader=createPictureLoader({
    createImage:()=>{const image={};images.push(image);return image;},
    setTimer:fn=>{timers.set(++id,fn);return id;},clearTimer:id=>timers.delete(id),
    onChange:(...args)=>changes.push(args),persist:url=>persisted.push(url),...options
  });
  return {loader,images,timers,changes,persisted};
}

test('concurrent requests and shared-story assets have a single URL lifecycle',async()=>{
  const {loader,images,changes,persisted}=harness();
  assert.equal(loader.status('main'),'idle');
  const first=loader.load('main'),second=loader.load('main');
  assert.equal(first,second);assert.equal(images.length,1);assert.equal(loader.status('main'),'pending');
  images[0].onload();assert.equal(await first,'ready');
  assert.equal(loader.status('main'),'ready');assert.equal(loader.load('main'),first);
  assert.deepEqual(changes,[['main','ready']]);assert.deepEqual(persisted,['main']);
});

test('a failed intro or alternate cannot mark the main or another alternate unavailable',async()=>{
  const {loader,images}=harness();
  const intro=loader.load('intro'),main=loader.load('main'),request=loader.load('request'),resolved=loader.load('resolved');
  images[0].onerror();images[1].onload();images[2].onerror();images[3].onload();
  assert.deepEqual(await Promise.all([intro,main,request,resolved]),['failed','ready','failed','ready']);
  assert.equal(loader.status('main'),'ready');assert.equal(loader.status('resolved'),'ready');
  loader.load('intro');assert.equal(images.length,4,'Repeated renders do not create a failed-resource request loop');
});

test('timeout releases callers to the loading placeholder while a late decode can still become ready without a new request',async()=>{
  const {loader,images,timers,changes,persisted}=harness();
  const result=loader.load('slow'),lateLoad=images[0].onload;
  [...timers.values()][0]();assert.equal(await result,'slow');
  assert.equal(loader.status('slow'),'slow');assert.deepEqual(persisted,[]);
  assert.equal(loader.load('slow'),result);assert.equal(images.length,1);
  lateLoad();await Promise.resolve();assert.equal(loader.status('slow'),'ready');
  assert.deepEqual(changes,[['slow','slow'],['slow','ready']]);assert.deepEqual(persisted,['slow']);assert.equal(timers.size,0);
});

test('a slow download may fail later without retrying or affecting another URL',async()=>{
  const {loader,images,timers,changes}=harness();
  const slow=loader.load('slow');[...timers.values()][0]();await slow;
  const other=loader.load('other');images[1].onload();await other;
  images[0].onerror();assert.equal(loader.status('slow'),'failed');assert.equal(loader.status('other'),'ready');
  assert.deepEqual(changes,[['slow','slow'],['other','ready'],['slow','failed']]);
  loader.load('slow');assert.equal(images.length,2);
});

test('cache write failure and a pending cache write do not block a decoded picture',async()=>{
  for(const persist of [()=>Promise.reject(new Error('quota')),()=>new Promise(()=>{})]){
    const {loader,images}=harness({persist});
    const ready=loader.load('main');images[0].onload();
    assert.equal(await ready,'ready');assert.equal(loader.status('main'),'ready');
  }
});

test('synchronous image creation error is contained and the absent asset never loads',async()=>{
  const {loader,timers}=harness({createImage:()=>{throw new Error('unavailable');}});
  assert.equal(await loader.load('broken'),'failed');assert.equal(timers.size,0);
  assert.equal(await loader.load(null),'missing');
});


test('explicit retry recovers a failed URL without replacing ready pictures',async()=>{
  const {loader,images,changes}=harness();
  const failed=loader.load('main');images[0].onerror();await failed;
  const retried=loader.load('main',{retry:true});assert.equal(images.length,2);
  assert.equal(loader.status('main'),'pending');images[1].onload();
  assert.equal(await retried,'ready');assert.equal(loader.load('main',{retry:true}),retried);
  assert.deepEqual(changes,[['main','failed'],['main','ready']]);
});

test('retrying a timed-out picture rejects stale callbacks from the replaced request',async()=>{
  const {loader,images,timers,changes}=harness();
  const slow=loader.load('main'),oldLoad=images[0].onload,oldError=images[0].onerror;
  [...timers.values()][0]();await slow;
  const retried=loader.load('main',{retry:true});oldLoad();oldError();
  assert.equal(loader.status('main'),'pending');images[1].onload();
  assert.equal(await retried,'ready');assert.deepEqual(changes,[['main','slow'],['main','ready']]);
});
