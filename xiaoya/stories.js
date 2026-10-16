import {EVENTS} from './content.js';

// Keep original course IDs: changing the presentation never erases evidence.
export const STORIES = [
  {id:'food-water',image:'water-v1.webp',frames:['玩球后，小芽口渴了','杯子空了，小芽向朋友要水','朋友把水倒进杯子','小芽喝到了水'],cueFrame:1},
  {id:'play-box',image:'help-v1.webp',frames:['玩具在盖紧的箱子里','小芽打不开，向朋友求助','朋友和小芽一起打开箱子','小芽拿到了玩具'],cueFrame:1},
  {id:'hello-goodbye',image:'goodbye-v2.webp',frames:['两个朋友一起玩','朋友背起小包，准备离开','朋友回头挥手告别','伙伴回应，朋友向外走远'],cueFrame:2}
].map(story=>Object.freeze({...story,event:EVENTS.find(event=>event.id===story.id)}));
export const storyFor=id=>STORIES.find(story=>story.id===id)||STORIES[0];
