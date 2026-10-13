import {showDialog} from './dialog.js';
import {gardenToolArt} from './garden-art.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let waterRewardDialog=null;

// Rewards are already saved by the caller. This is the child's collection moment,
// not a second transaction: refresh, navigation and repeated taps cannot lose/regrant it.
export function closeWaterReward(){
  const dialog=waterRewardDialog;waterRewardDialog=null;
  if(dialog){dialog.close();dialog.remove();}
}

export function showWaterReward({water,seeds=0,fertilizer=0,onCollect}){
  closeWaterReward();
  const dialog=document.createElement('dialog');waterRewardDialog=dialog;
  dialog.className='reward-claim-dialog';
  dialog.setAttribute('aria-labelledby','water-reward-title');
  dialog.setAttribute('aria-describedby','water-reward-hint');
  dialog.setAttribute('aria-modal','true');
  dialog.innerHTML=`<div class="reward-claim-stars" aria-hidden="true">✦ ★ ✦</div><h2 id="water-reward-title">水壶来啦！</h2><p id="water-reward-hint">点点大水壶，带走小奖励</p><button class="reward-collect" data-reward-collect autofocus aria-label="收下水壶，可以浇水 ${water} 次"><span class="reward-can-art" aria-hidden="true">${gardenToolArt('water')}</span><span class="reward-water-count" data-material="water"><strong>+${water}</strong><small>次浇水</small></span><strong>收下水壶 <span aria-hidden="true">↓</span></strong></button>${seeds||fertilizer?`<div class="reward-extra">${seeds?`<span data-material="seeds">🌰 种子 <strong>+${seeds}</strong></span>`:''}${fertilizer?`<span data-material="fertilizer">🌿 肥料 <strong>+${fertilizer}</strong></span>`:''}</div>`:''}<small class="reward-saved">小奖励已保存在背包里</small>`;
  let collected=false;
  dialog.addEventListener('cancel',event=>event.preventDefault());
  // Keep the single action focused even in browsers that tab from a native
  // modal's last control to browser chrome. Old Safari also gets showDialog's trap.
  dialog.addEventListener('keydown',event=>{if(event.key==='Tab'){event.preventDefault();dialog.querySelector('[data-reward-collect]').focus();}});
  dialog.querySelector('[data-reward-collect]').onclick=()=>{
    if(collected||waterRewardDialog!==dialog)return;
    collected=true;dialog.querySelector('button').disabled=true;
    closeWaterReward();onCollect();
  };
  document.body.append(dialog);showDialog(dialog);
  return dialog.querySelector('[data-reward-collect]');
}

export function rankButton(adventure){
  const rank=adventure.rank;
  return `<button class="adventure-rank" data-adventure-passport data-level="${rank.level}" aria-label="打开冒险手册：${esc(rank.title)}"><span aria-hidden="true">${rank.icon}</span><span><strong>Lv.${rank.level}</strong><small>冒险手册</small></span></button>`;
}

export function walletMarkup(adventure){
  return `<div class="adventure-wallet" aria-label="我的花园背包">${[['seeds','🌰','种子'],['water','💧','水壶']].map(([key,symbol,label])=>`<span data-wallet-material="${key}" data-value="${adventure.stats[key]}" aria-label="${label} ${adventure.stats[key]}"><i aria-hidden="true">${symbol}</i><b>${adventure.stats[key]}</b></span>`).join('')}</div>`;
}

export function questSteps(active){
  const sequence=active.gardenPractice?['listen','speak']:active.checkup?['speak','choose']:!active.preview&&active.ids[active.index]!==active.newId?['remember','speak','choose']:['listen','choose','speak'];
  const labels={listen:['👂','听一听'],remember:['💭','想一想'],choose:['🧩','找图片'],speak:['🎤','说一说']};
  const current=sequence.indexOf(active.step);
  return `<ol class="quest-steps" aria-label="这次冒险的路线">${sequence.map((step,index)=>`<li data-quest-step="${step}" class="${index===current?'is-current':index<current?'is-passed':''}" ${index===current?'aria-current="step"':''}><span aria-hidden="true">${labels[step][0]}</span><b>${labels[step][1]}</b></li>`).join('')}</ol>`;
}

export function treasureMarkup(){
  return '<div class="game-treasure" aria-hidden="true"><span class="treasure-rays"></span><span class="treasure-spark s1">✦</span><span class="treasure-spark s2">✧</span><span class="treasure-spark s3">✦</span><svg viewBox="0 0 220 160"><ellipse cx="110" cy="144" rx="76" ry="10" fill="#556932" opacity=".16"/><g class="treasure-lid"><path d="M36 64Q33 14 73 14h74q40 0 37 50Z" fill="#dc9956" stroke="#865333" stroke-width="5"/><path d="M55 54q-1-22 20-23h70q21 1 20 23Z" fill="#895438"/><path d="M72 17v44m76-44v44" stroke="#ffe1a1" stroke-width="13"/></g><path d="m36 65 7 68q67 14 134 0l7-68Z" fill="#bd793f" stroke="#865333" stroke-width="5"/><path d="m40 77 140 0m-136 47h132" stroke="#edae62" stroke-width="7"/><path d="m71 68 2 68m74-68-2 68" stroke="#ffe1a1" stroke-width="13"/><rect x="95" y="71" width="30" height="37" rx="9" fill="#ffdc75" stroke="#d69537" stroke-width="3"/><path d="m110 80 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill="#bd7e32"/></svg></div>';
}

export function openAdventurePassport(adventure,avatar){
  if(document.querySelector('.adventure-passport'))return;
  const previous=document.activeElement,dialog=document.createElement('dialog');
  const {rank,stats,nextGoal}=adventure;
  dialog.className='adventure-passport focus-dialog';dialog.setAttribute('aria-labelledby','passport-title');
  dialog.innerHTML=`<header><h2 id="passport-title">我的冒险手册</h2><button class="circle-btn" data-close-passport aria-label="合上冒险手册">×</button></header><div class="passport-hero"><span class="passport-avatar">${avatar}</span><div><span class="passport-level">${rank.icon} Lv.${rank.level}</span><h3>${esc(rank.title)}</h3></div></div><div class="passport-progress"><div role="progressbar" aria-label="花园成长进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(rank.progress*100)}"><i style="width:${rank.progress*100}%"></i></div><p>${rank.target===null?'你的花园已经长成大世界啦':`再积累 ${Math.max(0,rank.target-rank.current)} 点成长 · ${esc(rank.nextTitle)}`}</p></div><div class="passport-stamps"><div><span>📖</span><b>${stats.learnedCount}</b><small>句新发现</small></div><div><span>🌼</span><b>${stats.bloomCount}</b><small>朵花开了</small></div><div><span>☀️</span><b>${stats.practiceDays}</b><small>天来玩过</small></div></div><div class="passport-goal"><span aria-hidden="true">🌱</span><div><strong>${esc(nextGoal.title)}</strong><p>${esc(nextGoal.hint)}</p></div></div><p class="passport-note">每认识一句新句、每养开一朵花，积累 1 点成长。称号记录探索和种植，不代表发音或记忆已经掌握。</p><button class="primary" data-close-passport>继续我的冒险</button>`;
  document.body.append(dialog);showDialog(dialog);
  dialog.querySelectorAll('[data-close-passport]').forEach(button=>button.onclick=()=>dialog.close());
  dialog.addEventListener('close',()=>{dialog.remove();if(previous?.isConnected)previous.focus();},{once:true});
}
