import {appStorage, GM_SANDBOX} from './runtime.js';
import {DEFAULT_ECONOMY_SETTINGS, ECONOMY_LIMITS, createEconomySettingsStore, validateEconomySettings} from './economy-settings.js';
import {ALL_FLOWERS} from './garden-meadow.js';
import {meadowPlantArt} from './meadow-art.js';
import {exportTuningBackup, validateTuningBackup, restoreTuningBackup, TUNING_BACKUP_LIMIT} from './tuning-backup.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const FIELD_GROUPS=[
  ['学习奖励',[['shellReward','普通练习 · 贝壳'],['waterReward','普通练习 · 水滴'],['starterShellReward','首次练习 · 贝壳'],['starterWaterReward','首次练习 · 水滴']]],
  ['挑战与商店',[['challengeShells','挑战通过 · 贝壳'],['challengeWater','挑战通过 · 水滴'],['packPrice','种子盲袋 · 贝壳价格']]],
  ['种子与成长',[['normalWaterNeeded','普通花 · 成熟水滴'],['giantWaterNeeded','巨型花 · 成熟水滴'],['giantChance','每颗新种子 · 巨型概率（%）'],['giantScale','巨型花 · 大小倍率']]],
];
const same=(a,b)=>Object.keys(DEFAULT_ECONOMY_SETTINGS).every(key=>a[key]===b[key]);

