/* Isolated interaction checks: no changes to a child's saved learning state. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = path.resolve(__dirname, '..');
const fixture = `<!doctype html><html lang="zh-CN" data-skin="sunny"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Garden interaction test</title>
<link rel="stylesheet" href="/src/styles.css"><link rel="stylesheet" href="/src/focus.css"><link rel="stylesheet" href="/src/skins.css"><link rel="stylesheet" href="/src/garden-play.css">
<body><div id="app"><header class="header">英语小芽</header><main id="main"><section class="focus-screen focus-garden garden-play">
<div class="screen-heading"><h1>我的小花园</h1><button>看图鉴</button></div>
<div class="plot-tabs"><button>第1块地</button><button>第2块地</button><button>第3块地</button></div>
<article class="garden-plot garden-stage"><h2>向日葵</h2><button class="garden-drop" data-garden-drop aria-label="花田"><svg class="garden-plant-picture" viewBox="0 0 150 165"><path d="M75 142V60" stroke="green" stroke-width="6"/><circle cx="75" cy="55" r="30" fill="gold"/><ellipse cx="75" cy="145" rx="57" ry="12" fill="#d8c2a0"/></svg></button><div class="garden-growth"><progress value="4" max="12"></progress><span>4 / 12</span></div></article>
<p class="garden-instruction" data-garden-instruction aria-live="polite">拖动小工具，照顾你的花田</p><div class="garden-tool-tray">
${[['plant','种子','🌰'],['water','水壶','💧'],['fertilize','营养','✨']].map(([type,label,art])=>`<button class="garden-tool" data-garden-tool="${type}"><span class="garden-tool-art">${art}</span><strong>10</strong><span>${label}</span></button>`).join('')}
</div><button class="primary" data-garden-practice>练一句，领两滴水</button></section></main><nav class="bottom-nav"><button>今天</button><button>句子</button><button>花园</button></nav></div>
<script type="module">import {bindGardenInteraction} from '/src/garden-interaction.js'; window.actions=[];window.bind=()=>window.dispose=bindGardenInteraction(document.querySelector('.garden-play'),{onAction:(type,detail)=>window.actions.push({type,method:detail.method})});window.bind();window.ready=true;</script></body></html>`;

(async () => {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/') { res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(fixture); return; }
      if (!/^\/src\/[\w-]+\.(css|js)$/.test(req.url)) { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':'text/css');
      res.end(await fs.readFile(path.join(root,req.url)));
    } catch (error) { res.writeHead(500); res.end(String(error)); }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const results=[];
  async function test(name, callback) {
    const context=await browser.newContext({viewport:{width:320,height:568},hasTouch:true});
    const page=await context.newPage();
    try { await page.goto(origin); await page.waitForFunction(()=>window.ready); await callback(page,context); results.push(name); console.log(`PASS ${name}`); }
    finally { await context.close(); }
  }
  const tool=type=>`[data-garden-tool="${type}"]`;
  const count=page=>page.evaluate(()=>window.actions.length);
  async function centers(page,type='water') {
    const a=await page.locator(tool(type)).boundingBox(),b=await page.locator('[data-garden-drop]').boundingBox();
    return {start:{x:a.x+a.width/2,y:a.y+a.height/2},end:{x:b.x+b.width/2,y:b.y+b.height/2}};
  }
  async function drag(page,endOverride) {
    const {start,end}=await centers(page); await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move((endOverride||end).x,(endOverride||end).y,{steps:5});return {start,end};
  }
  try {
    await test('tool tap then large picture tap commits once',async page=>{
      await page.locator(tool('water')).click();assert.equal(await count(page),0);
      assert.equal(await page.locator(tool('water')).getAttribute('aria-pressed'),'true');
      await page.locator('[data-garden-drop]').click();await page.locator('[data-garden-drop]').click();
      assert.deepEqual(await page.evaluate(()=>window.actions),[{type:'water',method:'tap'}]);
    });
    await test('mouse drag, release and duplicate pointerup spend once',async page=>{
      const {end}=await drag(page);assert.equal(await page.locator('.garden-drag-ghost').count(),1);
      assert.ok(await page.locator('.garden-play').evaluate(el=>el.classList.contains('garden-over-target')));
      await page.mouse.up();await page.evaluate(({x,y})=>window.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,clientX:x,clientY:y})),end);
      assert.deepEqual(await page.evaluate(()=>window.actions),[{type:'water',method:'drag'}]);assert.equal(await page.locator('.garden-drag-ghost').count(),0);
    });
    await test('real touch drag stays on screen and commits once',async(page,context)=>{
      const {start,end}=await centers(page,'plant'),cdp=await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
      for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*i/5,y:start.y+(end.y-start.y)*i/5}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      assert.deepEqual(await page.evaluate(()=>window.actions),[{type:'plant',method:'drag'}]);assert.equal(await page.evaluate(()=>window.scrollY),0);
    });
    await test('outside drop, cancel and blur do not spend',async page=>{
      await drag(page,{x:2,y:2});await page.mouse.up();assert.equal(await count(page),0);
      await drag(page);await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1})));await page.mouse.up();assert.equal(await count(page),0);assert.equal(await page.locator('.garden-drag-ghost').count(),0);
      await drag(page);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();assert.equal(await count(page),0);
    });
    await test('disabled tool and disabled drop cannot commit',async page=>{
      await page.locator(tool('water')).evaluate(el=>el.disabled=true);
      await page.locator(tool('water')).dispatchEvent('click');await page.locator('[data-garden-drop]').click();assert.equal(await count(page),0);
      await page.locator(tool('plant')).click();await page.locator('[data-garden-drop]').evaluate(el=>el.disabled=true);await page.locator('[data-garden-drop]').dispatchEvent('click');assert.equal(await count(page),0);
    });
    await test('tool disabled during drag cancels safely',async page=>{
      const {end}=await drag(page);await page.locator(tool('water')).evaluate(el=>el.disabled=true);await page.mouse.move(end.x+1,end.y+1);await page.mouse.up();assert.equal(await count(page),0);assert.equal(await page.locator('.garden-drag-ghost').count(),0);
    });
    await test('keyboard selection, escape and completion',async page=>{
      await page.locator(tool('fertilize')).focus();await page.keyboard.press('Enter');await page.keyboard.press('Escape');await page.locator('[data-garden-drop]').focus();await page.keyboard.press('Enter');assert.equal(await count(page),0);
      await page.locator(tool('fertilize')).focus();await page.keyboard.press('Space');await page.locator('[data-garden-drop]').focus();await page.keyboard.press('Enter');assert.deepEqual(await page.evaluate(()=>window.actions),[{type:'fertilize',method:'tap'}]);
    });
    await test('second finger cannot replace or commit primary drag',async page=>{
      const {start,end}=await centers(page);
      await page.evaluate(({start,end})=>{
        const el=document.querySelector('[data-garden-tool="water"]');
        const fire=(node,type,id,x,y,primary)=>node.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',clientX:x,clientY:y,isPrimary:primary}));
        fire(el,'pointerdown',80,start.x,start.y,true);fire(window,'pointermove',80,end.x,end.y,true);
        fire(document.querySelector('[data-garden-tool="plant"]'),'pointerdown',81,start.x,start.y,false);fire(window,'pointerup',81,end.x,end.y,false);fire(window,'pointerup',80,end.x,end.y,true);
      },{start,end});assert.deepEqual(await page.evaluate(()=>window.actions),[{type:'water',method:'drag'}]);
    });
    await test('cleanup removes ghost and listeners; rebind stays single',async page=>{
      await drag(page);await page.evaluate(()=>window.dispose());await page.mouse.up();assert.equal(await count(page),0);assert.equal(await page.locator('.garden-drag-ghost').count(),0);
      await page.evaluate(()=>{window.bind();window.bind();});await page.locator(tool('plant')).click();await page.locator('[data-garden-drop]').click();assert.equal(await count(page),1);
    });
    await test('320 phone and 768 iPad keep large target and tools visible',async page=>{
      for(const viewport of [{width:320,height:568},{width:768,height:1024}]){
        await page.setViewportSize(viewport);
        const geometry=await page.evaluate(()=>({height:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth,drop:document.querySelector('[data-garden-drop]').getBoundingClientRect().toJSON(),tools:[...document.querySelectorAll('[data-garden-tool], [data-garden-practice]')].map(el=>el.getBoundingClientRect().toJSON())}));
        assert.ok(geometry.height<=viewport.height+1,JSON.stringify({viewport,geometry}));assert.ok(geometry.width<=viewport.width+1);assert.ok(geometry.drop.height>=100);assert.ok(geometry.tools.every(box=>box.height>=44&&box.bottom<=viewport.height));
      }
    });
    console.log(`${results.length} garden interaction checks passed`);
  } finally { await browser.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
