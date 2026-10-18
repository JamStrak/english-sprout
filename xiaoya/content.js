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


// New stories reuse the shipped course IDs and all three static English voices.
// Each row includes a second real-life context for an answer-free checkup.
rows.push(
  ['hello-thanks','hello','收到朋友的苹果','🍎','greet','hello-05','Thank you.','谢谢你。','thank-apple','感谢小苹果','🍎',
    '朋友把篮子里的苹果送给小芽。','收到苹果后谢谢朋友。','朋友把苹果送给你，可以说谢谢你。','小芽接过苹果，微笑着感谢朋友。',
    '画画时朋友把自己的蜡笔借给你。','谢谢借蜡笔的朋友。','朋友借给你蜡笔，也可以说谢谢你。','play','thanks-crayon',['Thank you','Thanks']],
  ['hello-sorry','hello','不小心碰倒积木','🧱','greet','hello-07',"I'm sorry.",'对不起。','sorry-block','修好的积木','🧱',
    '小芽转身时碰倒了朋友刚搭好的积木。','告诉朋友你很抱歉。','不小心碰倒朋友的积木，可以说对不起。','小芽道了歉，和朋友一起把积木搭好。',
    '野餐时不小心碰翻了朋友的水杯。','为碰翻水杯向朋友道歉。','不小心弄洒了水，可以先说对不起，再一起擦干。','food','sorry-cup',["I'm sorry",'Sorry']],
  ['hello-okay','hello','原谅不小心的朋友','💛','greet','hello-08',"That's okay.",'没关系。','okay-heart','温暖小心心','💛',
    '朋友不小心把小芽的积木碰倒了，低下头很不好意思。','告诉朋友没关系。','朋友不是故意的，它很不好意思，你可以说没关系。','朋友放松下来，两个人一起重新搭积木。',
    '朋友不小心弄皱了你的画，正低头向你道歉。','回应朋友的道歉。','愿意原谅朋友时，可以告诉它没关系。','play','okay-picture',["That's okay",'It is okay','Okay']],
  ['food-hungry','food','肚子咕噜咕噜','🥣','request','needs-02',"I'm hungry.",'我饿了。','hungry-bowl','饭饭小碗','🥣',
    '午饭时间到了，小芽摸摸肚子，看着桌上的饭。','告诉朋友你饿了。','肚子饿了，想吃东西，可以告诉朋友我饿了。','朋友端来午饭，小芽开始吃饭。',
    '在公园玩了一阵，你摸着肚子，朋友打开野餐篮。','告诉朋友你想吃东西。','玩过以后肚子饿了，也可以告诉朋友我饿了。','outside','picnic-hungry',["I'm hungry",'Hungry']],
  ['food-full','food','吃饱的小肚子','🥣','decline','needs-03',"I'm full.",'我吃饱了。','full-plate','吃饱小盘','🥣',
    '小芽吃完了饭，摸着鼓鼓的肚子，朋友准备再添一点。','告诉朋友你吃饱了。','已经吃饱了，不用勉强再吃，可以告诉朋友我吃饱了。','朋友放下饭勺，小芽舒服地休息。',
    '野餐时你吃饱了，朋友又拿出一块面包。','告诉朋友你已经吃饱。','吃饱后可以停下来，告诉朋友我吃饱了。','outside','picnic-full',["I'm full",'Full']],
  ['food-spoon','food','把勺子递过来','🥄','request','meals-04','Pass the spoon, please.','请把勺子递给我。','spoon-friend','小木勺','🥄',
    '饭碗在小芽面前，勺子放在朋友那边。','请朋友把勺子递过来。','勺子在朋友那边，可以请它把勺子递给你。','朋友把勺子递过来，小芽可以吃饭了。',
    '野餐的酸奶打开了，勺子在朋友的篮子里。','请朋友递给你勺子。','想吃酸奶，可以请朋友递一下勺子。','outside','picnic-spoon',['Pass the spoon please','Spoon please']],
  ['food-apple','food','喜欢红苹果','🍎','discover','meals-05','I like apples.','我喜欢苹果。','apple-tree','苹果小树','🍎',
    '水果盘里有苹果和香蕉，小芽开心地拿起苹果。','告诉朋友你喜欢苹果。','你喜欢吃苹果，可以开心地告诉朋友我喜欢苹果。','小芽和朋友一起分享喜欢的苹果。',
    '果园里树上挂着苹果，你指着苹果开心地笑。','告诉朋友你喜欢的水果。','看见喜欢的苹果，也可以告诉朋友我喜欢苹果。','outside','orchard-apple',['I like apples','Like apples']],
  ['food-hot','food','先等热汤凉一点','🥣','care','meals-07',"It's too hot.",'这个太烫了。','cool-soup','小汤碗','🥣',
    '汤碗冒着热气，小芽凑近后赶紧停住。','告诉朋友汤太烫了。','汤很烫，先不要喝，可以告诉朋友这个太烫了。','朋友把汤放稳，等热气少了才一起尝。',
    '刚出炉的面包冒着热气，你停下伸过去的手。','告诉朋友面包太烫了。','刚出炉的面包很烫，先停一停，告诉朋友这个太烫了。','food','bakery-hot',["It's too hot",'Too hot','Hot']],
  ['food-milk','food','早餐想喝牛奶','🥛','request','meals-10','May I have some milk?','可以给我一些牛奶吗？','milk-cup','牛奶小杯','🥛',
    '早餐桌上有牛奶壶，小芽面前的杯子还是空的。','请朋友倒一点牛奶。','想喝牛奶，可以有礼貌地问，能给我一些牛奶吗。','朋友倒好牛奶，小芽接过杯子。',
    '野餐时你的杯子空了，朋友的篮子里放着牛奶。','有礼貌地要一点牛奶。','想喝牛奶时，可以先问朋友能给我一些牛奶吗。','outside','picnic-milk',['May I have some milk','Milk please','Some milk please']],
  ['care-teeth','care','牙刷跳跳舞','🪥','care','care-01','Brush your teeth.','刷刷牙。','toothbrush-cup','牙刷小杯','🪥',
    '洗手台上放着牙刷牙膏，睡前小芽张开嘴。','和朋友一起刷牙。','牙刷和牙膏准备好了，伙伴说刷刷牙，我们就刷一刷。','小芽刷好牙，对着镜子露出干净的牙齿。',
    '露营早上，小水杯旁放着牙刷，朋友准备洗漱。','听伙伴提醒一起刷牙。','在帐篷外也要刷牙，听伙伴说刷刷牙。','outside','camp-teeth',['Brush your teeth','Brush teeth']],
  ['care-face','care','洗掉小花脸','🫧','care','care-02',"Let's wash our faces.",'我们洗洗脸吧。','face-towel','洗脸小巾','🫧',
    '画画后小芽和朋友脸上沾了颜色，旁边有水盆。','邀请朋友一起洗脸。','脸上沾了颜色，可以邀请朋友，我们洗洗脸吧。','两个人把小花脸洗干净，用毛巾轻轻擦脸。',
    '在花园挖土后，你们的脸上都沾了泥点。','邀请朋友一起洗掉泥点。','脸上有泥点时，可以邀请朋友，我们洗洗脸吧。','outside','garden-face',["Let's wash our faces",'Wash our faces','Wash face']],
  ['care-tissue','care','纸巾来帮忙','🤧','care','care-06','Use a tissue.','用一张纸巾。','tissue-box','纸巾小盒','🤧',
    '小芽鼻子流了一点鼻涕，朋友拿出纸巾盒。','听伙伴提醒拿纸巾。','鼻子需要擦一擦，伙伴会提醒你，用一张纸巾。','小芽用纸巾轻轻擦鼻子，把用过的纸巾放进垃圾桶。',
    '野餐后你嘴边沾了果酱，朋友递来一张纸巾。','听伙伴提醒擦擦嘴。','嘴边有果酱，也可以用一张纸巾擦干净。','outside','picnic-tissue',['Use a tissue','Tissue']],
  ['care-dry','care','小手擦干啦','👐','care','care-08',"Let's dry our hands.",'我们擦干手吧。','dry-towel','擦手小巾','👐',
    '洗完手，小芽和朋友的手还在滴水，毛巾挂在一旁。','邀请朋友一起擦干手。','小手湿湿的，可以一起拿毛巾，我们擦干手吧。','两个人用毛巾擦干手，干爽的小手张开了。',
    '公园里洗完手，纸巾盒就在水龙头旁边。','邀请朋友把手擦干。','手上还有水滴，可以用纸巾，我们擦干手吧。','outside','park-dry',["Let's dry our hands",'Dry our hands','Dry hands']],
  ['care-shoes','care','穿好鞋子去玩','👟','care','dress-01','Put on your shoes.','穿上鞋子。','ready-shoes','出发小鞋','👟',
    '门已经打开，小芽脚上只有袜子，鞋子摆在门边。','听伙伴提醒穿好鞋子。','出门前，伙伴会提醒你穿上鞋子。','小芽把两只鞋穿好，和朋友一起出发。',
    '野餐垫上休息完，你准备离开，鞋子在垫子旁。','听伙伴提醒先穿鞋。','要离开野餐垫了，先穿上鞋子。','outside','picnic-shoes',['Put on your shoes','Shoes on']],
  ['play-turn','play','轮到我滑啦','🛝','together','play-02',"It's my turn.",'轮到我了。','turn-slide','轮流小滑梯','🛝',
    '朋友刚从滑梯滑下来，排在后面的小芽走到台阶旁。','告诉朋友轮到你了。','朋友玩过一次，现在可以说轮到我了。','小芽滑下来，朋友在下面开心地等。',
    '朋友刚给积木塔放好一块，把剩下的积木递给你。','告诉朋友轮到你放积木。','朋友放过一块，现在可以说轮到我了。','play','blocks-turn',["It's my turn",'My turn']],
  ['play-roll','play','小球滚过来','⚽','together','play-04','Roll the ball.','滚一滚球。','roll-ball','滚滚小球','⚽',
    '小芽和朋友坐在草地两头，中间放着一只球。','邀请朋友把球沿地面滚来。','让小球贴着地面滚过来，可以说滚一滚球。','小球沿草地滚到小芽面前，小芽把它接住。',
    '屋里用积木搭了小球门，朋友拿着球站在前面。','请朋友把球滚进小球门。','把球沿着地面滚进球门，可以说滚一滚球。','play','indoor-roll',['Roll the ball','Roll ball']],
  ['play-catch','play','张开手接球','⚽','together','play-05','Catch the ball.','接住球。','catch-ball','接接小球','⚽',
    '小芽举起软球，朋友张开双手站在对面。','提醒朋友接住球。','轻轻抛球给朋友前，可以提醒它接住球。','球轻轻飞过去，朋友用双手接住了。',
    '屋里的软垫上，朋友准备把软球轻轻抛给你。','听提醒张开手接球。','伙伴提醒接住球，你就张开双手，等球过来。','play','indoor-catch',['Catch the ball','Catch ball']],
  ['play-tower','play','搭一座高高的塔','🧱','together','play-06',"Let's build a tower.",'我们搭一座塔吧。','color-tower','彩色积木塔','🧱',
    '地毯上有好多积木，小芽想把它们一块块搭高。','邀请朋友一起搭塔。','想把积木搭得高高的，可以邀请朋友，我们搭一座塔吧。','两个人轮流放积木，彩色高塔立起来了。',
    '沙坑边有几只小桶，你想用沙子堆一座高塔。','邀请朋友一起堆沙塔。','玩沙时也能邀请朋友，我们搭一座塔吧。','outside','sand-tower',["Let's build a tower",'Build a tower']],
  ['play-again','play','倒了再试试','🧱','together','play-08',"Let's try again.",'我们再试一次吧。','again-tower','再试小塔','🧱',
    '刚搭的积木塔倒了，小芽和朋友看着散落的积木。','邀请朋友再试一次。','没成功也可以再试，可以说我们再试一次吧。','两个人重新搭，塔稳稳地站住了。',
    '小球没有滚进球门，停在球门旁边。','邀请朋友再滚一次。','小球没进去，还可以再试一次。','outside','ball-again',["Let's try again",'Try again']],
  ['play-did-it','play','我自己搭好了','🌟','discover','play-09','I did it.','我做到了。','did-it-star','做到小星星','🌟',
    '小芽专心把最后一块拼图放进空位。','告诉朋友你做到了。','你自己完成了，可以开心地说我做到了。','拼图完整了，朋友为小芽拍拍手。',
    '你自己把外套拉链从下往上拉好了。','把自己做到的事告诉朋友。','自己拉好了拉链，也可以开心地说我做到了。','care','zip-did-it',['I did it','Did it']],
  ['play-tidy','play','玩具回到盒子里','📦','care','tidy-01','Put it in the box.','把它放进盒子里。','tidy-box','收好玩具盒','📦',
    '玩好以后，小球还在地上，旁边有打开的玩具盒。','听伙伴提醒把球收进盒子。','玩具玩好了，伙伴提醒，把它放进盒子里。','小芽把球放进盒子，地面变整洁了。',
    '画画结束，桌上散着蜡笔，蜡笔盒开着。','听伙伴提醒把蜡笔收好。','画画用的蜡笔也可以收进盒子里。','play','crayon-tidy',['Put it in the box','In the box']],
  ['outside-hand','outside','一起牵手走','🤝','together','outside-01','Hold my hand.','牵着我的手。','hand-heart','牵手小心心','🤝',
    '小芽和朋友来到小桥前，朋友伸出手。','邀请朋友牵着手一起走。','一起走路时，可以伸出手说牵着我的手。','两个人牵好手，慢慢走过小桥。',
    '公园的小路上有人经过，你伸手邀请伙伴一起走。','请伙伴牵着你的手。','外出一起走路，可以邀请伙伴牵着你的手。','outside','park-hand',['Hold my hand','My hand']],
  ['outside-rain','outside','窗外下雨啦','🌧️','discover','outside-08',"It's raining outside.",'外面下雨了。','rain-umbrella','雨天小伞','🌧️',
    '小芽望向窗外，雨点落在树叶和水洼里。','告诉朋友外面下雨了。','看见窗外的雨点，可以告诉朋友外面下雨了。','朋友走到窗边看雨，两个人拿起雨伞。',
    '你们在门廊休息，看见花园里落下雨点。','把下雨的发现告诉朋友。','门廊外落下雨点，也可以告诉朋友外面下雨了。','outside','porch-rain',["It's raining outside",'Raining outside','Raining']],
  ['bed-hug','bed','想要暖暖的抱抱','💛','request','feelings-09','I need a hug.','我想要一个拥抱。','hug-heart','抱抱小心心','💛',
    '小芽的气球飞走了，它低着头，朋友就在旁边。','告诉朋友你想要一个拥抱。','有一点难过，想让朋友抱抱，可以说我想要一个拥抱。','朋友张开手，轻轻抱住愿意靠近的小芽。',
    '睡前你有一点想念家人，伙伴坐在旁边。','告诉伙伴你想要抱抱。','想要安慰时，可以说我想要一个拥抱。','bed','bedtime-hug',['I need a hug','A hug please','Hug please']],
);

