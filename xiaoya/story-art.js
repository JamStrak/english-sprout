import {sceneArt} from './art.js';

// Four stills tell one action: need, invitation, action and consequence. These
// are local, text-free vector storyboards; a future image can replace any story
// without changing its event, voice or learning evidence.
const C={ink:'#4e5143',green:'#76925f',mint:'#dbe8bf',leaf:'#527645',bear:'#bf916b',cream:'#fff9e9',pink:'#efbbaa',blue:'#a7cdd3',red:'#d77e68',yellow:'#ebc267',wood:'#c9a47b'};
const path=(d,c=C.ink,w=3,extra='')=>`<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const shape=(d,c,extra='')=>`<path d="${d}" fill="${c}" ${extra}/>`;
const oval=(x,y,rx,ry,c,extra='')=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${c}" ${extra}/>`;
const circle=(x,y,r,c)=>oval(x,y,r,r,c);
const rect=(x,y,w,h,r,c,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${c}" ${extra}/>`;
const at=(x,y,s,body,r=0)=>`<g transform="translate(${x} ${y}) scale(${s}) rotate(${r})">${body}</g>`;
const cue=(name,body)=>`<g data-cue="${name}">${body}</g>`;
const heart=(x,y,s=1)=>at(x,y,s,shape('M0 12C-27-5-14-24 0-12C14-24 27-5 0 12',C.red));
const gleam=(x,y,s=1)=>at(x,y,s,shape('M0-12Q3-3 12 0Q3 3 0 12Q-3 3-12 0Q-3-3 0-12',C.yellow));
const drops=(x,y,n=3)=>cue('water-drops',Array.from({length:n},(_,i)=>at(x+i*12,y+(i%2)*9,.6,shape('M0-12C-20 11 20 11 0-12',C.blue))).join(''));
const motion=(d)=>path(d,C.wood,2.5,'stroke-dasharray="4 7"');

function person(kind,x,y,pose='rest',mood='happy',scale=1){
  const bear=kind==='bear',skin=bear?C.bear:C.mint,arm=bear?C.bear:C.green;
  const poses={rest:[[-40,29],[40,29]],ask:[[-38,23],[53,-8]],offer:[[-43,22],[62,2]],receive:[[-61,0],[43,20]],open:[[-55,0],[55,0]],belly:[[-12,23],[13,23]],up:[[-47,-40],[47,-40]],point:[[-40,25],[63,-37]],brush:[[-40,25],[17,-35]],wipe:[[-43,24],[3,-33]],hold:[[-27,3],[27,3]],walk:[[-47,12],[45,22]],sit:[[-40,23],[41,23]],wave:[[-42,28],[48,-54]]};
  const arms=poses[pose]||poses.rest;
  const limb=(side,end)=>pose==='embrace'?'':path(`M${side*27} 0Q${side*43} 13 ${end[0]} ${end[1]}`,arm,12)+circle(end[0],end[1],6,arm);
  const sad=/sad|sorry|worried/.test(mood),eyes=mood==='closed'?path('M-16-44q5 5 10 0M7-44q5 5 10 0',C.ink,2.5):circle(-12,-45,2.5,C.ink)+circle(12,-45,2.5,C.ink);
  const mouth=sad?path('M-7-29q7-6 14 0',C.ink,2.3):mood==='ask'?oval(0,-30,3,4,C.ink):path('M-7-32q7 7 14 0',C.ink,2.3);
  return at(x,y,scale,`<g data-character="${kind}" data-pose="${pose}" data-mood="${mood}">${oval(0,60,38,6,'#80765c','opacity=".12"')}${path(pose==='sit'?'M-16 38l-23 14M16 38l23 14':'M-15 36l-3 19M15 36l3 19',arm,12)}${limb(-1,arms[0])}${limb(1,arms[1])}${oval(0,13,30,36,skin)}${oval(0,21,17,20,bear?'#e7c6a4':'#abc58c')}${['belly','hold'].includes(pose)?limb(-1,arms[0])+limb(1,arms[1]):''}${bear?circle(-24,-70,12,skin)+circle(24,-70,12,skin)+circle(-24,-70,6,'#ddbaa0')+circle(24,-70,6,'#ddbaa0'):path('M0-70q-3-15 7-28',C.leaf,4)+shape('M1-83C-23-80-31-101-24-105C-6-106 5-94 1-83',C.green)+shape('M4-89C5-110 28-113 31-106C32-91 18-85 4-89',C.leaf)}${oval(0,-44,34,34,skin)}${bear?oval(0,-31,17,12,'#eed3b4')+oval(0,-36,5,3.5,C.ink):''}${eyes}${oval(-22,-32,6,3,C.pink)}${oval(22,-32,6,3,C.pink)}${mouth}${sad?path('M-18-55l9 3M9-52l9-3',C.ink,2):''}</g>`);
}

function prop(name,x,y,s=1,opts={}){
  let body='';
  switch(name){
    case 'ball':body=circle(0,0,17,C.yellow)+path('M-16-5Q0 2 15-7M-10-13Q-3 0-9 14M7-15Q-1 0 10 13',C.red,3);break;
    case 'apple':body=shape('M0-13C-25-22-28 8-13 19Q-6 24 0 20Q7 24 14 17C28-1 19-22 0-13',C.red)+path('M0-12q-1-9 4-13',C.wood,3)+shape('M4-19Q20-29 19-17Q11-12 4-19',C.green);break;
    case 'banana':body=shape('M-20-14Q-9 22 24-8Q13 29-12 16Q-25 7-20-14',C.yellow)+path('M-20-14l-3-5M24-8l3-4',C.wood,3);break;
    case 'bowl':body=oval(0,0,32,10,C.blue)+shape('M-32 0Q-28 29 0 29Q28 29 32 0',C.blue)+oval(0,-1,29,8,opts.empty?'#dae6dc':'#f0cb93')+(opts.empty?'':circle(-10,-2,3,C.green)+circle(9,0,3,C.red));break;
    case 'plate':body=oval(0,0,36,11,C.cream)+oval(0,0,27,7,'#ecdcc1');break;
    case 'spoon':body=path('M0 22V-9',C.wood,5)+oval(0,-15,8,12,C.wood)+oval(0,-16,5,8,'#e1c6a4');break;
    case 'cup':body=path('M15-10q22-4 18 17q-2 10-18 7',C.blue,5)+shape('M-18-17H18L15 22Q0 29-15 22Z',C.blue)+oval(0,-17,18,5,'#eaf1e4')+(opts.full?oval(0,-16,14,3,'#fffdf4'):'');break;
    case 'milk':body=path('M12-24q29 0 24 26H18',C.blue,7)+shape('M-17-32H14V-20L22-13V27Q0 36-22 25V-13L-17-20Z','#e8efe4')+rect(-21,-7,42,23,3,C.blue)+oval(-2,-31,15,4,'#c4dcda')+circle(0,4,7,'#fffdf4');break;
    case 'bread':body=shape('M-27 11V-7C-28-26-8-27 0-20C12-28 30-19 26-4V11Z','#dbab76')+path('M-16-13l-1 14M0-16v17M15-12l1 13','#f3d7a6',3);break;
    case 'towel':body=rect(-23,-25,46,50,5,C.blue)+path('M-16 14h32M-16 19h32','#e7f1e5',3);break;
    case 'tissue':body=shape('M-16-19L19-14L15 18L-19 14Z','#fffdf7','stroke="#d9cfb9" stroke-width="1.5"')+path('M-7-15l7 25M13-7l-24 3','#eee8d9',1.5);break;
    case 'tissuebox':body=rect(-31,-8,62,30,5,C.blue)+oval(0,-7,19,5,'#759ca4')+shape('M-13-7L-18-28L11-33L16-7Z',C.cream);break;
    case 'toothbrush':body=path('M-19 13L13-15',C.red,5)+rect(8,-24,16,10,3,'#f6f5e6','transform="rotate(-37 16 -19)"')+path('M9-19l-5-6M13-23l-5-6M17-26l-5-6',C.blue,2.5);break;
    case 'shoe':body=shape('M-18-10H2L10 0Q28-2 29 13H-20Z',C.red)+path('M-21 14H28',C.cream,4)+path('M-1-6l-5 8M5-2l-5 7',C.cream,2.5);break;
    case 'crayon':body=rect(-19,-5,32,10,2,C.red)+shape('M13-5l12 5-12 5',C.wood)+rect(-14,-5,5,10,1,C.cream);break;
    case 'box':body=rect(-35,-9,70,44,4,C.wood)+oval(0,-10,34,9,'#9f7b57')+path('M-32 4l64 0','#dabb91',3);break;
    case 'basket':body=path('M-23-6Q-26-46 23-6',C.wood,5)+shape('M-30-10H30L24 24H-24Z',C.wood)+path('M-21 0h42M-22 10h44M-12-8v31M0-8v31M12-8v31','#a9845e',2);break;
    case 'umbrella':body=shape('M-36 0Q0-57 36 0Q22-8 12 0Q0-9-12 0Q-24-8-36 0',C.red)+path('M0-30v60q0 14 12 8',C.wood,3)+path('M0-30Q-16-18-12 0M0-30q16 13 12 30','#f0c3a7',2);break;
    case 'picture':body=rect(-34,-24,68,48,3,C.cream)+circle(16,-10,7,C.yellow)+shape('M-26 18L-8-5L8 17L17 3L29 18',C.green);break;
    case 'bin':body=rect(-20,-20,40,48,5,'#a2b4a5')+rect(-24,-24,48,7,3,'#718e7d')+path('M-11-12v29M0-12v29M11-12v29','#d0ddca',2);break;
  }
  return at(x,y,s,`<g data-prop="${name}">${body}</g>`,opts.rotate||0);
}
const table=()=>rect(45,208,310,15,7,C.wood)+path('M68 222v54M333 222v54','#ac8962',9);
const mat=()=>oval(200,250,163,36,'#e6c4a2')+path('M64 246h273','#f6e4c8',4);
const block=(x,y,c=C.red,r=0)=>at(x,y,1,rect(-15,-15,30,30,4,c)+path('M-11-10h20','#fff',2,'opacity=".3"'),r);
const stack=(n,x=203,y=236,sand=false)=>cue('tower-'+n,Array.from({length:n},(_,i)=>sand?rect(x-25+i*3,y-27*i-24,50-i*6,27,3,'#dcc08b'):block(x,y-i*30,[C.blue,C.red,C.yellow,C.green][i%4])).join(''));
const scattered=()=>cue('fallen-blocks',block(180,246,C.red,28)+block(221,247,C.blue,-16)+block(246,245,C.yellow,11));
const steam=(n=3)=>cue(n?'hot-steam':'cooled',Array.from({length:n},(_,i)=>path(`M${185+i*15} 167q-8-11 0-21q8-10 0-18`,'#b6b3a1',3)).join(''));
const sink=()=>rect(118,219,164,58,8,'#c3d8ce')+oval(200,218,90,21,'#e7ece0')+oval(200,217,65,12,'#a6c7c9')+path('M202 202v-28q0-13 17-13h14',C.blue,8)+path('M234 163v12',C.blue,8);
const tent=()=>shape('M304 80L373 210H239Z',C.red)+shape('M304 110L270 210H337Z','#8f745a');

function backdrop(theme,alt=false,id=''){
  const outside=id==='outside-rain'?alt:theme==='outside'||['play-roll','play-catch','play-turn','outside-hand'].includes(id)&&!alt;
  if(outside)return rect(0,0,400,300,0,'#f5eedc')+circle(328,48,22,'#f4d793')+shape('M0 173Q94 137 185 166Q296 134 400 164V300H0Z','#dce5c5')+shape('M0 242Q156 219 400 238V300H0Z','#cad6b2')+path('M35 176v-62',C.wood,10)+oval(35,101,40,50,'#b5c792')+oval(74,129,27,30,'#bfd09f')+(alt?cue('alternate-outdoors',shape('M0 269Q167 201 400 267V300H0Z','#ead5af')):'');
  return rect(0,0,400,300,0,theme==='bed'?'#e5e5d8':'#fbefdc')+rect(0,231,400,69,0,'#e5cfaa')+path('M0 232h400','#d3b78d',3)+rect(267,28,95,100,8,'#d6b78e')+rect(274,35,81,86,5,theme==='bed'?'#8a9baf':'#d8e8dd')+path('M314 36v85M274 78h80',C.cream,5)+(theme==='bed'?circle(338,56,13,'#f5de9c'):circle(335,55,12,'#f6dca1'))+rect(18,94,66,8,3,C.wood)+prop('picture',48,65,.65)+(alt?cue('alternate-room',rect(10,247,380,40,18,'#e4bf9d')):'');
}

function comic(id,f,alt=false,theme='play'){
  let art='',rear='',front='',sprout={x:108,y:193,pose:'rest',mood:'happy',scale:1},bear={x:292,y:193,pose:'rest',mood:'happy',scale:1};
  const done=f===3,act=f===2;
  const give=()=>{bear.pose='receive';sprout.pose=f<2?'ask':'offer';};
  const meal=()=>{const picnic=alt&&id!=='food-hot';rear=picnic?mat()+prop('basket',340,239,.75):'';front=picnic?'':table();sprout.y=picnic?182:174;bear.y=picnic?182:174;};
  switch(id){
    case 'hello-thanks': {
      const gift=alt?'crayon':'apple';give();sprout.pose=f===1?'receive':done?'wave':sprout.pose;
      front=cue(f<2?'gift-offered':'gift-received',prop(gift,[230,190,146,145][f],188,.9));
      if(done)front+=heart(208,116,.65);if(alt)rear=mat()+prop('picture',202,244,.7);break;
    }
    case 'hello-sorry':case 'hello-okay': {
      const forgive=id==='hello-okay';sprout.mood=f<3?(forgive?'happy':'sorry'):'happy';bear.mood=f<3?(forgive?'sorry':'sad'):'happy';
      sprout.pose=f===1?(forgive?'offer':'hold'):act?'receive':'rest';bear.pose=act?'offer':'rest';
      if(!alt)rear=f<3?scattered():stack(3);
      else if(forgive)rear=cue(done?'picture-smoothed':'picture-wrinkled',prop('picture',204,243,1,{rotate:done?0:13})+(done?'':path('M177 228l19 9-14 8 30 10','#bdad91',2)));
      else rear=cue(done?'spill-clean':'cup-spilled',prop('cup',204,236,.65,{rotate:done?0:65})+(done?'':oval(245,251,33,8,C.blue)));
      if(act&&alt)front=prop('towel',209,220,.7);if(done)front=heart(200,118,.6);break;
    }
    case 'food-hungry':{
      meal();sprout.pose=f<2?'belly':done?'hold':'receive';sprout.mood=f<2?'ask':'happy';bear.pose=f<2?'hold':'offer';
      front+=cue(f<2?'food-out-of-reach':'meal-arrived',prop('bowl',[273,270,189,126][f],alt?225:204,.83));
      if(f<2)front+=cue('hungry-belly',path('M81 193q-10 5-1 10M137 193q10 5 1 10',C.wood,2.5));
      if(done)front+=prop('spoon',148,165,.65,{rotate:-45});break;
    }
    case 'food-full':{
      meal();sprout.pose='belly';sprout.mood='closed';bear.pose=f<2?'receive':'rest';
      front+=prop('plate',118,alt?224:207,.9)+cue(f<2?'more-food-offered':'offer-withdrawn',prop(alt?'bread':'spoon',[218,218,267,308][f],187,.8));
      if(f===1)front+=cue('full-stop',path('M151 175l7-7M155 185h12',C.red,3));break;
    }
    case 'food-spoon':{
      meal();give();front+=prop('bowl',120,alt?225:207,.85)+cue(f<2?'spoon-out-of-reach':'spoon-passed',prop('spoon',[267,240,190,143][f],[205,188,187,180][f],.8,{rotate:[15,-30,-55,-40][f]}));
      if(act)front+=motion('M245 166q-24-9-42 1');break;
    }
    case 'food-apple':{
      meal();sprout.pose=f<2?'hold':done?'hold':'offer';bear.pose=done?'hold':'receive';
      if(alt)rear+=path('M209 202v-105',C.wood,12)+oval(208,91,55,48,'#b5c58b')+prop('apple',181,93,.6)+prop('apple',236,74,.6);
      front+=prop('banana',241,209,.9)+cue('apple-chosen',prop('apple',f===2?174:127,f<2?188:171,.85));
      if(done)front+=prop('apple',277,172,.85);if(f===1)front+=heart(143,113,.65);break;
    }
    case 'food-hot':{
      meal();sprout.pose=f<2?'ask':'rest';sprout.mood=f<2?'worried':'happy';bear.pose=f<2?'receive':'hold';
      front+=prop(alt?'bread':'bowl',202,207,1)+steam(f<2?3:act?1:0);
      if(f===1)front+=cue('pause-before-hot-food',path('M153 165l7-5M150 175h9',C.red,3));
      if(done)front+=prop('spoon',146,165,.65,{rotate:-45});break;
    }
    case 'food-milk':{
      meal();give();front+=cue(f<2?'empty-cup':'milk-in-cup',prop('cup',143,199,.72,{full:f>1}))+prop('milk',act?207:273,act?164:186,.9,{rotate:act?-32:0});
      if(act)front+=cue('milk-pouring',path('M178 159Q148 169 146 185','#fffdf6',7));if(done)sprout.pose='hold';break;
    }
    case 'care-teeth':{
      rear=alt?tent():rect(130,28,116,99,14,'#c5d7cc')+rect(137,35,102,85,10,'#ecf1e6');front=alt?prop('cup',217,244,.7):sink();
      sprout.x=145;sprout.y=174;bear.x=306;bear.pose=f===1?'point':'hold';sprout.pose=f<2?'ask':done?'wave':'brush';
      front+=cue(f<2?'toothbrush-ready':done?'teeth-clean':'brushing-teeth',prop('toothbrush',act?160:210,act?145:198,.7,{rotate:act?-130:0}));
      if(act)front+=circle(141,146,6,C.cream)+circle(151,148,4,C.cream)+motion('M166 123l7-7M168 137l9-3');
      if(done)front+=rect(139,141,12,5,2,'#fffdf7')+gleam(166,143,.55);break;
    }
    case 'care-face':{
      rear=alt?tent():'';front=sink();sprout.x=118;bear.x=288;sprout.y=bear.y=179;sprout.pose=bear.pose=act?'wipe':done?'hold':'ask';
      if(f<3)front+=cue('dirty-faces',circle(98,146,5,alt?'#997350':C.red)+circle(139,154,4,alt?'#997350':C.blue)+circle(275,146,5,alt?'#997350':C.red));
      if(act)front+=drops(135,167)+drops(261,171);if(done)front+=cue('faces-clean',prop('towel',143,163,.56)+prop('towel',268,163,.56));break;
    }
    case 'care-tissue':{
      sprout.pose=act?'wipe':'rest';sprout.mood=f<2?'worried':'happy';bear.pose=f<3?'receive':'rest';
      rear=alt?mat():'';front=prop('tissuebox',252,219,.75)+prop('bin',344,248,.68);
      if(f<2)front+=cue(alt?'jam-on-mouth':'runny-nose',alt?oval(113,168,5,3,C.red):shape('M108 157q-8 17 1 17q8 0-1-17','#bfd3b2'));
      if(act)front+=cue('tissue-wiping',prop('tissue',111,163,.75));if(done)front+=cue('tissue-in-bin',prop('tissue',344,228,.46))+gleam(135,164,.45);break;
    }
    case 'care-dry':{
      rear=alt?rect(20,204,61,45,7,'#c3d8ce'):sink();sprout.pose=bear.pose=f>1?'hold':'open';
      if(f<2)front=cue('wet-hands',drops(52,221)+drops(156,220)+drops(247,220));
      front+=prop(alt?'tissuebox':'towel',f<2?200:112,f<2?136:202,f<2?.75:.65);
      if(f>1)front+=cue(done?'hands-dry':'drying-hands',prop(alt?'tissue':'towel',284,199,.65));if(done)front+=gleam(160,211,.5)+gleam(246,211,.5);break;
    }
    case 'care-shoes':{
      rear=alt?mat():rect(163,22,85,198,9,C.wood)+rect(170,28,71,190,4,'#d9e6ce');sprout.x=110;sprout.pose=act?'hold':done?'walk':'rest';bear.pose=f===1?'point':'rest';
      front=cue(f<2?'shoes-on-floor':done?'shoes-worn':'putting-on-shoes',prop('shoe',f<2?182:93,f<2?253:247,.65)+prop('shoe',f<2?225:128,f<2?253:247,.65));
      if(f<2)front+=cue('socks-only',oval(92,248,12,6,C.cream)+oval(127,248,12,6,C.cream));if(done)front+=motion('M161 250h24');break;
    }
    case 'play-turn':{
      if(alt){rear=stack(f<2?2:done?4:3);sprout.pose=f<2?'ask':'offer';bear.pose=f<2?'offer':'rest';front=cue(f<2?'friend-turn-finished':'sprout-turn',block(f<2?252:161,f<2?201:159,C.green));}
      else{rear=cue('slide',path('M218 101h33l80 142h-37L218 116','#d39870',13)+path('M217 113l-46 125M191 190h26M201 162h28M211 135h29',C.wood,7));bear={x:f<2?310:342,y:f<2?204:212,pose:done?'wave':'rest',mood:'happy',scale:.78};sprout={x:f<2?106:act?208:284,y:f<2?197:act?89:205,pose:f===1?'ask':act?'hold':done?'sit':'rest',mood:'happy',scale:.8};front=cue(f<2?'waiting-turn':done?'sprout-sliding':'climbing-after-friend',done?motion('M276 206l-18-31'):gleam(f<2?109:208,f<2?115:37,.45));}break;
    }
    case 'play-roll':case 'play-catch':{
      const roll=id==='play-roll';sprout.pose=roll?'sit':f<2?'hold':'open';bear.pose=roll?'sit':'open';sprout.y=bear.y=roll?204:193;
      if(alt)rear=mat()+(roll?cue('block-goal',rect(269,213,10,38,2,C.red)+rect(331,213,10,38,2,C.red)+rect(268,208,74,10,2,C.blue)):'');
      const xs=roll?(alt?[116,119,213,301]:[274,266,197,144]):alt?[274,266,209,150]:[138,143,207,261];
      const ys=roll?[243,243,243,243]:[176,167,120,180];
      front=cue(roll?'ball-on-ground':f===2?'ball-in-air':done?'ball-caught':'ball-ready',prop('ball',xs[f],ys[f],.9));
      if(act)front+=cue(roll?'ground-motion':'throw-arc',motion(roll?'M143 242h34M225 242h22':'M151 153Q195 84 246 152'));
      if(done)front+=gleam(xs[f]+20,ys[f]-24,.5);break;
    }
    case 'play-tower':case 'play-again':{
      const again=id==='play-again';sprout.pose=bear.pose=f<2?'ask':done?'up':'offer';
      if(again&&alt){rear=cue('ball-goal',rect(250,204,10,51,2,C.red)+rect(330,204,10,51,2,C.red)+rect(249,199,92,12,3,C.blue));front=cue(f<2?'missed-goal':done?'goal-reached':'retry-ball-roll',prop('ball',f<2?346:act?203:288,f<2?265:245,.8));if(act)front+=motion('M156 244h27');}
      else{rear=alt?oval(206,249,109,35,'#e9d4a6'):mat();front=f<2?(again?scattered():block(168,248,C.red)+block(210,248,C.blue)+block(247,247,C.yellow)):stack(done?4:2,205,236,alt);if(act)front+=cue('block-being-added',alt?rect(190,162,30,21,2,'#dcc08b'):block(205,160,C.yellow));}
      if(done)front+=gleam(235,101,.8);break;
    }
    case 'play-did-it':{
      sprout.pose=f<2?'hold':done?'wave':'up';bear.pose=f>1?'hold':'rest';
      if(alt)front=cue(f===0?'zip-unfinished':'zip-finished',shape('M82 194l26-9 27 9-7 46H88Z',C.red)+path(`M108 191v${f===0?38:7}`,C.cream,3)+rect(104,f===0?225:196,8,8,2,C.yellow));
      else{rear=mat();front=rect(156,209,91,52,8,C.wood)+rect(161,214,81,42,4,C.blue)+shape('M166 251l25-28 19 20 13-19 16 27',C.green)+cue(f===0?'puzzle-gap':'puzzle-complete',f===0?rect(195,219,27,27,3,'#f6e6c7')+rect(145,194,26,26,3,C.yellow):rect(195,219,27,27,3,C.yellow));}
      if(f>0)front+=gleam(143,127,.65)+gleam(249,151,.55);break;
    }
    case 'play-tidy':{
      sprout.pose=f<2?'ask':'offer';bear.pose=f<2?'point':'rest';rear=alt?table():mat();const item=alt?'crayon':'ball',y=alt?195:247;
      front=prop('box',244,y,1)+cue(f<2?'toy-outside-box':done?'toy-in-box':'toy-moving-to-box',prop(item,[140,142,201,244][f],f===2?y-38:done?y-13:y,alt?.9:.7));
      if(done)front+=rect(211,y+1,65,28,3,C.wood)+gleam(283,y-26,.6);if(act)front+=motion(`M162 ${y-22}q12-20 26-18`);break;
    }
    case 'outside-hand':{
      rear=alt?shape('M0 255Q190 204 400 260V300H0Z','#ead5b4'):cue('small-bridge',shape('M145 263Q243 223 371 262V286H145Z',C.wood)+path('M157 249Q247 211 360 247',C.wood,7)+path('M161 249v32M207 234v37M254 231v38M300 235v38M351 246v35',C.wood,5));
      sprout.x=f<2?105:174;bear.x=f<2?276:252;sprout.pose=f<2?'offer':'walk';bear.pose='receive';
      if(f>1)front=cue('hands-joined',path('M201 204Q214 213 222 197',C.green,11)+circle(217,203,7,C.bear));else front=cue('hand-invitation',motion('M169 193h31'));
      if(done)front+=motion('M150 260h-17');break;
    }
    case 'outside-rain':{
      rear=cue(alt?'porch-rain':'rain-outside-window',rect(154,25,221,167,8,C.wood)+rect(161,32,207,153,4,'#c4d8d6')+shape('M161 147Q251 120 368 144V185H161Z','#adc599')+oval(268,172,52,9,'#95bfc9')+Array.from({length:14},(_,i)=>path(`M${174+(i%7)*28} ${51+Math.floor(i/7)*58}l-6 18`,'#6d9da9',3)).join('')+(alt?path('M163 28v158M366 28v158',C.cream,8):path('M262 32v153M161 112h207',C.cream,6)));
      sprout={x:100,y:218,pose:f<2?'point':done?'offer':'hold',mood:f<2?'ask':'happy',scale:.85};bear={x:f<2?324:235,y:229,pose:done?'offer':'rest',mood:'happy',scale:.8};
      if(done)front=cue('umbrellas-held',prop('umbrella',153,196,.8)+prop('umbrella',285,208,.7)+circle(153,220,5,C.green)+circle(285,231,5,C.bear));break;
    }
    case 'bed-hug':{
      rear=alt?rect(27,211,167,50,11,C.blue)+rect(31,198,49,22,9,C.cream):cue('balloon-floated-away',oval(62-f*8,42-f*8,15,20,C.red)+path(`M${62-f*8} ${62-f*8}q-8 15 2 24`,C.wood,1.5));
      sprout={x:f<2?112:act?154:183,y:199,pose:f<2?'hold':act?'open':'embrace',mood:f<2?'sad':'closed',scale:1};
      bear={x:f<2?285:act?255:226,y:195,pose:done?'embrace':f===0?'rest':'open',mood:'happy',scale:1};
      if(act)front=cue('hug-invitation',heart(208,110,.7));if(done)front=cue('hug-together',path('M198 189Q171 211 159 189',C.bear,12)+path('M171 194Q205 218 248 192',C.green,11)+heart(210,100,.8));break;
    }
    default:throw new Error(`Missing comic action: ${id}`);
  }
  if(f===1){
    const speaker=['care-teeth','care-tissue','care-shoes','play-tidy'].includes(id)?bear:sprout;
    front+=cue('spoken-invitation',path(`M${speaker.x+42*speaker.scale} ${speaker.y-47*speaker.scale}q8 7 0 14`,C.green,2.5)+path(`M${speaker.x+49*speaker.scale} ${speaker.y-52*speaker.scale}q12 12 0 24`,C.green,2));
  }
  return backdrop(theme,alt,id)+rear+person('sprout',sprout.x,sprout.y,sprout.pose,sprout.mood,sprout.scale)+person('bear',bear.x,bear.y,bear.pose,bear.mood,bear.scale)+front;
}

function render(event,frame,context){
  const f=Math.max(0,Math.min(3,Number(frame)||0)),alt=!!context&&context.id!==event.contexts[0].id;
  if(event.illustration!=='comic'){
    const scene=sceneArt({...event,...context},['before','request','resolved','resolved'][f]);
    // Keep existing individually authored scene art. Frame 2 focuses the action;
    // frame 3 opens back out so the child can see its consequence.
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" aria-hidden="true" focusable="false" data-story="${event.id}" data-frame="${f}" data-alternate="${alt}"><g${f===2?' transform="translate(-12 -7) scale(1.06)"':''}>${scene}</g>${f===3?cue('shared-success',gleam(346,50,.7)):''}</svg>`;
  }
  const theme=alt?context.scene:event.theme;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" aria-hidden="true" focusable="false" data-story="${event.id}" data-action="${event.id}" data-frame="${f}" data-alternate="${alt}">${comic(event.id,f,alt,theme)}</svg>`;
}
export function storyFrame(story,frame=0){return render(story.event,frame,story.event.contexts[0]);}
export function assessmentFrame(event,context=event.contexts[0],phase='request'){return render(event,['resolved','complete','success'].includes(phase)?3:1,context);}
