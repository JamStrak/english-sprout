/* Home entry regression: real built modules, isolated profiles, no learner data.
 * Run after npm run build:dev: node tests/xiaoya-home-entry-browser.cjs
 * This owns a temporary loopback server and never builds or changes the live app.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const out = path.join(root, 'test-results', 'xiaoya-home-entry-layout');
const filter = process.env.XIAOYA_TEST_FILTER ? new RegExp(process.env.XIAOYA_TEST_FILTER) : null;
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
const report = {checks:[],scope:{isolatedProfiles:true,microphoneUsed:false,realLearningRecordsChanged:false}};
let server, browser, origin;
async function serve() {
  server = http.createServer(async (req,res) => {
    try {
      let name = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(name.endsWith('/'))name+='index.html';
      const file=path.resolve(dist,'.'+name),relative=path.relative(dist,file);
      if(relative.startsWith('..')||path.isAbsolute(relative))return res.writeHead(403).end();
      const data=await fsp.readFile(file);
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function seed(page,{studied,gardenProgress}) {
  await page.evaluate(async({studied,gardenProgress})=>{
    const base=document.querySelector('script[type="module"][src]').src;
    const [challenge,practice,meadow,learning]=await Promise.all(['challenges.js','practice-plan.js','garden-meadow.js','learning.js'].map(file=>import(new URL(file,base))));
    const eventIds=challenge.CHALLENGE_UNITS[0].eventIds;
    let plan=practice.createPracticePlan(),garden=meadow.createMeadow();
    for(const [i,eventId] of eventIds.slice(0,studied).entries())plan=practice.recordPractice(plan,{roundId:`layout-study-${i}`,eventId,date:'2026-10-19',attemptId:null,mode:'new',rewardVariant:null});
    if(gardenProgress){
      garden=meadow.rewardRound(garden,{roundId:'layout-reward',eventId:eventIds[0],date:'2026-10-19'});
      garden=meadow.openSeedPack(garden,0);
      garden=meadow.plantSeed(garden,{x:.5,y:.5});
      for(let i=0;i<3;i++)garden=meadow.waterPlant(garden,garden.plants[0].id);
      if(meadow.nextAction(garden)!=='learn')throw Error('Fixture must show the garden shortcut, not the primary garden action');
    }
    localStorage.setItem(practice.PRACTICE_KEY,JSON.stringify(plan));
    localStorage.setItem(meadow.MEADOW_KEY,JSON.stringify(garden));
    localStorage.setItem(challenge.CHALLENGE_KEY,JSON.stringify(challenge.createChallenges()));
    localStorage.setItem(learning.STORAGE_KEY,JSON.stringify(learning.createState()));
    localStorage.setItem('xiaoya-english:preferences:v1',JSON.stringify({welcome:true,mic:false,guideStep:'done'}));
  },{studied,gardenProgress});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('main.home-view').waitFor();
}
const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
async function verify(page,{challenge,garden}) {
  assert.equal(await page.locator('.home-shortcuts [data-action="challenges"]').count(),challenge?1:0,'Challenge eligibility stays unchanged');
  assert.equal(await page.locator('.home-shortcuts [data-action="garden"]').count(),garden?1:0,'The garden remains a separate secondary entry');
  assert.equal(await page.locator('.home-view .primary-wrap').count(),1,'There is one main action');
  const layout=await page.evaluate(()=>{
    const rect=e=>{const r=e.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const controls=[...document.querySelectorAll('.home-shortcuts button')].map(e=>{
      const r=rect(e),points=[[.5,.5],[.3,.3],[.7,.7]];
      return{action:e.dataset.action,...r,hits:points.map(([x,y])=>document.elementFromPoint(r.left+r.width*x,r.top+r.height*y)?.closest('button')===e)};
    });
    return{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,controls,
      reward:rect(document.querySelector('.reward-preview')),primary:rect(document.querySelector('.primary-wrap'))};
  });
  assert(layout.scrollWidth<=layout.width+1,`Horizontal overflow: ${JSON.stringify(layout)}`);
  assert(layout.scrollHeight<=layout.height+1,`Home requires scrolling: ${JSON.stringify(layout)}`);
  for(const c of layout.controls){
    assert(c.width>=48&&c.height>=48,`Touch target too small: ${JSON.stringify(c)}`);
    assert(c.left>=0&&c.top>=0&&c.right<=layout.width&&c.bottom<=layout.height,`Entry is outside viewport: ${JSON.stringify(c)}`);
    assert(c.hits.every(Boolean),`Entry is covered: ${JSON.stringify(c)}`);
    assert(!overlap(c,layout.primary)&&!overlap(c,layout.reward),`Entry overlaps primary or reward: ${JSON.stringify(layout)}`);
  }
  if(layout.controls.length===2){
    const [a,b]=layout.controls;
    assert(b.left-a.right>=12,'Challenge and garden have a clear visible gap');
    assert(Math.abs((a.top+a.bottom)-(b.top+b.bottom))<2,'Secondary entries share the same row');
  }
  return layout;
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});origin=await serve();
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  const cases=[
    {name:'desktop-both',width:1440,height:900,studied:4,gardenProgress:true,challenge:true,garden:true},
    {name:'phone-both',width:390,height:844,studied:4,gardenProgress:true,challenge:true,garden:true},
    {name:'small-phone-both',width:320,height:568,studied:4,gardenProgress:true,challenge:true,garden:true},
    {name:'landscape-both',width:640,height:360,studied:4,gardenProgress:true,challenge:true,garden:true},
    {name:'garden-only-three-studied',width:390,height:844,studied:3,gardenProgress:true,challenge:false,garden:true},
    {name:'challenge-only',width:390,height:844,studied:4,gardenProgress:false,challenge:true,garden:false},
    {name:'fresh-single-primary',width:390,height:844,studied:0,gardenProgress:false,challenge:false,garden:false},
  ];
  for(const item of cases){
    if(filter&&!filter.test(item.name))continue;
    const context=await browser.newContext({viewport:{width:item.width,height:item.height},timezoneId:'Asia/Shanghai',serviceWorkers:'block',hasTouch:item.width<600,isMobile:item.width<600,reducedMotion:'reduce'});
    const errors=[];let page;
    try{
      await context.route('**/*',route=>new URL(route.request().url()).origin===origin&&!/\.(onnx|wasm)(\?|$)|\/speech-local\.js/.test(route.request().url())?route.continue():route.abort('blockedbyclient'));
      await context.addInitScript(()=>{if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{throw Error('No microphone allowed in layout acceptance');};});
      page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`${origin}/xiaoya/?garden=b`,{waitUntil:'domcontentloaded'});await page.locator('main.home-view').waitFor();
      await seed(page,item);
      const layout=await verify(page,item);
      report.build=await page.locator('meta[name="xiaoya-build"]').getAttribute('content');
      await page.screenshot({path:path.join(out,item.name+'.png'),animations:'disabled'});
      if(item.challenge){await page.locator('.home-shortcuts [data-action="challenges"]').click();await page.locator('[data-challenge-board]').waitFor();await page.locator('[data-action="home"]').first().click();await page.locator('main.home-view').waitFor();}
      if(item.garden){await page.locator('.home-shortcuts [data-action="garden"]').click();await page.locator('.meadow-view').waitFor();}
      assert.deepEqual(errors,[],'No page JavaScript errors');
      report.checks.push({name:item.name,status:'PASS',layout});console.log('PASS',item.name);
    }catch(error){report.checks.push({name:item.name,status:'FAIL',error:error.stack});console.error('FAIL',item.name,error.message);await page?.screenshot({path:path.join(out,item.name+'-failed.png'),animations:'disabled',fullPage:true}).catch(()=>{});}
    finally{await context.close();}
  }
})().catch(error=>{report.error=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{
  await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());
  await fsp.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  if(report.checks.some(c=>c.status==='FAIL'))process.exitCode=1;
});
