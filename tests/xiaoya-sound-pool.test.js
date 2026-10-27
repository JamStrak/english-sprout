import test from 'node:test';
import assert from 'node:assert/strict';
import {createSoundPlayer} from '../xiaoya/sound-player.js';
import {SOUND_EVENTS,SOUND_ASSETS} from '../xiaoya/sound-catalog.js';

const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
const sampleEvents=[
  {id:'tap',assetId:'tick',volume:.5,priority:1,cooldownMs:0,kind:'sfx'},
  {id:'alias',assetId:'tick-alias',volume:.8,priority:1,cooldownMs:0,kind:'sfx'},
  {id:'reward',assetId:'chime',volume:.8,priority:3,cooldownMs:0,kind:'sfx'},
  {id:'bgm',assetId:'piano',volume:1,priority:0,cooldownMs:0,kind:'bgm'},
];
const sampleAssets=[{id:'tick',url:'tick.mp3'},{id:'tick-alias',url:'tick.mp3'},{id:'chime',url:'chime.mp3'},
  {id:'piano',url:'piano.mp3',kind:'bgm'},{id:'unused',url:'unused.mp3'}];

function fixture(t,{events=sampleEvents,assets=sampleAssets,preload=true,deferred=false,native=false,factoryDefault=false}={}){
  let time=0,timerId=0;
  const players=[],timers=new Map(),listeners=new Set(),visibility=new Set();
  const settings={enabled:true,volume:.6,customAssets:{},events:Object.fromEntries(events.map(event=>[event.id,{assetId:event.assetId,enabled:event.enabled!==false,volume:event.volume}]))};
  const document={hidden:false,baseURI:'https://example.test/app/',addEventListener(name,callback){if(name==='visibilitychange')visibility.add(callback);},removeEventListener(name,callback){visibility.delete(callback);}};
  const createAudio=url=>{
    let resolvePlay,rejectPlay;
    const audio={url,paused:true,currentTime:0,plays:0,pauses:0,loads:0,removed:0,
      play(){this.plays++;if(this.playFailure==='throw')throw Error('Audio unavailable');if(this.playFailure==='reject')return Promise.reject(Error('Autoplay blocked'));if(deferred)return new Promise((resolve,reject)=>{resolvePlay=resolve;rejectPlay=reject;});this.start();return Promise.resolve();},
      start(){this.paused=false;this.currentTime=.1;this.onplaying?.();},
      end(){this.paused=true;this.onended?.();},fail(){this.onerror?.();},
      resolvePlay(){resolvePlay?.();},rejectPlay(){rejectPlay?.(Error('decode failed'));},
      pause(){this.pauses++;this.paused=true;},load(){this.loads++;},removeAttribute(name){if(name==='src')this.removed++;},
    };
    players.push(audio);return audio;
  };
  const originalAudio=Object.getOwnPropertyDescriptor(globalThis,'Audio'),originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  if(native){
    Object.defineProperty(globalThis,'Audio',{configurable:true,writable:true,value:function(url){return createAudio(url);}});
    Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:document});
  }
  const player=createSoundPlayer({events,assets,document,now:()=>time,
    ...(native?{}:{createAudio,...(factoryDefault?{}:{preload})}),
    store:{get:()=>structuredClone(settings),subscribe(callback){listeners.add(callback);return()=>listeners.delete(callback);}},
    setTimer(callback,ms){timers.set(++timerId,{callback,at:time+ms});return timerId;},clearTimer(id){timers.delete(id);},
  });
  t.after(()=>{
    player.destroy();
    if(native){
      if(originalAudio)Object.defineProperty(globalThis,'Audio',originalAudio);else delete globalThis.Audio;
      if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else delete globalThis.document;
    }
  });
  return {player,players,timers,settings,listeners,visibility,document,
    change(){for(const callback of listeners)callback();},
    hide(hidden){document.hidden=hidden;for(const callback of visibility)callback();},
    advance(ms){const end=time+ms;while(true){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;timers.delete(next[0]);time=next[1].at;next[1].callback();}time=end;},
  };
}

test('the native default preloads all 17 built-in effects without playing or loading BGM',t=>{
  const f=fixture(t,{native:true,events:SOUND_EVENTS,assets:SOUND_ASSETS});
  assert.equal(f.players.length,17);
  assert.equal(new Set(f.players.map(audio=>audio.url)).size,17);
  assert.equal(f.players.some(audio=>audio.url.includes('garden-piano')),false);
  assert.equal(f.players.some(audio=>audio.url.endsWith('/record-stop.mp3')),true,'Disabled defaults are available for later GM use');
  for(const audio of f.players){assert.equal(audio.preload,'auto');assert.equal(audio.loads,1);assert.equal(audio.plays,0);assert.equal(audio.paused,true);}
  assert.equal(f.timers.size,0);assert.equal(f.player.status().id,null);
});

