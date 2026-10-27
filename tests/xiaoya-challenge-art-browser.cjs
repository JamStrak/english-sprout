// Source-module visual regression: never reads or modifies the child's profile
// or a running release. Tests the actual shipped WebP alpha and CSS geometry.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/challenge-art-v024');
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base href="/"><link rel="stylesheet" href="/xiaoya/meadow.css"><style>*{box-sizing:border-box}body{margin:16px;background:#efeadd;font-family:sans-serif}button{font:inherit}#gallery{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}.sample{text-align:center;background:#fffaee;border-radius:16px;padding:8px}.sample svg{height:180px;width:100%;overflow:visible}.sample b{display:block;font-size:12px}</style><main id="app"></main><script type="module">
import {meadowView,layoutMeadowWatering} from '/xiaoya/meadow-ui.js';
import {meadowPlantArt} from '/xiaoya/meadow-art.js';
import {createMeadow,rewardChallenge,redeemChallengeSeed,plantSeed,waterPlant,rewardRound,claimReward} from '/xiaoya/garden-meadow.js';
import {CHALLENGE_FLOWERS} from '/xiaoya/challenge-flowers.js';
import {installPaperArt} from '/xiaoya/paper-art.js';
installPaperArt(document);
const app=document.querySelector('#app');
window.qa={flowers:CHALLENGE_FLOWERS,
gallery(){app.innerHTML='<div id="gallery">'+CHALLENGE_FLOWERS.map(f=>'<div class="sample">'+meadowPlantArt(f,5)+'<b>'+f.name+'</b></div>').join('')+'</div>';},
render(waterings=10,tool='',giant=true){
let state=rewardChallenge(createMeadow(),{unitId:'challenge-1',date:'2026-10-21'},giant?0:.99);
state=redeemChallengeSeed(state);state=plantSeed(state,{x:.5,y:.84});
for(let i=0;i<5;i++){const roundId='qa-fund-'+i;state=rewardRound(state,{roundId,eventId:'hello-morning',date:'2026-10-21'});state=claimReward(state,roundId,'water');}
for(let i=0;i<waterings;i++)state=waterPlant(state,'plant-1');
app.innerHTML=meadowView({state,header:'',balance:'',feedback:null,tool});
layoutMeadowWatering(app);
},
async geometry(id){
const b=document.querySelector('[data-meadow-plant="'+id+'"]'),svg=b.querySelector('svg'),image=b.querySelector('[data-paper-image]'),body=b.querySelector('[data-plant-body]');
const w=image.width.baseVal.value,h=image.height.baseVal.value,im=new Image();im.src=image.href.baseVal;await im.decode();
const canvas=document.createElement('canvas');canvas.width=im.naturalWidth;canvas.height=im.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
const scale=Math.min(w/canvas.width,h/canvas.height),ox=image.x.baseVal.value+(w-canvas.width*scale)/2,oy=image.y.baseVal.value+h-canvas.height*scale,m=image.getScreenCTM();
const map=(x,y)=>{const p=new DOMPoint(x,y).matrixTransform(m);return {x:p.x,y:p.y};},root=map(ox+192*scale,oy+451*scale),soil=new DOMPoint(80,164).matrixTransform(body.getScreenCTM());
let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,hits=0,total=0,firstHit=null;
const field=b.closest('[data-meadow-field]').getBoundingClientRect();
for(let y=0;y<canvas.height;y+=3)for(let x=0;x<canvas.width;x+=3){if(rgba[(y*canvas.width+x)*4+3]<128)continue;const p=map(ox+x*scale,oy+y*scale);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);if(p.x<field.left||p.x>field.right||p.y<field.top||p.y>field.bottom)throw Error('painted pixel clipped '+id);if(p.y<0||p.y>=innerHeight)continue;total++;if(document.elementFromPoint(p.x,p.y)?.closest('[data-meadow-plant]')?.dataset.meadowPlant===id){hits++;firstHit??=p;}}
return {root,soil:{x:soil.x,y:soil.y},bounds:{minX,minY,maxX,maxY,width:maxX-minX,height:maxY-minY},button:b.getBoundingClientRect().toJSON(),stage:svg.dataset.stage,paintedHeight:Number(svg.dataset.paintedHeight),hits,total,firstHit};
}};
</script>`;
const mime={'.js':'text/javascript','.css':'text/css','.webp':'image/webp','.json':'application/json'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return;}
  const rel=decodeURIComponent(url.pathname).slice(1),file=path.resolve(root,rel.startsWith('xiaoya/paper/')||rel.startsWith('xiaoya/growth/')?'public':'',rel);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
const report={scope:'Source modules, actual 21 challenge flower WebPs, disposable Edge profile; no microphone or saved player data.',checks:[]};
let browser;
async function ready(page){await page.waitForFunction(()=>[...document.querySelectorAll('[data-paper-art]')].length>0&&[...document.querySelectorAll('[data-paper-art]')].every(e=>e.dataset.paperState==='ready'));}
(async()=>{
  fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({channel:'msedge',headless:true});
  const origin='http://127.0.0.1:'+server.address().port;
  for(const viewport of [{width:1100,height:950},{width:390,height:844}]){
    const context=await browser.newContext({viewport,serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.waitForFunction(()=>window.qa);
    if(viewport.width===1100){await page.evaluate(()=>qa.gallery());await ready(page);assert.equal(await page.locator('[data-paper-art][data-paper-state=ready]').count(),21);await page.screenshot({path:path.join(out,'all-21-flowers.png'),fullPage:true});}
    await page.evaluate(()=>qa.render(5,'',false));await ready(page);
    const normal=await page.evaluate(()=>qa.geometry('plant-1'));
    await page.screenshot({path:path.join(out,'normal-'+viewport.width+'.png'),fullPage:true});
    await page.evaluate(()=>qa.render());await ready(page);
    const giant=await page.evaluate(()=>qa.geometry('plant-1'));
    assert.ok(Math.abs(giant.bounds.height/normal.bounds.height-2.5)<.002,'Painted giant height is exactly 2.5x normal');
    assert.ok(Math.abs(giant.bounds.width/normal.bounds.width-2.5)<.002,'Painted giant width is exactly 2.5x normal');
    assert.ok(Math.hypot(giant.root.x-giant.soil.x,giant.root.y-giant.soil.y)<.01,'Full-canvas root stays on soil');
    assert.equal(giant.hits,giant.total,'Every exposed painted giant pixel is clickable');
    await page.screenshot({path:path.join(out,'size-'+viewport.width+'.png'),fullPage:true});
    let previous=0,soil=null;const growth=[];
    for(let pours=0;pours<=10;pours++){
      await page.evaluate(n=>qa.render(n,'can'),pours);await ready(page);
      const g=await page.evaluate(()=>qa.geometry('plant-1'));
      assert.ok(g.bounds.height>previous,'Every giant pour is visibly taller than the last');previous=g.bounds.height;
      if(soil)assert.ok(Math.hypot(g.root.x-soil.x,g.root.y-soil.y)<.02,'No root drift between growth stages');soil=g.root;
      if(pours<10){const button=page.locator('[data-water-plant="plant-1"]'),box=await button.boundingBox();assert.equal(box.width,48);assert.equal(box.height,48);await button.click();}
      else assert.equal(await page.locator('[data-water-plant="plant-1"]').count(),0);
      growth.push({pours,stage:g.stage,height:g.bounds.height});
    }
    assert.deepEqual(errors,[]);report.checks.push({viewport,ratio:giant.bounds.height/normal.bounds.height,giantHitPixels:giant.hits,growth});await context.close();
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
