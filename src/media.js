const MAX_WARM_AUDIO=6;
const warmAudio=new Map();
let player=null,playback=null;
const audioURL=file=>new URL(file,document.baseURI).href;
const canWarm=url=>/^https?:/.test(url);

function releaseAudio(audio){
  audio.pause();
  audio.removeAttribute('src');
  // Discard only evicted buffers. Pausing ordinary playback keeps its warm data.
  audio.load();
}
function trimWarmAudio(){
  while(warmAudio.size>MAX_WARM_AUDIO){
    const unused=[...warmAudio].find(([,entry])=>entry.audio!==player);
    if(!unused)break;
    warmAudio.delete(unused[0]);releaseAudio(unused[1].audio);
  }
}
function audioEntry(url){
  let entry=warmAudio.get(url);
  if(entry){warmAudio.delete(url);warmAudio.set(url,entry);return entry;}
  const audio=new Audio();
  audio.preload='auto';audio.src=url;
  entry={audio,url,warmed:false};
  if(canWarm(url)){
    warmAudio.set(url,entry);
    audio.addEventListener('error',()=>{if(warmAudio.get(url)===entry)warmAudio.delete(url);});
    trimWarmAudio();
  }
  return entry;
}
export function preloadAudio(files){
  // Keep this small: a browser may ignore preload, but a user tap must still play.
  const urls=[...new Set(files.map(audioURL).filter(canWarm))].slice(0,MAX_WARM_AUDIO);
  for(const url of urls){
    const entry=audioEntry(url);
    if(entry.warmed||entry.audio===player)continue;
    entry.warmed=true;
    try{entry.audio.load();}catch{if(warmAudio.get(url)===entry)warmAudio.delete(url);}
  }
}
const playbackRate=value=>typeof value==='number'&&Number.isFinite(value)?Math.max(.5,Math.min(1.5,value)):value===true?.8:1;
export function isAudioLoading(file,slow=false){
  return !!(playback&&playback.url===audioURL(file)&&playback.rate===playbackRate(slow)&&(playback.pending||playback.status==='loading'));
}
export function setPlaybackRate(rate,file){
  // Change the current stream in place: no seek, play(), load(), or new request.
  if(!playback||!file||playback.url!==audioURL(file)||!['loading','playing'].includes(playback.status)||typeof rate!=='number'||!Number.isFinite(rate))return false;
  try{
    playback.audio.preservesPitch=true;
    playback.audio.playbackRate=playbackRate(rate);
    playback.rate=playback.audio.playbackRate;
    return true;
  }catch{return false;}
}
export function stopAudio(){
  const previous=playback;
  playback=null;player=null;
  if(previous){previous.cleanup();previous.audio.pause();}
  if('speechSynthesis' in window)window.speechSynthesis.cancel();
}
export async function playFile(file,slow=false,onState=()=>{}){
  if(isAudioLoading(file,slow)){
    playback.observers.add(onState);onState('loading');
    return playback.promise;
  }
  stopAudio();
  const entry=audioEntry(audioURL(file)),audio=entry.audio;
  const current={audio,url:entry.url,rate:playbackRate(slow),status:'loading',pending:true,observers:new Set([onState]),cleanup:()=>{},promise:null};
  player=audio;playback=current;entry.warmed=true;
  audio.playbackRate=current.rate;audio.preservesPitch=true;
  try{audio.currentTime=0;}catch{} // Metadata may not exist yet on a cold request.
  const notify=state=>{current.status=state;for(const observer of current.observers)observer(state);};
  const onEvent=event=>{
    if(playback!==current)return;
    // Media events are queued tasks. An old pause/end can arrive after a warmed
    // element has already restarted, so check its present state as well.
    if(event.type==='pause'&&!audio.paused)return;
    if(event.type==='ended'&&audio.ended===false)return;
    if(event.type==='playing'&&audio.paused)return;
    const state=event.type==='playing'?'playing':event.type==='waiting'?'loading':event.type==='error'?'error':'idle';
    if(state==='idle'||state==='error')current.pending=false;
    notify(state);
  };
  const events=['playing','waiting','ended','pause','error'];
  for(const event of events)audio.addEventListener(event,onEvent);
  current.cleanup=()=>{for(const event of events)audio.removeEventListener(event,onEvent);};
  onState('loading');
  current.promise=(async()=>{
    try{await audio.play();if(playback!==current)return;current.pending=false;return audio;}
    catch(error){
      if(playback!==current)return;
      if(warmAudio.get(entry.url)===entry)warmAudio.delete(entry.url);
      current.pending=false;if(current.status!=='error')notify('error');
      current.cleanup();playback=null;player=null;
      throw error;
    }
  })();
  return current.promise;
}
let activeRecording=null,clipURL=null,recordGeneration=0;
export function recordingSupported(){return !!(window.isSecureContext&&navigator.mediaDevices?.getUserMedia&&window.MediaRecorder);}

