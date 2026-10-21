import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../xiaoya/audio.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace(/export (async )?function /g,'$1function ');
function fixture({playError=null}={}){
  const timers=new Map(),sounds=[],states=[],fetches=[];let now=0,id=0;
  class Audio{
    constructor(url){this.src=url;this.volume=1;this.currentTime=0;this.playCalls=0;sounds.push(this);}
    play(){this.playCalls++;return playError?Promise.reject(playError):Promise.resolve();}
    pause(){this.paused=true;}
    removeAttribute(name){if(name==='src')this.src='';}
    load(){}
  }
  const sandbox={Audio,URL,performance:{now:()=>now},document:{baseURI:'http://127.0.0.1/xiaoya/'},location:{origin:'http://127.0.0.1'},
    navigator:{serviceWorker:{controller:{}}},window:{caches:{}},fetch(url){fetches.push(url);throw Error('Unexpected fetch probe');},
    setTimeout(fn,delay){const key=++id;timers.set(key,{fn,due:now+delay});return key;},clearTimeout(key){timers.delete(key);}};
  vm.runInNewContext(source+';globalThis.api={playSound,stopSound,fadeOutSound};',sandbox);
  return {...sandbox.api,sounds,states,fetches,timers,
    start(file='audio/guide.mp3'){return sandbox.api.playSound(file,state=>states.push(state));},
    advance(ms){const until=now+ms;let next;while((next=[...timers].filter(([,timer])=>timer.due<=until).sort((a,b)=>a[1].due-b[1].due)[0])){now=next[1].due;timers.delete(next[0]);next[1].fn();}now=until;}};
}

test('native playback starts in the click turn and does not launch a second fetch',async()=>{
  const f=fixture(),done=f.start(),audio=f.sounds[0];
  assert.equal(audio.playCalls,1);assert.deepEqual(f.states,['loading']);assert.equal(f.fetches.length,0);
  audio.onplaying();audio.currentTime=1;audio.onended();
  assert.equal(await done,true);assert.equal(f.fetches.length,0);assert.deepEqual(f.states,['loading','playing','idle']);assert.equal(f.timers.size,0);
});

test('autoplay denial retains its name so optional greetings can recover on a gesture',async()=>{
  const f=fixture({playError:Object.assign(new Error('autoplay denied'),{name:'NotAllowedError'})});
  await assert.rejects(f.start(),error=>error.name==='NotAllowedError'&&/浏览器/.test(error.message));
  assert.equal(f.sounds[0].paused,true);assert.equal(f.timers.size,0);
  assert.deepEqual(f.states,['loading','error']);
});

test('playback stalled after starting times out instead of leaving the lesson waiting forever',async()=>{
  const f=fixture(),done=f.start(),failure=assert.rejects(done,/本地声音读取超时/),audio=f.sounds[0];
  audio.onplaying();f.advance(15000);await failure;
  assert.equal(audio.paused,true);assert.deepEqual(f.states,['loading','playing','error']);
});

test('real progress renews the watchdog, unchanged time updates do not hide a stall',async()=>{
  const f=fixture(),done=f.start(),failure=assert.rejects(done,/本地声音读取超时/),audio=f.sounds[0];
  audio.onplaying();f.advance(14000);audio.currentTime=10;audio.ontimeupdate();f.advance(14000);
  assert.equal(audio.paused,undefined);audio.ontimeupdate();f.advance(1000);await failure;
  assert.equal(audio.ontimeupdate,null);
});

test('a replacement playback releases old handlers and settles cancelled playback only once',async()=>{
  const f=fixture(),old=f.start(),audio=f.sounds[0],lateEnd=audio.onended,latest=f.start('audio/next.mp3');
  assert.equal(await old,false);lateEnd();assert.equal(audio.onended,null);
  f.sounds[1].onplaying();f.sounds[1].onended();assert.equal(await latest,true);
  assert.deepEqual(f.states,['loading','idle','loading','playing','idle']);assert.equal(f.timers.size,0);
});

test('a playing explanation fades over 180 ms, then releases its audio and timers',async()=>{
  const f=fixture(),done=f.start(),audio=f.sounds[0];audio.onplaying();
  const fade=f.fadeOutSound();assert.equal(f.fadeOutSound(),fade,'Repeated requests share the same fade');
  assert.equal(audio.paused,undefined);assert.equal(audio.volume,1);
  f.advance(80);assert.ok(audio.volume>0&&audio.volume<0.6);assert.equal(audio.paused,undefined);
  f.advance(100);await fade;assert.equal(await done,false);
  assert.equal(audio.volume,0);assert.equal(audio.paused,true);assert.equal(f.timers.size,0);
  assert.deepEqual(f.states,['loading','playing','idle']);
});

test('navigation or replacement cancels a fade without muting the next voice',async()=>{
  for(const replace of [true,false]){
    const f=fixture(),old=f.start();f.sounds[0].onplaying();const fade=f.fadeOutSound();f.advance(48);
    if(!replace)f.stopSound();
    const next=f.start('audio/next.mp3');f.sounds[1].onplaying();await fade;assert.equal(await old,false);
    f.advance(300);assert.equal(f.sounds[1].volume,1);assert.equal(f.sounds[1].paused,undefined);
    f.sounds[1].onended();assert.equal(await next,true);assert.equal(f.timers.size,0);
  }
});

test('loading or already ended audio does not add an unnecessary fade delay',async()=>{
  const f=fixture(),done=f.start();await f.fadeOutSound();assert.equal(await done,false);assert.equal(f.timers.size,0);
  await f.fadeOutSound();
  const next=f.start();f.sounds[1].onplaying();const fade=f.fadeOutSound();f.advance(32);f.sounds[1].onended();
  await fade;assert.equal(await next,true);assert.equal(f.timers.size,0);
});