test('the pool is bounded by unique built-in SFX URLs and excludes data, blob, unused, and BGM assets',t=>{
  const extraAssets=[{id:'data',url:'data:audio/mpeg;base64,AAAA'},{id:'blob',url:'blob:audio'},{id:'music',kind:'bgm',url:'other-music.mp3'}];
  const f=fixture(t,{assets:[...sampleAssets,...extraAssets],events:[...sampleEvents,...extraAssets.map(asset=>({...sampleEvents[0],id:asset.id,assetId:asset.id}))]});
  assert.deepEqual(f.players.map(audio=>audio.url),['tick.mp3','chime.mp3']);
  assert.equal(f.players.reduce((sum,audio)=>sum+audio.plays,0),0);
});

test('injected factories remain lazy and disposable unless preloading is explicitly enabled',async t=>{
  const f=fixture(t,{factoryDefault:true});assert.equal(f.players.length,0);
  const result=f.player.play('tap'),audio=f.players[0];await flush();audio.end();
  assert.equal(await result,true);assert.equal(audio.removed,1);assert.equal(audio.loads,1);
});

test('settled cues reuse the same preloaded element and reset it without clearing its source',async t=>{
  const f=fixture(t),audio=f.players[0];
  const first=f.player.play('tap'),stalePlaying=audio.onplaying,staleEnded=audio.onended;await flush();audio.end();
  assert.equal(await first,true);assert.equal(audio.paused,true);assert.equal(audio.currentTime,0);assert.equal(audio.removed,0);assert.equal(audio.loads,1);
  for(let i=0;i<25;i++){
    const next=f.player.play('alias');await flush();
    const count=f.timers.size;stalePlaying();staleEnded();
    assert.equal(audio.paused,false);assert.equal(f.player.status().id,'alias');assert.equal(f.timers.size,count);
    assert.equal(audio.volume,.48);audio.end();assert.equal(await next,true);
  }
  assert.equal(f.players.length,2);assert.equal(audio.plays,26);assert.equal(audio.loads,1);assert.equal(audio.removed,0);assert.equal(f.timers.size,0);
});

test('stopping at the media origin avoids a seek while completed audio still rewinds for reuse',async t=>{
  const f=fixture(t),audio=f.players[0];let playhead=0,seeks=0;
  audio.readyState=4;
  Object.defineProperty(audio,'currentTime',{get:()=>playhead,set(value){seeks++;playhead=value;audio.readyState=1;}});
  // Native playback may be running before its reported media clock moves off 0.
  audio.start=function(){this.paused=false;this.onplaying?.();};
  const first=f.player.play('tap');await flush();f.player.stop();
  assert.equal(await first,false);assert.equal(seeks,0);assert.equal(audio.readyState,4);assert.equal(audio.paused,true);
  const next=f.player.play('alias');await flush();
  assert.equal(audio.plays,2);assert.equal(f.players.length,2);assert.equal(audio.readyState,4);assert.equal(audio.removed,0);
  playhead=.1;audio.end();assert.equal(await next,true);
  assert.equal(seeks,1);assert.equal(audio.currentTime,0);assert.equal(audio.paused,true);assert.equal(f.timers.size,0);
});

test('cancelled pending play promises and stale handlers cannot touch a replacement cue',async t=>{
  for(const outcome of ['resolve','reject'])for(const started of [false,true]){
    const f=fixture(t,{deferred:true}),old=f.players[0],first=f.player.play('tap');
    const stalePlaying=old.onplaying,staleEnded=old.onended,staleError=old.onerror;
    if(started)old.start();
    f.player.stop();assert.equal(await first,false);assert.equal(old.removed,1);assert.equal(old.paused,true);
    const next=f.player.play('alias'),fresh=f.players.at(-1);assert.notEqual(fresh,old);assert.equal(f.players.length,3);
    fresh.start();fresh.resolvePlay();await flush();const count=f.timers.size;
    old.start();stalePlaying();staleEnded();staleError();old[outcome==='resolve'?'resolvePlay':'rejectPlay']();await flush();
    assert.equal(old.paused,true);assert.equal(fresh.paused,false);assert.equal(f.player.status().id,'alias');assert.equal(f.timers.size,count);
    fresh.end();assert.equal(await next,true);assert.equal(fresh.removed,0);assert.equal(f.timers.size,0);
  }
});

test('the 1200 ms startup deadline evicts a pending pooled player without replaying it later',async t=>{
  const f=fixture(t,{deferred:true}),old=f.players[0],result=f.player.play('tap');
  f.advance(1199);assert.equal(f.player.status().id,'tap');f.advance(1);
  assert.equal(await result,false);assert.equal(old.removed,1);
  old.start();old.resolvePlay();await flush();assert.equal(old.paused,true);assert.equal(f.player.status().id,null);assert.equal(f.timers.size,0);
});

