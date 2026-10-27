import test from 'node:test';
import assert from 'node:assert/strict';
import {createGardenMusic, gardenMusicSettings, gardenMusicGain} from '../xiaoya/garden-music.js';

const flush = async () => { for (let i=0;i<4;i++) await Promise.resolve(); };
function fixture({reject=false,wait=false}={}) {
  let time=0,id=0,created=0,resolvePlay;
  const timers=new Map(),volumes=[];
  const player={paused:true,plays:0,pauses:0,currentTime:12,_volume:1,
    set volume(v){this._volume=v;volumes.push(v);},get volume(){return this._volume;},
    play(){this.plays++;if(reject){reject=false;return Promise.reject(new Error('NotAllowedError'));}
      this.paused=false;return wait?new Promise(resolve=>{resolvePlay=resolve;}):Promise.resolve();},
    pause(){this.pauses++;this.paused=true;}};
  const music=createGardenMusic({createAudio(){created++;return player;},now:()=>time,
    setTimer(fn,ms){timers.set(++id,{fn,at:time+ms});return id;},clearTimer(id){timers.delete(id);}});
  return {music,player,volumes,get created(){return created;},resolve:()=>resolvePlay?.(),
    advance(ms){const end=time+ms;while(true){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;timers.delete(next[0]);time=next[1].at;next[1].fn();}time=end;}};
}
test('garden track is lazy, maps default 50% to a softer gain, and rerenders do not restart it',async()=>{
  const f=fixture();f.music.setState({active:false});assert.equal(f.created,0);
  f.music.setState({active:true});await flush();f.advance(640);
  assert.equal(f.player.volume,.25);assert.equal(f.player.loop,true);
  for(let i=0;i<8;i++)f.music.setState({active:true});
  assert.equal(f.created,1);assert.equal(f.player.plays,1);assert.equal(f.player.currentTime,12);
  assert.ok(f.volumes.every(v=>v>=0&&v<=.25));
});
test('narration ducks music and interruption/restoration cancels outdated fades',async()=>{
  const f=fixture();f.music.setState({active:true});await flush();f.advance(640);
  f.music.setState({active:true,ducked:true});f.advance(128);assert.equal(f.player.volume,.06);
  f.music.setState({active:true});f.advance(80);assert.ok(f.player.volume>.06);
  f.music.setState({active:true,ducked:true});f.advance(640);assert.equal(f.player.volume,.06);
  f.music.setState({active:true});f.advance(640);assert.equal(f.player.volume,.25);
});
test('exit fades then pauses; quick reentry preserves playback; background pauses immediately',async()=>{
  const f=fixture();f.music.setState({active:true});await flush();f.advance(640);
  f.music.setState({active:false});f.advance(160);assert.ok(f.player.volume>0&&f.player.volume<.25);
  f.music.setState({active:true});f.advance(640);assert.equal(f.player.volume,.25);assert.equal(f.player.plays,1);
  f.music.setState({active:false});f.advance(640);assert.equal(f.player.volume,0);assert.equal(f.player.paused,true);
  f.music.setState({active:true});await flush();f.advance(640);assert.equal(f.player.plays,2);
  f.music.setState({active:false,immediate:true});assert.equal(f.player.volume,0);assert.equal(f.player.paused,true);
  f.advance(500);assert.equal(f.player.volume,0);
});
test('autoplay rejection waits for a real retry and never creates overlapping players',async()=>{
  const f=fixture({reject:true});f.music.setState({active:true});await flush();f.advance(640);
  f.music.setState({active:true});assert.equal(f.player.plays,1);
  f.music.retry();await flush();assert.equal(f.player.plays,2);assert.equal(f.player.paused,false);assert.equal(f.created,1);
  f.music.setState({active:false,immediate:true});f.music.retry();assert.equal(f.player.plays,2);
});
test('late play completion cannot resurrect music after leaving the garden',async()=>{
  const f=fixture({wait:true});f.music.setState({active:true});f.advance(640);
  f.music.setState({active:false,immediate:true});f.resolve();await flush();
  assert.equal(f.player.paused,true);assert.equal(f.player.volume,0);
});

test('normal page exit takes a full smooth fade even when narration is ducking',async()=>{
  const f=fixture({wait:true});f.music.setState({active:true});
  assert.equal(f.player.volume,0);
  f.advance(300);assert.ok(f.player.volume>0&&f.player.volume<.25);
  f.advance(340);assert.equal(f.player.volume,.25);
  f.music.setState({active:true,ducked:true});f.advance(128);
  const before=f.player.volume;
  f.music.setState({active:false,ducked:true});
  assert.equal(f.player.volume,before);assert.equal(f.player.paused,false);
  f.advance(160);assert.ok(f.player.volume>0&&f.player.volume<before);
  f.advance(480);assert.equal(f.player.volume,0);assert.equal(f.player.paused,true);
  f.resolve();await flush();assert.equal(f.player.paused,true);
});

