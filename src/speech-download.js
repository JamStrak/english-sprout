// Keep verified archive bytes between visits. No recordings enter this cache.
const CACHE_NAME='english-sprout-speech-v1';
const DEFAULT_CHUNK=256*1024;
const TIMEOUT=90000;
function aborted(){return new DOMException('已取消声音下载。','AbortError');}
function checkSignal(signal){if(signal?.aborted)throw aborted();}
function partKey(url,start){const key=new URL(url);key.searchParams.set('sprout-part',String(start));return key.href;}
function metaKey(url){const key=new URL(url);key.searchParams.set('sprout-meta','1');return key.href;}
function validSize(value){return Number.isSafeInteger(value)&&value>0;}
function notify(callback,loaded,total){try{callback?.({loaded,total});}catch{}}
function responseFor(bytes,type='application/octet-stream'){
  return new Response(bytes,{status:200,headers:{'Content-Type':type,'Content-Length':String(bytes.size??bytes.byteLength)}});
}

async function requestPart(url,start,end,{signal,expectedTotal}){
  for(let attempt=0;attempt<=3;attempt++){
    checkSignal(signal);
    const controller=new AbortController();
    const cancel=()=>controller.abort();
    signal?.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(cancel,TIMEOUT);
    try{
      const response=await fetch(url,{headers:{Range:`bytes=${start}-${end}`},signal:controller.signal,cache:'no-store'});
      if(response.status!==200&&response.status!==206)throw new Error(`声音下载失败 (${response.status})。`);
      // HTTP content encoding changes bytes transparently in fetch, so it cannot
      // be safely combined with offsets into the original .tar.gz archive.
      const encoding=response.headers.get('Content-Encoding');
      if(response.status===206&&encoding&&encoding.toLowerCase()!=='identity')throw new Error('声音下载的分段编码不一致。');
      let total,full=response.status===200;
      if(!full){
        const range=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range')||'');
        if(!range)throw new Error('声音下载的分段信息不完整。');
        const first=Number(range[1]),last=Number(range[2]);total=Number(range[3]);
        if(!validSize(total)||first!==start||last!==Math.min(end,total-1)||last<first||(expectedTotal&&total!==expectedTotal))throw new Error('声音下载的分段位置不一致。');
      }
      const bytes=await response.blob();
      checkSignal(signal);
      if(full){
        total=bytes.size;
        const length=response.headers.get('Content-Length');
        if(!validSize(total)||(expectedTotal&&total!==expectedTotal)||(!encoding&&length!==null&&Number(length)!==total))throw new Error('声音文件没有下载完整。');
      }else if(bytes.size!==Math.min(end,total-1)-start+1)throw new Error('声音分段没有下载完整。');
      return {bytes,total,full,type:response.headers.get('Content-Type')||'application/octet-stream'};
    }catch(error){
      if(signal?.aborted)throw aborted();
      if(attempt===3)throw error;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }
}

export async function downloadSpeechAsset(input,{onProgress,signal,expectedBytes,chunkBytes=DEFAULT_CHUNK}={}){
  checkSignal(signal);
  const url=new URL(input,globalThis.location?.href||globalThis.document?.baseURI).href;
  if(expectedBytes!==undefined&&!validSize(expectedBytes))throw new Error('声音文件大小无效。');
  if(!validSize(chunkBytes))throw new Error('声音下载分段大小无效。');
  let cache=null;
  try{if(globalThis.caches)cache=await caches.open(CACHE_NAME);}catch{}
  const read=async key=>{try{return await cache?.match(key);}catch{return null;}};
  const write=async (key,response)=>{try{if(!cache)return false;await cache.put(key,response);return true;}catch{return false;}};
  const erase=async key=>{try{await cache?.delete(key);}catch{}};
  const cached=await read(url);
  if(cached){
    const bytes=await cached.blob();checkSignal(signal);
    const length=cached.headers.get('Content-Length');
    if(validSize(bytes.size)&&(!expectedBytes||bytes.size===expectedBytes)&&(cached.headers.get('Content-Encoding')||length===null||Number(length)===bytes.size)){
      notify(onProgress,bytes.size,bytes.size);
      const response=responseFor(bytes,cached.headers.get('Content-Type')||undefined);
      response.headers.set('X-Sprout-Cache-Persisted','1');return response;
    }
    await erase(url);
  }
  let total=expectedBytes||0;
  try{
    const metadata=await read(metaKey(url));
    if(metadata){const value=await metadata.json();if(value.version===1&&validSize(value.total)&&value.chunkBytes===chunkBytes&&(!total||value.total===total))total=value.total;}
  }catch{}
  const parts=new Map();let loaded=0,type='application/octet-stream';
  const finish=async bytes=>{
    checkSignal(signal);
    const response=responseFor(bytes,type);
    const persisted=await write(url,response.clone());
    response.headers.set('X-Sprout-Cache-Persisted',persisted?'1':'0');
    notify(onProgress,bytes.size,bytes.size);
    // Retain parts if the final write failed: they remain usable next time.
    if(persisted){
      for(let start=0;start<bytes.size;start+=chunkBytes)await erase(partKey(url,start));
      await erase(metaKey(url));
    }
    checkSignal(signal);return response;
  };
  const accept=async (start,value)=>{
    total=value.total;type=value.type;
    parts.set(start,value.bytes);loaded+=value.bytes.size;
    await write(partKey(url,start),responseFor(value.bytes,type));
    notify(onProgress,loaded,total);
  };
  if(!total){
    const first=await requestPart(url,0,chunkBytes-1,{signal});
    total=first.total;type=first.type;
    if(first.full)return finish(first.bytes);
    await accept(0,first);
  }
  await write(metaKey(url),new Response(JSON.stringify({version:1,total,chunkBytes}),{headers:{'Content-Type':'application/json'}}));
  const missing=[];
  for(let start=0;start<total;start+=chunkBytes){
    checkSignal(signal);
    if(parts.has(start))continue;
    const previous=await read(partKey(url,start));
    if(previous){
      const bytes=await previous.blob();
      if(bytes.size===Math.min(chunkBytes,total-start)){
        parts.set(start,bytes);loaded+=bytes.size;type=previous.headers.get('Content-Type')||type;continue;
      }
      await erase(partKey(url,start));
    }
    missing.push(start);
  }
  notify(onProgress,loaded,total);
  // Probe Range support before starting parallel requests. A server that ignores
  // Range should transfer the full large model only once, rather than 3 times.
  if(parts.size===0&&missing[0]===0){
    const first=await requestPart(url,0,Math.min(chunkBytes,total)-1,{signal,expectedTotal:total});
    type=first.type;
    if(first.full)return finish(first.bytes);
    await accept(0,first);missing.shift();
  }
  let index=0,failure=null,whole=null;
  const worker=async()=>{
    while(!failure&&!whole&&index<missing.length){
      const start=missing[index++];
      try{
        const value=await requestPart(url,start,Math.min(start+chunkBytes,total)-1,{signal,expectedTotal:total});
        if(whole)continue;
        if(value.full){whole=value.bytes;type=value.type;notify(onProgress,total,total);}
        else await accept(start,value);
      }catch(error){failure=error;}
    }
  };
  await Promise.all(Array.from({length:Math.min(3,missing.length)},worker));
  checkSignal(signal);
  if(whole)return finish(whole);
  if(failure)throw failure;
  const ordered=[];
  for(let start=0;start<total;start+=chunkBytes){const bytes=parts.get(start);if(!bytes)throw new Error('声音下载尚未完整。');ordered.push(bytes);}
  return finish(new Blob(ordered,{type}));
}
