import {showDialog} from './dialog.js';
import {SKINS,SKIN_STORAGE_KEY,DEFAULT_SKIN_ID,getSkinProgress,resolveSelectedSkin} from './skins.js';

// Frozen source roles from Creative Asset Lab palette library 2026.09.26.2.
export const SKIN_PALETTES = Object.freeze({
  sunny:{number:24,name:'奶纸晴蓝',bg:'#EFF1F5',surface:'#E6E9EF',ink:'#4C4F69',accent:'#1E66F5'},
  classic:{number:null,name:'经典小芽',bg:'#fcf9f2',surface:'#e9efd7',ink:'#344332',accent:'#547442'},
  meadow:{number:9,name:'雾林茶奶',bg:'#EFEADF',surface:'#CCD4BD',ink:'#344B45',accent:'#D08D6C'},
  peach:{number:10,name:'湖畔暮桃',bg:'#E7ECEF',surface:'#C1D1D2',ink:'#304A5D',accent:'#D6A08C'},
  grape:{number:16,name:'纸白葡萄',bg:'#F8F9FA',surface:'#F1F3F5',ink:'#212529',accent:'#BE4BDB'},
});
let skinDialog=null;
function storedSkin(){try{return localStorage.getItem(SKIN_STORAGE_KEY);}catch{return DEFAULT_SKIN_ID;}}
export function applySavedSkin(state,today){
  const id=resolveSelectedSkin(state,today,storedSkin());
  document.documentElement.dataset.skin=id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',SKIN_PALETTES[id].bg);
  return id;
}
function remainingLabel(skin){return {newLessons:`再认识 ${skin.remaining} 句`,reviews:`再复习 ${skin.remaining} 次`,practiceDays:`再练习 ${skin.remaining} 天`}[skin.metric]||'免费使用';}
export function skinEntryMarkup(state,today){
  const skins=getSkinProgress(state,today),next=skins.find(skin=>!skin.unlocked),count=skins.filter(skin=>skin.unlocked).length;
  return `<button class="skin-entry" data-open-skins><span aria-hidden="true">🎨</span><span><strong>花园换装 · 已收集 ${count} / ${skins.length}</strong><small>${next?`${remainingLabel(next)}，点亮${next.title}`:'五个小世界都点亮啦！点一下换装'}</small></span><span aria-hidden="true">›</span></button>`;
}
export function skinRewardMarkup(state,today,previous=[]){
  const newSkins=getSkinProgress(state,today).filter(s=>s.target&&s.unlocked&&!previous.includes(s.id));
  return newSkins.length?`<button class="skin-unlock-note" data-open-skins="${newSkins[0].id}">🎁 新皮肤！${newSkins.map(s=>s.title).join('、')} · 看看</button>`:'';
}
function previewPicture(skin){
  const p=SKIN_PALETTES[skin.id];
  return `<svg viewBox="0 0 320 210" role="img" aria-label="${skin.title}配色预览"><rect x="24" y="10" width="272" height="190" rx="25" fill="white"/><rect x="37" y="24" width="246" height="134" rx="19" fill="${p.bg}"/><circle cx="236" cy="54" r="15" fill="${p.accent}" opacity=".75"/><path d="M37 130Q92 61 163 119Q238 75 283 120V140Q283 158 265 158H55Q37 158 37 140Z" fill="${p.surface}"/><path d="M163 140V75m-1 41q-37-1-32-26 28 0 32 26m2-10q30-4 28-27-24-1-28 27" fill="${p.accent}" stroke="${p.ink}" stroke-width="3" stroke-linecap="round"/><g fill="${p.accent}"><circle cx="163" cy="64" r="14"/><circle cx="146" cy="76" r="14"/><circle cx="153" cy="95" r="14"/><circle cx="175" cy="95" r="14"/><circle cx="180" cy="76" r="14"/></g><circle cx="163" cy="80" r="12" fill="white"/><path d="M158 83q5 5 10 0" fill="none" stroke="${p.ink}" stroke-width="2" stroke-linecap="round"/><circle cx="159" cy="77" r="1.8" fill="${p.ink}"/><circle cx="168" cy="77" r="1.8" fill="${p.ink}"/><rect x="85" y="168" width="150" height="18" rx="9" fill="${p.accent}"/><path d="m153 177 6 3v-6z" fill="white"/></svg>`;
}
export function closeSkinPicker(){skinDialog?.close();}
export function openSkinPicker({getState,today,notify=()=>{},onChange=()=>{},initialId}={}){
  if(skinDialog?.isConnected)return;
  const prior=document.activeElement,d=document.createElement('dialog');
  d.className='skin-dialog focus-dialog';d.setAttribute('aria-labelledby','skin-picker-title');
  let index=Math.max(0,SKINS.findIndex(s=>s.id===(initialId||applySavedSkin(getState(),today()))));
  function draw(){
    const skins=getSkinProgress(getState(),today()),skin=skins[index],p=SKIN_PALETTES[skin.id],active=applySavedSkin(getState(),today());
    d.innerHTML=`<header><h2 id="skin-picker-title">我的小世界</h2><button data-close-skins aria-label="关闭换装">×</button></header><p class="skin-status" role="status">${skin.unlocked?'✨ 已点亮':'🔒 等你来点亮'} · 收集 ${skins.filter(s=>s.unlocked).length} / ${skins.length}</p><div class="skin-preview" style="--preview-bg:${p.bg};--preview-surface:${p.surface};--preview-ink:${p.ink};--preview-accent:${p.accent}">${previewPicture(skin)}</div><h3 class="skin-name">${skin.emoji} ${skin.title}</h3><p class="skin-rule">${skin.rule}${skin.target?` · ${Math.min(skin.current,skin.target)} / ${skin.target}`:''}</p><progress class="skin-progress" max="${skin.target||1}" value="${skin.target?Math.min(skin.current,skin.target):1}" aria-label="${skin.title}收集进度"></progress><div class="skin-pagination"><button data-skin-page="-1" aria-label="上一个皮肤" ${index===0?'disabled':''}>← 上一个</button><span>${index+1} / ${skins.length}</span><button data-skin-page="1" aria-label="下一个皮肤" ${index===skins.length-1?'disabled':''}>下一个 →</button></div><button class="primary" data-use-skin="${skin.id}" ${skin.unlocked?'':'disabled'}>${!skin.unlocked?remainingLabel(skin):active===skin.id?'正在用 · 选好啦':'换上这个小世界'}</button><p class="skin-source">${skin.target?'慢慢来，累计就能收集；不用连续打卡':'随时免费换，不消耗种子和水滴'}</p>`;
    d.querySelector('[data-close-skins]').onclick=()=>d.close();
    d.querySelectorAll('[data-skin-page]').forEach(button=>button.onclick=()=>{index+=Number(button.dataset.skinPage);draw();d.querySelector(button.dataset.skinPage==='1'?'[data-skin-page="-1"]':'[data-skin-page="1"]').focus({preventScroll:true});});
    d.querySelector('[data-use-skin]').onclick=()=>{
      if(!getSkinProgress(getState(),today()).find(s=>s.id===skin.id)?.unlocked){draw();return;}
      try{localStorage.setItem(SKIN_STORAGE_KEY,skin.id);}catch{const status=d.querySelector('.skin-status');status.setAttribute('role','alert');status.textContent='没能保存换装，请让家长检查浏览器存储空间后再试。';return;}
      applySavedSkin(getState(),today());d.close();onChange();notify(`${skin.emoji} 换好啦！欢迎来到${skin.title}`);
    };
  }
  draw();document.body.append(d);skinDialog=d;
  d.onclose=()=>{d.remove();skinDialog=null;if(prior?.isConnected)prior.focus({preventScroll:true});};
  showDialog(d);d.querySelector('[data-close-skins]').focus({preventScroll:true});
}
