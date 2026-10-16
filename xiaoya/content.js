/** Small, offline-friendly content catalogue. English is for audio and the parent/exploration views only. */
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

export const THEMES = freeze([
  {id:'hello',name:'见面与告别',title:'见面与告别',icon:'☀️',color:'#edb768'},
  {id:'food',name:'吃饭喝水',title:'吃饭喝水',icon:'🍎',color:'#eaa087'},
  {id:'play',name:'一起玩',title:'一起玩',icon:'🧸',color:'#9bbfa0'},
  {id:'care',name:'洗手穿衣',title:'洗手穿衣',icon:'🫧',color:'#9fc4d0'},
  {id:'outside',name:'外出探索',title:'外出探索',icon:'🌳',color:'#b3c987'},
  {id:'bed',name:'睡前陪伴',title:'睡前陪伴',icon:'🌙',color:'#b7aed5'},
]);

export const GOALS = freeze([
  {id:'greet',name:'主动问候',core:false},
  {id:'request',name:'表达需要',core:true},
  {id:'help',name:'请求帮助',core:true},
  {id:'together',name:'邀请陪伴',core:true},
  {id:'care',name:'照顾自己',core:false},
  {id:'discover',name:'分享发现',core:false},
  {id:'decline',name:'礼貌拒绝',core:false},
  {id:'goodbye',name:'回应告别',core:false},
]);

