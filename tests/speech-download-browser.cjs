// Isolated real Edge/Vosk integration: no user browser data or microphone input.
const {chromium}=require('C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/speech-download-browser');
const chunkBytes=256*1024,prefixParts=16,prefixBytes=prefixParts*chunkBytes;
const library=fs.readFileSync(path.join(root,'public/speech/vosk-0.0.8.js'));
const compressedLibrary=zlib.gzipSync(library);
const archive=fs.readFileSync(path.join(root,'public/speech/model-en-us-0.15.tar.gz'));
assert.equal(archive.length,41184862);
const requests=[],modelRequests=[],libraryRequests=[],checks=[],errors=[],uploads=[],external=[];
let probeAttempts=0,stallClosedAfterMs=null;
fs.mkdirSync(out,{recursive:true});
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const sourceHashes=Object.fromEntries(['src/speech-local.js','src/speech-download.js'].map(file=>[file,hash(file)]));
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  requests.push({url:req.url,method:req.method});
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Speech download recovery isolation</title>');return;}
  if(pathname==='/fixture/verified-prefix'){
    res.writeHead(200,{'Content-Length':prefixBytes,'Content-Type':'application/octet-stream'});res.end(archive.subarray(0,prefixBytes));return;
  }
  if(pathname==='/speech/vosk-0.0.8.js'){
    libraryRequests.push({range:req.headers.range||null,acceptEncoding:req.headers['accept-encoding']||null});
    if(req.headers.range){res.writeHead(416,{'Content-Range':`bytes */${compressedLibrary.length}`});res.end();return;}
    res.writeHead(200,{'Content-Type':'text/javascript','Content-Encoding':'gzip','Content-Length':compressedLibrary.length});
    res.end(compressedLibrary);return;
  }
  if(pathname==='/speech/model-en-us-0.15.tar.gz'){
    const range=/^bytes=(\d+)-(\d+)$/.exec(req.headers.range||'');
    if(!range){res.writeHead(400);res.end('Expected Range');return;}
    const start=Number(range[1]),end=Math.min(Number(range[2]),archive.length-1);
    const item={start,end,status:206,at:Date.now(),attempt:start===prefixBytes?++probeAttempts:null};modelRequests.push(item);
    if(start===prefixBytes&&probeAttempts>1&&probeAttempts<=4){item.status=503;res.writeHead(503);res.end('Temporary model connection failure');return;}
    const headers={'Content-Type':'application/gzip','Content-Range':`bytes ${start}-${end}/${archive.length}`,'Content-Length':end-start+1};
    res.writeHead(206,headers);
    if(start===prefixBytes&&probeAttempts===1){
      const stalledAt=Date.now();res.write(archive.subarray(start,start+65536));
      res.on('close',()=>{stallClosedAfterMs=Date.now()-stalledAt;});
      // Leave the genuine HTTP response open. The product's 15 s inactivity
      // deadline must cancel this body and then exhaust three 503 retries.
      return;
    }
    res.end(archive.subarray(start,end+1));return;
  }
  const relative=pathname.startsWith('/src/')?pathname.slice(1):'public'+pathname;
  const target=path.resolve(root,relative);
  if(!target.startsWith(root+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':target.endsWith('.js')?'text/javascript':target.endsWith('.mp3')?'audio/mpeg':'application/octet-stream'});
  fs.createReadStream(target).pipe(res);
});
const pass=(name,evidence)=>{checks.push({name,status:'PASS',...evidence});console.log('PASS '+name);};
const report={scope:'Fresh isolated Edge context, actual local Vosk library/model/known course MP3; synthetic server failures, no child pronunciation or physical iPad validation.',sourceHashes,libraryDecodedBytes:library.length,libraryEncodedBytes:compressedLibrary.length,archiveBytes:archive.length,prefixBytes,checks,requests,modelRequests,libraryRequests,errors,uploads,external};
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});
  const context=await browser.newContext();
  const page=await context.newPage();page.setDefaultTimeout(45000);
  context.on('page',p=>p.on('pageerror',error=>errors.push(error.message)));
  page.on('pageerror',error=>errors.push(error.message));
  context.on('request',request=>{
    if(!['GET','HEAD'].includes(request.method()))uploads.push({url:request.url(),method:request.method()});
    if(!request.url().startsWith(origin)&&!request.url().startsWith('blob:')&&!request.url().startsWith('data:'))external.push(request.url());
  });
  try{
    await page.goto(origin);
    const seeded=await page.evaluate(async({chunkBytes,prefixParts,archiveBytes})=>{
      const model=new URL('/speech/model-en-us-0.15.tar.gz',location.href).href;
      const bytes=await(await fetch('/fixture/verified-prefix')).arrayBuffer();
      const cache=await caches.open('english-sprout-speech-v1');
      for(let index=0;index<prefixParts;index++){
        const key=new URL(model);key.searchParams.set('sprout-part',String(index*chunkBytes));
        const part=bytes.slice(index*chunkBytes,(index+1)*chunkBytes);
        await cache.put(key.href,new Response(part,{headers:{'Content-Type':'application/gzip','Content-Length':String(part.byteLength)}}));
      }
      const key=new URL(model);key.searchParams.set('sprout-meta','1');
      await cache.put(key.href,new Response(JSON.stringify({version:1,total:archiveBytes,chunkBytes}),{headers:{'Content-Type':'application/json'}}));
      return {parts:(await cache.keys()).filter(key=>key.url.includes('sprout-part=')).length,bytes:bytes.byteLength};
    },{chunkBytes,prefixParts,archiveBytes:archive.length});
    assert.deepEqual(seeded,{parts:16,bytes:prefixBytes});
    pass('16 real verified model chunks seed the existing v1 resume cache at approximately 10%',seeded);
    await page.evaluate(async()=>{
      window.speech=await import('/src/speech-local.js');window.statuses=[];window.prepareStarted=performance.now();
      window.preparation=window.speech.prepareSpeech({background:true,onStatus:message=>window.statuses.push({message,at:performance.now()-window.prepareStarted})})
        .then(value=>{window.ready=value.ready;return value;}).catch(error=>{window.prepareError=String(error);return null;});
    });
    await page.waitForFunction(()=>window.statuses?.some(item=>item.message.includes('小耳朵下载中 10%')&&item.message.includes('4.1/')),{},{timeout:15000});
    const late=await page.evaluate(()=>{
      window.lateStatuses=[];const current=window.statuses.at(-1).message;
      window.latePreparation=window.speech.prepareSpeech({background:true,onStatus:message=>window.lateStatuses.push(message)}).catch(error=>{window.lateError=String(error);});
      return {current,replayed:window.lateStatuses[0]};
    });
    assert.equal(late.replayed,late.current);assert.match(late.replayed,/10%.*4\.1\//);
    pass('A later observer immediately receives the current 10% download progress',late);
    const retainedDuringStall=await page.evaluate(async()=>{
      const cache=await caches.open('english-sprout-speech-v1');
      return (await cache.keys()).filter(key=>key.url.includes('sprout-part=')).length;
    });
    assert.equal(retainedDuringStall,16);
    pass('The incomplete stalled HTTP body is not saved over the 16 verified chunks',{retainedDuringStall});
    await page.waitForFunction(()=>window.ready||window.prepareError,{},{timeout:45000});
    const result=await page.evaluate(async()=>{
      await Promise.all([window.preparation,window.latePreparation]);
      return {ready:window.ready,error:window.prepareError||null,lateError:window.lateError||null,statuses:window.statuses,lateStatuses:window.lateStatuses,elapsedMs:performance.now()-window.prepareStarted};
    });
    report.preparation=result;report.stallClosedAfterMs=stallClosedAfterMs;
    assert.equal(result.error,null);assert.equal(result.lateError,null);assert.equal(result.ready,true);
    assert.ok(result.statuses.some(item=>item.message.includes('连接慢，自动续传')));
    assert.ok(result.statuses.some(item=>item.message.includes('连接中断，自动续传')));
    assert.ok(stallClosedAfterMs>=14000&&stallClosedAfterMs<22000,'real stalled network body must cancel around the 15 s inactivity deadline');
    assert.equal(probeAttempts,5,'four attempts fail, then the automatic outer recovery transfers the same missing chunk');
    assert.ok(modelRequests.every(item=>item.start>=prefixBytes),'verified prefix must never be requested again');
    assert.ok(modelRequests.filter(item=>item.start===prefixBytes)[4].at-modelRequests.filter(item=>item.start===prefixBytes)[3].at>=2800,'exhausted request resumes automatically after approximately 3 s');
    assert.equal(libraryRequests.length,1);assert.equal(libraryRequests[0].range,null);
    pass('Real gzip library GET and stalled/503 model Range download recover automatically to actual Vosk ready',{elapsedMs:result.elapsedMs,probeAttempts,stallClosedAfterMs});
    const assessment=await page.evaluate(async()=>{
      const url=URL.createObjectURL(await(await fetch('/audio/hello-01.mp3')).blob());
      try{return await window.speech.assessRecording(url,'Hello, everyone.');}finally{URL.revokeObjectURL(url);}
    });
    assert.equal(assessment.matched,true);report.assessment=assessment;
    pass('The recovered real Vosk model recognizes known course audio',{heard:assessment.heard,matched:assessment.matched});
    const cached=await page.evaluate(async()=>{
      const cache=await caches.open('english-sprout-speech-v1');
      const response=await cache.match(new URL('/speech/model-en-us-0.15.tar.gz',location.href).href);
      return {size:(await response.blob()).size,parts:(await cache.keys()).filter(key=>key.url.includes('sprout-part=')).length};
    });
    assert.deepEqual(cached,{size:archive.length,parts:0});
    pass('The exact completed archive persists and verified parts are cleaned only after saving',cached);
    await page.evaluate(()=>window.speech.disposeSpeechAssessment());
    const cold=await context.newPage();cold.setDefaultTimeout(45000);await cold.goto(origin);
    await cold.evaluate(async()=>{window.speech=await import('/src/speech-local.js');});
    const modelRequestsBeforeOffline=modelRequests.length,libraryRequestsBeforeOffline=libraryRequests.length;
    await context.setOffline(true);
    const offline=await cold.evaluate(async()=>{const model=await window.speech.prepareSpeech({background:true});const ready=model.ready;window.speech.disposeSpeechAssessment();return ready;});
    assert.equal(offline,true);assert.equal(modelRequests.length,modelRequestsBeforeOffline);assert.equal(libraryRequests.length,libraryRequestsBeforeOffline);
    pass('A cold page prepares the genuine Vosk model offline without another library/model request',{offlineColdPrepare:true});
    assert.deepEqual(errors,[]);assert.deepEqual(uploads,[]);assert.deepEqual(external,[]);
    pass('No uploads, external requests or uncaught browser errors occur in the recovery chain');
    report.status='PASS';fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({passed:checks.length,elapsedMs:result.elapsedMs,modelRequests:modelRequests.length,report:path.join(out,'results.json')}));
  }catch(error){report.status='FAIL';report.failure=error.stack||String(error);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));throw error;}
  finally{await context.close();await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;server.closeAllConnections();server.close();});
