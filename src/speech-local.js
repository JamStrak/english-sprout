import {scoreSpeech} from './speech-match.js';
import {downloadSpeechAsset} from './speech-download.js';

// Model assets keep one stable cache/IndexedDB address across code releases.
const ASSET_BASE=globalThis.document?.baseURI||new URL('../',import.meta.url).href;
const LIBRARY=new URL('speech/vosk-0.0.8.js',ASSET_BASE).href;
const MODEL=new URL('speech/model-en-us-0.15.tar.gz',ASSET_BASE).href;
let model=null, preparing=null, generation=0, libraryPromise=null,assetController=null;
const pending=new Set();
const preparingListeners=new Set();
let lastPreparationStatus='';
function preparingStatus(message){lastPreparationStatus=message;for(const listener of preparingListeners)try{listener(message);}catch{}}

function recoveryPause(delay,signal){
  return new Promise((resolve,reject)=>{
    let timer;
    const finish=(fn,value)=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);window.removeEventListener('online',resume);fn(value);};
    const cancel=()=>finish(reject,abortError()),resume=()=>finish(resolve);
    if(signal?.aborted){cancel();return;}
    signal?.addEventListener('abort',cancel,{once:true});window.addEventListener('online',resume,{once:true});
    timer=setTimeout(resume,delay);
  });
}
async function prepareAsset(url,{signal,label,...options}){
  let progress={loaded:0,total:0};
  const amount=()=>progress.total?`${Math.min(99,Math.floor(progress.loaded/progress.total*100))}% · ${(progress.loaded/1048576).toFixed(1)}/${(progress.total/1048576).toFixed(1)}MB`:`${(progress.loaded/1048576).toFixed(1)}MB`;
  for(let attempt=0;;attempt++){
    if(signal?.aborted)throw abortError();
    try{return await downloadSpeechAsset(url,{...options,signal,
      onProgress:value=>{progress=value;preparingStatus(`${label}下载中 ${amount()}`);},
      onState:value=>{if(value.phase==='retrying')preparingStatus(`连接慢，自动续传 · ${amount()}`);else if(value.phase==='saving')preparingStatus(`${label}下载好了，正在保存`);}
    });}catch(error){
      if(signal?.aborted||error.name==='AbortError')throw abortError();
      preparingStatus(`连接中断，自动续传 · ${amount()}`);
      await recoveryPause(Math.min(30000,3000*2**Math.min(attempt,4)),signal);
    }
  }
}

// Keep Vosk's stable model URL for its IndexedDB path, while its worker reads
// already-downloaded bytes. This also works before a service worker takes over.
function modelFromArchive(Vosk,archive){
  const archiveURL=URL.createObjectURL(archive),urls=[archiveURL];
  const NativeWorker=window.Worker;
  function CachedWorker(source,options){
    const wrapper=`const target=${JSON.stringify(MODEL)},archive=${JSON.stringify(archiveURL)};
const rewrite=value=>String(value)===target?archive:value;
const nativeFetch=self.fetch.bind(self);self.fetch=(input,options)=>nativeFetch(rewrite(typeof input==='string'?input:input.url),options);
const nativeOpen=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url,...args){return nativeOpen.call(this,method,rewrite(url),...args);};
importScripts(${JSON.stringify(String(source))});`;
    const workerURL=URL.createObjectURL(new Blob([wrapper],{type:'text/javascript'}));urls.push(workerURL);
    return new NativeWorker(workerURL,options);
  }
  CachedWorker.prototype=NativeWorker.prototype;
  const cleanup=()=>urls.forEach(url=>URL.revokeObjectURL(url));
  try{window.Worker=CachedWorker;return {value:new Vosk.Model(MODEL,-2),cleanup};}
  catch(error){cleanup();throw error;}
  finally{window.Worker=NativeWorker;}
}