const rows = [
  ['hello-morning','hello','清晨碰面','☀️','greet','hello-02','Good morning.','早上好。','sun-lamp','小太阳灯','☀️',
    '窗边亮起晨光，伙伴刚刚醒来。','向伙伴打个早上的招呼。','早上见面，可以挥挥手，跟伙伴说早上好。','伙伴挥挥手，邀请你一起迎接新的一天。',
    '早上来到花园，伙伴正在给花浇水。','在花园和伙伴说早上好。','花园里的伙伴也在等你打招呼。','outside','garden-morning',['Good morning','Morning']],
  ['hello-welcome','hello','迎接新朋友','👋','greet','hello-10','Nice to meet you.','很高兴认识你。','welcome-mat','迎客地垫','🟨',
    '门口来了第一次见面的新伙伴。','向新伙伴表示欢迎。','这是刚认识的朋友，可以告诉它很高兴认识它。','新伙伴走进小屋，开心地向你挥手。',
    '来到公园，遇到第一次见面的小熊。','和公园里的新朋友打招呼。','这是新认识的朋友，试着欢迎它。','outside','park-new-friend',['Nice to meet you','Hello']],
  ['hello-goodbye','hello','送玩伴回家','👋','goodbye','hello-04','See you later.','一会儿见。','cloud-cushion','云朵靠垫','☁️',
    '玩伴背起小包，站在小屋门口准备回家。','和玩伴告别。','朋友要暂时离开了，可以说一会儿见。','伙伴挥手告别，约好下次再来。',
    '公园的游戏结束了，朋友走向回家的小路。','在公园和朋友说再见。','朋友要回家了，可以挥手告别。','outside','park-goodbye',['See you later','Bye','Goodbye']],
  ['food-water','food','玩后要水','🥤','request','needs-01','I need water.','我需要水。','blue-cup','蓝色杯子','🥤',
    '你刚玩过球，面前有空杯子和一壶水。','告诉伙伴你想喝水。','玩累了想喝水，可以告诉伙伴你需要水。','伙伴把水倒进你的杯子，陪你一起休息。',
    '睡前的床边放着空杯子，水壶在伙伴身边。','告诉伙伴你想喝一点水。','睡前口渴了，也可以说自己需要水。','bed','bed-water',['I need water','Water please','Water']],
  ['food-more','food','野餐添一点','🧺','request','needs-09','More, please.','请再给我一点。','picnic-basket','野餐篮','🧺',
    '野餐垫上，你的小盘子已经空了，伙伴还有水果。','向伙伴再要一点水果。','还想吃一点，可以有礼貌地再要一点。','伙伴往你盘里放一点水果，大家继续野餐。',
    '一起画画时，装彩色纸的小碗空了，伙伴还有纸。','请伙伴再给一点纸。','材料不够了，也可以有礼貌地再要一点。','play','drawing-more',['More please','More']],
  ['food-no-thanks','food','吃饱谢绝加餐','🍎','decline','meals-06','No, thank you.','不用了，谢谢。','apple-plate','苹果小盘','🍎',
    '你已经吃饱了，伙伴又递来一块点心。','告诉伙伴你不需要了。','不想再吃，可以说不用了，并谢谢伙伴。','伙伴收好点心，尊重你的选择。',
    '外出休息时，伙伴递来一杯你不想喝的果汁。','有礼貌地拒绝果汁。','不需要的时候可以拒绝，不用勉强接受。','outside','park-decline',['No thank you','No thanks']],
  ['play-box','play','打开玩具盒','🧸','help','needs-08','Help me, please.','请帮帮我。','toy-box','玩具收纳盒','🧸',
    '你选中的玩具盒盖子卡住了，伙伴就在旁边。','请伙伴帮你打开玩具盒。','盒子打不开，可以向伙伴求助。','伙伴过来打开盒子，你们一起玩里面的玩具。',
    '出门前你的外套拉链卡住了，伙伴空着双手。','请伙伴帮忙拉好外套。','拉链卡住也可以请求帮助。','care-zip','coat-zip',['Help me please','Help me','Help please','Help']],
  ['play-ball','play','邀请踢球','⚽','together','play-01',"Let's play together.",'我们一起玩吧。','soft-ball','柔软小球','⚽',
    '草地上有一只球，伙伴坐在旁边看着你。','邀请伙伴一起来玩。','想和伙伴一起玩，可以主动邀请它。','伙伴走过来，你们把球滚来滚去。',
    '小屋地毯上摆着积木，伙伴正好空闲。','邀请伙伴和你一起玩积木。','换成积木，也可以邀请伙伴一起玩。','play-bridge','blocks-invite',["Let's play together",'Play with me','Play together']],
  ['play-bridge','play','合作搭桥','🧱','help','needs-08','Help me, please.','请帮帮我。','wooden-bridge','积木小桥','🧱',
    '小河两边有积木，最后一块桥板需要伙伴扶住。','请伙伴帮你把桥搭好。','桥板拿不稳，可以请伙伴帮忙。','伙伴扶住桥板，你把小桥接好了。',
    '收拾游戏时，大玩具筐需要两个人一起抬。','请伙伴帮你抬起玩具筐。','一个人抬不动的时候可以请求帮助。','play-box','basket-lift',['Help me please','Help me','Help please','Help']],
  ['care-hands','care','玩泥后洗手','🫧','care','meals-02','Wash your hands.','洗洗手。','leaf-soap','叶子香皂','🧼',
    '你玩过泥巴，洗手池旁有香皂和毛巾。','听伙伴说的话，找到洗手的地方。','小手脏了，伙伴在提醒你洗手。','水流冲掉泥巴，毛巾把小手擦干。',
    '准备野餐前，桌旁有清水盆，手上还沾着颜料。','听伙伴的话，把手洗干净再吃东西。','吃东西之前，要先洗掉手上的颜料。','food','picnic-wash',['Wash your hands','Wash hands']],
  ['care-zip','care','拉链卡住','🧥','help','needs-08','Help me, please.','请帮帮我。','coat-hook','小树衣帽钩','🪵',
    '出门前你的外套拉链卡住了，伙伴空着双手。','请伙伴帮忙拉好外套。','拉链卡住了，可以请伙伴帮忙。','伙伴帮你拉好拉链，你可以出门了。',
    '到了门口，书包上的扣子打不开。','请伙伴帮你打开书包扣子。','扣子打不开，也可以向伙伴求助。','hello','backpack-buckle',['Help me please','Help me','Help please','Help']],
  ['care-socks','care','更换湿袜子','🧦','care','dress-06','My socks are wet.','我的袜子湿了。','sock-basket','袜子小篮','🧦',
    '踩过水洼之后，脚上的袜子湿了，旁边有干袜子。','告诉伙伴袜子湿了。','脚不舒服，因为袜子湿了，可以告诉伙伴。','伙伴拿来干袜子，你把湿袜子放进篮子。',
    '在屋里打翻了一点水，脚上的袜子被打湿了。','告诉伙伴你需要换掉湿袜子。','屋里的水也会打湿袜子，可以说明发生了什么。','food','spilled-water-socks',['My socks are wet','Wet socks','Socks wet']],
  ['outside-cat','outside','发现小猫','🐈','discover','explore-01',"What's this?",'这是什么？','cat-plush','小猫玩偶','🐈',
    '树边探出一只小猫，你第一次发现它。','向伙伴问问你发现了什么。','看到想认识的东西，可以问这是什么。','伙伴陪你看清小猫，小猫轻轻摇动尾巴。',
    '窗边出现一只小蜗牛，你想知道它是什么。','向伙伴问问窗边的小动物。','遇到不同的新东西，也可以问这是什么。','hello','window-snail',["What's this",'What is this']],
  ['outside-bird','outside','邀请看小鸟','🐦','discover','explore-03','Look at the bird.','看那只小鸟。','bird-mobile','小鸟吊饰','🐦',
    '枝头停着一只小鸟，伙伴还低头看着地面。','请伙伴一起看小鸟。','伙伴还没看到小鸟，你可以提醒它看。','伙伴抬头，小鸟展开翅膀。',
    '小屋窗台飞来一只小鸟，伙伴背对着窗户。','邀请伙伴转过来看看小鸟。','窗边也有小鸟，提醒伙伴一起看。','hello','window-bird',['Look at the bird','Look a bird','Bird']],
  ['outside-dog','outside','寻找狗叫来源','🐕','discover','explore-10','I hear a dog.','我听到狗叫。','dog-toy','小狗玩具','🐕',
    '小路旁传来狗叫声，伙伴正在寻找声音。','告诉伙伴你听到了什么。','听到狗叫，可以把听见的声音告诉伙伴。','你们一起找到围栏旁的小狗。',
    '在屋里听到窗外有狗叫声，伙伴还在看书。','告诉伙伴窗外传来的声音。','没有看到小狗时，也能告诉伙伴自己听到了它。','bed','window-dog',['I hear a dog','A dog','Dog']],
  ['bed-book','bed','选择共读的书','📚','together','family-05',"Let's read a book.",'我们看一本书吧。','book-shelf','小小书架','📚',
    '床边放着绘本，伙伴坐在软垫上。','邀请伙伴一起看书。','想一起看绘本，可以邀请伙伴读一本书。','伙伴坐到你身边，一起翻开绘本。',
    '午后的花园长椅上放着绘本，伙伴走了过来。','邀请伙伴坐下共读。','在花园里也可以邀请伙伴一起看书。','outside','garden-book',["Let's read a book",'Read a book','Read with me']],
  ['bed-story','bed','邀请讲故事','📖','request','family-06','Tell me a story.','给我讲个故事。','story-chair','故事摇椅','🪑',
    '你盖好毯子，伙伴坐在床边，今晚还没开始讲故事。','请伙伴给你讲个故事。','想听故事，可以把这个愿望告诉伙伴。','伙伴翻开绘本，开始讲一个安静的小故事。',
    '雨天不能出门，你和伙伴坐在窗边的小椅子上。','请伙伴给你讲个故事。','雨天休息时，也可以请求伙伴讲故事。','hello','rain-story',['Tell me a story','A story please','Story please']],
  ['bed-night','bed','盖毯道晚安','🌙','goodbye','hello-03','Good night.','晚安。','star-blanket','星星小毯','🌟',
    '夜灯亮着，伙伴准备休息，星星出现在窗外。','向伙伴说晚安。','睡前可以向伙伴道晚安。','伙伴拉好毯子，夜灯柔和地暗下来。',
    '露营的小帐篷里，伙伴铺好了睡袋。','在帐篷里向伙伴说晚安。','睡在帐篷里，也可以在休息前说晚安。','outside','camp-night',['Good night','Night night']],
];

