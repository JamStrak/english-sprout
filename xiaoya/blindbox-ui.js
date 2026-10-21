import {getEconomySettings} from './economy-settings.js';
import {flowerForSeed} from './garden-meadow.js';
import {packArt,shellArt,seedArtForFlower} from './garden-art.js';
import {seedAppearance} from './seed-appearance.js';
import {icon} from './art.js';

const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// The six bags are choices of wrapping, not six different odds or a finite pool.
// Only the persisted pendingSeed determines the result, including after reload.
export function blindboxView({state,header,balance,selection=null,busy=false}) {
  const flower=state.pendingSeed?flowerForSeed(state.pendingSeed):null;
  if(flower){
    const seed=seedAppearance(flower),opening=selection?.animate===true;
    return `${header}<main class="blindbox-view blindbox-reveal ${opening?'is-opening':''}" data-blindbox-phase="revealed" data-flower-id="${flower.id}">${balance}
      <div class="seed-reveal-stage" aria-hidden="true"><div class="seed-reveal-halo"></div>${Array.from({length:8},(_,i)=>`<i class="seed-spark" style="--spark:${i}"></i>`).join('')}<div class="seed-reveal-art">${seedArtForFlower(flower)}</div>${opening?`<div class="seed-open-wrap">${packArt()}</div>`:''}</div>
      <div class="seed-reveal-name" aria-live="polite"><button class="seed-name-button" data-action="blindbox-voice" aria-label="听一听：${esc(seed.seedName)}">${esc(seed.seedName)}${icon('sound',24)}</button></div>
      <button class="seed-plant-button" data-action="blindbox-plant" aria-label="带上${esc(seed.seedName)}去花园种下">${icon('place',32)}<span>去种下</span>${icon('arrow',26)}</button>
    </main>`;
  }
  return `${header}<main class="blindbox-view" data-blindbox-phase="choose" aria-busy="${busy}">${balance}
    <button class="blindbox-instruction" data-action="blindbox-voice" aria-label="听一听：选一袋，用${getEconomySettings().packPrice}枚贝壳打开">选一袋，拆开看看${icon('sound',24)}</button>
    <div class="blindbox-price" aria-label="每袋需要${getEconomySettings().packPrice}枚贝壳">${shellArt()}<b>${getEconomySettings().packPrice}</b><span>一袋</span></div>
    <div class="blindbox-bags" role="group" aria-label="六个一样的惊喜种子袋，选中一袋才扣贝壳">${Array.from({length:6},(_,i)=>`<button class="blindbox-bag ${selection?.index===i?'is-selected':''}" data-mystery-bag="${i}" aria-label="选择第${i+1}袋，用${getEconomySettings().packPrice}枚贝壳打开" ${busy?'disabled':''}><span class="blindbox-bag-art" aria-hidden="true">${packArt()}</span><span class="blindbox-bag-shadow" aria-hidden="true"></span></button>`).join('')}</div>
    <div class="blindbox-footer"><button class="icon-button" data-action="blindbox-back" aria-label="返回种子商店，不购买">${icon('back',30)}</button><button class="icon-button" data-action="next-event" aria-label="玩英语，收集贝壳或水">${icon('play',30)}</button></div>
  </main>`;
}
