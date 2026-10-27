/* Disposable Edge profiles: actual built economic controls, backups and sandbox isolation. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24756').origin;
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname));
const out=path.resolve(__dirname,'../test-results/xiaoya-v024-economy');
const key='xiaoya-english:economy-settings:v1',results=[];
let browser;
const stored=p=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),key);
const player=p=>p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>/^xiaoya-english:(state|meadow|practice-plan|challenges|voice):/.test(k)).sort().map(k=>[k,localStorage.getItem(k)])));
async function open(p){await p.locator('#xiaoya-gm [data-gm-action="open"]').click();await p.locator('[data-gm-tab="economy"]').click();await p.locator('[data-economy-field="packPrice"]').waitFor();}
async function set(p,values){for(const[name,value]of Object.entries(values))await p.locator(`[data-economy-field="${name}"]`).fill(String(value));}
const action=(p,name)=>p.locator(`[data-economy-action="${name}"]`).click();
async function fixture(width=1200){
  const c=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',acceptDownloads:true,reducedMotion:'reduce'}),p=await c.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(20000);
  await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await c.addInitScript(()=>{if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{throw Error('No physical microphone allowed');};});
  await p.goto(origin+'/xiaoya/');await p.locator('main.home-view').waitFor();
  const gift=p.locator('[data-action="open-welcome-gift"]');if(await gift.isVisible()){await gift.click();await p.locator('.welcome-gift-overlay[open]').waitFor({state:'hidden',timeout:15000});}
  await open(p);return{p,c,errors};
}
async function test(name,fn,width){let f;try{f=await fixture(width);await fn(f.p);assert.deepEqual(f.errors,[]);results.push({name,status:'PASS'});console.log('PASS',name);}catch(e){results.push({name,status:'FAIL',error:e.stack});console.error('FAIL',name,e.stack);await f?.p.screenshot({path:path.join(out,`failure-${results.length}.png`),fullPage:true}).catch(()=>{});}finally{await f?.c.close();}}
async function run(){
  await test('Saved controls change actual rewards, prices and new seed growth; old seeds keep snapshots',async p=>{
    assert.equal(await p.locator('[data-economy-field]').count(),11);
    assert.equal(await p.locator('[data-economy-flower] option').count(),35);
    await set(p,{shellReward:3,waterReward:4,starterShellReward:12,starterWaterReward:3,packPrice:7,challengeShells:9,challengeWater:11,normalWaterNeeded:6,giantWaterNeeded:10,giantChance:100,giantScale:2.5});
    await action(p,'save');assert.match(await p.locator('[data-economy-status]').textContent(),/已保存/);
    const result=await p.evaluate(async()=>{
      const base=document.querySelector('script[type="module"][src]').src;
      const m=await import(new URL('garden-meadow.js',base));
      let garden=m.rewardRound(m.createMeadow(),{roundId:'qa-first',eventId:'hello-morning',date:'2026-10-21'});
      garden=m.openSeedPack(garden,0,0);const acquired=garden.pendingSeed;
      return{garden,acquired,flower:m.flowerForSeed(acquired)};
    });
    assert.equal(result.garden.shells,5);assert.equal(result.garden.water,3);
    assert.equal(result.acquired.growth.giant,true);assert.equal(result.acquired.growth.waterNeeded,10);assert.equal(result.acquired.growth.scale,2.5);
    await set(p,{giantChance:0,normalWaterNeeded:7,giantScale:3});await action(p,'save');
    const next=await p.evaluate(async old=>{const base=document.querySelector('script[type="module"][src]').src;const m=await import(new URL('garden-meadow.js',base));let garden=m.rewardRound(m.createMeadow(),{roundId:'qa-second',eventId:'hello-morning',date:'2026-10-21'});garden=m.openSeedPack(garden,0,0);return{newSeed:garden.pendingSeed,oldFlower:m.flowerForSeed(old)};},result.acquired);
    assert.equal(next.newSeed.growth.giant,false);assert.equal(next.newSeed.growth.waterNeeded,7);assert.equal(next.oldFlower.waterNeeded,10);assert.equal(next.oldFlower.scale,2.5);
    await p.keyboard.press('Escape');await p.reload();await p.locator('main.home-view').waitFor();await open(p);
    assert.equal(await p.locator('[data-economy-field="packPrice"]').inputValue(),'7');
  });
  await test('Normal and giant preview uses real images, one root line and the chosen size ratio',async p=>{
    await p.locator('[data-economy-flower]').selectOption({index:14});await set(p,{giantScale:2.5});await action(p,'bloom');
    const geometry=await p.locator('[data-economy-comparison]').evaluate(async el=>{
      const images=[...el.querySelectorAll('image')];await Promise.all(images.map(async e=>{const img=new Image();img.src=e.getAttribute('href');await img.decode();}));
      return['normal','giant'].map(kind=>{const wrapper=el.querySelector(`[data-economy-plant="${kind}"]`),r=wrapper.getBoundingClientRect();return{width:r.width,root:r.top+r.height*164/180,href:wrapper.querySelector('image')?.getAttribute('href')};});
    });
    assert(Math.abs(geometry[1].width/geometry[0].width-2.5)<.01);assert(Math.abs(geometry[0].root-geometry[1].root)<.1);assert(geometry.every(x=>x.href?.includes('growth/v09/flowers/')));
    await p.screenshot({path:path.join(out,'normal-giant-comparison.png'),fullPage:true});
    await action(p,'reset');for(let i=0;i<10;i++)await action(p,'water-giant');assert.match(await p.locator('[data-economy-water-count="giant"]').textContent(),/10 \/ 10/);
  });
  await test('Export, confirmed restore and invalid backup rejection leave child records untouched',async p=>{
    const before=await player(p);await set(p,{shellReward:3,packPrice:7,giantScale:2.75});await action(p,'save');
    const downloadPromise=p.waitForEvent('download');await action(p,'export');const download=await downloadPromise,file=path.join(out,'saved-tuning.json');await download.saveAs(file);
    const backup=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(backup.schema,'xiaoya-tuning-backup/v1');assert.deepEqual(Object.keys(backup.settings).sort(),['economy','gardenMusic','growth','sounds']);assert.equal(backup.settings.economy.packPrice,7);
    await set(p,{shellReward:8,packPrice:11});await action(p,'save');
    await p.locator('[data-economy-import]').setInputFiles(file);await p.locator('[data-economy-import-review]').waitFor({state:'visible'});assert.equal((await stored(p)).packPrice,11,'Picking a file does not restore it silently');
    await action(p,'restore');assert.equal((await stored(p)).packPrice,7);assert.equal((await stored(p)).shellReward,3);
    const saved=await stored(p);backup.settings.economy.giantChance=4;
    await p.locator('[data-economy-import]').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    await p.waitForFunction(()=>document.querySelector('[data-economy-status]').textContent.includes('未导入'));assert.deepEqual(await stored(p),saved);assert.deepEqual(await player(p),before);
  });
  await test('Sandbox inherits tuning but editing there never overwrites real settings or wallet',async p=>{
    await set(p,{shellReward:3,packPrice:7});await action(p,'save');const before=await player(p),formal=await stored(p);
    await p.goto(origin+'/xiaoya/?gm=test&gmPage=home');await p.locator('main.home-view').waitFor();await open(p);
    assert.equal(await p.locator('[data-economy-field="packPrice"]').inputValue(),'7');await set(p,{shellReward:99,packPrice:1});await action(p,'save');
    const values=await p.evaluate(async()=>{const base=document.querySelector('script[type="module"][src]').src;return(await import(new URL('economy-settings.js',base))).getEconomySettings();});assert.equal(values.shellReward,99);assert.deepEqual(await stored(p),formal);
    await p.keyboard.press('Escape');await p.locator('[data-gm-action="exit"]').click();await p.locator('main.home-view').waitFor();await open(p);
    assert.equal(await p.locator('[data-economy-field="shellReward"]').inputValue(),'3');assert.deepEqual(await stored(p),formal);assert.deepEqual(await player(p),before);
  });
  await test('All numeric controls and backup actions fit a narrow GM panel',async p=>{
    const bounds=await p.locator('#gm-workbench').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth,width:innerWidth}));assert(bounds.scroll<=bounds.client+1,JSON.stringify(bounds));
    await set(p,{giantScale:4});await action(p,'bloom');await p.locator('[data-economy-comparison]').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,'economy-320.png'),fullPage:true});
    await p.locator('[data-economy-action="export"]').scrollIntoViewIfNeeded();assert(await p.locator('[data-economy-action="export"]').isVisible());
  },320);
}
(async()=>{await fs.mkdir(out,{recursive:true});browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});await run();await browser.close();browser=null;await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(`${results.filter(x=>x.status==='PASS').length}/${results.length} passed`);if(results.some(x=>x.status==='FAIL'))process.exitCode=1;})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});
