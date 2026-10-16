import { EVENTS } from '../xiaoya/content.js';
import { writeFileSync, mkdirSync } from 'node:fs';
const prompts = [
  {id:'guide-hello',text:'你好呀，我是小芽。点一下小耳朵，听我说。'},
  {id:'guide-wave',text:'早上见面，我们挥挥手。点一下小手，跟我打个招呼吧。'},
  {id:'guide-speak',text:'轮到你啦。点一下话筒，试着跟我说一句。说完，停一停就好。'},
  {id:'guide-replay',text:'点一下小耳朵，听听你刚才的声音。'},
  {id:'guide-gift',text:'谢谢你陪我一起玩。点一下小太阳，把它带回家吧。'},
  {id:'guide-place',text:'点一下发光的地方，把小太阳放好吧。'},
  {id:'guide-done',text:'小太阳住进来啦。下次还和我一起玩哦。'},
  {id:'guide-skip',text:'现在不想说，也没关系。先听我说一遍吧。'},
  {id:'guide-mic',text:'请身边的大人帮忙，打开话筒吧。'},
  {id:'guide-retry',text:'刚才没有听到声音。点一下话筒，再试一试吧。'},
  {id:'next',text:'我们继续玩吧。点一下中间的图画。'},
  {id:'finish',text:'我们玩好啦。点一下小勾勾，收好这次的小礼物吧。'},
  {id:'recorded',text:'你的声音留下来啦。可以点小耳朵听一听，再请身边的大人看一看。'},
  {id:'welcome',text:'欢迎来到小芽的小屋。点一幅图，和我一起玩吧。'},
  {id:'listen',text:'听一听，再点一幅图。哪一幅，说的是刚才那句话呢？'},
  {id:'speak',text:'轮到你啦。点一下话筒，把想说的话告诉我吧。'},
  {id:'again',text:'没关系。点小耳朵，再听一遍吧。也可以请大人帮忙。'},
  {id:'reward',text:'谢谢你陪我一起玩。点一下小礼物，把它带回家吧。'},
  {id:'house',text:'先点一件小家具，再点小屋里想放的地方。'},
  {id:'silent',text:'现在不想说，也没关系。先听我说一遍吧。'},
  {id:'assist-model',text:'不会说也没关系。先听我说，听完点话筒。话筒亮了，再跟我说。'},
  {id:'speech-pass',text:'我听懂啦！点小勾勾，收好这次相遇吧。'},
  {id:'speech-partial',text:'我听到了你说的一部分。点小芽，让我再教你一遍。'},
  {id:'speech-retry',text:'这次我还没听清。点小芽，听我说，再试一次吧。'},
  {id:'speech-silent',text:'还没听到你的声音。点小芽听我说，或者点话筒再试一次。'},
  {id:'speech-wait',text:'小耳朵还在准备。你可以先听我说，准备好会帮你听一听。'},
  {id:'house-placed',text:'放好啦。点下面的小房子，和我接着玩吧。'},
  ...EVENTS.flatMap(event=>event.contexts.map(context=>({id:context.id,text:context.help+'点一下小耳朵，听我说。'}))),
];
const contextIds = new Set([...EVENTS.flatMap(event => event.contexts.map(context => context.id)),
  'assist-model','speech-pass','speech-partial','speech-retry','speech-silent','speech-wait','house-placed']);
for (const prompt of prompts) Object.assign(prompt, contextIds.has(prompt.id)
  ? {engine:'edge-neural',voice:'zh-CN-XiaoxiaoNeural',model:'Microsoft Edge Neural TTS'}
  : {engine:'qwen-custom-voice',voice:'Serena',model:'Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice'});
mkdirSync('public/xiaoya/audio',{recursive:true});
writeFileSync('public/xiaoya/audio/prompts.json',JSON.stringify({version:2,kind:'prerecorded neural Chinese guidance',language:'Chinese',prompts},null,2)+'\n');
console.log(`${prompts.length} Chinese help prompts prepared`);
