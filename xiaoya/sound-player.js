import {SOUND_EVENTS,SOUND_ASSETS} from './sound-catalog.js';
import {soundSettings} from './sound-settings.js';

const nativeAudio=url=>new Audio(new URL(url,document.baseURI).href);

/** One cue at a time; keep only the finite built-in SFX set warm, never play to preload. */
export function createSoundPlayer({store=soundSettings,events=SOUND_EVENTS,assets=SOUND_ASSETS,
  createAudio=nativeAudio,preload=createAudio===nativeAudio&&typeof globalThis.Audio==='function'&&!!globalThis.document,
  now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout,document:doc=globalThis.document}={}) {
  const state={speech:false,recording:false,hidden:false,suspended:false,muted:false};
  const last=new Map(),pool=new Map();let current=null,destroyed=false;
  const poolURLs=new Set(preload?events.filter(event=>event.kind==='sfx').map(event=>assets.find(asset=>asset.id===event.assetId))
    .filter(asset=>asset&&asset.kind!=='bgm'&&typeof asset.url==='string'&&!/^(?:data|blob):/i.test(asset.url)).map(asset=>asset.url):[]);
  const pause=player=>{try{player.pause();}catch{}};
  function release(player){pause(player);try{player.removeAttribute?.('src');player.load?.();}catch{}}
  function warm(url){
    let player;
    try{player=createAudio(url);player.preload='auto';player.load?.();pool.set(url,player);return player;}
    catch{if(player)release(player);return null;}
  }
  for(const url of poolURLs)warm(url);
  function resolve(id){
    const event=events.find(item=>item.id===id),settings=store.get();if(!event)return null;
    const binding=settings.events[id]||event;
    const asset=assets.find(item=>item.id===binding.assetId)||settings.customAssets[binding.assetId];
    const music=event.kind==='bgm';
    return {event,asset,enabled:(music||settings.enabled)&&binding.enabled!==false&&!!asset,
      volume:Math.max(0,Math.min(1,(music?1:settings.volume)*binding.volume)),eventVolume:binding.volume};
  }
  const allowed=preview=>!destroyed&&!state.muted&&!state.hidden&&!doc?.hidden&&!state.speech&&!state.recording&&(!state.suspended||preview);
  function stop(){if(current)current.finish(false);}
  function play(id,{preview=false,volume:previewVolume}={}){
    const entry=resolve(id),volume=preview&&Number.isFinite(previewVolume)?Math.max(0,Math.min(1,previewVolume)):entry?.volume;
    if(!entry?.asset||(!preview&&!entry.enabled)||!volume||!allowed(preview))return Promise.resolve(false);
    const {event,asset}=entry;
    if(!preview&&event.kind==='bgm')return Promise.resolve(false);
    if(!preview&&now()-(last.get(id)??-Infinity)<event.cooldownMs)return Promise.resolve(false);
    if(!preview&&current&&!current.preview&&current.priority>event.priority)return Promise.resolve(false);
    stop();last.set(id,now());
    return new Promise(resolveResult=>{
      const pooled=poolURLs.has(asset.url)&&assets.includes(asset);
      let player;try{player=pooled?(pool.get(asset.url)||warm(asset.url)):createAudio(asset.url);}catch{return resolveResult(false);}
      if(!player)return resolveResult(false);
      let loadingTimer,limitTimer,finished=false,started=false,playSettled=false,retained=false;
      const cue={id,player,preview,priority:event.priority,finish(ok,reuse=true){
        if(finished)return;finished=true;clearTimer(loadingTimer);clearTimer(limitTimer);
        player.onended=player.onerror=player.onplaying=null;
        // An unresolved play() can still complete after pause(). Never lend that
        // element to another cue: late native events/promises must touch only it.
        retained=pooled&&playSettled&&reuse&&!destroyed;
        // Seeking to 0 when already there can discard the browser's ready buffer.
        if(retained){pause(player);try{if(player.currentTime!==0)player.currentTime=0;}catch{}}
        else{if(pool.get(asset.url)===player)pool.delete(asset.url);release(player);}
        if(current===cue)current=null;resolveResult(ok);
      }};
      current=cue;player.preload='auto';player.volume=volume;player.loop=false;
      player.onplaying=()=>{
        if(finished){if(!retained)pause(player);return;}
        if(current!==cue||!allowed(preview)){cue.finish(false);return;}
        if(started)return;
        started=true;clearTimer(loadingTimer);
        // Imported files may be long. UI feedback never turns into a second song.
        limitTimer=setTimer(()=>cue.finish(true),event.kind==='bgm'?12000:2000);
      };
      player.onended=()=>cue.finish(started);player.onerror=()=>cue.finish(false,false);
      // Native MP3 cold decoding can exceed 400ms even for a local 4KB file.
      // Allow one short startup window; speech/navigation still cancel it.
      loadingTimer=setTimer(()=>cue.finish(false),preview?5000:1200);
      const settled=ok=>{
        playSettled=true;
        if(finished){if(!retained)pause(player);return;}
        if(!ok)cue.finish(false,false);
      };
      try{Promise.resolve(player.play()).then(()=>settled(true),()=>settled(false));}catch{cue.finish(false,false);}
    });
  }
  function setState(change){Object.assign(state,change);if(current&&!allowed(current.preview))stop();}
  const visibility=()=>setState({hidden:!!doc?.hidden});
  doc?.addEventListener?.('visibilitychange',visibility);
  const unsubscribe=store.subscribe(()=>stop());
  return Object.freeze({play,stop,resolve,setState,status:()=>({...state,id:current?.id||null,playing:!!current&&!current.player.paused,preview:!!current?.preview}),
    destroy(){if(destroyed)return;destroyed=true;stop();for(const player of pool.values())release(player);pool.clear();unsubscribe();doc?.removeEventListener?.('visibilitychange',visibility);}});
}
export const soundPlayer=createSoundPlayer();
