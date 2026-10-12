// Real local-ASR integration smoke test. No microphone/recordings leave the PC.
const {chromium}=require('C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const requests=[];
const server=http.createServer((req,res)=>{
  requests.push(req.url);
  if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Local speech test</title>');return;}
  const decoded=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const relative=decoded.startsWith('/src/')?decoded.slice(1):`public${decoded}`;
  const target=path.resolve(root,relative);
  if(!target.startsWith(root+path.sep)||!fs.existsSync(target)){res.writeHead(404);res.end();return;}
  const type=target.endsWith('.js')?'text/javascript':target.endsWith('.mp3')?'audio/mpeg':'application/octet-stream';
  res.writeHead(200,{'Content-Type':type});fs.createReadStream(target).pipe(res);
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});
  const context=await browser.newContext();
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',req=>{assert.ok(req.url().startsWith(origin)||req.url().startsWith('blob:'),'Unexpected external request');});
  try{
    await page.goto(origin);
    const result=await page.evaluate(async()=>{
      const speech=await import('/src/speech-local.js');
      const start=performance.now(),statuses=[];
      await speech.prepareSpeech({onStatus:value=>statuses.push(value)});
      const prepared=Math.round(performance.now()-start);
      const output=[];
      for(const [file,expected] of [['hello-01.mp3','Hello, everyone.'],['hello-02.mp3','Good morning.'],['hello-01.mp3','I want some water.']]){
        const blob=await (await fetch(`/audio/${file}`)).blob();const url=URL.createObjectURL(blob);
        try{output.push({file,expected,...await speech.assessRecording(url,expected)});}finally{URL.revokeObjectURL(url);}
      }
      // A valid two-second, silent PCM WAV must not receive words or a pass.
      const wav=new ArrayBuffer(44+64000),header=new DataView(wav);
      const text=(offset,value)=>{for(let i=0;i<value.length;i++)header.setUint8(offset+i,value.charCodeAt(i));};
      text(0,'RIFF');header.setUint32(4,wav.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');
      header.setUint32(16,16,true);header.setUint16(20,1,true);header.setUint16(22,1,true);
      header.setUint32(24,16000,true);header.setUint32(28,32000,true);header.setUint16(32,2,true);header.setUint16(34,16,true);
      text(36,'data');header.setUint32(40,64000,true);
      const silentURL=URL.createObjectURL(new Blob([wav],{type:'audio/wav'}));
      try{output.push({file:'generated-silence.wav',expected:'Hello, everyone.',...await speech.assessRecording(silentURL,'Hello, everyone.')});}
      finally{URL.revokeObjectURL(silentURL);}
      const cancelled=new AbortController();cancelled.abort();
      let abortName='';try{await speech.prepareSpeech({signal:cancelled.signal});}catch(error){abortName=error.name;}
      speech.disposeSpeechAssessment();
      const duringPrepare=new AbortController();
      const stopped=speech.prepareSpeech({signal:duringPrepare.signal});duringPrepare.abort();
      let duringAbortName='';try{await stopped;}catch(error){duringAbortName=error.name;}
      // The second model start reads its IndexedDB files; no model re-download.
      await speech.prepareSpeech();speech.disposeSpeechAssessment();
      return {prepared,statuses,output,abortName,duringAbortName};
    });
    assert.equal(result.output[0].matched,true);assert.equal(result.output[1].matched,true);
    assert.equal(result.output[2].matched,false);assert.equal(result.output[3].matched,false);assert.equal(result.output[3].heard,'');
    assert.equal(result.abortName,'AbortError');assert.equal(result.duringAbortName,'AbortError');assert.equal(errors.length,0);
    assert.equal(requests.filter(url=>url.includes('model-en-us-0.15.tar.gz')).length,1,'Model must persist between local model sessions');
    // Script cache + IndexedDB model permit a cold page in the same browser to
    // prepare offline once the application shell itself has been loaded.
    const offline=await context.newPage();await offline.goto(origin);
    await offline.evaluate(()=>import('/src/speech-local.js').then(speech=>window.localSpeech=speech));
    await context.setOffline(true);
    assert.equal(await offline.evaluate(async()=>{await window.localSpeech.prepareSpeech();window.localSpeech.disposeSpeechAssessment();return true;}),true);
    const report={...result,errors,modelDownloads:1,offlineColdPrepare:true};
    fs.mkdirSync(path.join(root,'test-results/speech-local'),{recursive:true});
    fs.writeFileSync(path.join(root,'test-results/speech-local/results.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
