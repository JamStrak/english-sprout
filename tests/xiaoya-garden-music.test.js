import test from 'node:test';
import assert from 'node:assert/strict';
import {createGardenMusic} from '../xiaoya/garden-music.js';

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
test('garden track is lazy, loops at 50%, and repeated renders do not restart it',async()=>{
  const f=fixture();f.music.setState({active:false});assert.equal(f.created,0);
  f.music.setState({active:true});await flush();f.advance(320);
  assert.equal(f.player.volume,.5);assert.equal(f.player.loop,true);
  for(let i=0;i<8;i++)f.music.setState({active:true});
  assert.equal(f.created,1);assert.equal(f.player.plays,1);assert.equal(f.player.currentTime,12);
  assert.ok(f.volumes.every(v=>v>=0&&v<=.5));
});
test('narration ducks music and interruption/restoration cancels outdated fades',async()=>{
  const f=fixture();f.music.setState({active:true});await flush();f.advance(320);
  f.music.setState({active:true,ducked:true});f.advance(128);assert.equal(f.player.volume,.12);
  f.music.setState({active:true});f.advance(80);assert.ok(f.player.volume>.12);
  f.music.setState({active:true,ducked:true});f.advance(320);assert.equal(f.player.volume,.12);
  f.music.setState({active:true});f.advance(320);assert.equal(f.player.volume,.5);
});
test('exit fades then pauses; quick reentry preserves playback; background pauses immediately',async()=>{
  const f=fixture();f.music.setState({active:true});await flush();f.advance(320);
  f.music.setState({active:false});f.advance(160);assert.ok(f.player.volume>0&&f.player.volume<.5);
  f.music.setState({active:true});f.advance(320);assert.equal(f.player.volume,.5);assert.equal(f.player.plays,1);
  f.music.setState({active:false});f.advance(320);assert.equal(f.player.volume,0);assert.equal(f.player.paused,true);
  f.music.setState({active:true});await flush();f.advance(320);assert.equal(f.player.plays,2);
  f.music.setState({active:false,immediate:true});assert.equal(f.player.volume,0);assert.equal(f.player.paused,true);
  f.advance(500);assert.equal(f.player.volume,0);
});
test('autoplay rejection waits for a real retry and never creates overlapping players',async()=>{
  const f=fixture({reject:true});f.music.setState({active:true});await flush();f.advance(320);
  f.music.setState({active:true});assert.equal(f.player.plays,1);
  f.music.retry();await flush();assert.equal(f.player.plays,2);assert.equal(f.player.paused,false);assert.equal(f.created,1);
  f.music.setState({active:false,immediate:true});f.music.retry();assert.equal(f.player.plays,2);
});
test('late play completion cannot resurrect music after leaving the garden',async()=>{
  const f=fixture({wait:true});f.music.setState({active:true});f.advance(320);
  f.music.setState({active:false,immediate:true});f.resolve();await flush();
  assert.equal(f.player.paused,true);assert.equal(f.player.volume,0);
});
