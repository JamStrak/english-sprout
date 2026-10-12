/* Single-screen geometry QA: measures real content and coordinate taps, never scrolls controls into view. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),origin=process.env.TEST_URL||'http://127.0.0.1:24736';
const out=path.join(root,'test-results',process.env.FOCUS_REPORT_NAME||'focus-mobile');fs.mkdirSync(out,{recursive:true});
const curriculum=JSON.parse(fs.readFileSync(path.join(root,'public/data/curriculum.json'),'utf8')),key='english-sprout-state-v1';
const viewports=process.env.FOCUS_VIEWPORTS?JSON.parse(process.env.FOCUS_VIEWPORTS):[{width:320,height:568},{width:320,height:640},{width:390,height:844},{width:430,height:932},{width:1440,height:1000}];
const checks=[];let browser;
async function tap(p,selector){
  const l=p.locator(selector).first();await l.waitFor({state:'visible'});const r=await l.evaluate(e=>{const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return{x,y,left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,hit:e.contains(document.elementFromPoint(x,y)),scrollY,innerWidth,innerHeight};});
  assert.equal(r.scrollY,0,selector+' must not scroll');assert.ok(r.left>=-1&&r.top>=-1&&r.right<=r.innerWidth+1&&r.bottom<=r.innerHeight+1,selector+' outside viewport '+JSON.stringify(r));assert.equal(r.hit,true,selector+' is covered');await p.mouse.click(r.x,r.y);
}
async function screen(p,label,size){
  await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(70);
  const r=await p.evaluate(()=>{
    const d=document.documentElement,b=document.body,dialog=document.querySelector('dialog[open]'),scope=dialog||document.querySelector('#app')||b;
    const hidden=e=>!e.getClientRects().length||getComputedStyle(e).visibility==='hidden'||getComputedStyle(e).display==='none'||e.closest('[hidden],.interaction-feedback-layer,svg,dialog:not([open])');
    const rect=e=>{const r=e.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const name=e=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(typeof e.className==='string'?'.'+e.className.trim().split(/\s+/).join('.'):'');
    const outside=[],clipped=[],blocked=[],small=[];
    for(const e of [scope,...scope.querySelectorAll('*')]){
      if(hidden(e))continue;const r=rect(e),style=getComputedStyle(e);if(r.width<1||r.height<1)continue;if(r.width<=1&&r.height<=1&&style.position==='absolute'&&(style.clip!=='auto'||style.clipPath!=='none'))continue;
      if((e.matches('button,a,input,select,textarea,h1,h2,h3,p,label,small,strong')||e.matches('img'))&&(r.left< -1||r.right>innerWidth+1||r.top< -1||r.bottom>innerHeight+1))outside.push({element:name(e),...r});
      if(e.clientHeight>0&&e.scrollHeight>e.clientHeight+3&&/(hidden|clip|auto|scroll)/.test(style.overflowY)&&!e.matches('input,textarea,select'))clipped.push({element:name(e),scroll:e.scrollHeight,client:e.clientHeight,overflow:style.overflowY});
      if(e.matches('button,a[href],input:not([type=file]),select,textarea')&&!e.disabled&&style.pointerEvents!=='none'){
        const x=r.left+r.width/2,y=r.top+r.height/2;if(!e.contains(document.elementFromPoint(x,y)))blocked.push(name(e));
        if(r.height<40||r.width<36)small.push({element:name(e),width:r.width,height:r.height});
      }
    }
    return{width:innerWidth,height:innerHeight,scrollX,scrollY,documentWidth:Math.max(d.scrollWidth,b.scrollWidth),documentHeight:Math.max(d.scrollHeight,b.scrollHeight),outside:outside.slice(0,15),clipped:clipped.slice(0,15),blocked:blocked.slice(0,15),small:small.slice(0,15)};
  });
  const issues=[];if(r.documentWidth>r.width+1||r.documentHeight>r.height+1)issues.push('document overflow');if(r.scrollX||r.scrollY)issues.push('page scrolled');for(const field of ['outside','clipped','blocked','small'])if(r[field].length)issues.push(field);
  const item={viewport:size,label,status:issues.length?'FAIL':'PASS',issues,geometry:r};checks.push(item);console.log(item.status,size,label,issues.join(', '));
  if(issues.length||['home-learn','practice-listen','practice-choose','practice-speak','home-review','garden-field','parent-menu'].includes(label))await p.screenshot({path:path.join(out,`${size}-${label}.png`)});
}
async function go(p,view){await tap(p,`[data-go="${view}"]:visible`);}
async function seed(p,state){await p.evaluate(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key,state});await p.reload({waitUntil:'networkidle'});}
(async()=>{
  const learning=await import(require('node:url').pathToFileURL(path.join(root,'src/learning.js')).href);let mature=learning.createState('2026-10-01');for(let i=0;i<3;i++)mature=learning.recordResult(mature,curriculum.lessons[i].id,'good',`2026-10-0${i+1}`,{isNew:true});
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  for(const viewport of viewports){const size=`${viewport.width}x${viewport.height}`,c=await browser.newContext({viewport,timezoneId:'Asia/Shanghai',permissions:['microphone'],isMobile:viewport.width<600,hasTouch:viewport.width<600,reducedMotion:'reduce'}),p=await c.newPage();p.setDefaultTimeout(6000);await p.clock.setFixedTime(new Date('2026-10-08T10:00:00+08:00'));const errors=[];p.on('pageerror',e=>errors.push(e.message));
    try{
      await p.goto(origin,{waitUntil:'networkidle'});await p.locator('#hero-start').waitFor();await screen(p,'home-learn',size);
      await tap(p,'[data-sound-settings]');await screen(p,'home-sound-dialog',size);await tap(p,'[data-close-sound]');
      await tap(p,'#hero-start');await screen(p,'practice-listen',size);await tap(p,'[data-sound-settings]');await screen(p,'practice-sound-dialog',size);await tap(p,'[data-close-sound]');
      await tap(p,'[data-step="choose"]');await screen(p,'practice-choose',size);await tap(p,'[data-choice="1"]');await screen(p,'practice-wrong-feedback',size);await tap(p,'[data-choice="0"]');await screen(p,'practice-correct-feedback',size);await tap(p,'#quiz-next');await screen(p,'practice-speak',size);
      await tap(p,'#record');await p.waitForFunction(()=>document.querySelector('#record').textContent.includes('停止录音'));await screen(p,'practice-recording',size);await p.waitForTimeout(400);await tap(p,'#record');await p.waitForFunction(()=>!document.querySelector('#replay-record').disabled);await screen(p,'practice-recorded',size);
      await tap(p,'[data-rating="good"]');await screen(p,'completion',size);await go(p,'home');await screen(p,'home-finished',size);

      const longest=[...new Set([curriculum.lessons.reduce((a,b)=>a.english.length>b.english.length?a:b).id,curriculum.lessons.reduce((a,b)=>(a.scene+a.action).length>(b.scene+b.action).length?a:b).id])];
      for(const id of longest){const lesson=curriculum.lessons.find(l=>l.id===id);await go(p,'library');if(!await p.locator('#phrase-search').isVisible())await tap(p,'#search-open');await p.locator('#phrase-search').fill(lesson.english);await p.locator('#phrase-search').blur();await tap(p,`[data-preview="${id}"]`);await screen(p,`long-listen-${id}`,size);await tap(p,'.scene-picture');await p.waitForFunction(()=>document.body.dataset.playing==='playing');await screen(p,`long-playing-${id}`,size);await tap(p,'[data-step="choose"]');await tap(p,`[data-choice="${lesson.answerIndex}"]`);await tap(p,'#quiz-next');await screen(p,`long-speak-${id}`,size);await tap(p,'#exit-session');}
      await go(p,'library');if(await p.locator('[data-library-back]:visible').count())await tap(p,'[data-library-back]');await screen(p,'library-themes',size);
await tap(p,'[data-page-delta="1"]');await screen(p,'library-themes-page2',size);await tap(p,'[data-theme-open]');await screen(p,'library-phrases',size);await tap(p,'[data-page-delta="1"]');await screen(p,'library-phrases-page2',size);await tap(p,'[data-page-delta="1"]');await screen(p,'library-phrases-page3',size);await tap(p,'#search-open');await screen(p,'library-search',size);await p.locator('#phrase-search').fill('牛奶');await p.locator('#phrase-search').blur();await screen(p,'library-search-result',size);await p.locator('#phrase-search').fill('no-such-phrase');await p.locator('#phrase-search').blur();await screen(p,'library-search-empty',size);
      await go(p,'garden');await screen(p,'garden-field',size);for(const index of [1,2]){await tap(p,`[data-plot-tab="${index}"]`);await screen(p,`garden-plot${index}`,size);}await tap(p,'[data-garden-view="collection"]');await screen(p,'garden-collection',size);
      await go(p,'parent');await screen(p,'parent-menu',size);for(const panel of ['habits','voice','offline','backup','progress','help']){await tap(p,`[data-parent-panel="${panel}"]`);await screen(p,`parent-${panel}`,size);if(panel==='offline'&&await p.locator('[data-parent-panel="install"]').count()){await tap(p,'[data-parent-panel="install"]');await screen(p,'parent-install',size);await tap(p,'[data-parent-back]');if(await p.locator('[data-parent-back]:visible').count())await tap(p,'[data-parent-back]');}else if(panel==='help'){await tap(p,'[data-parent-panel="about"]');await screen(p,'parent-about',size);await tap(p,'[data-parent-back]');}else await tap(p,'[data-parent-back]');}
      await go(p,'home');await tap(p,'#avatar-open');await screen(p,'avatar-presets',size);await tap(p,'[data-avatar-mode="photo"]');await screen(p,'avatar-photo',size);await tap(p,'#avatar-close');
      await seed(p,mature);await screen(p,'home-review',size);await tap(p,'#hero-start');await screen(p,'practice-remember',size);await tap(p,'[data-step="speak"]');await screen(p,'review-recall',size);await tap(p,'#reveal');await screen(p,'review-prompted',size);await tap(p,'#exit-session');
      let ready=mature;for(const id of Object.keys(ready.cards))ready=learning.recordResult(ready,id,'good','2026-10-06');ready=learning.recordResult(ready,'hello-04','good','2026-10-08',{isNew:true});await seed(p,ready);await screen(p,'home-checkup',size);await tap(p,'#hero-start');await screen(p,'checkup-recall',size);await tap(p,'#reveal');await screen(p,'checkup-prompted',size);for(let i=0;i<3;i++){await tap(p,`[data-rating="${i===0?'help':'good'}"]`);await screen(p,'checkup-choose'+i,size);await tap(p,`[data-choice="${curriculum.lessons[i].answerIndex}"]`);await tap(p,'#quiz-next');}await screen(p,'checkup-completion',size);
      assert.deepEqual(errors,[]);checks.push({viewport:size,label:'no-page-errors',status:'PASS'});
    }catch(e){checks.push({viewport:size,label:'flow-execution',status:'FAIL',error:e.stack});console.log('FAIL',size,e.message);await p.screenshot({path:path.join(out,`${size}-flow-failure.png`)}).catch(()=>{});}
    await c.close();
  }
  await browser.close();const result={url:origin,viewports,passed:checks.filter(c=>c.status==='PASS').length,failed:checks.filter(c=>c.status==='FAIL').length,checks};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,failed:result.failed,path:out}));process.exitCode=result.failed?1:0;
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
