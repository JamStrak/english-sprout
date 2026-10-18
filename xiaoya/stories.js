import {EVENTS} from './content.js';
import {CORE_PHRASE_EVENT_IDS} from './curriculum.js';

// A story ID always remains its original event ID. Replacing vector art with an
// image later changes only `image`; it never resets evidence or garden rewards.
const illustrated = {
  'family-love':{image:'love-paper-v1.webp',imageLayout:'single'},
  'hello-thanks':{image:'thanks-paper-v1.webp',imageLayout:'single'},
  'outside-go-home':{image:'home-paper-v1.webp',imageLayout:'single'},
  'food-water':{image:'water-v1.webp',frames:['玩球后，小芽口渴了','杯子空了，小芽向朋友要水','朋友把水倒进杯子','小芽喝到了水'],cueFrame:1},
  'play-box':{image:'help-v1.webp',frames:['玩具在盖紧的箱子里','小芽打不开，向朋友求助','朋友和小芽一起打开箱子','小芽拿到了玩具'],cueFrame:1},
  'hello-goodbye':{image:'goodbye-v2.webp',frames:['两个朋友一起玩','朋友背起小包，准备离开','朋友回头挥手告别','伙伴回应，朋友向外走远'],cueFrame:2},
};
const intermediate = {
  'hello-morning':'小芽睁开眼睛，挥手回应朋友', 'hello-welcome':'新朋友走近，小芽挥手迎接',
  'food-more':'朋友把水果从篮子里拿出来','food-no-thanks':'朋友把点心收回去',
  'play-ball':'朋友走到球旁边，两个人面对面','play-bridge':'朋友扶住桥板，小芽慢慢放下',
  'care-hands':'小手搓出泡泡，清水洗掉泥点','care-zip':'朋友扶好外套，慢慢拉起拉链',
  'care-socks':'小芽脱下湿袜子，朋友拿来干袜子','outside-cat':'两个人蹲下，看清树边的小猫',
  'outside-bird':'朋友抬起头，顺着小芽的目光看','outside-dog':'两个人顺着声音走向围栏',
  'bed-book':'朋友坐过来，两个人一起翻开书','bed-story':'朋友打开书，开始讲故事','bed-night':'朋友盖好毯子，轻轻挥手',
  'hello-thanks':'小芽接住朋友递来的红苹果','hello-sorry':'小芽低下头道歉，伸手帮忙收积木','hello-okay':'小芽微笑回应，伸手安慰朋友',
  'food-hungry':'朋友把饭碗放到小芽面前','food-full':'朋友把饭勺收回去，不再添饭','food-spoon':'勺子从朋友那边递到小芽面前',
  'food-apple':'小芽把苹果递给朋友一起尝','food-hot':'两个人等一等，碗上的热气慢慢变少','food-milk':'朋友把白白的牛奶倒进杯子',
  'care-teeth':'小芽拿着牙刷，在牙齿上轻轻刷','care-face':'两个人用水洗掉脸上的颜色','care-tissue':'小芽拿纸巾，轻轻擦鼻子','care-dry':'小芽和朋友拿毛巾擦手','care-shoes':'小芽把脚伸进鞋子，一只再一只',
  'play-turn':'朋友走开空出滑梯，小芽爬上台阶','play-roll':'球贴着地面，慢慢滚向小芽','play-catch':'软球轻轻飞向朋友张开的双手','play-tower':'积木一块接着一块向上叠','play-again':'小芽把倒下的积木重新放稳','play-did-it':'最后一块拼图落进空位','play-tidy':'小芽把地上的球拿起来，放进盒子',
  'outside-hand':'小芽和朋友把手牵在一起','outside-rain':'朋友也走到窗边，看见了雨点','bed-hug':'朋友张开双臂，小芽愿意地靠近',
};
// The spoken expression sets the route; artwork is a replaceable view.
const first = CORE_PHRASE_EVENT_IDS;
const twoFrames = new Set(['hello-sorry','hello-okay','play-again','food-full','care-zip']);
const ordered = [...first.map(id=>EVENTS.find(event=>event.id===id)),...EVENTS.filter(event=>!first.includes(event.id))];
export const STORIES = Object.freeze(ordered.map(event=>{
  const art = illustrated[event.id];
  const frames = Object.freeze(art?.frames || (event.id==='play-did-it'?['拼图还差最后一块','小芽把最后一块放进空位','小芽开心地举手，告诉朋友自己做到了','朋友为小芽拍拍手']:[event.setup,event.request,intermediate[event.id]||event.request,event.resolution]));
  const cueFrame=art?.cueFrame??(event.id==='play-did-it'?2:1);
  return Object.freeze({id:event.id,event,...art,frames,cueFrame,
    teachingFrames:Object.freeze(twoFrames.has(event.id)?[0,cueFrame]:[cueFrame]),
    vector:Object.freeze({kind:event.illustration,action:event.id,theme:event.theme}),
    helpAudio:event.id,
  });
}));
export const storyFor = id => STORIES.find(story=>story.id===id)||STORIES[0];
