import {appStorage, GM_SANDBOX} from './runtime.js';
import {GROWTH_FLOWERS, GROWTH_FLOWER_BY_ID, GROWTH_STAGE_NAMES} from './growth-catalog.js';
import {DEFAULTS, effective, sample, waterStep} from './growth-core.js';
import {createGrowthSettingsStore} from './growth-settings.js';

// Internal acceptance tool. Water is deliberately local UI state, never a ledger entry.
export function createGrowthWorkbench() {
  const store = createGrowthSettingsStore({storage:appStorage, ids:GROWTH_FLOWERS.map(f=>f.id)});
  const esc = value => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const asset = src => new URL(`xiaoya/${src.replace(/^\.\//,'')}`, document.baseURI).href;
  let settings = store.load(), selected = GROWTH_FLOWERS[0].id, water = 0, scope = 'defaults';
  let target = null, dirty = false, status = '', imageGeneration = 0;
  const flower = ()=>GROWTH_FLOWER_BY_ID.get(selected);
  const current = ()=>effective(settings, selected);
  const editing = ()=>scope==='defaults' ? settings.defaults : current();
  const statusText = ()=>status || (GM_SANDBOX ? '临时测试：参数只在本次会话生效，刷新重置。' : '修改自动保存在当前浏览器。可导出参数供后续接入。');
  function updateStatus() {
    const el=target?.querySelector('[data-growth-status]'); if(!el)return;
    el.textContent=statusText(); el.classList.toggle('is-error',dirty);
    target.querySelector('[data-growth-action="retry"]').hidden=!dirty;
  }
  function persist(next) {
    settings=next;
    try {settings=store.save(next);dirty=false;status=GM_SANDBOX?'已保存到本次临时测试，刷新重置。':'已自动保存到当前浏览器。';}
    catch {dirty=true;status='尚未保存：浏览器存储不可用。当前预览仍可用，请重试保存或导出参数。';}
    updateStatus(); updatePreview(); updateInheritance();
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
    updateInheritance();
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
    target.querySelector('[data-growth-action="water"]').disabled=state.mature;
    target.querySelector('[data-growth-action="water"]').textContent=state.mature?'已经盛放':'浇一滴水';
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
  function select(id) {selected=id;water=0;target.querySelector('[data-growth-flower]').value=id;updateFields();updatePreview();}
  function edit(input) {
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
    if(action==='water') {water=waterStep(water,current());updatePreview();}
    if(action==='reset') {water=0;updatePreview();}
    if(action==='reload') {target.querySelector('[data-growth-image]').removeAttribute('src');updatePreview();}
    if(action==='previous'||action==='next') {const index=GROWTH_FLOWERS.findIndex(f=>f.id===selected);select(GROWTH_FLOWERS[(index+(action==='next'?1:-1)+GROWTH_FLOWERS.length)%GROWTH_FLOWERS.length].id);}
    if(action==='retry')persist(settings);
    if(action==='inherit') {const next=dirty?structuredClone(settings):store.load();delete next.overrides[selected];persist(next);updateFields();}
    if(action==='defaults') {const next=dirty?structuredClone(settings):store.load();next.defaults={...DEFAULTS,scales:[...DEFAULTS.scales]};persist(next);updateFields();}
    if(action==='export') {
      const url=URL.createObjectURL(new Blob([JSON.stringify(settings,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='xiaoya-growth-settings.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
  }
  return {render(container) {
    if(target!==container) {
      target=container;target.addEventListener('click',click);
      target.addEventListener('input',e=>{if(e.target.matches('[data-growth-total],[data-growth-scale]'))edit(e.target);});
      target.addEventListener('change',e=>{
        if(e.target.matches('[data-growth-flower]'))select(e.target.value);
        if(e.target.matches('[data-growth-scope]')){scope=e.target.value;updateFields();}
      });
    }
    if(!dirty)settings=store.load();
    const families=new Map();for(const f of GROWTH_FLOWERS){if(!families.has(f.familyId))families.set(f.familyId,[]);families.get(f.familyId).push(f);}
    target.innerHTML=`<div class="gm-section-heading"><div><h2>花朵成长实验台</h2><p>50 种花 · 每种 5 阶段 · 18 种共享种子外观</p></div><span class="gm-count">美术待验收</span></div>
      <p class="gm-growth-note">这里调整新花的预览参数；当前孩子花园、商店和挑战奖励沿用已上线版本。测试浇水不消耗水滴，不添加种子，也不修改学习记录。</p>
      <div class="gm-growth-picker"><button data-growth-action="previous" aria-label="上一朵花">←</button><label for="gm-growth-flower" class="gm-sr">选择花朵</label><select id="gm-growth-flower" data-growth-flower>${[...families.values()].map(group=>`<optgroup label="${esc(group[0].familyName)}">${group.map(f=>`<option value="${esc(f.id)}"${f.id===selected?' selected':''}>${esc(f.name)}</option>`).join('')}</optgroup>`).join('')}</select><button data-growth-action="next" aria-label="下一朵花">→</button></div>
      <div class="gm-growth-grid"><section class="gm-growth-card"><h3 data-growth-name></h3><code data-growth-id></code>
        <div class="gm-growth-preview" data-growth-preview><div class="gm-growth-ground"></div><img data-growth-image alt=""><span class="gm-growth-root" data-growth-root title="固定根点"></span><button data-growth-action="reload" class="gm-growth-reload"><span data-growth-image-error></span></button></div>
        <p data-growth-progress class="gm-growth-progress" role="status"></p><div class="gm-flow-buttons"><button data-growth-action="water" class="gm-primary">浇一滴水</button><button data-growth-action="reset">回到萌芽</button></div>
        <div class="gm-growth-frames" data-growth-frames></div><div class="gm-growth-seed"><img data-growth-seed alt="共享种子外观"><div><strong>种子独立展示</strong><p data-growth-seed-name></p><p>种子不占成长阶段；切换花朵从萌芽开始。</p></div></div></section>
      <section class="gm-growth-card gm-growth-settings"><h3>成长参数</h3><label>调整范围<select data-growth-scope aria-label="调整范围"><option value="defaults"${scope==='defaults'?' selected':''}>统一默认</option><option value="flower"${scope==='flower'?' selected':''}>仅当前花朵</option></select></label><p data-growth-inheritance></p>
        <label>长成所需水滴<input type="number" min="4" max="50" step="1" data-growth-total aria-label="长成所需水滴"></label><p>默认 10 滴。阶段之间逐滴插值放大，整张图片只缩放一次，根点固定。</p>
        <div class="gm-growth-scales">${GROWTH_STAGE_NAMES.map((name,i)=>`<label>${esc(name)}<span><input type="number" min="15" max="150" step="1" data-growth-scale="${i}" aria-label="${esc(name)}大小"> %</span></label>`).join('')}</div>
        <p data-growth-validation class="gm-growth-error" role="status"></p><p data-growth-status role="status"></p><div class="gm-flow-buttons"><button data-growth-action="retry" hidden>重试保存</button><button data-growth-action="inherit">当前花恢复跟随默认</button><button data-growth-action="defaults">统一参数恢复初始值</button><button data-growth-action="export">导出参数</button></div>
        <p class="gm-growth-note">候选素材 v09。部分花的细节、末两阶段差异仍待人工审核；参数保存不代表美术已验收。公开版不包含此测试台或候选图片。</p></section></div>`;
    updateFields();updatePreview();updateStatus();
  }};
}
