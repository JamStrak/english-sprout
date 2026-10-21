import {FLOWERS,ECONOMY,hasUnlimitedResources} from './garden-meadow.js';
import {meadowPlantArt} from './meadow-art.js';
import {shellArt,packArt,seedArtForFlower} from './garden-art.js';
import {icon} from './art.js';

const flowerFor=id=>FLOWERS.find(f=>f.id===id);
function price(value,owned){return `<span class="seed-price" aria-hidden="true">${shellArt()}<b>${value}</b><span class="shell-progress">${Array.from({length:value},(_,i)=>`<i class="${i<owned?'filled':''}"></i>`).join('')}</span></span>`;}
export function offerPicture(offer){const f=flowerFor(offer.flowerId);return `<span class="offer-picture" aria-hidden="true">${meadowPlantArt(f,f.waterNeeded)}<span class="offer-seed">${seedArtForFlower(f)}</span></span>`;}
function offerCard(offer,state,source){
  if(!offer)return '';
  const f=flowerFor(offer.flowerId),kept=state.shop.reserved?.id===offer.id;
  return `<section class="seed-offer ${source==='reserved'?'is-reserved':''}" data-offer-id="${offer.id}" data-flower-id="${offer.flowerId}" data-price="${offer.price}">
    <button class="seed-purchase" data-buy-offer="${offer.id}" data-source="${source}" aria-label="${source==='reserved'?'为你保留的':''}${f.name}种子，需要${offer.price}枚贝壳，现有${hasUnlimitedResources(state)?'无限':state.shells}枚">
      <span class="shop-card-label">${source==='reserved'?'帮你留着':'这包种子'}</span>${offerPicture(offer)}${price(offer.price,hasUnlimitedResources(state)?Infinity:state.shells)}
    </button>
    ${source==='shop'?`<button class="reserve-seed ${kept?'is-kept':''}" data-action="reserve-offer" data-reserve-offer="${offer.id}" aria-label="${kept?'这包已经帮你留好':'帮我留下这包种子'}" aria-pressed="${kept}">${icon(kept?'check':'star',24)}</button>`:''}
  </section>`;
}
export function seedShopView({state,header,balance}){
  return `${header}<main class="seed-shop-view">${balance}<div class="seed-shop-shelf">
    <section class="seed-offer mystery-offer"><button class="seed-purchase" data-action="shop-pack" aria-label="进入盲盒，六个袋子选一个，每袋两枚贝壳"><span class="shop-card-label">惊喜种子</span><span class="mystery-picture" aria-hidden="true">${packArt()}<b>?</b></span>${price(ECONOMY.packPrice,hasUnlimitedResources(state)?Infinity:state.shells)}</button></section>
    ${offerCard(state.shop.offer,state,'shop')}
    ${state.shop.reserved&&state.shop.reserved.id!==state.shop.offer?.id?offerCard(state.shop.reserved,state,'reserved'):''}
    </div><div class="shop-footer"><button class="icon-button" data-action="shop-back" aria-label="回到花园">${icon('house',32)}</button><button class="icon-button" data-action="next-event" aria-label="玩英语，收集贝壳或水">${icon('play',32)}</button></div></main>`;
}