function abortError(){return new DOMException('已取消这次跟读。','AbortError');}
function releaseModel(value){
  if(!value)return;
  value.sproutArchiveCleanup?.();value.sproutArchiveCleanup=null;
  // Pinned vosk-browser 0.0.8 exposes its Worker as this property. Terminating the
  // worker also interrupts a pending model download/inference, unlike its public
  // terminate() message, which waits behind the current synchronous WASM work.
  if(value.worker&&typeof value.worker.terminate==='function')value.worker.terminate();
  else try{value.terminate();}catch{}
}
export function disposeSpeechAssessment(){
  generation++;
  assetController?.abort();assetController=null;preparingListeners.clear();lastPreparationStatus='';
  for(const cancel of [...pending])cancel();
  releaseModel(model);model=null;preparing=null;
}

function bounded(work,{signal,timeout=60000,disposeOnTimeout=true}={}){
  return new Promise((resolve,reject)=>{
    let finished=false;
    const finish=(fn,value)=>{if(finished)return;finished=true;clearTimeout(timer);pending.delete(cancel);signal?.removeEventListener('abort',onAbort);fn(value);};
    const cancel=()=>finish(reject,abortError());
    const onAbort=()=>{cancel();disposeSpeechAssessment();};
    const timer=setTimeout(()=>{finish(reject,new Error('小耳朵还没准备好，可以稍后再试或先去花园。'));if(disposeOnTimeout)disposeSpeechAssessment();},timeout);
    pending.add(cancel);
    if(signal?.aborted){onAbort();return;}
    signal?.addEventListener('abort',onAbort,{once:true});
    Promise.resolve(work).then(value=>finish(resolve,value),error=>finish(reject,error));
  });
}

async function loadLibrary(signal){
  if(window.Vosk)return window.Vosk;
  if(!libraryPromise)libraryPromise=(async()=>{
    const response=await prepareAsset(LIBRARY,{signal,label:'声音工具',useRanges:false});
    preparingStatus('声音工具下载好了，正在打开…');
    const url=URL.createObjectURL(new Blob([await response.text()],{type:'text/javascript'}));
    try{
      await bounded(new Promise((resolve,reject)=>{
        const script=document.createElement('script');script.src=url;
        script.onload=()=>{script.remove();resolve();};
        script.onerror=()=>{script.remove();reject(new Error('这个浏览器暂时无法打开小耳朵。'));};
        document.head.append(script);
      }),{signal,timeout:60000});
    }finally{URL.revokeObjectURL(url);}
    if(!window.Vosk)throw new Error('这个浏览器暂时无法打开小耳朵。');
    return window.Vosk;
  })().catch(error=>{libraryPromise=null;throw error;});
  return libraryPromise;
}

export async function prepareSpeech({onStatus=()=>{},signal,background=false}={}){
  if(signal?.aborted)throw abortError();
  if(model?.ready)return model;
  if(!window.WebAssembly||!window.Worker||!(window.AudioContext||window.webkitAudioContext))throw new Error('这个浏览器暂时不能听懂跟读，可以继续听示范或照顾花园。');
  preparingListeners.add(onStatus);
  onStatus(preparing&&lastPreparationStatus?lastPreparationStatus:'准备小耳朵…首次需要下载约47MB，之后保存在这台设备。');
  const currentGeneration=generation;
  if(!preparing){
    const controller=new AbortController();assetController=controller;
    const task=(async()=>{
      const Vosk=await loadLibrary(controller.signal);
      if(currentGeneration!==generation)throw abortError();
      const response=await prepareAsset(MODEL,{signal:controller.signal,expectedBytes:41184862,label:'小耳朵'});
      if(currentGeneration!==generation)throw abortError();
      preparingStatus('下载完成，正在打开小耳朵…');
      const {value,cleanup}=modelFromArchive(Vosk,await response.blob());value.sproutArchiveCleanup=cleanup;model=value;
      try{
        await bounded(new Promise((resolve,reject)=>{
          value.on('load',message=>message.result?resolve():reject(new Error('小耳朵没有准备好，请再试一次。')));
          value.on('error',()=>reject(new Error('小耳朵暂时无法准备，请检查网络或稍后再试。')));
        }),{signal:controller.signal,timeout:120000});
        if(currentGeneration!==generation)throw abortError();
        return value;
      }catch(error){releaseModel(value);if(model===value)model=null;throw error;}
      finally{cleanup();}
    })();
    preparing=task;
    task.catch(()=>{if(preparing===task)preparing=null;});
  }
  try{
    const value=await bounded(preparing,{signal,timeout:background?1800000:15000,disposeOnTimeout:background});
    if(currentGeneration!==generation)throw abortError();
    onStatus('小耳朵准备好了');return value;
  }finally{preparingListeners.delete(onStatus);}
}

