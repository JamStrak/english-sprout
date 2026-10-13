// Keep verified archive bytes between visits. No recordings enter this cache.
const CACHE_NAME='english-sprout-speech-v1';
const DEFAULT_CHUNK=256*1024;
const REQUEST_TIMEOUT=15000,CACHE_TIMEOUT=5000;
function aborted(){return new DOMException('已取消声音下载。','AbortError');}
function checkSignal(signal){if(signal?.aborted)throw aborted();}
function partKey(url,start){const key=new URL(url);key.searchParams.set('sprout-part',String(start));return key.href;}
function metaKey(url){const key=new URL(url);key.searchParams.set('sprout-meta','1');return key.href;}
function validSize(value){return Number.isSafeInteger(value)&&value>0;}
function notify(callback,loaded,total){try{callback?.({loaded,total});}catch{}}
function responseFor(bytes,type='application/octet-stream'){
  return new Response(bytes,{status:200,headers:{'Content-Type':type,'Content-Length':String(bytes.size??bytes.byteLength)}});
}
// Resolve our own deadline even if a browser ignores abort for a stalled body.
function limited(work,ms,{signal,onTimeout=()=>{}}={}){
  return new Promise((resolve,reject)=>{
    let done=false,timer;
    const finish=(fn,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);fn(value);};
    const cancel=()=>finish(reject,aborted());
    if(signal?.aborted){cancel();return;}
    signal?.addEventListener('abort',cancel,{once:true});
    timer=setTimeout(()=>{finish(reject,new Error('下载暂时没有进展，正在续传。'));try{onTimeout();}catch{}},ms);
    Promise.resolve().then(work).then(value=>finish(resolve,value),error=>finish(reject,error));
  });
}

async function requestPart(url,start,end,{signal,expectedTotal,useRanges=true,requestTimeoutMs,retryDelayMs,onBytes=()=>{},onRetry=()=>{}}){
  for(let attempt=0;attempt<=3;attempt++){
    checkSignal(signal);
    const controller=new AbortController(),cancel=()=>controller.abort();let reader;
    signal?.addEventListener('abort',cancel,{once:true});
    const wait=work=>limited(work,requestTimeoutMs,{signal:controller.signal,onTimeout:cancel});
    try{
      onBytes(0,expectedTotal||0,!useRanges);
      const response=await wait(()=>fetch(url,{headers:useRanges?{Range:`bytes=${start}-${end}`}:{},signal:controller.signal,cache:'no-store'}));
      if(response.status!==200&&response.status!==206)throw new Error(`声音下载失败 (${response.status})。`);
      if(!useRanges&&response.status!==200)throw new Error('声音工具需要完整文件，不能使用分段响应。');
      const encoding=response.headers.get('Content-Encoding');
      if(response.status===206&&encoding&&encoding.toLowerCase()!=='identity')throw new Error('声音下载的分段编码不一致。');
      let total=expectedTotal||0,full=response.status===200;
      if(!full){
        const range=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range')||'');
        if(!range)throw new Error('声音下载的分段信息不完整。');
        const first=Number(range[1]),last=Number(range[2]);total=Number(range[3]);
        if(!validSize(total)||first!==start||last!==Math.min(end,total-1)||last<first||(expectedTotal&&total!==expectedTotal))throw new Error('声音下载的分段位置不一致。');
      }else if(!total&&!encoding){const length=Number(response.headers.get('Content-Length'));if(validSize(length))total=length;}
      onBytes(0,total,full);
      let bytes;
      if(response.body?.getReader){
        reader=response.body.getReader();const chunks=[];let received=0;
        while(true){
          const item=await wait(()=>reader.read());checkSignal(signal);
          if(item.done)break;
          received+=item.value.byteLength;chunks.push(item.value);onBytes(received,total,full);
        }
        bytes=new Blob(chunks,{type:response.headers.get('Content-Type')||'application/octet-stream'});
      }else bytes=await wait(()=>response.blob());
      checkSignal(signal);
      if(full){
        total=bytes.size;const length=response.headers.get('Content-Length');
        if(!validSize(total)||(expectedTotal&&total!==expectedTotal)||(!encoding&&length!==null&&Number(length)!==total))throw new Error('声音文件没有下载完整。');
      }else if(bytes.size!==Math.min(end,total-1)-start+1)throw new Error('声音分段没有下载完整。');
      return {bytes,total,full,type:response.headers.get('Content-Type')||'application/octet-stream'};
    }catch(error){
      if(signal?.aborted)throw aborted();
      onBytes(0,expectedTotal||0,!useRanges);onRetry(attempt+1);
      if(attempt===3)throw error;
      if(retryDelayMs>0)await limited(()=>new Promise(resolve=>setTimeout(resolve,retryDelayMs)),retryDelayMs+1000,{signal});
    }finally{
      signal?.removeEventListener('abort',cancel);controller.abort();
      if(reader)try{reader.cancel().catch(()=>{});}catch{}
    }
  }
}

