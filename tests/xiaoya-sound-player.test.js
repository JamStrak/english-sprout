import test from 'node:test';
import assert from 'node:assert/strict';
import {createSoundPlayer} from '../xiaoya/sound-player.js';

const flush = async () => { for (let i=0;i<5;i++) await Promise.resolve(); };
function fixture({deferred=false,reject=false,createFailure=false}={}) {
  let time=0,timerId=0;
  const timers=new Map(),listeners=new Set(),visibility=new Set(),players=[];
  const events=[
    {id:'tap',assetId:'tick',volume:.5,priority:1,cooldownMs:120,kind:'sfx'},
    {id:'reward',assetId:'chime',volume:.8,priority:3,cooldownMs:120,kind:'sfx'},
    {id:'bgm',assetId:'piano',volume:1,priority:0,cooldownMs:0,kind:'bgm'},
  ];
  const assets=['tick','chime','piano'].map(id=>({id,url:`${id}.mp3`}));
  const settings={enabled:true,volume:.6,events:Object.fromEntries(events.map(event=>[event.id,{assetId:event.assetId,enabled:true,volume:event.volume}])),customAssets:{}};
  const store={get:()=>structuredClone(settings),subscribe(callback){listeners.add(callback);return()=>listeners.delete(callback);}};
  const document={hidden:false,addEventListener(name,callback){if(name==='visibilitychange')visibility.add(callback);},removeEventListener(name,callback){visibility.delete(callback);}};
  const player=createSoundPlayer({store,events,assets,document,now:()=>time,
    setTimer(callback,ms){timers.set(++timerId,{callback,at:time+ms});return timerId;},clearTimer(id){timers.delete(id);},
    createAudio(url){
      if(createFailure)throw Error('Audio unavailable');
      let resolvePlay,rejectPlay;
      const audio={url,paused:true,pauses:0,plays:0,cleared:false,loaded:false,
        play(){this.plays++;if(reject)return Promise.reject(Error('NotAllowedError'));if(deferred)return new Promise((resolve,reject)=>{resolvePlay=resolve;rejectPlay=reject;});this.start();return Promise.resolve();},
        start(){this.paused=false;this.onplaying?.();},
        end(){this.paused=true;this.onended?.();},
        fail(){this.onerror?.();},
        finishLoading(){this.start();resolvePlay?.();},
        rejectLoading(){rejectPlay?.(Error('Decode error'));},
        pause(){this.pauses++;this.paused=true;},removeAttribute(name){if(name==='src')this.cleared=true;},load(){this.loaded=true;},
      };
      players.push(audio);return audio;
    }});
  return {player,players,settings,timers,listeners,visibility,
    change(patch){Object.assign(settings,patch);for(const callback of listeners)callback();},
    hide(hidden){document.hidden=hidden;for(const callback of visibility)callback();},
    advance(ms){const end=time+ms;while(true){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;timers.delete(next[0]);time=next[1].at;next[1].callback();}time=end;},
  };
}

test('feedback is lazy, resolves the saved binding and volume, and releases media after a real end',async()=>{
  const f=fixture();assert.equal(f.players.length,0);
  f.settings.events.tap.assetId='chime';f.settings.events.tap.volume=.25;
  const result=f.player.play('tap'),audio=f.players[0];
  assert.equal(audio.url,'chime.mp3');assert.equal(audio.volume,.15);assert.equal(audio.loop,false);
  assert.equal(f.player.status().id,'tap');assert.equal(f.player.status().playing,true);
  audio.end();assert.equal(await result,true);assert.equal(f.player.status().id,null);
  assert.equal(audio.paused,true);assert.equal(audio.cleared,true);assert.equal(audio.loaded,true);assert.equal(f.timers.size,0);
});

