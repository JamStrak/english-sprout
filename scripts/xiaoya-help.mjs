import { EVENTS } from '../xiaoya/content.js';
import { writeFileSync, mkdirSync } from 'node:fs';
const prompts = [
  {id:'welcome',text:'欢迎来到小芽的小屋！点一幅图，和小芽一起玩吧。'},
  {id:'listen',text:'听一听，哪幅图和听到的话是一回事？'},
  {id:'speak',text:'现在轮到你啦！点一下话筒，把想说的话告诉小芽。'},
  {id:'again',text:'没关系。可以再听一遍，也可以请身边的大人陪你一起。'},
  {id:'reward',text:'谢谢你和小芽一起玩！把这件小礼物放进小屋吧。'},
  {id:'house',text:'先点一件小家具，再点小屋里想放的位置。也可以拖动它。'},
  {id:'silent',text:'这次先看小芽做也可以。等你准备好了，再告诉小芽。'},
  ...EVENTS.flatMap(event=>event.contexts.map(context=>({id:context.id,text:context.help+'点小耳朵，听听可以怎么说。'}))),
];
mkdirSync('public/xiaoya/audio',{recursive:true});
writeFileSync('public/xiaoya/audio/prompts.json',JSON.stringify({voice:'Microsoft Huihui Desktop',kind:'offline synthesized Chinese help',prompts},null,2));
console.log(`${prompts.length} Chinese help prompts prepared`);
