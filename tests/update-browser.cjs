// Real Service Worker update regression: independent local releases, no user profile.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist'),output=path.join(root,'test-results','automatic-updates');
const version=JSON.parse(fs.readFileSync(path.join(dist,'version.json'),'utf8'));
const sourceSW=fs.readFileSync(path.join(dist,'sw.js'),'utf8');
assert.match(sourceSW,/GET_BUILD/,'Build the automatic-update version before running this test.');
const core=JSON.parse(sourceSW.match(/const CORE=(\[.*?\]);/)[1]);
const lesson=JSON.parse(fs.readFileSync(path.join(dist,'data/curriculum.json'),'utf8')).lessons[0];
const key='english-sprout-state-v1',A='111111111111',B='222222222222',OLD='000000000140';
const files=new Map(),scopes=new Map(),checks=[];
for(const file of core.slice(1).map(f=>f.replace(/^\.\//,'')))files.set(file,fs.readFileSync(path.join(dist,file)));
for(const file of fs.readdirSync(path.join(dist,'src')))files.set('src/'+file,fs.readFileSync(path.join(dist,'src',file)));
files.set('sw.js',Buffer.from(sourceSW));files.set('version.json',fs.readFileSync(path.join(dist,'version.json')));
const gitFile=file=>execFileSync('git',['show',`3d969a5:${file}`],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
const legacyBuild=gitFile('scripts/build.mjs');
const legacyCore=[...new Set([...legacyBuild.matchAll(/['"](\.\/[^'"]*)['"]/g)].map(m=>m[1]).filter(f=>f==='./'||f==='./index.html'||files.has(f.replace(/^\.\//,''))))];
const legacyFiles=new Map([
 ['index.html',gitFile('index.html')],['src/app.js',gitFile('src/app.js')],
 ['sw.js',gitFile('sw.template.js').replace('__BUILD_ID__',OLD).replace('__CORE_FILES__',JSON.stringify(legacyCore))]
]);
// Hash-valid immutable fixtures: rewriting a build path also changes its digest.
const releases=new Map();
for(const build of [A,B]){
 const map=new Map();
 for(const [file,data] of files){const name=file.replaceAll(version.build,build);map.set(name,/\.(?:js|css|html|json|webmanifest)$/.test(file)?Buffer.from(data.toString().replaceAll(version.build,build)):data);}
 const fixtureCore=core.map(f=>f.replaceAll(version.build,build));
 const integrity={};
 for(const file of fixtureCore){const name=file==='./'?'index.html':file.slice(2);integrity[file]=crypto.createHash('sha256').update(map.get(name)).digest('hex');}
 let fixtureSW=map.get('sw.js').toString().replace(/const INTEGRITY=\{.*?\};/,`const INTEGRITY=${JSON.stringify(integrity)};`);
 if(process.env.UPDATE_DIAGNOSE_WAITING==='1')fixtureSW=fixtureSW.replace('await self.skipWaiting();','await self.skipWaiting();self.__qaSkipWaitingDone=true;')+`\nself.addEventListener('message',e=>{if(e.data==='QA_SKIP_WAITING')e.ports[0].postMessage({build:CACHE.slice(PREFIX.length),called:!!self.__qaSkipWaitingDone});});`;
 map.set('sw.js',Buffer.from(fixtureSW));
 releases.set(build,map);
}
const types={'.js':'application/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.mp3':'audio/mpeg','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),parts=decodeURIComponent(url.pathname).split('/').filter(Boolean),scope=scopes.get(parts.shift());
 if(!scope){res.writeHead(404);res.end();return;}
 if(scope.networkDown){res.destroy();return;}
 const isRoot=parts.length===0,file=parts.join('/')||'index.html';
 if(file.startsWith('speech/')){res.writeHead(503);res.end('ASR preparation excluded from lifecycle fixtures');return;}
 if(scope.fail===file){res.writeHead(503);res.end('Deliberate missing release asset');return;}
 let data;
 if(scope.build===OLD&&legacyFiles.has(file))data=Buffer.from(legacyFiles.get(file));
 else {
  const requestBuild=file.startsWith(`releases/${A}/`)?A:file.startsWith(`releases/${B}/`)?B:scope.build;
  data=releases.get(requestBuild)?.get(file)||files.get(file);
 }
 if(!data&&!file.includes('..')){try{data=fs.readFileSync(path.join(dist,file));}catch{}}
 if(!data){res.writeHead(404);res.end();return;}
 if(file==='index.html'&&scope.build!==OLD&&scope.staleIndex&&(scope.staleIndex!=='root'||isRoot))data=Buffer.from(data.toString('utf8').replaceAll(scope.build,A));
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','Content-Length':data.length});res.end(data);
});
let browser,origin,sequence=0;
async function fixture(options={}){
 const name=`case-${++sequence}`,release={build:options.legacy?OLD:A,fail:null};scopes.set(name,release);
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',permissions:['microphone']});
 await context.route('**/speech/**',route=>route.abort()); // Lifecycle guards, not ASR accuracy.
 context.setDefaultTimeout(15000);
 await context.addInitScript(()=>{
  sessionStorage.setItem('qa-document-loads',String(Number(sessionStorage.getItem('qa-document-loads')||0)+1));
  window.__qaAudio=[];window.__qaStreams=[];
  const NativeAudio=window.Audio;
  window.Audio=function(...args){const a=new NativeAudio(...args);window.__qaAudio.push(a);return a;};window.Audio.prototype=NativeAudio.prototype;
  const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async(...args)=>{const stream=await original(...args);window.__qaStreams.push(stream);return stream;};
 });
 if(options.pendingMic)await context.addInitScript(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=(...args)=>new Promise((resolve,reject)=>{window.__grantMic=()=>original(...args).then(resolve,reject);});});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url=`${origin}/${name}/`;await page.goto(url,{waitUntil:'networkidle'});await page.locator('#hero-start').waitFor();await controlled(page);
 return {context,page,release,url,errors};
}
async function controlled(page){await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);}
async function requestUpdate(page){await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});}
async function workerBuild(page){return page.evaluate(()=>new Promise(resolve=>{const ch=new MessageChannel(),timer=setTimeout(()=>resolve(null),2000);ch.port1.onmessage=e=>{clearTimeout(timer);ch.port1.close();resolve(e.data?.build);};navigator.serviceWorker.controller?.postMessage('GET_BUILD',[ch.port2]);}));}
async function active(page,build=B){
 // An explicit update may share the initial native check; the next automatic poll is 15 s.
 const deadline=Date.now()+30000;while(Date.now()<deadline){try{if(await workerBuild(page)===build)return;}catch{}await page.waitForTimeout(100);}
 const diagnostic=await page.evaluate(async target=>{const r=await navigator.serviceWorker.getRegistration();const name=`english-sprout-core-${target}`;const cache=await caches.open(name),keys=await cache.keys();return {controller:navigator.serviceWorker.controller?.scriptURL,installing:r.installing?.state,waiting:r.waiting?.state,active:r.active?.state,cacheEntries:keys.length,cacheNames:await caches.keys(),styles:keys.filter(k=>k.url.endsWith('.css')).map(k=>k.url)};},build).catch(e=>String(e));
 throw new Error(`Controller did not activate ${build}; ${JSON.stringify(diagnostic)}`);
}
async function updated(page,build=B){try{await page.waitForFunction(b=>document.querySelector('meta[name="app-build"]')?.content===b,build,{timeout:45000});}catch(error){const diagnostic=await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return {page:document.querySelector('meta[name="app-build"]')?.content,version:document.querySelector('[data-app-version]')?.textContent,installing:r.installing?.state,waiting:r.waiting?.state,active:r.active?.state,caches:await caches.keys(),hidden:document.hidden,body:document.body.dataset,history:history.state};});if(process.env.UPDATE_DIAGNOSE_WAITING==='1'){const integrity=JSON.parse(releases.get(build).get('sw.js').toString().match(/const INTEGRITY=(\{.*?\});/)[1]);diagnostic.completed=await page.evaluate(async({build,integrity})=>{const r=await navigator.serviceWorker.getRegistration(),cache=await caches.open(`english-sprout-core-${build}`);const skip=await new Promise(resolve=>{if(!r.waiting)return resolve(null);const ch=new MessageChannel();const timer=setTimeout(()=>resolve(null),3000);ch.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data);};r.waiting.postMessage('QA_SKIP_WAITING',[ch.port2]);});const bad=[];for(const [file,expected]of Object.entries(integrity)){const response=await cache.match(new URL(file,location.href));if(!response){bad.push(file);continue;}const digest=await crypto.subtle.digest('SHA-256',await response.arrayBuffer());const actual=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');if(actual!==expected)bad.push(file);}if(r.waiting)r.waiting.postMessage('ACTIVATE_UPDATE');return {skip,total:Object.keys(integrity).length,bad};},{build,integrity});await page.waitForTimeout(3000);diagnostic.afterCompatibilityActivation=await pageBuild(page);}throw new Error(`${error.message}; ${JSON.stringify(diagnostic)}`);}await page.locator('#app .header').waitFor();}
const loads=page=>page.evaluate(()=>Number(sessionStorage.getItem('qa-document-loads')));
const pageBuild=page=>page.locator('meta[name="app-build"]').getAttribute('content');
async function unchanged(page,count){await page.waitForTimeout(2400);assert.equal(await loads(page),count,`An unsafe page was automatically reloaded (document ${await pageBuild(page).catch(()=>null)}, controller ${await workerBuild(page)})`);}
async function enterSpeak(page){await page.locator('#hero-start').click();await page.locator('button[data-step="choose"]').click();await page.locator(`[data-choice="${lesson.answerIndex}"]`).click();await page.locator('#quiz-next').click();}
async function updateFixture(f){f.release.build=B;await requestUpdate(f.page);await active(f.page);}
async function scenario(name,options,run){
 if(process.env.UPDATE_TEST_FILTER&&!process.env.UPDATE_TEST_FILTER.split('|').some(filter=>name.includes(filter)))return;
 const f=await fixture(options);try{const evidence=await run(f);assert.deepEqual(f.errors,[]);checks.push({name,status:'PASS',evidence:evidence||null});console.log('PASS',name);}
 catch(error){checks.push({name,status:'FAIL',error:error.stack});console.log('FAIL',name,error.message);}
 finally{await f.context.close();}
}
(async()=>{
 fs.mkdirSync(output,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 await scenario('First install stays put; idle release applies once and keeps all local preferences',{},async f=>{
  const count=await loads(f.page);await unchanged(f.page,count);assert.equal(count,1);
  await f.page.evaluate(()=>{localStorage.setItem('english-sprout-voice-v1','pip');localStorage.setItem('english-sprout-course-rate-v1','0.9');localStorage.setItem('english-sprout-avatar-v1',JSON.stringify({version:1,kind:'preset',animal:'cat'}));localStorage.setItem('qa-private-sentinel','unchanged');});
  const before=await f.page.evaluate(()=>({...localStorage}));await updateFixture(f);await updated(f.page);assert.equal(await loads(f.page),count+1);assert.deepEqual(await f.page.evaluate(()=>({...localStorage})),before);await unchanged(f.page,count+1);
  assert.equal(await f.page.locator('#update-app').count(),0);return {firstInstallLoads:count,afterUpdateLoads:count+1};
 });
 await scenario('Permission pending, active microphone and recorded replay survive until saved completion',{pendingMic:true},async f=>{
  await enterSpeak(f.page);await f.page.locator('#record').click();await f.page.waitForFunction(()=>typeof window.__grantMic==='function');const count=await loads(f.page);await updateFixture(f);await unchanged(f.page,count);assert.equal(await f.page.locator('#record').isDisabled(),true);
  await f.page.evaluate(()=>window.__grantMic());await f.page.locator('#record.recording').waitFor();await unchanged(f.page,count);assert.equal(await f.page.evaluate(()=>__qaStreams[0].getAudioTracks()[0].readyState),'live');
  await f.page.locator('#record').click();await f.page.waitForFunction(()=>!document.querySelector('#replay-record').disabled);await unchanged(f.page,count);await f.page.locator('#replay-record').click();await f.page.waitForFunction(()=>__qaAudio.some(a=>a.src.startsWith('blob:')&&!a.paused));
  await f.page.locator('[data-rating="good"]').click();await f.page.locator('.completion').waitFor();await unchanged(f.page,count);await f.page.locator('#completion-next').click();if(await f.page.locator('#exit-session').count())await f.page.locator('#exit-session').click();await updated(f.page);assert.equal(await loads(f.page),count+1);const saved=await f.page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.ok(saved.cards['hello-01']);return {savedCards:Object.keys(saved.cards),recordingPreserved:true,completionPreserved:true};
 });
 await scenario('Parent draft remains until save and return to parent menu',{},async f=>{
  await f.page.locator('[data-go="parent"]').click();await f.page.locator('[data-parent-panel="habits"]').click();await f.page.locator('#nickname').fill('测试小芽');await f.page.locator('h1').click();const count=await loads(f.page);await updateFixture(f);await unchanged(f.page,count);assert.equal(await f.page.locator('#nickname').inputValue(),'测试小芽');
  await f.page.locator('#save-settings').click();await unchanged(f.page,count);await f.page.locator('[data-parent-back]').click();await updated(f.page);const saved=await f.page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.equal(saved.settings.nickname,'测试小芽');
 });
 await scenario('Open avatar dialog is preserved; closing it permits automatic update',{},async f=>{
  await f.page.locator('#avatar-open').click();const count=await loads(f.page);await updateFixture(f);await unchanged(f.page,count);await f.page.locator('#avatar-close').click();await updated(f.page);
 });
 await scenario('Multiple tabs update independently; active practice is not interrupted',{},async f=>{
  const busy=await f.context.newPage();busy.on('pageerror',e=>f.errors.push(e.message));await busy.goto(f.url,{waitUntil:'networkidle'});await busy.locator('#hero-start').click();const busyCount=await loads(busy);await updateFixture(f);await updated(f.page);await active(busy);await unchanged(busy,busyCount);await busy.locator('#exit-session').click();await updated(busy);assert.equal(await loads(busy),busyCount+1);
 });
 await scenario('Background tab waits until it becomes visible',{},async f=>{
  await f.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});const count=await loads(f.page);await updateFixture(f);await unchanged(f.page,count);
  await f.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await updated(f.page);
 });
 await scenario('Real looped audio keeps playing until an idle point',{},async f=>{
  await f.page.locator('[data-sound-settings]').click();await f.page.evaluate(()=>__qaAudio.forEach(a=>a.loop=true));await f.page.locator('[data-voice="aiden"]').click();await f.page.waitForFunction(()=>__qaAudio.some(a=>!a.paused));await f.page.evaluate(()=>__qaAudio.filter(a=>!a.paused).forEach(a=>a.loop=true));await f.page.locator('[data-close-sound]').click();const count=await loads(f.page);await updateFixture(f);await unchanged(f.page,count);assert.ok(await f.page.evaluate(()=>__qaAudio.some(a=>!a.paused)));await f.page.evaluate(()=>__qaAudio.forEach(a=>a.pause()));await updated(f.page);
 });
 await scenario('Failed release download leaves old app and offline cache usable',{},async f=>{
  const count=await loads(f.page);f.release.build=B;f.release.fail=`releases/${B}/src/illustrations.js`;await requestUpdate(f.page);await unchanged(f.page,count);assert.equal(await workerBuild(f.page),A);await f.context.setOffline(true);await f.page.reload({waitUntil:'domcontentloaded'});await f.page.locator('#hero-start').waitFor();assert.equal(await pageBuild(f.page),A);
  await f.context.setOffline(false);f.release.fail=null;await requestUpdate(f.page);await updated(f.page);return {offlineOldApp:true,recoveryAutomatic:true};
 });
 await scenario('A stale HTTP-200 HTML release cannot activate or create a reload loop',{},async f=>{
  const count=await loads(f.page);f.release.build=B;f.release.staleIndex='root';await requestUpdate(f.page);await unchanged(f.page,count);assert.equal(await workerBuild(f.page),A);
  f.release.staleIndex=false;await requestUpdate(f.page);await updated(f.page);await unchanged(f.page,count+1);return {rejectedMismatchedHTML:true,recoveryAutomatic:true};
 });
 await scenario('Network loss during update check neither reloads nor clears progress',{},async f=>{
  await enterSpeak(f.page);await f.page.locator('[data-rating="good"]').click();const saved=await f.page.evaluate(k=>localStorage.getItem(k),key),count=await loads(f.page);f.release.build=B;f.release.networkDown=true;await f.context.setOffline(true);await requestUpdate(f.page).catch(()=>{});await unchanged(f.page,count);assert.equal(await f.page.evaluate(k=>localStorage.getItem(k),key),saved);await f.page.reload({waitUntil:'domcontentloaded'});await f.page.locator('#hero-start').waitFor();assert.equal(await pageBuild(f.page),A);
  f.release.networkDown=false;await f.context.setOffline(false);await requestUpdate(f.page);await updated(f.page);assert.equal(await f.page.evaluate(k=>localStorage.getItem(k),key),saved);
 });
 await scenario('Unsaved in-memory learning after storage failure blocks automatic reload',{},async f=>{
  await enterSpeak(f.page);await f.page.evaluate(k=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(name,value){if(name===k)throw new DOMException('Full','QuotaExceededError');return original.call(this,name,value);};},key);await f.page.locator('[data-rating="good"]').click();await f.page.locator('#storage-warning:visible').waitFor();assert.equal(await f.page.locator('#completion-next').count(),0,'Failed saving must not show a successful completion');await f.page.locator('#exit-session').focus();await f.page.keyboard.press('Enter');const count=await loads(f.page);await updateFixture(f);await unchanged(f.page,count);assert.equal(await pageBuild(f.page),A);assert.equal(await f.page.evaluate(k=>localStorage.getItem(k),key),null);
 });
 await scenario('Real v1.4 page is not interrupted; after new worker activation, ordinary reload migrates without parent controls',{legacy:true},async f=>{
  await f.page.locator('#hero-start').click();const count=await loads(f.page);await updateFixture(f);await unchanged(f.page,count);await f.page.locator('.practice-main').waitFor();await f.page.reload({waitUntil:'domcontentloaded'});await updated(f.page);assert.equal(await loads(f.page),count+1);await unchanged(f.page,count+1);await f.page.locator('[data-go="parent"]').click();assert.equal(await f.page.locator('#update-app').count(),0);
 });
 const reportName=process.env.UPDATE_REPORT_NAME||(process.env.UPDATE_TEST_FILTER?'results-filtered':'results');assert.match(reportName,/^[a-zA-Z0-9_-]+$/);const reportFile=reportName+'.json';const report={version,mode:'real Edge service workers and app, isolated release server',filter:process.env.UPDATE_TEST_FILTER||null,checks,passed:checks.filter(c=>c.status==='PASS').length,total:checks.length};fs.writeFileSync(path.join(output,reportFile),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,report:path.join(output,reportFile)}));if(report.passed!==report.total)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(resolve=>server.close(resolve));});