export function createEconomyWorkbench({storage=appStorage,wallet=()=>null,setWallet=()=>false}={}) {
  const store=createEconomySettingsStore({storage});
  let target, saved=store.load(), draft={...saved}, selected=ALL_FLOWERS[0].id;
  let waters={normal:saved.normalWaterNeeded,giant:saved.giantWaterNeeded};
  let message='', error=false, pending=null;
  const dirty=()=>!same(draft,saved);
  function notice(text,failed=false){message=text;error=failed;updateStatus();}
  function updateWallet() {
    const current=wallet();
    const status=target?.querySelector('[data-wallet-current]');
    if(!status || !current) return;
    status.textContent=`当前真实余额：${current.shells} 贝壳，${current.water} 水滴`;
    for(const key of ['shells','water'])target.querySelector(`[data-wallet-field="${key}"]`).value=current[key];
  }
  async function saveWallet(button) {
    const values={};
    for(const key of ['shells','water']) {
      const raw=target.querySelector(`[data-wallet-field="${key}"]`).value.trim();
      if(!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw)>1000000000) {
        target.querySelector('[data-wallet-status]').textContent='请输入 0 到 1000000000 的整数。';return;
      }
      values[key]=Number(raw);
    }
    const status=target.querySelector('[data-wallet-status]');
    button.disabled=true;
    try {
      if(!await setWallet(values)) throw Error('保存失败，请检查浏览器存储。');
      if(status.isConnected){updateWallet();status.textContent='已保存真实余额，返回花园即可使用。';}
    } catch(err) {if(status.isConnected)status.textContent=`未保存：${err.message}`;}
    finally {button.disabled=false;}
  }
  function updateStatus(){
    const element=target?.querySelector('[data-economy-status]');if(!element)return;
    element.textContent=message || (dirty()?'有未保存的数值草稿。比较画面已更新；点击“保存数值”后才应用到花园。':GM_SANDBOX?'当前参数仅保存在本次测试内存，退出后恢复正式参数。':'数值已保存到本机；花园下一次奖励、购买和新种子使用这套参数。');
    element.classList.toggle('is-error',error);target.querySelector('[data-economy-dirty]').textContent=dirty()?'未保存':'已保存';
    target.querySelector('[data-economy-action="save"]').disabled=!dirty();
  }
  function readDraft(){
    const next={};
    for(const input of target.querySelectorAll('[data-economy-field]')){
      const key=input.dataset.economyField;
      next[key]=input.value.trim()===''?NaN:Number(input.value)/(key==='giantChance'?100:1);
    }
    draft=next;message='';error=false;updateStatus();updatePreview();
  }
  function updateFields(){
    for(const input of target.querySelectorAll('[data-economy-field]')){
      const key=input.dataset.economyField;input.value=key==='giantChance'?Number((draft[key]*100).toFixed(5)):draft[key];
    }
    updateStatus();updatePreview();
  }
  function updatePreview(animatedKind=''){
    const area=target?.querySelector('[data-economy-comparison]');if(!area)return;
    let settings;try{settings=validateEconomySettings(draft);}catch{target.querySelector('[data-economy-preview-note]').textContent='请填入范围内的数值；修正后恢复实时比较。';return;}
    const flower=ALL_FLOWERS.find(item=>item.id===selected)||ALL_FLOWERS[0];
    const normal={...flower,giant:false,waterNeeded:settings.normalWaterNeeded,scale:1};
    const giant={...flower,giant:true,waterNeeded:settings.giantWaterNeeded,scale:settings.giantScale};
    for(const [kind,instance] of [['normal',normal],['giant',giant]]){
      waters[kind]=Math.max(0,Math.min(Number.isFinite(waters[kind])?waters[kind]:0,instance.waterNeeded));
      const holder=area.querySelector(`[data-economy-plant="${kind}"]`);
      holder.style.setProperty('--plant-scale',instance.scale);
      holder.innerHTML=meadowPlantArt(instance,waters[kind]);
      holder.classList.toggle('is-watered',kind===animatedKind);
      const label=target.querySelector(`[data-economy-water-count="${kind}"]`);label.textContent=`${waters[kind]} / ${instance.waterNeeded} 滴 · ${instance.scale} 倍`;
      target.querySelector(`[data-economy-action="water-${kind}"]`).disabled=waters[kind]>=instance.waterNeeded;
    }
    target.querySelector('[data-economy-preview-note]').textContent=`${flower.name} · 同种花、同一地平线。每颗新种子有 ${Number((settings.giantChance*100).toFixed(3))}% 的机会成为巨型。`;
  }
  function download(){
    try{
      const backup=exportTuningBackup({storage});
      const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download=`xiaoya-tuning-${backup.exportedAt.replace(/[:.]/g,'-')}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
      notice(`已导出全部已保存参数：数值、成长阶段与动效、声音和背景音乐。${dirty()?'当前未保存的数值草稿未包含在备份中。':''}`);
    }catch(err){notice(`导出失败：${err.message}`,true);}
  }
  async function importFile(file){
    if(!file)return;
    pending=null;
    try{
      if(file.size>TUNING_BACKUP_LIMIT)throw Error('文件超过 8 MiB。');
      pending=validateTuningBackup(await file.text());
      const review=target.querySelector('[data-economy-import-review]');
      review.hidden=false;review.querySelector('p').textContent=`已检查 ${file.name}。备份时间 ${new Date(pending.exportedAt).toLocaleString('zh-CN')}。包含数值、成长动效与单花设置、声音素材、背景音乐；不会覆盖孩子的存档。`;
      notice('备份校验通过。点击“恢复这份参数”才会替换当前调参。');
    }catch(err){target.querySelector('[data-economy-import-review]').hidden=true;notice(`未导入：${err.message} 原参数保持不变。`,true);}
  }
  function click(event){
    const button=event.target.closest('[data-economy-action]');if(!button||!target.contains(button))return;
    const action=button.dataset.economyAction;
    if(action==='wallet-save'){void saveWallet(button);}
    else if(action==='wallet-refresh'){updateWallet();target.querySelector('[data-wallet-status]').textContent='已读取当前余额。';}
    else if(action==='save'){
      try{saved=store.save(draft);draft={...saved};notice(GM_SANDBOX?'已保存到本次测试内存；退出测试不改正式参数。':'数值已保存，后续奖励、购买和新种子立即沿用。');}
      catch(err){notice(`未保存：${err.message}`,true);}
    }else if(action==='defaults'){draft={...DEFAULT_ECONOMY_SETTINGS};message='已载入推荐数值草稿；点击保存才会生效。';error=false;updateFields();}
    else if(action==='reload'){saved=store.load();draft={...saved};message='已放弃数值草稿，重新读取保存值。';error=false;updateFields();}
    else if(action==='export')download();
    else if(action==='import')target.querySelector('[data-economy-import]').click();
    else if(action==='restore'&&pending){
      const result=restoreTuningBackup(pending,{storage});
      if(!result.ok){notice(result.error,true);return;}
      pending=null;target.querySelector('[data-economy-import-review]').hidden=true;
      saved=store.load();draft={...saved};message=GM_SANDBOX?'全部参数已恢复到测试内存，退出后仍使用正式设置。':'全部参数已恢复。孩子的学习记录、花园和钱包保持原样。';error=false;updateFields();
    }else if(action==='cancel-import'){pending=null;target.querySelector('[data-economy-import-review]').hidden=true;notice('已取消恢复，原参数未变。');}
    else if(action==='bloom'){waters={normal:draft.normalWaterNeeded,giant:draft.giantWaterNeeded};updatePreview();}
    else if(action==='reset'){waters={normal:0,giant:0};updatePreview();}
    else if(action==='water-normal'||action==='water-giant'){const kind=action.slice(6);waters[kind]++;updatePreview(kind);}
  }
  return {stop(){},render(container){
    if(target!==container){
      target=container;target.addEventListener('click',click);
      target.addEventListener('input',event=>{if(event.target.matches('[data-economy-field]'))readDraft();});
      target.addEventListener('change',event=>{
        if(event.target.matches('[data-economy-flower]')){selected=event.target.value;updatePreview();}
        if(event.target.matches('[data-economy-import]')){void importFile(event.target.files?.[0]);event.target.value='';}
      });
    }
    if(!dirty()){saved=store.load();draft={...saved};}
    pending=null;
    target.innerHTML=`<div class="gm-section-heading"><div><h2>数值与参数备份</h2><p>${GM_SANDBOX?'测试模式：无限资源；这里的调整只在本次测试有效。':'正式内测：保存后持久生效。进入流程测试会继承参数，退出恢复玩家数据。'}</p></div><span class="gm-count" data-economy-dirty></span></div>
      ${GM_SANDBOX?'<section class="gm-economy-backup"><h3>真实贝壳与水滴</h3><p>模拟测试不能修改真实余额。请退出测试后在这里设置。</p></section>':`<section class="gm-economy-backup"><h3>真实贝壳与水滴</h3><p>为孩子设置这个浏览器中花园的当前余额；保存后立即生效，不改变已种的花或学习记录。</p><p data-wallet-current></p><div class="gm-flow-buttons"><label>贝壳 <input type="number" data-wallet-field="shells" aria-label="真实贝壳数量" min="0" max="1000000000" step="1"></label><label>水滴 <input type="number" data-wallet-field="water" aria-label="真实水滴数量" min="0" max="1000000000" step="1"></label><button class="gm-primary" data-economy-action="wallet-save">保存真实余额</button><button data-economy-action="wallet-refresh">重新读取余额</button></div><p data-wallet-status role="status" aria-live="polite"></p></section>`}
      <div class="gm-economy-layout"><section class="gm-economy-settings">${FIELD_GROUPS.map(([title,fields])=>`<fieldset><legend>${title}</legend>${fields.map(([key,label])=>{const[min,max,integer]=ECONOMY_LIMITS[key],percent=key==='giantChance';return `<label>${label}<input type="number" data-economy-field="${key}" aria-label="${label}" min="${percent?min*100:min}" max="${percent?max*100:max}" step="${percent?0.1:integer?1:.05}"></label>`;}).join('')}</fieldset>`).join('')}
      <p class="gm-economy-note">普通练习仍二选一领取。挑战同时奖励贝壳、水滴和本关种子（种子仅首次完成）；每颗新种子独立判定巨型。已有种子的体型和成熟水数保持原值。</p>
      <div class="gm-flow-buttons"><button class="gm-primary" data-economy-action="save">保存数值</button><button data-economy-action="reload">放弃草稿</button><button data-economy-action="defaults">载入推荐值</button></div></section>
      <section class="gm-economy-preview"><h3>普通 / 巨型 · 实时比较</h3><label>同种花<select data-economy-flower aria-label="大小比较花种">${ALL_FLOWERS.map(flower=>`<option value="${esc(flower.id)}"${flower.id===selected?' selected':''}>${esc(flower.name)}</option>`).join('')}</select></label>
        <div class="gm-economy-comparison" data-economy-comparison><div class="gm-economy-ground"></div><div class="gm-economy-plant" data-economy-plant="normal"></div><div class="gm-economy-plant" data-economy-plant="giant"></div></div>
        <div class="gm-economy-comparison-labels"><div><strong>普通花</strong><span data-economy-water-count="normal"></span><button data-economy-action="water-normal">普通花 + 1 滴</button></div><div><strong>巨型花</strong><span data-economy-water-count="giant"></span><button data-economy-action="water-giant">巨型花 + 1 滴</button></div></div>
        <p data-economy-preview-note></p><div class="gm-flow-buttons"><button data-economy-action="reset">从种子开始</button><button data-economy-action="bloom">比较盛开大小</button></div><p class="gm-economy-note">预览使用花园同一套图片和成长绘制。这里浇水只改变预览，不消耗玩家的水。</p>
      </section></div>
      <p class="gm-economy-status" data-economy-status role="status" aria-live="polite"></p>
      <section class="gm-economy-backup"><h3>一次备份，保留全部调参</h3><p>包含数值、成长阶段大小与单花覆盖、浇水动效、全部音效开关/音量/本机替换音频、背景音乐。只导出已保存值，不包含孩子的学习、花园、钱包或录音。</p><div class="gm-flow-buttons"><button data-economy-action="export">导出全部已保存参数</button><button data-economy-action="import">选择参数备份</button><input type="file" accept=".json,application/json" data-economy-import hidden aria-label="选择参数备份文件"></div><div data-economy-import-review hidden><p></p><button class="gm-primary" data-economy-action="restore">恢复这份参数</button><button data-economy-action="cancel-import">取消</button></div></section>`;
    updateFields();if(!GM_SANDBOX)updateWallet();
  }};
}
