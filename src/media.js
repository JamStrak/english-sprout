let player=null;
export function stopAudio(){if(player){player.pause();player=null;}if('speechSynthesis' in window)window.speechSynthesis.cancel();}
export async function playFile(file,slow=false){
  stopAudio();
  const audio=new Audio(new URL(file,document.baseURI));
  player=audio;
  audio.playbackRate=slow?.8:1;
  audio.preservesPitch=true;
  try{await audio.play();return audio;}catch(e){if(player===audio)player=null;throw e;}
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
  const cache=await caches.open('english-sprout-audio-v1');let done=0;let cursor=0;
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
  const cache=await caches.open('english-sprout-audio-v1');
  const results=await Promise.all(files.map(f=>cache.match(new URL(f,document.baseURI).href)));
  return results.filter(Boolean).length;
}
