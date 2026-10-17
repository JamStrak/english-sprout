import {FLOWERS} from './garden-meadow.js';

const n=(value)=>Number(value.toFixed(2));
const petals=(count,rx,ry,color)=>Array.from({length:count},(_,i)=>`<ellipse cx="0" cy="-20" rx="${rx}" ry="${ry}" fill="${color}" stroke="#927657" stroke-opacity=".17" stroke-width="1.5" transform="rotate(${n(i*360/count)})"/>`).join('');

function blossom(flower) {
  const color=flower.color;
  if(flower.shape==='bow')return `<path d="M-5-5C-23-29-42-28-36-5q-5 28 31 10m10-10C23-29 42-28 36-5q5 28-31 10" fill="${color}" stroke="#947283" stroke-width="2"/><path d="M-8 8l-13 27 13-4 5 9L5 10M8 8l13 27-13-4-5 9L-5 10" fill="${color}" stroke="#947283" stroke-width="1.5"/><path d="M-27-11l19 10M27-11L8-1" stroke="#fff8ef" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/><ellipse rx="10" ry="11" fill="${color}" stroke="#947283" stroke-width="2"/><circle cx="-3" cy="-3" r="2.5" fill="#fff8ef"/>`;
  if(flower.shape==='tulip')return `<path d="M-30-24q16 4 30 18 14-14 30-18 5 49-30 49T-30-24Z" fill="${color}" stroke="#c97669" stroke-width="2"/><path d="M-18-4L0-34 18-4Q0 13-18-4" fill="#f5ad9b"/><path d="M0 24V-3" stroke="#d18577" stroke-width="2"/>`;
  if(flower.shape==='bellflower')return `<path d="M0 18V-24m0 14q-22-15-28 3m28 8q23-14 28 4" stroke="#618c5c" stroke-width="4"/>${[[-28,-5],[0,-25],[28,8]].map(([x,y])=>`<path d="M${x-10} ${y}q10-11 20 0l6 22q-16-8-32 0Z" fill="${color}" stroke="#6d88b3" stroke-width="2"/><ellipse cx="${x}" cy="${y+21}" rx="15" ry="4" fill="#d3def0"/>`).join('')}`;
  if(flower.shape==='sunflower')return petals(12,9,23,color)+'<circle r="20" fill="#a67c4a"/><circle r="15" fill="#bb925c"/><path d="M-8-7h2m9 0h2m-18 8h2m9 0h2m9 0h2m-20 8h2m9 0h2" stroke="#87663d" stroke-width="3" stroke-linecap="round"/>';
  if(flower.shape==='poppy')return petals(4,24,26,color)+'<circle r="11" fill="#66554a"/><circle r="5" fill="#dfb95f"/>';
  if(flower.shape==='violet')return petals(5,18,20,color)+'<path d="M-14 7q14-19 28 0-14 23-28 0" fill="#8871a0"/><circle r="7" fill="#f0ce6d"/>';
  return petals(10,9,22,color)+'<circle r="13" fill="#efc965"/><circle cx="-4" cy="-3" r="2" fill="#ceaa4f"/>';
}

/**
 * Soil-level plant, no pot. Every pour changes visible geometry, up to full bloom.
 * The UI sizes the planting target using flower.scale (1 or 1.75), anchored at soil.
 */
export function meadowPlantArt(input,waterings=0) {
  // Resolve known metadata instead of inserting caller-controlled text into SVG.
  const flower=FLOWERS.find((item)=>item.id===input?.id)||FLOWERS[0];
  const growth=Number.isFinite(waterings)?Math.max(0,Math.min(flower.waterNeeded,Math.floor(waterings))):0;
  const progress=growth/flower.waterNeeded;
  const bloom=growth===flower.waterNeeded;
  const stemHeight=n(15+progress*87);
  const top=n(159-stemHeight);
  const leafSize=n(.28+progress*.72);
  const leafPairs=1+Math.floor(progress*2);
  let leaves='';
  for(let i=0;i<leafPairs;i++) {
    const y=n(151-i*(stemHeight-8)/Math.max(leafPairs,1));
    const scale=n(leafSize*(1-i*.14));
    leaves+=`<g transform="translate(80 ${y}) scale(${scale})"><path d="M0 0q-33 1-32-25Q-5-28 0 0" fill="#83b273" stroke="#5e9059" stroke-width="2"/><path d="M0-6q31 2 31-24Q5-29 0-6" fill="#a2c585" stroke="#5e9059" stroke-width="2"/><path d="M-5-3l-16-14M5-9l16-13" stroke="#d7e8af" stroke-width="2" stroke-linecap="round"/></g>`;
  }
  let head='';
  if(bloom)head=`<g data-part="flower" transform="translate(80 ${top})">${blossom(flower)}</g>`;
  else if(progress>=.5) {
    const budSize=n(8+progress*10);
    const open=n((progress-.5)*28);
    head=`<g data-part="bud" transform="translate(80 ${top})"><path d="M0 9q-${budSize+open} -7-${budSize} -${budSize+3}Q-5 -${budSize+10} 0 -${budSize+3}q6-8 ${budSize} 0Q${budSize+open} 2 0 9Z" fill="${flower.color}" stroke="#698d5b" stroke-width="2"/><path d="M-9 5L0 10 9 5M0 9V-5" stroke="#81a565" stroke-width="3" stroke-linecap="round"/></g>`;
  }
  return `<svg viewBox="0 0 160 180" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-flower="${flower.id}" data-growth="${growth}" data-bloom="${bloom}" data-giant="${flower.giant}" data-scale="${flower.scale}"><ellipse data-part="soil" cx="80" cy="164" rx="${n(19+progress*15)}" ry="6" fill="#8d8f59" opacity=".25"/><path data-part="stem" d="M80 162Q${n(76-progress*3)} ${n(162-stemHeight/2)} 80 ${top}" stroke="#608b55" stroke-width="${n(3+progress*3)}" stroke-linecap="round"/>${leaves}${head}<path d="M67 165l-3-7m31 7 3-9" stroke="#88aa6d" stroke-width="3" stroke-linecap="round"/></svg>`;
}