function releaseTracks(current){
  if(current.tracksReleased)return;
  current.tracksReleased=true;
  current.stream.getTracks().forEach(track=>track.stop());
}
function disposeRecording(current){
  current.closed=true;
  clearTimeout(current.timer);
  if(activeRecording===current)activeRecording=null;
  const recorder=current.recorder;
  if(recorder){
    recorder.ondataavailable=null;recorder.onstop=null;recorder.onerror=null;
    if(recorder.state!=='inactive'){try{recorder.stop();}catch{}}
  }
  releaseTracks(current);
  current.chunks=[];
}
export async function startRecording(onEnd){
  if(!recordingSupported())throw new Error('请在手机浏览器的 HTTPS 网页中打开，才能录音。仍可以直接开口练习。');
  stopAudio();clearRecording();
  const generation=recordGeneration;
  const granted=await navigator.mediaDevices.getUserMedia({audio:true});
  if(generation!==recordGeneration){granted.getTracks().forEach(t=>t.stop());throw new DOMException('Recording cancelled','AbortError');}
  const current={generation,stream:granted,recorder:null,chunks:[],timer:null,closed:false,tracksReleased:false};
  activeRecording=current;
  try{
    const type=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    const recorder=new MediaRecorder(granted,type?{mimeType:type}:{});
    current.recorder=recorder;
    const isCurrent=()=>!current.closed&&activeRecording===current&&generation===recordGeneration;
    const finish=(hasAudio)=>{
      if(!isCurrent())return;
      const blob=hasAudio?new Blob(current.chunks,{type:recorder.mimeType}):null;
      disposeRecording(current);
      if(blob?.size){clipURL=URL.createObjectURL(blob);onEnd(clipURL);}else onEnd(null);
    };
    recorder.ondataavailable=event=>{if(isCurrent()&&event.data.size)current.chunks.push(event.data);};
    recorder.onstop=()=>finish(true);
    recorder.onerror=()=>finish(false);
    recorder.start();
    current.timer=setTimeout(()=>{if(isCurrent())stopRecording();},15000);
  }catch(e){disposeRecording(current);throw e;}
}
export function stopRecording(){
  const current=activeRecording;
  if(!current||current.closed)return;
  clearTimeout(current.timer);
  // Stop capture immediately; queued final data still belongs to this recording.
  try{if(current.recorder?.state!=='inactive')current.recorder.stop();}
  catch{current.recorder?.onerror?.();}
  finally{releaseTracks(current);}
}
export function clearRecording(){
  recordGeneration++;
  if(activeRecording)disposeRecording(activeRecording);
  if(clipURL){URL.revokeObjectURL(clipURL);clipURL=null;}
}
export async function cacheAllAudio(files,onProgress){
  if(!('caches' in window))throw new Error('这个浏览器暂不支持离线保存，请使用新版 Safari、Chrome 或 Edge。');
  const cache=await caches.open('english-sprout-audio-v5');let done=0;let cursor=0;
  const unique=[...new Set(files)];
  await Promise.all(Array.from({length:3},async()=>{
    while(cursor<unique.length){
      const file=unique[cursor++];const url=new URL(file,document.baseURI).href;
      if(!await cache.match(url)){const response=await fetch(url);if(!response.ok)throw new Error('部分声音还没下载好，请联网后再试。');await cache.put(url,response);}
      done++;onProgress(done,unique.length);
    }
  }));
}
export async function cachedAudioCount(files){
  if(!('caches' in window))return 0;
  const cache=await caches.open('english-sprout-audio-v5');
  const results=await Promise.all(files.map(f=>cache.match(new URL(f,document.baseURI).href)));
  return results.filter(Boolean).length;
}
