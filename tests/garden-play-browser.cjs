/* Real app touch/layout regression checks in isolated browser contexts. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const origin=process.env.TEST_URL||'http://127.0.0.1:24736';
const key='english-sprout-state-v1';
const output=path.join(root,'test-results','garden-play');
fs.mkdirSync(output,{recursive:true});
(async()=>{
  const learning=await import(pathToFileURL(path.join(root,'src/learning.js')).href);
  const garden=await import(pathToFileURL(path.join(root,'src/garden.js')).href);
  const today='2026-10-12';
  let initial=learning.recordResult(learning.createState(today),'hello-01','good',today,{isNew:true});
  for(let i=0;i<6;i++)initial=garden.recordGardenPractice(initial,{lessonId:'hello-01',attemptId:'touch-layout-'+i,assessment:'practice-effort'},today);
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const checks=[];
  async function layout(page,label){
    const data=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,buttons:[...document.querySelectorAll('button')].filter(el=>el.offsetWidth&&el.offsetHeight&&!el.closest('dialog')).map(el=>({text:el.textContent.trim(),...el.getBoundingClientRect().toJSON()})),picture:document.querySelector('[data-garden-drop],.scene-picture')?.getBoundingClientRect().toJSON()}));
    assert.ok(data.scrollWidth<=data.width+1,`${label} horizontal: ${JSON.stringify(data)}`);
    assert.ok(data.scrollHeight<=data.height+1,`${label} vertical: ${JSON.stringify(data)}`);
    const outside=data.buttons.filter(b=>b.top< -1||b.left< -1||b.right>data.width+1||b.bottom>data.height+1);
    assert.deepEqual(outside,[],`${label} actions must fit`);
    assert.ok(data.picture.height>=50,`${label} picture must remain tappable`);
    checks.push({name:label,geometry:data});
  }
  async function touchDrag(page,context,type){
    const a=await page.locator(`[data-garden-tool="${type}"]`).boundingBox(),b=await page.locator('[data-garden-drop]').boundingBox();
    const start={x:a.x+a.width/2,y:a.y+a.height/2},end={x:b.x+b.width/2,y:b.y+b.height/2};
    const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
    for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*i/6,y:start.y+(end.y-start.y)*i/6}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  }
  try{
    for(const viewport of [{width:320,height:568},{width:360,height:640},{width:390,height:844},{width:768,height:1024},{width:1024,height:768}]){
      const size=`${viewport.width}x${viewport.height}`;
      const context=await browser.newContext({viewport,hasTouch:true,serviceWorkers:'block',timezoneId:'Asia/Shanghai'});
      const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
      try{
        await page.clock.setFixedTime(new Date('2026-10-12T10:00:00+08:00'));
        await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(initial));},{key,initial});
        await page.route('**/speech/**',route=>route.abort());
        await page.goto(origin+'/#garden');await page.locator('[data-garden-tool="plant"]').waitFor();
        await layout(page,size+' empty garden');await touchDrag(page,context,'plant');
        assert.equal(await page.locator('[data-garden-tool="plant"]').isDisabled(),true);
        for(let n=1;n<=2;n++){await touchDrag(page,context,'water');assert.equal(await page.locator('.garden-stage').getAttribute('data-growth'),String(n));}
        await layout(page,size+' growing garden');await page.screenshot({path:path.join(output,size+'-garden.png')});
        const afterWater=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
        assert.equal(afterWater.garden.actions.length,initial.garden.actions.length+3);
        await page.locator('[data-garden-practice]').click();await layout(page,size+' practice listen');
        await page.locator('[data-step="speak"]').click();await layout(page,size+' practice speak');
        await page.locator('[data-garden-effort]').click();await layout(page,size+' encouragement reward');await page.screenshot({path:path.join(output,size+'-practice.png')});
        await page.locator('[data-garden-claim]').click();await page.locator('.garden-stage').waitFor();
        const afterPractice=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
        assert.deepEqual(afterPractice.cards,initial.cards);assert.deepEqual(afterPractice.days,initial.days);
        assert.equal(afterPractice.garden.actions.length,afterWater.garden.actions.length+1);
        assert.equal(garden.getGarden(afterPractice,today).inventory.water,garden.getGarden(afterWater,today).inventory.water+2);
        await page.reload();await page.locator('.garden-stage').waitFor();assert.equal(await page.locator('.garden-stage').getAttribute('data-growth'),'2');
        assert.deepEqual(errors,[]);console.log('PASS '+size+' touch plant, repeated water, independent practice, persistence and five layouts');
      }finally{await context.close();}
    }
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({checks},null,2));
    console.log(checks.length+' real garden/practice layout checks passed');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