test('turning music off fades and a quick unmute continues from its current volume',async()=>{
  const f=fixture();f.music.setState({active:true});await flush();f.advance(640);
  f.music.setState({active:true,enabled:false});f.advance(200);
  const midway=f.player.volume;assert.ok(midway>0&&midway<.25);
  f.music.setState({active:true,enabled:true});assert.equal(f.player.volume,midway);
  f.advance(640);assert.equal(f.player.volume,.25);assert.equal(f.player.plays,1);
  f.music.setState({active:true,volume:0});f.advance(640);
  assert.equal(f.player.volume,0);assert.equal(f.player.paused,true);
});

test('music preferences default safely and clamp corrupt or older saved values',()=>{
  for(const value of [undefined,null,{}, {volume:'50'}, {volume:NaN}, {volume:Infinity}]) {
    assert.deepEqual(gardenMusicSettings(value),{enabled:true,volume:.5});
  }
  assert.deepEqual(gardenMusicSettings({enabled:false,volume:-1}),{enabled:false,volume:0});
  assert.deepEqual(gardenMusicSettings({volume:2}),{enabled:true,volume:1});
});
test('live volume changes use one player; narration never increases a quiet setting',async()=>{
  const f=fixture();f.music.setState({active:true,volume:1});await flush();f.advance(640);
  assert.equal(f.player.volume,1);assert.equal(f.music.status().playing,true);
  f.music.setState({active:true,volume:1,ducked:true});f.advance(128);assert.equal(f.player.volume,.12);
  f.music.setState({active:true,volume:.2});f.advance(640);assert.equal(f.player.volume,gardenMusicGain(.2));
  f.music.setState({active:true,volume:.2,ducked:true});f.advance(128);assert.equal(f.player.volume,gardenMusicGain(.2)*.24);
  f.music.setState({active:true,volume:.2});f.advance(640);assert.equal(f.player.volume,gardenMusicGain(.2));
  assert.equal(f.created,1);assert.equal(f.player.plays,1);assert.equal(f.player.currentTime,12);
});
test('off and zero volume pause and suppress retries; re-enabling restores chosen volume',async()=>{
  const f=fixture();f.music.setState({active:true,enabled:false});f.music.retry();assert.equal(f.created,0);
  f.music.setState({active:true,volume:.3});await flush();f.advance(640);
  f.music.setState({active:true,volume:0,immediate:true});f.music.retry();
  assert.equal(f.player.paused,true);assert.equal(f.player.plays,1);
  f.music.setState({active:true,enabled:false,volume:.3,immediate:true});f.music.retry();assert.equal(f.player.plays,1);
  f.music.setState({active:true,volume:.3,immediate:true});await flush();
  assert.equal(f.player.volume,.09);assert.equal(f.player.paused,false);assert.equal(f.player.plays,2);
});

test('low listening levels are distinct, monotonic, and substantially quieter than linear amplitude',()=>{
  assert.equal(gardenMusicGain(0),0);
  assert.equal(gardenMusicGain(.5),.25);
  assert.equal(gardenMusicGain(1),1);
  let previous=0;
  for(let percent=1;percent<=100;percent++){
    const gain=gardenMusicGain(percent/100);
    assert.ok(gain>previous&&gain<=1);previous=gain;
  }
  assert.ok(gardenMusicGain(.05)<=.002500000000001);
  assert.ok(gardenMusicGain(.05)/.05<=.050000000000001,'5% must be at least 26 dB quieter than the former linear setting');
  for(const input of [undefined,NaN,Infinity,'5'])assert.equal(gardenMusicGain(input),.25);
  assert.equal(gardenMusicGain(-3),0);assert.equal(gardenMusicGain(3),1);
});

test('changing low volume during duck restores the latest setting, with no stale louder fade',async()=>{
  const f=fixture();f.music.setState({active:true,volume:.5});await flush();f.advance(640);
  f.music.setState({active:true,ducked:true,volume:.5});f.advance(48);
  f.music.setState({active:true,ducked:true,volume:.05});f.advance(128);
  assert.equal(f.player.volume,gardenMusicGain(.05)*.24);
  f.music.setState({active:true,volume:.05});f.advance(640);
  assert.equal(f.player.volume,gardenMusicGain(.05));
  f.music.setState({active:true,volume:0,immediate:true});f.advance(500);
  assert.equal(f.player.volume,0);assert.equal(f.player.paused,true);
  assert.equal(f.created,1);
});
