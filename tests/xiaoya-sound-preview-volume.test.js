import test from 'node:test';
import assert from 'node:assert/strict';
import {createSoundPlayer} from '../xiaoya/sound-player.js';
import {gardenMusicGain} from '../xiaoya/garden-music.js';

function fixture(t) {
  const events=[
    {id:'bgm',kind:'bgm',assetId:'piano',volume:1,priority:0,cooldownMs:0},
    {id:'tap',kind:'sfx',assetId:'tick',volume:.5,priority:1,cooldownMs:0},
  ];
  const settings={enabled:true,volume:.6,customAssets:{},events:Object.fromEntries(events.map(event=>[event.id,{assetId:event.assetId,enabled:true,volume:event.volume}]))};
  const players=[],timers=new Map();let timerId=0;
  const player=createSoundPlayer({events,assets:[{id:'piano',url:'piano.mp3'},{id:'tick',url:'tick.mp3'}],
    store:{get:()=>structuredClone(settings),subscribe:()=>()=>{}},document:{hidden:false},
    setTimer(callback){timers.set(++timerId,callback);return timerId;},clearTimer:id=>timers.delete(id),
    createAudio(url){
      const audio={url,paused:true,play(){this.paused=false;this.onplaying?.();return Promise.resolve();},
        pause(){this.paused=true;},end(){this.onended?.();},removeAttribute(){},load(){}};
      players.push(audio);return audio;
    }});
  t.after(()=>player.destroy());
  return {player,players,timers,settings};
}

test('BGM previews use the scene gain while disabled gameplay bindings stay disabled',async t=>{
  const f=fixture(t);f.settings.events.bgm.enabled=false;f.player.setState({suspended:true});
  for(const eventVolume of [1,.55]){
    f.settings.events.bgm.volume=eventVolume;
    const entry=f.player.resolve('bgm'),volume=gardenMusicGain(.5*entry.eventVolume);
    const preview=f.player.play('bgm',{preview:true,volume}),audio=f.players.at(-1);
    assert.equal(audio.volume,volume);
    assert.equal(f.player.resolve('bgm').enabled,false);
    assert.equal(f.settings.events.bgm.volume,eventVolume);
    audio.end();assert.equal(await preview,true);
  }
  assert.equal(f.timers.size,0);
});

test('a zero preview gain allocates no audio or timers even when the usage point has volume',async t=>{
  const f=fixture(t),entry=f.player.resolve('bgm');
  assert.equal(entry.volume,1);
  assert.equal(await f.player.play('bgm',{preview:true,volume:gardenMusicGain(0*entry.eventVolume)}),false);
  assert.equal(f.players.length,0);assert.equal(f.timers.size,0);assert.equal(f.player.status().id,null);
});

test('ordinary effects ignore preview-only volume overrides',async t=>{
  const f=fixture(t);
  for(const volume of [0,1]){
    const result=f.player.play('tap',{volume}),audio=f.players.at(-1);
    assert.equal(audio.volume,.3);audio.end();assert.equal(await result,true);
  }
});

test('preview gains are clamped and invalid overrides retain configured volume',async t=>{
  const f=fixture(t);
  assert.equal(await f.player.play('tap',{preview:true,volume:-1}),false);assert.equal(f.players.length,0);
  for(const [volume,expected] of [[2,1],[NaN,.3],[Infinity,.3],[undefined,.3]]){
    const result=f.player.play('tap',{preview:true,volume}),audio=f.players.at(-1);
    assert.equal(audio.volume,expected);audio.end();assert.equal(await result,true);
  }
});
