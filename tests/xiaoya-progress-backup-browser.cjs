// Public build integration with disposable, in-memory Edge browser contexts.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const origin=new URL(process.env.TEST_URL||'http://127.0.0.1:24899');
if(!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))throw Error('Isolated loopback server required');
const key='xiaoya-english:meadow:v1';
async function setup(browser){
 const ctx=await browser.newContext({acceptDownloads:true,serviceWorkers:'block',viewport:{width:900,height:900}});const page=await ctx.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await ctx.route('**/*',route=>new URL(route.request().url()).origin===origin.origin?route.continue():route.abort());
 await page.goto(origin.origin+'/xiaoya/');await page.locator('main.home-view').waitFor();
 const gift=page.locator('[data-action="open-welcome-gift"]');if(await gift.isVisible()){await gift.click();await page.locator('.welcome-gift-overlay[open]').waitFor({state:'hidden',timeout:15000});}
 return {ctx,page,errors};
}
async function parent(p){await p.locator('[data-action="parent"]').first().click();const input=p.locator('#parent-answer');if(await input.count()){const numbers=(await p.locator('label[for="parent-answer"]').innerText()).match(/\d+/g).map(Number);await input.fill(String(numbers[0]+numbers[1]));await p.locator('[data-action="gate-submit"]').click();}await p.locator('.parent-view').waitFor();}
async function wallet(p,s,w){await p.locator('#parent-shells').fill(String(s));await p.locator('#parent-water').fill(String(w));await p.locator('[data-action="parent-wallet-save"]').click();}
async function state(p){return p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);}
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});let a,c;try{
 a=await setup(b);await parent(a.page);await wallet(a.page,32,19);await a.page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).shells===32,key);assert.equal((await state(a.page)).water,19);
 await wallet(a.page,-1,12);assert.equal((await state(a.page)).shells,32);assert.equal((await state(a.page)).water,19);
 await a.page.reload();await a.page.locator('main.home-view').waitFor();await parent(a.page);assert.equal(await a.page.locator('#parent-shells').inputValue(),'32');assert.equal(await a.page.locator('#parent-water').inputValue(),'19');
 const dl=a.page.waitForEvent('download');await a.page.locator('[data-action="backup-download"]').click();const download=await dl;const file=await download.path();const bytes=fs.readFileSync(file);assert.equal(JSON.parse(bytes).product,'xiaoya-english-progress-backup');
 c=await setup(b);await parent(c.page);const before=await state(c.page);
 await c.page.locator('#progress-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{broken')});await c.page.locator('.modal-error').waitFor();assert.deepEqual(await state(c.page),before);await c.page.locator('.modal-error [data-action="close"]').last().click();
 await c.page.locator('#progress-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:bytes});await c.page.locator('.modal-restore-preview').waitFor();assert.match(await c.page.locator('.modal-restore-preview').innerText(),/贝壳 32/);await c.page.locator('[data-action="backup-confirm"]').click();await c.page.locator('main.home-view').waitFor();await c.page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).shells===32,key);assert.equal((await state(c.page)).water,19);
 assert.deepEqual(a.errors,[]);assert.deepEqual(c.errors,[]);console.log('PASS public parent wallet, reload, invalid input, backup download, invalid import and cross-context restore');
 }finally{await a?.ctx.close();await c?.ctx.close();await b.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
