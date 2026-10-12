import {PLANTS} from './garden.js';
export function gardenToolArt(type){
  const art={
    plant:'<path d="M22 18h40l4 47q-22 10-48 0Z" fill="#ebc888" stroke="#a98549" stroke-width="3"/><path d="M20 20h44" stroke="#fff1c6" stroke-width="5"/><ellipse cx="42" cy="45" rx="10" ry="14" transform="rotate(32 42 45)" fill="#9c7447"/><path d="m37 53 10-16" stroke="#f8e0a6" stroke-width="2"/><path d="M42 28q-2-16 12-16-1 13-12 16" fill="#84aa6c"/>',
    water:'<path d="M25 28C0 9-1 62 22 54" fill="none" stroke="#6da2ba" stroke-width="7"/><path d="m53 40 19-20 5 5-12 31-13 5" fill="#8ac7d9" stroke="#568da5" stroke-width="2"/><path d="M19 28h38v32q-18 17-38 0Z" fill="#85bed4" stroke="#568da5" stroke-width="2"/><ellipse cx="38" cy="28" rx="19" ry="5" fill="#c5e6ee"/><path d="M29 45h17m-8-8v17" stroke="#dff3f5" stroke-width="4" stroke-linecap="round"/><path d="m68 15 10 10" stroke="#568da5" stroke-width="6" stroke-linecap="round"/>',
    fertilize:'<path d="m27 10 7 15h16l7-15" fill="#cedaa0" stroke="#829b64" stroke-width="3"/><path d="M31 25C7 57 15 71 42 71s35-14 11-46Z" fill="#bfd593" stroke="#829b64" stroke-width="3"/><path d="M42 60V38m0 12Q23 47 27 35q14 2 15 15m0-4q3-16 16-12-1 12-16 12" fill="#688f54" stroke="#688f54" stroke-width="2"/>'
  };
  return `<svg viewBox="0 0 84 80" aria-hidden="true">${art[type]||art.plant}</svg>`;
}
export function plantDrawing(kind,growth,scale=1){
 const plant=PLANTS.find(item=>item.id===kind)||PLANTS[0],color=plant.color;
 let flower='';
 if(growth===3){if(kind==='sunflower')flower=Array.from({length:9},(_,i)=>`<ellipse cx="75" cy="36" rx="9" ry="17" fill="${color}" transform="rotate(${i*40} 75 57)"/>`).join('')+'<circle cx="75" cy="57" r="16" fill="#94734d"/>';else if(kind==='tulip')flower=`<path d="M48 33 62 47 75 25 88 47 102 33v29q-27 27-54 0Z" fill="${color}"/>`;else if(kind==='strawberry')flower=`<path d="M49 48q25-13 51 0 5 29-25 46-31-19-26-46" fill="${color}"/><path d="m75 50-23-9 17-1 6-13 7 13 17 1Z" fill="#77a063"/>${[[-14,8],[0,15],[13,7],[-6,27],[8,29]].map(([x,y])=>`<ellipse cx="${75+x}" cy="${48+y}" rx="2" ry="3" fill="#f9e4aa"/>`).join('')}`;else flower=[[-16,0],[14,14],[-13,28]].map(([x,y])=>`<path d="M${75+x-10} ${34+y}q10-15 20 0l4 15q-14 6-28 0Z" fill="${color}"/>`).join('');}
 else if(growth===2)flower=`<ellipse cx="75" cy="57" rx="12" ry="19" fill="${color}"/><path d="m62 63 13 13 13-13" fill="#7d9f63"/>`;
 return `<svg class="garden-plant-picture" viewBox="0 0 150 165" aria-hidden="true"><ellipse cx="75" cy="145" rx="57" ry="12" fill="#d8c2a0"/><g transform="translate(75 142) scale(${scale}) translate(-75 -142)">${growth<0?'<path d="M45 141h60m-41-5 6 14m18-14-6 14" stroke="#b59874" stroke-width="3"/>':growth===0?'<ellipse cx="75" cy="139" rx="9" ry="5" fill="#ab8454"/><path d="M74 137v-7q-13-13-16-4 2 7 16 4" fill="#8ca874"/>':`<path d="M75 142V${growth===1?'88':'59'}" stroke="#789561" stroke-width="6" fill="none"/><path d="M74 120q-37-3-33-29 29 1 33 29m2-13q32-6 31-29-28 3-31 29" fill="#8fb573"/>${growth===1?'<path d="M74 91q-20-20-5-27 13 6 5 27" fill="#92b779"/>':flower}`}</g></svg>`;
}
