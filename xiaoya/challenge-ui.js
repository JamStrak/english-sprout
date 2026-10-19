import {icon} from './art.js';
import {shellArt,dropArt,seedArt} from './garden-art.js';
import {meadowPlantArt} from './meadow-art.js';
import {SPECIAL_FLOWERS} from './garden-meadow.js';
import {paperLayer} from './paper-art.js';

export const flagArt=()=>`<svg viewBox="0 0 64 64" fill="none" aria-hidden="true">${paperLayer('challenge-flag','<path d="M20 55V10" stroke="#66785a" stroke-width="5" stroke-linecap="round"/><path d="M22 11Q34 4 48 14L43 23 48 31Q35 23 22 30Z" fill="#e5b96d" stroke="#9c7b56" stroke-width="2"/><path d="m34 14 2 4 5 1-4 3 1 4-4-2-4 2 1-4-3-3 4-1Z" fill="#fff9e8"/><ellipse cx="20" cy="56" rx="12" ry="3" fill="#80936c" opacity=".2"/>',{width:64,height:64})}</svg>`;
export function challengeFlag(summary,{invite=false}={}) {
  if(!summary.units.some(u=>u.available))return '';
  return `<button class="challenge-flag ${invite?'is-invited':''}" data-action="challenges" aria-label="花园挑战，进度会保留${invite?'，可以来试试了':''}">${flagArt()}${invite?'<i aria-hidden="true"></i>':''}</button>`;
}
export function challengeSteps(unit){return `<div class="challenge-steps" role="img" aria-label="已完成 ${unit.completedCount} 步，共四步">${unit.items.map(i=>`<i class="${i.passed?'done':''}">${i.passed?icon('check',18):'<span></span>'}</i>`).join('')}</div>`;}
export function challengeBoard({summary,header,balance,seedPending=false}) {
  const next=summary.units.find(u=>u.available&&!u.completed);
  return `${header}<main class="challenge-board" data-challenge-board>${balance}<button class="challenge-title" data-action="challenge-guide" aria-label="听花园挑战怎么玩">${flagArt()}<span>花园挑战</span>${icon('sound',22)}</button><div class="challenge-prize-preview" aria-label="每组首次完成可获得四枚贝壳和六滴水">${shellArt()}<b>4</b><span>＋</span>${dropArt()}<b>6</b></div><div class="challenge-units">${summary.units.map((u,i)=>`<button class="challenge-unit ${u.completed?'completed':''} ${u.id===next?.id?'recommended':''}" data-challenge-unit="${u.id}" data-complete="${u.completed}" aria-label="第${i+1}组，${u.completed?'已经完成，可再练习':u.available?`已完成${u.completedCount}步，点击继续`:'先学这组表达'}"><span class="challenge-unit-number">${u.completed?icon('check',30):i+1}</span>${challengeSteps(u)}${!u.available?`<span class="challenge-learn">${icon('play',20)}</span>`:''}</button>`).join('')}</div><div class="challenge-milestones" aria-label="完成三组和六组不同挑战，各有一颗限定种子">${[3,6].map((n,i)=>`<div class="challenge-milestone ${summary.completedCount>=n?'earned':''}"><span class="milestone-flower">${meadowPlantArt(SPECIAL_FLOWERS[i],5)}</span><span>${Math.min(n,summary.completedCount)} / ${n}</span></div>`).join('')}</div>${seedPending?`<button class="challenge-seed-button" data-action="challenge-seed" aria-label="领取保留的特别种子">${seedArt()}${icon('gift',26)}</button>`:''}<button class="challenge-back" data-action="garden" aria-label="回到花园，挑战进度会保留">${icon('house',28)}</button></main>`;
}
export function challengePrize({header,unit,hasSeed,primary}) {
  return `${header}<main class="challenge-prize" data-challenge-complete="${unit.id}"><div class="challenge-fanfare" aria-hidden="true">${Array.from({length:12},(_,i)=>`<i style="--i:${i}">✦</i>`).join('')}${flagArt()}</div>${challengeSteps(unit)}<div class="reward-treasure challenge-treasure"><button class="reward-resource" data-action="shell-purpose" aria-label="四枚贝壳可以买种子">${shellArt()}<b>+4</b></button><button class="reward-resource" data-action="water-purpose" aria-label="六滴水可以浇花">${dropArt()}<b>+6</b></button></div>${hasSeed?`<div class="challenge-seed-earned" aria-label="还获得了一颗特别种子，空出手后可以领取">${seedArt()}${icon('star',24)}</div>`:''}${primary('garden','把挑战礼物带回花园',icon('house',46))}</main>`;
}