export const EVENTS = freeze(rows.map((r) => {
  const [id,theme,title,icon,goalId,lessonId,english,chinese,itemId,itemName,itemIcon,setup,request,help,resolution,otherSetup,otherRequest,otherHelp,otherScene,otherSetting,accepted] = r;
  const settingId = id === 'care-zip' ? 'coat-zip' : id;
  return {id,theme,scene:id,title,name:title,icon,goalId,lessonId,phraseId:lessonId,english,chinese,audio:`./audio/characters/pip/${lessonId}.mp3`,itemId,
    setup,request,help,resolution,accepted,
    contexts:[
      {id,settingId,scene:id,label:title,setup,request,help},
      {id:`${id}-elsewhere`,settingId:otherSetting,scene:otherScene,label:`换个地方：${otherRequest}`,setup:otherSetup,request:otherRequest,help:otherHelp},
    ],
    choices:[{id:'target',scene:id,icon,label:chinese,correct:true},
      ...['food-water','play-ball','bed-night','care-hands','outside-cat','hello-goodbye']
        .map((choiceId)=>rows.find((row)=>row[0]===choiceId))
        .filter((row)=>row[0]!==id && row[4]!==goalId).slice(0,2)
        .map((row)=>({id:row[0],scene:row[0],icon:row[3],label:row[7],correct:false}))],
  };
}));

export const ITEMS = freeze(rows.map((r) => ({id:r[8],name:r[9],title:r[9],icon:r[10],eventId:r[0],theme:r[1],replayEventId:r[0]})));

/** Product gates, not a validated developmental scale. All three are reachable without text. */
export const ALPHABET_CORE_GOALS = freeze(['help','request','together']);
const discoveryEvents = ['play-box','food-water','play-ball','care-zip','food-more','bed-book','play-bridge','bed-story'];
export const ALPHABET_NODES = freeze(Array.from({length:26},(_,index) => {
  const event = EVENTS.find((item) => item.id === discoveryEvents[index % discoveryEvents.length]);
  const letter = String.fromCharCode(65+index);
  return {id:`letter-${letter.toLowerCase()}`,letter,index,eventId:event.id,goalId:event.goalId,phraseId:event.lessonId,
    name:`发现${letter}`,icon:event.icon,audio:event.audio,english:event.english,chinese:event.chinese,
    contextId:event.contexts[Math.floor(index/discoveryEvents.length)%2].id,
    prompt:'用熟悉的话和伙伴交流，让藏起来的小符号出现。'};
}));