test('preloaded effects remain silent during speech, microphone, hidden, and suspended states',async t=>{
  for(const flag of ['speech','recording','hidden','suspended']){
    const f=fixture(t),first=f.player.play('tap'),audio=f.players[0];await flush();
    f.player.setState({[flag]:true});assert.equal(await first,false);assert.equal(audio.paused,true);assert.equal(audio.currentTime,0);assert.equal(audio.removed,0);
    assert.equal(await f.player.play('reward'),false);
    if(flag!=='suspended')assert.equal(await f.player.play('reward',{preview:true}),false);
    f.player.setState({[flag]:false});f.advance(3000);
    assert.equal(f.players.length,2);assert.equal(f.players.reduce((sum,item)=>sum+item.plays,0),1);assert.equal(f.timers.size,0);
  }
  const f=fixture(t);f.hide(true);assert.equal(await f.player.play('tap',{preview:true}),false);f.hide(false);
  assert.equal(f.players.every(audio=>audio.plays===0),true);
});

test('BGM and uploaded replacements stay disposable and never expand the warm pool',async t=>{
  const f=fixture(t);f.settings.customAssets.upload={id:'upload',url:'data:audio/mpeg;base64,AAAA'};f.settings.events.tap.assetId='upload';f.change();
  for(const id of ['tap','bgm']){
    const before=f.players.length,result=f.player.play(id,{preview:true}),audio=f.players.at(-1);await flush();
    assert.equal(f.players.length,before+1);assert.match(audio.url,id==='tap'?/^data:/:/^piano/);
    audio.end();assert.equal(await result,true);assert.equal(audio.removed,1);assert.equal(audio.loads,1);
  }
  assert.equal(f.players[0].plays,0);assert.equal(f.players[1].plays,0);
});

test('media errors evict a cached element so the next cue can retry with a fresh one',async t=>{
  const f=fixture(t),bad=f.players[0],first=f.player.play('tap');await flush();bad.fail();
  assert.equal(await first,false);assert.equal(bad.removed,1);
  const second=f.player.play('tap'),fresh=f.players.at(-1);assert.notEqual(fresh,bad);await flush();fresh.end();assert.equal(await second,true);assert.equal(fresh.removed,0);
});

test('autoplay rejection and synchronous play failures release the pool entry and permit a fresh retry',async t=>{
  for(const failure of ['reject','throw']){
    const f=fixture(t),bad=f.players[0];bad.playFailure=failure;
    assert.equal(await f.player.play('tap'),false);assert.equal(bad.removed,1);assert.equal(f.timers.size,0);
    const result=f.player.play('tap'),fresh=f.players.at(-1);assert.notEqual(fresh,bad);await flush();fresh.end();assert.equal(await result,true);
  }
});

test('disabled or zero-volume cues do not play or allocate beyond the already warm set',async t=>{
  const f=fixture(t);f.settings.events.tap.enabled=false;
  assert.equal(await f.player.play('tap'),false);
  assert.equal(await f.player.play('tap',{preview:true,volume:0}),false);
  f.settings.events.tap.enabled=true;f.settings.volume=0;
  assert.equal(await f.player.play('tap'),false);
  assert.equal(f.players.length,2);assert.equal(f.players.every(audio=>audio.plays===0),true);assert.equal(f.timers.size,0);
});

test('buffering recovery does not restart the duration limit or leave a timer after completion',async t=>{
  const f=fixture(t),audio=f.players[0],result=f.player.play('tap');await flush();
  f.advance(1000);audio.start();assert.equal(f.timers.size,1);
  f.advance(999);assert.equal(f.player.status().playing,true);f.advance(1);
  assert.equal(await result,true);assert.equal(audio.paused,true);assert.equal(f.timers.size,0);
  f.player.destroy();assert.equal(f.timers.size,0);
});

test('destroy releases every pooled source, cancels pending media, removes listeners, and prevents future allocation',async t=>{
  const f=fixture(t,{deferred:true}),result=f.player.play('tap'),old=f.players[0];f.player.destroy();
  assert.equal(await result,false);
  for(const audio of f.players){assert.equal(audio.paused,true);assert.equal(audio.removed,1);assert.equal(audio.loads,2);}
  assert.equal(f.listeners.size,0);assert.equal(f.visibility.size,0);assert.equal(f.timers.size,0);
  assert.equal(await f.player.play('tap',{preview:true}),false);assert.equal(f.players.length,2);
  old.start();old.resolvePlay();await flush();assert.equal(old.paused,true);
  f.player.destroy();assert.equal(f.players.every(audio=>audio.removed===1),true);
});