export async function downloadSpeechAsset(input,{onProgress,onState,signal,expectedBytes,chunkBytes=DEFAULT_CHUNK,useRanges=true,requestTimeoutMs=REQUEST_TIMEOUT,cacheTimeoutMs=CACHE_TIMEOUT,retryDelayMs=250}={}){
  checkSignal(signal);
  const url=new URL(input,globalThis.location?.href||globalThis.document?.baseURI).href;
  if(expectedBytes!==undefined&&!validSize(expectedBytes))throw new Error('声音文件大小无效。');
  if(!validSize(chunkBytes)||!validSize(requestTimeoutMs)||!validSize(cacheTimeoutMs)||!Number.isFinite(retryDelayMs)||retryDelayMs<0)throw new Error('声音下载参数无效。');
  let cache=null,total=expectedBytes||0,loaded=0,type='application/octet-stream';
  const state=(phase,extra={})=>{try{onState?.({phase,loaded,total,...extra});}catch{}};
  const storage=async work=>{try{return await limited(work,cacheTimeoutMs,{signal});}catch(error){checkSignal(signal);cache=null;return undefined;}};
  if(globalThis.caches)cache=await storage(()=>caches.open(CACHE_NAME))||null;
  const read=key=>{const store=cache;return store?storage(()=>store.match(key)):null;};
  const write=async(key,response)=>{const store=cache;if(!store)return false;return (await storage(async()=>{await store.put(key,response);return true;}))===true;};
  const erase=key=>{const store=cache;return store?storage(()=>store.delete(key)):null;};
  const cached=await read(url);
  if(cached){
    const bytes=await storage(()=>cached.blob());checkSignal(signal);
    const length=cached.headers.get('Content-Length');
    if(bytes&&validSize(bytes.size)&&(!expectedBytes||bytes.size===expectedBytes)&&(cached.headers.get('Content-Encoding')||length===null||Number(length)===bytes.size)){
      notify(onProgress,bytes.size,bytes.size);
      const response=responseFor(bytes,cached.headers.get('Content-Type')||undefined);
      response.headers.set('X-Sprout-Cache-Persisted','1');return response;
    }
    if(bytes)await erase(url);
  }
  const parts=new Map(),inFlight=new Map();
  const report=()=>{
    const values=[...inFlight.values()],whole=values.filter(v=>v.full);
    const received=whole.length?Math.max(loaded,...whole.map(v=>v.bytes)):loaded+values.reduce((sum,v)=>sum+v.bytes,0);
    notify(onProgress,total?Math.min(total,received):received,total);
  };
  const transfer=async(start,end,ranged=useRanges)=>{
    state('downloading');
    const value=await requestPart(url,start,end,{signal,expectedTotal:total||undefined,useRanges:ranged,requestTimeoutMs,retryDelayMs,
      onBytes:(bytes,size,full)=>{if(validSize(size)&&!total)total=size;inFlight.set(start,{bytes,full});report();},
      onRetry:attempt=>state('retrying',{attempt})});
    inFlight.delete(start);return value;
  };
  const finish=async bytes=>{
    checkSignal(signal);loaded=total=bytes.size;notify(onProgress,bytes.size,bytes.size);state('saving');
    const response=responseFor(bytes,type),persisted=await write(url,response.clone());
    response.headers.set('X-Sprout-Cache-Persisted',persisted?'1':'0');
    if(persisted){
      for(let start=0;start<bytes.size;start+=chunkBytes)await erase(partKey(url,start));
      await erase(metaKey(url));
    }
    checkSignal(signal);notify(onProgress,bytes.size,bytes.size);return response;
  };
  const accept=async(start,value)=>{
    total=value.total;type=value.type;parts.set(start,value.bytes);loaded+=value.bytes.size;
    report();await write(partKey(url,start),responseFor(value.bytes,type));
  };
  // Compressed JavaScript cannot safely use offsets into its decoded body.
  if(!useRanges){const value=await transfer(0,0,false);type=value.type;return finish(value.bytes);}
  const metadata=await read(metaKey(url));
  if(metadata){
    const value=await storage(()=>metadata.json());
    if(value?.version===1&&validSize(value.total)&&value.chunkBytes===chunkBytes&&(!total||value.total===total))total=value.total;
  }
  let rangeProbed=false;
  if(!total){
    const first=await transfer(0,chunkBytes-1);total=first.total;type=first.type;
    if(first.full)return finish(first.bytes);
    await accept(0,first);rangeProbed=true;
  }
  await write(metaKey(url),new Response(JSON.stringify({version:1,total,chunkBytes}),{headers:{'Content-Type':'application/json'}}));
  const missing=[];
  for(let start=0;start<total;start+=chunkBytes){
    checkSignal(signal);if(parts.has(start))continue;
    const previous=await read(partKey(url,start));
    if(previous){
      const bytes=await storage(()=>previous.blob());
      if(bytes?.size===Math.min(chunkBytes,total-start)){
        parts.set(start,bytes);loaded+=bytes.size;type=previous.headers.get('Content-Type')||type;continue;
      }
      if(bytes)await erase(partKey(url,start));
    }
    missing.push(start);
  }
  report();
  // Probe once even on resume: Range support may change between visits.
  if(missing.length&&!rangeProbed){
    const start=missing.shift(),first=await transfer(start,Math.min(start+chunkBytes,total)-1);
    type=first.type;if(first.full)return finish(first.bytes);await accept(start,first);
  }
  let index=0,failure=null,whole=null;
  const worker=async()=>{
    while(!failure&&!whole&&index<missing.length){
      const start=missing[index++];
      try{
        const value=await transfer(start,Math.min(start+chunkBytes,total)-1);
        if(whole)continue;
        if(value.full){whole=value.bytes;type=value.type;}
        else await accept(start,value);
      }catch(error){inFlight.delete(start);failure=error;}
    }
  };
  await Promise.all(Array.from({length:Math.min(3,missing.length)},worker));
  checkSignal(signal);if(whole)return finish(whole);if(failure)throw failure;
  const ordered=[];
  for(let start=0;start<total;start+=chunkBytes){const bytes=parts.get(start);if(!bytes)throw new Error('声音下载尚未完整。');ordered.push(bytes);}
  return finish(new Blob(ordered,{type}));
}