async function decodeRecording(url,signal){
  if(typeof url!=='string'||!url.startsWith('blob:')||new URL(url).origin!==location.origin)throw new Error('这次录音已经结束，请再录一次。');
  const response=await fetch(url,{signal});
  const bytes=await response.arrayBuffer();
  const Context=window.AudioContext||window.webkitAudioContext;
  const context=new Context();
  try{
    return await new Promise((resolve,reject)=>context.decodeAudioData(bytes,resolve,reject));
  }catch{
    throw new Error('这次录音没有听清，听一遍示范后再试试。');
  }finally{await context.close().catch(()=>{});}
}

function mono16k(buffer){
  if(!buffer.length||buffer.duration>20)throw new Error('请一次跟读一句，再试一次。');
  const samples=new Float32Array(Math.ceil(buffer.duration*16000));
  const channels=Array.from({length:buffer.numberOfChannels},(_,index)=>buffer.getChannelData(index));
  const ratio=buffer.sampleRate/16000;
  for(let i=0;i<samples.length;i++){
    const position=i*ratio, left=Math.floor(position), fraction=position-left;
    let value=0;
    for(const channel of channels)value+=(channel[left]||0)*(1-fraction)+(channel[Math.min(left+1,channel.length-1)]||0)*fraction;
    samples[i]=value/channels.length;
  }
  return samples;
}

export async function assessRecording(url,expected,{onStatus=()=>{},signal}={}){
  const currentGeneration=generation;
  const value=await prepareSpeech({onStatus,signal});
  if(signal?.aborted||currentGeneration!==generation)throw abortError();
  onStatus('小耳朵正在听你说…');
  let recognizer;
  const work=(async()=>{
    const audio=await decodeRecording(url,signal);
    if(signal?.aborted||currentGeneration!==generation)throw abortError();
    const samples=mono16k(audio);
    // Unconstrained recognition: never force the target sentence as the only
    // allowed answer, which could make unrelated audio appear to pass.
    recognizer=new value.KaldiRecognizer(16000);
    const parts=[];
    let waiting=null;
    const next=()=>new Promise((resolve,reject)=>{waiting={resolve,reject};});
    const receive=message=>{
      if(message.result?.text)parts.push(message.result.text);
      if(waiting){const callback=waiting;waiting=null;callback.resolve();}
    };
    recognizer.on('result',receive);
    recognizer.on('partialresult',receive);
    recognizer.on('error',()=>{if(waiting){const callback=waiting;waiting=null;callback.reject(new Error('这次没有听清，可以换一句试试。'));}});
    // One chunk in flight bounds worker memory and lets cancellation take effect.
    for(let offset=0;offset<samples.length;offset+=16000){
      if(signal?.aborted||currentGeneration!==generation)throw abortError();
      const response=next();
      recognizer.acceptWaveformFloat(samples.slice(offset,offset+16000),16000);
      await response;
    }
    const final=next();recognizer.retrieveFinalResult();await final;
    if(signal?.aborted||currentGeneration!==generation)throw abortError();
    return scoreSpeech(expected,parts.join(' '));
  })();
  try{return await bounded(work,{signal,timeout:45000});}
  finally{if(recognizer)try{recognizer.remove();}catch{}}
}