test('disabled, deleted, silent, unknown, and automatic BGM cues allocate no media',async()=>{
  const f=fixture();
  for(const id of ['missing','bgm'])assert.equal(await f.player.play(id),false);
  f.settings.events.tap.enabled=false;assert.equal(await f.player.play('tap'),false);
  f.settings.events.tap.enabled=true;f.settings.events.tap.assetId=null;assert.equal(await f.player.play('tap'),false);
  f.settings.events.tap.assetId='tick';f.settings.events.tap.volume=0;assert.equal(await f.player.play('tap'),false);
  f.settings.events.tap.volume=.5;f.settings.enabled=false;assert.equal(await f.player.play('tap'),false);
  f.settings.enabled=true;f.settings.volume=0;assert.equal(await f.player.play('tap'),false);
  assert.equal(f.players.length,0);
});

test('BGM bindings remain independent from the effect master switch and volume',()=>{
  const f=fixture();f.settings.enabled=false;f.settings.volume=0;f.settings.events.bgm.volume=.35;
  const music=f.player.resolve('bgm'),effect=f.player.resolve('tap');
  assert.equal(music.enabled,true);assert.equal(music.volume,.35);assert.equal(music.eventVolume,.35);
  assert.equal(effect.enabled,false);assert.equal(effect.volume,0);
  f.settings.events.bgm.enabled=false;assert.equal(f.player.resolve('bgm').enabled,false);
  f.settings.events.bgm.enabled=true;f.settings.events.bgm.assetId=null;assert.equal(f.player.resolve('bgm').enabled,false);
  assert.equal(f.players.length,0);
});

test('speech, microphone, hidden document, suspended gameplay and mute cancel current cues without deferred replay',async()=>{
  for(const flag of ['speech','recording','hidden','suspended','muted']){
    const f=fixture(),result=f.player.play('reward'),audio=f.players[0];
    f.player.setState({[flag]:true});assert.equal(await result,false);assert.equal(audio.paused,true);
    assert.equal(await f.player.play('tap'),false);assert.equal(f.players.length,1);
    f.player.setState({[flag]:false});f.advance(2000);assert.equal(f.players.length,1,'Unmuting must not replay an old cue');
    f.player.destroy();
  }
  const f=fixture(),result=f.player.play('tap');f.hide(true);
  assert.equal(await result,false);assert.equal(await f.player.play('reward',{preview:true}),false);
  f.hide(false);assert.equal(f.player.status().hidden,false);assert.equal(f.players.length,1);
});

test('an explicit GM preview works while gameplay is suspended but never over speech, recording or mute',async()=>{
  const f=fixture();f.player.setState({suspended:true});f.settings.events.tap.enabled=false;
  const preview=f.player.play('tap',{preview:true});assert.equal(f.player.status().preview,true);f.players[0].end();assert.equal(await preview,true);
  for(const flag of ['speech','recording','hidden','muted']){
    f.player.setState({[flag]:true});assert.equal(await f.player.play('tap',{preview:true}),false);f.player.setState({[flag]:false});
  }
  assert.equal(f.players.length,1);
});

test('mute stops a pending preview, preserves tuning, and never revives its late playback',async()=>{
  const f=fixture({deferred:true});
  f.settings.events.tap.volume=.25;
  const saved=structuredClone(f.settings),binding=f.player.resolve('tap');
  const result=f.player.play('tap',{preview:true}),audio=f.players[0],stalePlaying=audio.onplaying;
  f.player.setState({muted:true});
  assert.equal(await result,false);assert.equal(f.player.status().muted,true);
  assert.equal(f.player.status().playing,false);assert.equal(audio.paused,true);
  assert.equal(await f.player.play('tap',{preview:true}),false);
  assert.equal(await f.player.play('bgm',{preview:true}),false);
  assert.deepEqual(f.player.resolve('tap'),binding);assert.deepEqual(f.settings,saved);
  audio.finishLoading();stalePlaying();await flush();
  assert.equal(audio.paused,true);assert.equal(f.timers.size,0);
  f.player.setState({muted:false});f.advance(2000);
  assert.equal(f.players.length,1,'Unmuting must not replay the stopped preview');
  const next=f.player.play('tap',{preview:true});
  assert.equal(f.players.length,2);assert.equal(f.players[1].volume,.15);
  f.players[1].finishLoading();f.players[1].end();assert.equal(await next,true);
});