// The first release is selected by phrase in curriculum.js. These familiar
// expressions reuse the existing recordings without renaming any older event.
// Their lightweight scene art and optional Chinese help are independent of the
// earlier comic expansion and its pre-recorded Chinese help manifest.
const phraseRows = [
  ['hello-everyone','hello','大家好','👋','greet','hello-01','Hello, everyone.','大家好。','hello-waves','招手小旗','👋',
    '小芽来到花园，两位朋友抬起头看着它。','向大家挥手打招呼。','见到几个朋友，可以挥挥手说大家好。','朋友们一起挥手，欢迎小芽加入。',
    '小芽走进小屋，两个朋友正坐在地毯上。','和屋里的朋友们打招呼。','走进屋里见到大家，也可以说大家好。','hello-everyone','room-everyone',['Hello everyone','Hello']],
  ['family-love','hello','我爱你','💗','together','family-04','I love you.','我爱你。','love-heart','爱心小花','💗',
    '小芽开心地看着亲近的朋友，两个人面对面站着。','把你的爱告诉对方。','看着你爱的人，可以告诉它我爱你。','朋友微笑着张开双臂，小芽愿意地靠近。',
    '睡前家人坐在小芽的床边，两个人温柔地望着对方。','睡前告诉家人你爱它。','睡前也可以对家人说我爱你。','family-love','bedtime-love',['I love you','Love you']],
  ['hello-youre-welcome','hello','不客气','💛','greet','hello-06',"You're welcome.",'不客气。','welcome-heart','友好小心心','💛',
    '小芽把苹果递给朋友，朋友微笑着向小芽道谢。','回应朋友的谢谢。','别人对你说谢谢，可以回应不客气。','小芽笑着回应，朋友开心地拿起苹果。',
    '小芽把蜡笔借给朋友，朋友向小芽说谢谢。','回应借蜡笔的朋友。','朋友感谢你借给它蜡笔，可以说不客气。','hello-youre-welcome','crayon-welcome',["You're welcome",'You are welcome']],
  ['hello-excuse','hello','打扰一下','🙋','greet','hello-09','Excuse me.','打扰一下。','excuse-hand','招呼小手','🙋',
    '朋友正在看书，小芽站在旁边，想请朋友听自己说话。','有礼貌地请朋友注意你。','别人正在忙，想请它听你说，可以先说打扰一下。','朋友抬起头，愿意听小芽说话。',
    '朋友正在花园里画画，你站在旁边想问一个问题。','问问题前先打个招呼。','想问正在画画的朋友一个问题，可以先说打扰一下。','hello-excuse','garden-excuse',['Excuse me']],
  ['outside-go-home','outside','我们回家吧','🏡','together','outside-09',"Let's go home.",'我们回家吧。','home-path','回家小路','🏡',
    '花园里的游戏收好了，小芽和朋友站在通向小屋的小路旁。','邀请朋友一起回家。','准备离开外面回到家里，可以说我们回家吧。','小芽和朋友沿着小路，走向温暖的小屋。',
    '野餐结束，你们收好篮子，家就在小路的另一头。','邀请伙伴结束野餐一起回家。','野餐后要回家，也可以说我们回家吧。','outside-go-home','picnic-go-home',["Let's go home",'Go home']],
  ['outside-ready','outside','我准备好出发了','🎒','discover','dress-10',"I'm ready to go.",'我准备好出发了。','ready-bag','出发小包','🎒',
    '小芽穿好鞋，背好小包，朋友在敞开的门边等着。','告诉朋友你已经准备好出发。','鞋子穿好，东西拿好，可以说我准备好出发了。','朋友点点头，和小芽一起走出门。',
    '野餐垫收好了，你背起自己的小包，伙伴正在等你。','告诉伙伴你准备好走了。','收好东西准备离开时，可以说我准备好出发了。','outside-ready','picnic-ready',["I'm ready to go",'Ready to go']],
  ['family-come','hello','请过来','🤲','together','family-01','Come here, please.','请过来。','come-cushion','一起坐小垫','🤲',
    '小芽站在野餐垫旁边，朋友在几步远的小路上。','招招手，请朋友来到你身边。','想请朋友走到你这里，可以招手说请过来。','朋友走过来，和小芽坐到野餐垫上。',
    '你坐在铺好软垫的小屋里，朋友正在门边。','请朋友走过来一起坐。','朋友在门边，可以招招手说请过来。','family-come','room-come',['Come here please','Come here']],
  ['food-eat','food','我们吃饭吧','🍽️','together','meals-01',"Let's eat.",'我们吃饭吧。','eat-table','开饭小桌','🍽️',
    '饭菜已经摆上桌，小芽和朋友洗好手，准备坐下。','邀请朋友一起开始吃饭。','饭菜准备好了，可以邀请大家说我们吃饭吧。','小芽和朋友坐好，一起吃起饭来。',
    '野餐垫上摆好了食物，你和朋友都洗好了手。','邀请朋友开始吃野餐。','野餐准备好了，也可以说我们吃饭吧。','food-eat','picnic-eat',["Let's eat",'Let us eat']],
  ['feelings-happy','hello','我很开心','😊','discover','feelings-01',"I'm happy.",'我很开心。','happy-sun','开心小太阳','😊',
    '小芽眉眼弯弯，开心地笑着，朋友站在身边。','把开心的心情告诉朋友。','心里高兴、想笑的时候，可以说我很开心。','朋友也笑起来，和小芽分享这份开心。',
    '睡前你想到今天和家人一起玩的时光，露出了笑容。','告诉家人你很开心。','想起开心的事情，也可以告诉家人我很开心。','feelings-happy','bedtime-happy',["I'm happy",'I am happy','Happy']],
  ['feelings-tired','bed','我累了','😴','request','feelings-03',"I'm tired.",'我累了。','tired-cushion','休息软垫','😴',
    '玩了一会儿，小芽打了个哈欠，身边有一块软垫。','告诉朋友你想休息了。','玩过后身体累了，想休息，可以说我累了。','朋友陪小芽坐到软垫上，安静地休息。',
    '散步回来，你坐到门边的小椅子上，腿想歇一歇。','告诉伙伴你有些累了。','走路以后想坐下歇一歇，可以说我累了。','feelings-tired','walk-tired',["I'm tired",'I am tired','Tired']],
  ['play-your-turn','play','轮到你了','🧱','together','play-03',"It's your turn.",'轮到你了。','your-turn-block','轮流小积木','🧱',
    '小芽刚给积木塔放好一块，手里还有一块，朋友在旁边等。','把下一次机会交给朋友。','你玩过一次，接下来请朋友玩，可以说轮到你了。','朋友接过积木，给塔放上下一块。',
    '你刚沿草地滚过一次球，把球推到朋友面前。','告诉朋友接下来该它玩。','轮流玩球时，把下一次机会给朋友，可以说轮到你了。','play-your-turn','ball-your-turn',["It's your turn",'Your turn']],
  ['play-can-do','play','我可以自己做','💪','discover','dress-07','I can do it.','我可以自己做。','can-do-puzzle','自己来拼图','💪',
    '拼图还差一块，小芽拿着合适的拼图块，朋友在旁边等。','告诉朋友你想自己来。','想试着自己完成时，可以说我可以自己做。','小芽自己把拼图块放好，露出开心的笑容。',
    '你坐在门边，手里拿着已经解开鞋带的小鞋子。','告诉伙伴你可以自己穿鞋。','准备自己穿好鞋子时，可以说我可以自己做。','play-can-do','shoes-can-do',['I can do it','Can do it']],
  ['play-good-job','play','做得好','👏','together','kindness-08','Good job!','做得好！','good-job-star','鼓励小星星','👏',
    '朋友刚搭好一座稳稳的积木塔，小芽开心地看着。','夸一夸朋友完成的事情。','朋友认真做成了一件事，可以拍拍手说做得好。','朋友收到鼓励，开心地笑了起来。',
    '朋友把画好的彩色图画举给你看。','夸一夸朋友画得用心。','朋友认真完成了画，也可以告诉它做得好。','play-good-job','drawing-good-job',['Good job','Well done']],
];
rows.push(...phraseRows);

export const EVENTS = freeze(rows.map((r) => {
  const [id,theme,title,icon,goalId,lessonId,english,chinese,itemId,itemName,itemIcon,setup,request,help,resolution,otherSetup,otherRequest,otherHelp,otherScene,otherSetting,accepted] = r;
  const settingId = id === 'care-zip' ? 'coat-zip' : id;
  return {id,theme,scene:id,title,name:title,icon,goalId,lessonId,phraseId:lessonId,english,chinese,audio:`./audio/characters/pip/${lessonId}.mp3`,itemId,
    setup,request,help,resolution,accepted,
    illustration: phraseRows.includes(r) ? 'phrase' : rows.indexOf(r) < 18 ? 'legacy' : 'comic',
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
