/* Isolated real-browser acceptance for shared GM/real-garden watering motion.
 * Build internal first. Never reads the user's browser profile or microphone. */
const assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),dist=path.resolve(root,process.env.XIAOYA_TEST_DIST||'dist'),out=path.join(root,'test-results','xiaoya-meadow-motion');
const key='xiaoya-english:growth-settings:v1',motion={duration:1100,sway:17,flex:90,bounce:22,crossfade:240,particles:100};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.mp3':'audio/mpeg','.svg':'image/svg+xml'};
let server,browser;
async function press(p,selector){const e=p.locator(selector).first();await e.waitFor({state:'visible'});await e.click();}
async function bridge(p,method,...args){return p.evaluate(async({method,args})=>{const base=document.querySelector('script[type="module"][src]').src;return (await import(new URL('experience.js',base))).gmBridge[method](...args);},{method,args});}
const snapshot=p=>p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])));
async function main(){
  await fsp.mkdir(out,{recursive:true});
  const version=JSON.parse(await fsp.readFile(path.join(dist,'xiaoya/version.json'),'utf8'));
  assert.equal(version.channel,'internal','Build internal before running meadow motion acceptance.');
  server=http.createServer(async(req,res)=>{try{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name.endsWith('/'))name+='index.html';const file=path.resolve(dist,'.'+name);if(path.relative(dist,file).startsWith('..'))throw Error('Invalid path');const stat=await fsp.stat(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':stat.size});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404).end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext({viewport:{width:1180,height:1000},serviceWorkers:'block',reducedMotion:'no-preference'}),p=await context.newPage();
  const errors=[];let microphone=0;p.on('pageerror',e=>errors.push(e.message));
  await context.exposeBinding('qaMic',()=>{microphone++;});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await context.addInitScript(({key,motion})=>{if(!localStorage.getItem('qa-meadow-motion')){localStorage.setItem('qa-meadow-motion','saved-child-record');localStorage.setItem(key,JSON.stringify({motion}));localStorage.setItem('xiaoya-english:preferences:v1',JSON.stringify({welcome:true,guideStep:'done',gardenMusic:{volume:0,enabled:false}}));}if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{void window.qaMic();throw Error('Unexpected microphone request');};},{key,motion});
  p.setDefaultTimeout(20000);
  await p.goto(`${origin}/xiaoya/?garden=b`,{waitUntil:'domcontentloaded'});await p.locator('main.home-view').waitFor();
  const welcome=p.locator('[data-action="open-welcome-gift"]');if(await welcome.isVisible()){await welcome.click();await p.locator('.welcome-gift-overlay[open]').waitFor({state:'hidden',timeout:12000});}
  const saved=await snapshot(p);
  await p.goto(`${origin}/xiaoya/?garden=b&gm=test&gmSupply=1`,{waitUntil:'domcontentloaded'});await p.locator('.seed-shop-view').waitFor();
  await press(p,'[data-action="shop-pack"]');await press(p,'[data-mystery-bag="0"]');
  await p.locator('.blindbox-view[data-blindbox-phase="revealed"]').waitFor();await press(p,'[data-action="blindbox-plant"]');
  await p.locator('.meadow-view[data-tool="seed"]').waitFor();
  const field=await p.locator('[data-meadow-field]').boundingBox();await p.mouse.click(field.x+field.width*.5,field.y+field.height*.7);
  await p.locator('[data-meadow-plant][data-waterings="0"]').waitFor();await press(p,'[data-action="meadow-can"]');
  await p.evaluate(()=>{
    window.qaMeadowFrames=[];window.qaMeadowCapture=true;
    function frame(){if(!window.qaMeadowCapture)return;const e=document.querySelector('[data-meadow-plant]'),b=e?.querySelector('[data-plant-body]');if(e&&b){const svg=b.ownerSVGElement,m=b.getCTM(),s=svg.getCTM(),a=new DOMPoint(80,164).matrixTransform(m),z=new DOMPoint(80,164).matrixTransform(s);window.qaMeadowFrames.push({time:performance.now(),phase:e.dataset.meadowMotion,duration:e.dataset.meadowMotionDuration,sway:e.dataset.meadowMotionSway,rootError:Math.hypot(a.x-z.x,a.y-z.y),opacity:Number(getComputedStyle(b).opacity),angle:Math.atan2(m.b,m.a),outgoing:!!svg.querySelector('[data-meadow-motion-outgoing]'),effects:!!svg.querySelector('[data-meadow-motion-effects]')});}requestAnimationFrame(frame);}requestAnimationFrame(frame);
  });
  await press(p,'[data-water-plant]');await p.locator('[data-meadow-plant][data-waterings="1"]').waitFor();
  await p.waitForFunction(()=>document.querySelector('[data-meadow-plant]')?.dataset.meadowMotion==='sway');
  await p.waitForFunction(()=>!document.querySelector('[data-meadow-plant]')?.dataset.meadowMotion);
  const frames=await p.evaluate(()=>{window.qaMeadowCapture=false;return window.qaMeadowFrames.filter(f=>f.phase&&f.phase!=='loading');});
  assert(frames.length>10);assert(frames.every(f=>f.duration==='1100'&&f.sway==='17'),'Real watering ignored saved GM tuning');
  assert(Math.max(...frames.map(f=>Math.abs(f.angle)))>.03,'No actual sway');assert(Math.max(...frames.map(f=>f.rootError))<.1,'Plant root drifted');
  assert(frames.some(f=>f.opacity>.05&&f.opacity<.95&&f.outgoing),'Missing in-place crossfade');
  assert(frames.some(f=>f.effects),'Missing water feedback');assert(frames.at(-1).time-frames[0].time>900,'Saved duration not applied');
  assert.equal(await p.locator('[data-water]').first().textContent(),'∞');assert.deepEqual(await snapshot(p),saved);
  // A changed setting must be loaded on the very next real pour, without reload.
  await p.evaluate(async key=>{const base=document.querySelector('script[type="module"][src]').src,{appStorage}=await import(new URL('runtime.js',base));const value=JSON.parse(appStorage.getItem(key));value.motion={...value.motion,duration:2200,sway:0};appStorage.setItem(key,JSON.stringify(value));},key);
  await press(p,'[data-water-plant]');await p.waitForFunction(()=>document.querySelector('[data-meadow-plant]')?.dataset.meadowMotion==='sway');
  assert.equal(await p.locator('[data-meadow-plant]').getAttribute('data-meadow-motion-duration'),'2200');assert.equal(await p.locator('[data-meadow-plant]').getAttribute('data-meadow-motion-sway'),'0');
  await bridge(p,'navigate','home');await p.locator('main.home-view').waitFor();assert.equal(await p.locator('[data-meadow-motion-effects],[data-meadow-motion-outgoing]').count(),0);
  // All shipped identities, including both giant and challenge flowers, share
  // the exact adapter and retain their own painted next-stage art.
  const all=await p.evaluate(async()=>{
    const base=document.querySelector('script[type="module"][src]').src;
    const [{createMeadowMotion},{meadowPlantArt},{ALL_FLOWERS},{installPaperArt}]=await Promise.all(['meadow-motion.js','meadow-art.js','garden-meadow.js','paper-art.js'].map(n=>import(new URL(n,base))));
    const host=document.createElement('section');host.style.cssText='position:fixed;left:0;top:0;width:160px;height:180px;z-index:999999';document.body.append(host);
    const store={getItem:()=>JSON.stringify({motion:{duration:700,sway:18,flex:100,bounce:24,crossfade:120,particles:100}}),setItem(){}};
    const engine=createMeadowMotion({storage:store}),dispose=installPaperArt(host),results=[];
    for(const flower of ALL_FLOWERS){
      const make=water=>{const target=document.createElement('div');target.innerHTML=meadowPlantArt(flower,water);host.replaceChildren(target);return target;};
      let target=make(flower.waterNeeded-1);await Promise.all([...target.querySelectorAll('image')].map(async e=>{const img=new Image();img.src=new URL(e.getAttribute('href'),document.baseURI);await img.decode();}));
      const before=engine.capture(target);target=make(flower.waterNeeded);const pending=engine.play(target,before);await new Promise(resolve=>setTimeout(resolve,350));
      const body=target.querySelector('[data-plant-body]'),svg=body.ownerSVGElement,a=new DOMPoint(80,164).matrixTransform(body.getCTM()),b=new DOMPoint(80,164).matrixTransform(svg.getCTM());
      const live={id:flower.id,phase:target.dataset.meadowMotion,rootError:Math.hypot(a.x-b.x,a.y-b.y),crossfade:target.querySelectorAll('[data-meadow-motion-outgoing]').length};
      live.finished=await pending;live.src=target.querySelector('image[data-paper-image]').getAttribute('href');live.clean=!target.querySelector('[data-meadow-motion-effects],[data-meadow-motion-outgoing]');results.push(live);
    }
    engine.cancel();dispose();host.remove();return results;
  });
  assert.equal(all.length,14);for(const item of all){assert(item.finished&&item.clean,item.id);assert(item.rootError<.1,item.id);assert.equal(item.crossfade,1,item.id);assert(item.src.endsWith(`/flowers/${item.id}.webp`),item.id);}
  await press(p,'[data-gm-action="exit"]');await p.locator('main.home-view').waitFor();assert.deepEqual(await snapshot(p),saved);assert.deepEqual(errors,[]);assert.equal(microphone,0);
  const report={status:'PASS',build:version.build,realGardenFrames:frames.length,maxRootError:Math.max(...frames.map(f=>f.rootError)),savedTuningApplied:true,nextPourReloadsSettings:true,cancelOnNavigation:true,allFlowers:all,realRecordsUnchanged:true};
  await fsp.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await context.close();
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());});