test('rapid clicks are dropped and low priority feedback cannot interrupt a reward',async()=>{
  const f=fixture(),first=f.player.play('tap');
  assert.equal(await f.player.play('tap'),false);assert.equal(f.players.length,1);
  const reward=f.player.play('reward');assert.equal(await first,false);assert.equal(f.players[0].paused,true);
  f.advance(150);assert.equal(await f.player.play('tap'),false);assert.equal(f.players.length,2);
  f.players[1].end();assert.equal(await reward,true);
  const next=f.player.play('tap');assert.equal(f.players.length,3);f.players[2].end();assert.equal(await next,true);
});

test('a cold browser decoder may start an ordinary cue after 650 milliseconds',async()=>{
  const f=fixture({deferred:true}),result=f.player.play('tap'),audio=f.players[0];
  f.advance(650);assert.equal(f.player.status().id,'tap');assert.equal(audio.paused,true);
  audio.finishLoading();await flush();assert.equal(audio.paused,false);assert.equal(f.player.status().playing,true);
  audio.end();assert.equal(await result,true);assert.equal(f.timers.size,0);
});

test('an ordinary cue expires after 1200 milliseconds and a late play promise cannot resurrect it',async()=>{
  const f=fixture({deferred:true}),result=f.player.play('tap'),audio=f.players[0],stalePlaying=audio.onplaying;
  f.advance(1199);assert.equal(f.player.status().id,'tap');f.advance(1);
  assert.equal(await result,false);assert.equal(f.player.status().id,null);assert.equal(audio.paused,true);
  audio.finishLoading();stalePlaying();await flush();assert.equal(audio.paused,true);assert.equal(f.timers.size,0);
});

test('stop also cancels a pending preview, and late play resolution stays paused',async()=>{
  const f=fixture({deferred:true}),result=f.player.play('tap',{preview:true}),audio=f.players[0];
  f.advance(1201);assert.equal(f.player.status().id,'tap','Preview may wait longer than an interaction cue');
  f.player.stop();assert.equal(await result,false);audio.finishLoading();await flush();
  assert.equal(audio.paused,true);assert.equal(f.player.status().playing,false);assert.equal(f.timers.size,0);
});

test('long user replacements cannot leave interaction feedback running indefinitely',async()=>{
  const f=fixture(),result=f.player.play('tap');f.advance(1999);assert.equal(f.player.status().playing,true);
  f.advance(1);assert.equal(await result,true);assert.equal(f.players[0].paused,true);
  const preview=f.player.play('bgm',{preview:true});f.advance(11999);assert.equal(f.player.status().playing,true);
  f.advance(1);assert.equal(await preview,true);assert.equal(f.players[1].paused,true);
});

test('autoplay rejection, media decode errors, and unavailable audio fail without unhandled errors',async()=>{
  for(const options of [{reject:true},{createFailure:true}]){
    const f=fixture(options);assert.equal(await f.player.play('tap'),false);await flush();
    assert.equal(f.player.status().playing,false);assert.equal(f.timers.size,0);
  }
  const f=fixture(),result=f.player.play('tap');f.players[0].fail();assert.equal(await result,false);assert.equal(f.timers.size,0);
});

test('changing a setting stops stale media and disposal unregisters storage and visibility listeners',async()=>{
  const f=fixture(),result=f.player.play('reward');f.change({enabled:false});
  assert.equal(await result,false);assert.equal(f.players[0].paused,true);assert.equal(await f.player.play('tap'),false);
  assert.equal(f.listeners.size,1);assert.equal(f.visibility.size,1);f.player.destroy();
  assert.equal(f.listeners.size,0);assert.equal(f.visibility.size,0);assert.equal(f.timers.size,0);
});
