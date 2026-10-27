import {appStorage, GM_SANDBOX} from './runtime.js';
import {GROWTH_FLOWERS, GROWTH_FLOWER_BY_ID, GROWTH_STAGE_NAMES} from './growth-catalog.js';
import {DEFAULTS, effective, sample, waterStep} from './growth-core.js';
import {createGrowthSettingsStore} from './growth-settings.js';
import {MOTION_DEFAULTS, MOTION_PRESETS, MOTION_LIMITS, crossfadeLimit, motionFrame} from './growth-motion.js';

const MOTION_FIELDS = [
  ['duration','整滴节奏','毫秒',50], ['sway','左右摇摆','°',1], ['flex','柔软跟随','%',1],
  ['bounce','长大弹性','%',1], ['crossfade','换图淡化','毫秒',10], ['particles','水花与星光','%',1],
];
const PHASES = {idle:'准备浇水',loading:'准备下一张图片…',drop:'水滴落下',sway:'喝到水啦 · 柔软摇摆',grow:'长大一点 · 换新模样',settle:'轻轻落稳'};

// Internal acceptance tool. Water is deliberately local UI state, never a ledger entry.
export function createGrowthWorkbench() {
  const store = createGrowthSettingsStore({storage:appStorage, ids:GROWTH_FLOWERS.map(f=>f.id)});
  const esc = value => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const asset = src => new URL(`xiaoya/${src.replace(/^\.\//,'')}`, document.baseURI).href;
  let settings = store.load(), selected = GROWTH_FLOWERS[0].id, water = 0, scope = 'defaults';
  let target = null, dirty = false, status = '', imageGeneration = 0;
  let active=null, sequence=0, auto=false, slow=false, lastStep=null;
  const flower = ()=>GROWTH_FLOWER_BY_ID.get(selected);
  const current = ()=>effective(settings, selected);
  const editing = ()=>scope==='defaults' ? settings.defaults : current();
  const statusText = ()=>status || (GM_SANDBOX ? '临时测试：参数只在本次会话生效，刷新重置。' : '动效修改自动保存，回到花园后下一滴水立即沿用。');
  const preview = ()=>target?.querySelector('[data-growth-preview]');
  function controls() {
    if(!preview())return;
    const busy=!!active, mature=sample(water,current()).mature;
    target.querySelector('[data-growth-action="water"]').disabled=busy||auto||mature;
    target.querySelector('[data-growth-action="water"]').textContent=mature?'已经盛放':'浇一滴水';
    target.querySelector('[data-growth-action="replay"]').disabled=busy||auto||!lastStep;
    target.querySelector('[data-growth-action="auto"]').disabled=busy||auto;
    target.querySelector('[data-growth-action="auto"]').textContent=mature?'从头播放':'连续浇到盛放';
    target.querySelector('[data-growth-action="stop"]').disabled=!busy&&!auto;
  }
  function phase(name) {
    if(!preview())return;
    preview().dataset.motionState=name;
    const label=name==='idle'&&sample(water,current()).mature?'盛放啦！':PHASES[name];
    const output=target.querySelector('[data-growth-phase]');
    if(output.textContent!==label)output.textContent=label;
  }
  function cleanMotion() {
    if(!preview())return;
    target.querySelector('[data-growth-incoming]').style.opacity='0';
    target.querySelector('[data-growth-image]').style.opacity='1';
    for(const image of target.querySelectorAll('[data-growth-image],[data-growth-incoming]')) {
      image.style.removeProperty('transform');
      image.style.removeProperty('will-change');
    }
    for(const effect of target.querySelectorAll('[data-growth-effect]'))effect.style.opacity='0';
  }
  function stop() {
    sequence++;auto=false;
    const cancelled=active;active=null;
    if(cancelled){cancelAnimationFrame(cancelled.frame);cancelled.resolve(false);}
    imageGeneration++;cleanMotion();
    if(preview()){phase('idle');updatePreview();controls();}
  }
  function updateMotionFields() {
    if(!preview())return;
    target.querySelector('[data-growth-motion="crossfade"]').max=crossfadeLimit(settings.motion.duration);
    for(const [key] of MOTION_FIELDS) {
      target.querySelector(`[data-growth-motion="${key}"]`).value=settings.motion[key];
      target.querySelector(`[data-growth-motion-value="${key}"]`).textContent=settings.motion[key];
    }
    const preset=Object.entries(MOTION_PRESETS).find(([,value])=>Object.keys(value).every(key=>value[key]===settings.motion[key]));
    target.querySelector('[data-growth-preset]').value=preset?.[0]||'custom';
  }
  function applyFrame(frame, reduced, from, to) {
    const panel=preview();if(!panel)return;
    phase(frame.phase);
    const transform=`translate(calc(-1 * var(--root-x)),calc(-1 * var(--root-y))) rotate(${frame.angle}deg) skewX(${frame.bend}deg) scale(${frame.scale / Math.sqrt(frame.stretch)},${frame.scale * frame.stretch})`;
    for(const image of target.querySelectorAll('[data-growth-image],[data-growth-incoming]'))image.style.transform=transform;
    target.querySelector('[data-growth-image]').style.opacity=String(1-frame.mix);
    target.querySelector('[data-growth-incoming]').style.opacity=String(frame.mix);
    // Land near the visible plant, with splash and glow tied to its root (never the page).
    const image=target.querySelector('[data-growth-image]');
    const height=parseFloat(getComputedStyle(image).width)*4/3;
    const crown=Math.max(28,height*from.scale*.55), intensity=settings.motion.particles/100;
    const drop=target.querySelector('[data-growth-effect="drop"]');
    drop.style.transform=`translate(-50%,${-crown-96+96*frame.drop*frame.drop}px) rotate(-12deg)`;
    drop.style.opacity=reduced||frame.drop>=1?'0':'1';
    const ripple=target.querySelector('[data-growth-effect="ripple"]');
    ripple.style.transform=`translate(-50%,-50%) scale(${.3+frame.impact*2.1},${.16+frame.impact*.4})`;
    ripple.style.opacity=String(reduced?0:Math.sin(Math.PI*frame.impact)*intensity);
    const glow=target.querySelector('[data-growth-effect="glow"]');
    glow.style.transform=`translate(-50%,-50%) scale(${.6+frame.spark*.8})`;
    glow.style.opacity=String(reduced?0:Math.sin(Math.PI*frame.spark)*intensity*.65);
    target.querySelectorAll('[data-growth-particle]').forEach((particle,i)=>{
      const splash=i<6, p=splash?frame.impact:frame.spark;
      const angle=(i%6)/6*Math.PI*2;
      const distance=(splash?55:76)*p*(.6+intensity*.4);
      particle.style.transform=`translate(${Math.cos(angle)*distance}px,${-(splash?crown:height*to.scale*.55)+Math.sin(angle)*distance*.6-32*Math.sin(Math.PI*p)}px) rotate(${p*150}deg) scale(${.5+Math.sin(Math.PI*p)*.8})`;
      particle.style.opacity=String(reduced?0:Math.sin(Math.PI*p)*intensity);
    });
  }
  function animateStep(replay=false) {
    if(active||!preview()||(!replay&&sample(water,current()).mature)||replay&&!lastStep)return Promise.resolve(false);
    const fromWater=replay?lastStep.from:water, toWater=replay?lastStep.to:waterStep(water,current());
    const from=sample(fromWater,current()),to=sample(toWater,current()),f=flower();
    const outgoing=target.querySelector('[data-growth-image]'),incoming=target.querySelector('[data-growth-incoming]');
    ++imageGeneration;cleanMotion();
    return new Promise(resolve=>{
      const run={resolve,frame:0};active=run;phase('loading');controls();
      for(const image of [outgoing,incoming]) {
        image.style.setProperty('--root-x',`${f.rootPivot[0]*100}%`);
        image.style.setProperty('--root-y',`${f.rootPivot[1]*100}%`);
      }
      // Decode separately so a slow or failed asset cannot erase the currently visible flower.
      const oldAsset=new Image(), nextAsset=new Image();
      oldAsset.src=asset(f.stages[from.stageIndex].src);nextAsset.src=asset(f.stages[to.stageIndex].src);
      Promise.all([oldAsset.decode(),nextAsset.decode()]).then(()=>{
        if(active!==run)return;
        outgoing.src=oldAsset.src;incoming.src=nextAsset.src;
        outgoing.style.visibility='visible';incoming.style.visibility='visible';
        outgoing.style.willChange='transform, opacity';incoming.style.willChange='transform, opacity';
        const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
        const duration=reduced?180:settings.motion.duration*(slow?2:1), started=performance.now();
        function tick(now) {
          if(active!==run)return;
          const t=Math.min(1,(now-started)/duration);
          applyFrame(motionFrame(t,from.scale,to.scale,settings.motion,reduced),reduced,from,to);
          if(t<1){run.frame=requestAnimationFrame(tick);return;}
          active=null;
          if(!replay){water=toWater;lastStep={from:fromWater,to:toWater};}
          cleanMotion();updatePreview();phase('idle');controls();resolve(true);
        }
        run.frame=requestAnimationFrame(tick);
      }).catch(()=>{
        if(active!==run)return;
        active=null;cleanMotion();updatePreview();phase('idle');controls();
        target.querySelector('[data-growth-image-error]').textContent='下一阶段图片未加载，点击重试。';resolve(false);
      });
    });
  }
  async function playAll() {
    if(active||auto)return;
    if(sample(water,current()).mature){water=0;lastStep=null;updatePreview();}
    const token=++sequence;auto=true;controls();
    while(token===sequence&&!sample(water,current()).mature) {
      if(!await animateStep())break;
      await new Promise(resolve=>setTimeout(resolve,220));
    }
    if(token===sequence){auto=false;controls();}
  }
  function updateStatus() {
    const el=target?.querySelector('[data-growth-status]'); if(!el)return;
    el.textContent=statusText(); el.classList.toggle('is-error',dirty);
    target.querySelector('[data-growth-action="retry"]').hidden=!dirty;
  }
  function persist(next) {
    settings=next;
    try {settings=store.save(next);dirty=false;status=GM_SANDBOX?'已保存到本次临时测试，刷新重置。':'已自动保存到当前浏览器。';}
    catch {dirty=true;status='尚未保存：浏览器存储不可用。当前预览仍可用，请重试保存或导出参数。';}
    updateStatus(); updatePreview(); updateInheritance();updateMotionFields();
  }
  function updateInheritance() {
    target.querySelector('[data-growth-inheritance]').textContent=settings.overrides[selected]?'这朵花使用单花参数。':'这朵花跟随统一默认参数。';
    target.querySelector('[data-growth-action="inherit"]').disabled=!settings.overrides[selected];
  }
  function updateFields() {
    const value=editing();
    target.querySelector('[data-growth-total]').value=value.totalWater;
    target.querySelectorAll('[data-growth-scale]').forEach((input,i)=>{input.value=Math.round(value.scales[i]*100);});
    target.querySelectorAll('[data-growth-total],[data-growth-scale]').forEach(input=>input.setCustomValidity(''));
    target.querySelector('[data-growth-validation]').textContent='';
    updateInheritance();updateMotionFields();
  }
  function updatePreview() {
    if(!target?.querySelector('[data-growth-preview]'))return;
    const f=flower(), value=current(); water=Math.min(water,value.totalWater);
    const state=sample(water,value), image=target.querySelector('[data-growth-image]');
    const generation=++imageGeneration, src=asset(f.stages[state.stageIndex].src);
    image.alt=`${f.name} · ${GROWTH_STAGE_NAMES[state.stageIndex]}`;
    image.style.setProperty('--growth-scale',state.scale);
    image.style.setProperty('--root-x',`${f.rootPivot[0]*100}%`);
    image.style.setProperty('--root-y',`${f.rootPivot[1]*100}%`);
    image.dataset.stage=String(state.stageIndex); image.dataset.scale=String(state.scale);
    const error=target.querySelector('[data-growth-image-error]'); error.textContent='';
    if(image.src!==src) {
      image.style.visibility='hidden'; image.src=src;
      image.decode().then(()=>{if(generation===imageGeneration)image.style.visibility='visible';}).catch(()=>{if(generation===imageGeneration)error.textContent='图片未加载，请点击重新载入。';});
    } else if(image.complete&&image.naturalWidth)image.style.visibility='visible';
    else image.decode().then(()=>{if(generation===imageGeneration)image.style.visibility='visible';}).catch(()=>{if(generation===imageGeneration)error.textContent='图片未加载，请点击重新载入。';});
    target.querySelector('[data-growth-progress]').textContent=`${water} / ${value.totalWater} 滴 · ${GROWTH_STAGE_NAMES[state.stageIndex]} · ${Math.round(state.scale*100)}%`;
    controls();
    target.querySelector('[data-growth-seed]').src=asset(f.seed.src);
    target.querySelector('[data-growth-name]').textContent=f.name;
    target.querySelector('[data-growth-id]').textContent=f.id;
    target.querySelector('[data-growth-seed-name]').textContent=`${f.name}种子 · ${f.seed.id}`;
    const frames=target.querySelector('[data-growth-frames]');
    if(frames.dataset.flower!==selected) {
      frames.dataset.flower=selected;
      frames.innerHTML=f.stages.map((stage,i)=>`<figure><img src="${esc(asset(stage.src))}" alt="${esc(f.name)} · ${esc(GROWTH_STAGE_NAMES[i])}" loading="lazy"><figcaption>${esc(GROWTH_STAGE_NAMES[i])}</figcaption></figure>`).join('');
    }
    frames.querySelectorAll('figure').forEach((el,i)=>el.classList.toggle('is-current',i===state.stageIndex));
  }
  function select(id) {stop();selected=id;water=0;lastStep=null;target.querySelector('[data-growth-flower]').value=id;updateFields();updatePreview();phase('idle');}
  function edit(input) {
    stop();
    const raw=input.value.trim(), number=Number(raw), total=input.hasAttribute('data-growth-total');
    if(!raw || !Number.isFinite(number) || number<(total?4:15) || number>(total?50:150) || !Number.isInteger(number)) {
      input.setCustomValidity(total?'请填写 4–50 的整数。':'请填写 15–150 的整数百分比。');
      target.querySelector('[data-growth-validation]').textContent=input.validationMessage;
      return;
    }
    input.setCustomValidity('');target.querySelector('[data-growth-validation]').textContent='';
    // Merge the latest saved settings so unrelated changes from another tab survive.
    const next=dirty?structuredClone(settings):store.load();
    const value=scope==='defaults'?next.defaults:{...effective(next,selected),scales:[...effective(next,selected).scales]};
    if(total)value.totalWater=number;else value.scales[Number(input.dataset.growthScale)]=number/100;
    if(scope!=='defaults')next.overrides[selected]=value;
    persist(next);
  }
  function click(event) {
    const action=event.target.closest('[data-growth-action]')?.dataset.growthAction;if(!action)return;
    if(action==='water')void animateStep();
    if(action==='replay')void animateStep(true);
    if(action==='auto')void playAll();
    if(action==='stop')stop();
    if(action==='reset') {stop();water=0;lastStep=null;updatePreview();phase('idle');}
    if(action==='reload') {stop();target.querySelector('[data-growth-image]').removeAttribute('src');updatePreview();}
    if(action==='previous'||action==='next') {const index=GROWTH_FLOWERS.findIndex(f=>f.id===selected);select(GROWTH_FLOWERS[(index+(action==='next'?1:-1)+GROWTH_FLOWERS.length)%GROWTH_FLOWERS.length].id);}
    if(action==='retry')persist(settings);
    if(action==='inherit') {stop();const next=dirty?structuredClone(settings):store.load();delete next.overrides[selected];persist(next);updateFields();}
    if(action==='defaults') {stop();const next=dirty?structuredClone(settings):store.load();next.defaults={...DEFAULTS,scales:[...DEFAULTS.scales]};persist(next);updateFields();}
    if(action==='motion-defaults')setMotion(MOTION_DEFAULTS);
    if(action==='export') {
      const url=URL.createObjectURL(new Blob([JSON.stringify(settings,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='xiaoya-growth-settings.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
  }
  function setMotion(value) {
    stop();const next=dirty?structuredClone(settings):store.load();next.motion={...next.motion,...value};persist(next);
  }
  return {stop,render(container) {
    stop();
    if(target!==container) {
      target=container;target.addEventListener('click',click);
      target.addEventListener('input',e=>{
        if(e.target.matches('[data-growth-total],[data-growth-scale]'))edit(e.target);
        if(e.target.matches('[data-growth-motion]'))setMotion({[e.target.dataset.growthMotion]:Number(e.target.value)});
      });
      target.addEventListener('change',e=>{
        if(e.target.matches('[data-growth-flower]'))select(e.target.value);
        if(e.target.matches('[data-growth-scope]')){stop();scope=e.target.value;updateFields();}
        if(e.target.matches('[data-growth-preset]')&&MOTION_PRESETS[e.target.value])setMotion(MOTION_PRESETS[e.target.value]);
        if(e.target.matches('[data-growth-slow]')){stop();slow=e.target.checked;}
      });
    }
    if(!dirty)settings=store.load();
    const families=new Map();for(const f of GROWTH_FLOWERS){if(!families.has(f.familyId))families.set(f.familyId,[]);families.get(f.familyId).push(f);}
    target.innerHTML=`<div class="gm-section-heading"><div><h2>花朵成长实验台</h2><p>50 种花 · 每种 5 阶段 · 18 种共享种子外观</p></div><span class="gm-count">美术待验收</span></div>
      <p class="gm-growth-note">下方动效参数用于花园里的所有花朵。这里的 50 种候选花、阶段大小和浇水次数只用于美术预览；正式花种与成长次数保持现行规则。测试浇水不修改学习记录。</p>
      <div class="gm-growth-picker"><button data-growth-action="previous" aria-label="上一朵花">←</button><label for="gm-growth-flower" class="gm-sr">选择花朵</label><select id="gm-growth-flower" data-growth-flower>${[...families.values()].map(group=>`<optgroup label="${esc(group[0].familyName)}">${group.map(f=>`<option value="${esc(f.id)}"${f.id===selected?' selected':''}>${esc(f.name)}</option>`).join('')}</optgroup>`).join('')}</select><button data-growth-action="next" aria-label="下一朵花">→</button></div>
      <div class="gm-growth-grid"><section class="gm-growth-card"><h3 data-growth-name></h3><code data-growth-id></code>
        <div class="gm-growth-preview" data-growth-preview data-motion-state="idle"><div class="gm-growth-ground"></div><i class="gm-growth-glow" data-growth-effect="glow" aria-hidden="true"></i><img data-growth-image alt=""><img data-growth-incoming alt="" aria-hidden="true"><i class="gm-growth-ripple" data-growth-effect="ripple" aria-hidden="true"></i><i class="gm-growth-drop" data-growth-effect="drop" aria-hidden="true"></i>${Array.from({length:12},(_,i)=>`<i class="gm-growth-particle ${i<6?'is-water':'is-star'}" data-growth-effect="particle" data-growth-particle="${i}" aria-hidden="true"></i>`).join('')}<span class="gm-growth-root" data-growth-root title="固定根点"></span><span class="gm-growth-phase" data-growth-phase role="status">准备浇水</span><button data-growth-action="reload" class="gm-growth-reload"><span data-growth-image-error></span></button></div>
        <p data-growth-progress class="gm-growth-progress" role="status"></p><div class="gm-flow-buttons"><button data-growth-action="water" class="gm-primary">浇一滴水</button><button data-growth-action="replay">重播这一滴</button><button data-growth-action="auto">连续浇到盛放</button><button data-growth-action="stop">停止</button><button data-growth-action="reset">回到萌芽</button></div>
        <label class="gm-growth-slow"><input type="checkbox" data-growth-slow${slow?' checked':''}>半速观察（只影响预览）</label>
        <div class="gm-growth-frames" data-growth-frames></div><div class="gm-growth-seed"><img data-growth-seed alt="共享种子外观"><div><strong>种子独立展示</strong><p data-growth-seed-name></p><p>种子不占成长阶段；切换花朵从萌芽开始。</p></div></div></section>
      <section class="gm-growth-card gm-growth-settings"><h3>浇水动效调试</h3><p>水滴落下 → 柔性摇摆 → 淡入长大 → 弹动落稳。每滴都有反馈，同一阶段也会长大。</p><label>动效风格<select data-growth-preset aria-label="动效风格"><option value="gentle">轻柔舒展</option><option value="playful">活泼生长 · 推荐</option><option value="bouncy">欢快弹跳</option><option value="custom" disabled>自定义</option></select></label>
        <div class="gm-growth-motion-fields">${MOTION_FIELDS.map(([key,label,unit,step])=>`<label for="gm-growth-${key}">${label}<span><output data-growth-motion-value="${key}"></output> ${unit}</span></label><input id="gm-growth-${key}" type="range" data-growth-motion="${key}" min="${MOTION_LIMITS[key][0]}" max="${MOTION_LIMITS[key][1]}" step="${step}" aria-label="${label}">`).join('')}</div><button data-growth-action="motion-defaults">恢复推荐动效</button><p>动效统一应用于这里的 50 种花，可保存、导出。调参会停止当前播放；点重播比较。系统减少动态效果开启时使用简短淡化。</p>
        <hr><h3>成长参数</h3><label>调整范围<select data-growth-scope aria-label="调整范围"><option value="defaults"${scope==='defaults'?' selected':''}>统一默认</option><option value="flower"${scope==='flower'?' selected':''}>仅当前花朵</option></select></label><p data-growth-inheritance></p>
        <label>长成所需水滴<input type="number" min="4" max="50" step="1" data-growth-total aria-label="长成所需水滴"></label><p>默认 10 滴。阶段之间逐滴插值放大，整张图片只缩放一次，根点固定。</p>
        <div class="gm-growth-scales">${GROWTH_STAGE_NAMES.map((name,i)=>`<label>${esc(name)}<span><input type="number" min="15" max="150" step="1" data-growth-scale="${i}" aria-label="${esc(name)}大小"> %</span></label>`).join('')}</div>
        <p data-growth-validation class="gm-growth-error" role="status"></p><p data-growth-status role="status"></p><div class="gm-flow-buttons"><button data-growth-action="retry" hidden>重试保存</button><button data-growth-action="inherit">当前花恢复跟随默认</button><button data-growth-action="defaults">统一参数恢复初始值</button><button data-growth-action="export">导出参数</button></div>
        <p class="gm-growth-note">候选素材 v09。部分花的细节、末两阶段差异仍待人工审核；参数保存不代表美术已验收。公开版不包含此测试台或候选图片。</p></section></div>`;
    updateFields();updatePreview();updateStatus();phase('idle');
  }};
}
