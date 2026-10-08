// Each lesson has an explicit visual recipe. Shared drawing parts keep the picture language consistent.
export const ILLUSTRATION_RECIPES={
 'hello-01':['greet','wave'],'hello-02':['greet','sun'],'hello-03':['bed','moon'],'hello-04':['greet','bye'],'hello-05':['exchange','gift'],'hello-06':['exchange','welcome'],'hello-07':['exchange','sorry'],'hello-08':['exchange','okay'],'hello-09':['greet','excuse'],'hello-10':['greet','meet'],
 'needs-01':['need','water'],'needs-02':['need','hungry'],'needs-03':['need','full'],'needs-04':['need','toilet'],'needs-05':['need','rest'],'needs-06':['need','hot'],'needs-07':['need','cold'],'needs-08':['help','box'],'needs-09':['food','more'],'needs-10':['food','enough'],
 'feelings-01':['feeling','happy'],'feelings-02':['feeling','sad'],'feelings-03':['feeling','tired'],'feelings-04':['feeling','scared'],'feelings-05':['feeling','excited'],'feelings-06':['feeling','hurt'],'feelings-07':['help','care'],'feelings-08':['feeling','better'],'feelings-09':['together','hug'],'feelings-10':['feeling','breath'],
 'meals-01':['food','eat'],'meals-02':['wash','hands'],'meals-03':['chair','sit'],'meals-04':['exchange','spoon'],'meals-05':['food','apple'],'meals-06':['food','no'],'meals-07':['food','hot'],'meals-08':['food','little'],'meals-09':['food','yummy'],'meals-10':['food','milk'],
 'care-01':['wash','teeth'],'care-02':['wash','face'],'care-03':['wash','bath'],'care-04':['face','closed'],'care-05':['face','mouth'],'care-06':['wash','tissue'],'care-07':['wash','cover'],'care-08':['wash','dry'],'care-09':['bed','bedtime'],'care-10':['bed','dream'],
 'dress-01':['dress','shoes-on'],'dress-02':['dress','shoes-off'],'dress-03':['search','hat'],'dress-04':['dress','coat'],'dress-05':['help','zip'],'dress-06':['dress','socks'],'dress-07':['dress','self'],'dress-08':['dress','small'],'dress-09':['dress','clothes'],'dress-10':['dress','ready'],
 'play-01':['play','together'],'play-02':['play','my-turn'],'play-03':['play','your-turn'],'play-04':['play','roll'],'play-05':['play','catch'],'play-06':['play','tower'],'play-07':['play','join'],'play-08':['play','again'],'play-09':['play','done'],'play-10':['play','fun'],
 'tidy-01':['tidy','box'],'tidy-02':['tidy','where'],'tidy-03':['tidy','clean'],'tidy-04':['tidy','blocks'],'tidy-05':['tidy','book'],'tidy-06':['search','found'],'tidy-07':['search','missing'],'tidy-08':['exchange','yours'],'tidy-09':['exchange','mine'],'tidy-10':['tidy','done'],
 'outside-01':['outside','hand'],'outside-02':['outside','close'],'outside-03':['outside','look'],'outside-04':['outside','wait'],'outside-05':['outside','slow'],'outside-06':['outside','step'],'outside-07':['outside','touch'],'outside-08':['outside','rain'],'outside-09':['outside','home'],'outside-10':['outside','see'],
 'family-01':['family','come'],'family-02':['family','look'],'family-03':['family','listen'],'family-04':['together','love'],'family-05':['family','book'],'family-06':['family','story'],'family-07':['family','play'],'family-08':['family','doing'],'family-09':['family','draw'],'family-10':['family','phone'],
 'explore-01':['explore','mystery'],'explore-02':['explore','cat'],'explore-03':['explore','bird'],'explore-04':['explore','colors'],'explore-05':['explore','red'],'explore-06':['explore','count'],'explore-07':['explore','two'],'explore-08':['explore','big'],'explore-09':['explore','small'],'explore-10':['explore','dog'],
 'kindness-01':['kindness','share'],'kindness-02':['kindness','first'],'kindness-03':['kindness','turn'],'kindness-04':['kindness','back'],'kindness-05':['kindness','stop'],'kindness-06':['kindness','dislike'],'kindness-07':['kindness','together'],'kindness-08':['kindness','job'],'kindness-09':['kindness','encourage'],'kindness-10':['help','friend']
};
const line=(d,color='#40594f',width=3)=>`<path d="${d}" stroke="${color}" stroke-width="${width}" fill="none"/>`;
const circle=(x,y,r,fill)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const box=(x,y,w,h,fill,rx=5)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
const star=(x,y,s=1)=>`<path transform="translate(${x} ${y}) scale(${s})" d="m0-10 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1Z" fill="#efbe56" stroke="none"/>`;
const heart=(x,y,s=1)=>`<path transform="translate(${x} ${y}) scale(${s})" d="M0 10C-23-3-10-20 0-9 10-20 23-3 0 10" fill="#e99087" stroke="none"/>`;
const arrow=(x,y,direction='right',s=1)=>`<g transform="translate(${x} ${y}) scale(${direction==='left'?-s:s} ${s})">${line('M-18 0H17','#8caa75',4)}${line('m9-7 8 7-8 7','#8caa75',4)}</g>`;
function person(x,y,pose='open',mood='happy',s=1,shirt='#78afa4'){
 const arms={armless:'',open:'M-17 24-31 35M17 24 31 35',wave:'M-17 24-31 5-29-9M17 24 30 34',point:'M-17 24-31 36M17 24 38 13',up:'M-17 24-32 2M17 24 32 2',belly:'M-17 24-22 39-3 38M17 24 21 36 4 41',hug:'M-17 24-30 14M17 24 37 26',hold:'M-17 24-24 36-4 35M17 24 27 34 8 36',stop:'M-17 24-29 1M17 24 31 34',ears:'M-17 24-23 0M17 24 23 0',face:'M-17 24-13 6M17 24 13 6',sleep:'M-17 24-22 10-3 5M17 24 22 10 3 5',reach:'M-17 24-24 36-7 39M17 24 33 38 47 38',offer:'M-17 24-34 37-47 37M17 24 28 36 7 39',chest:'M-17 24-25 39-2 28M17 24 29 35',shrug:'M-17 24-31 32-40 24M17 24 31 32 40 24',clap:'M-17 24-9 33 6 20M17 24 12 35-3 24',sit:'M-17 24-23 38-8 40M17 24 25 38 9 40',kneel:'M-17 24-8 48M17 24 34 45',walk:'M-17 24-31 33M17 24 29 15',shiver:'M-17 24 14 39M17 24-13 39'};
 const seated=pose==='sit',kneeling=pose==='kneel',walking=pose==='walk';
 const legs=seated?'M-9 49-22 55-19 76M9 49 26 55 23 76':kneeling?'M-9 50-23 69-5 73M9 50 21 67 35 67':walking?'M-9 50-20 72M9 50 24 68':pose==='step'?'M-9 50-19 73M9 50 29 55 40 49':'M-9 50-12 74M9 50 12 74';
 const feet=seated?'M-19 77h-8M23 77h8':kneeling?'M-5 73h8M35 67h8':walking?'M-20 73h-8M24 69h8':pose==='step'?'M-19 74h-8M40 49h8':'M-12 75h-8M12 75h8';
 let eyes=['closed','tired','content'].includes(mood)?line('M-11-4q4 4 8 0M3-4q4 4 8 0'):circle(-7,-3,2.3,'#40594f')+circle(7,-3,2.3,'#40594f');
 const mouth=['sad','hurt','unhappy'].includes(mood)?line('M-6 10q6-6 12 0'):mood==='scared'||mood==='mouth'?`<ellipse cx="0" cy="9" rx="5" ry="7" fill="#b46657" stroke="none"/>`:line('M-6 7q6 7 12 0');
 const palm=pose==='stop'?line('M-30 1v-15M-25-1v-10M-35-1v-9M-29 0l8-6','#e4ab86',3.5):'';
 return `<g transform="translate(${x} ${y}) scale(${s})">${line(legs,'#5e706c',9)}${line(feet,'#b68561',7)}<path d="M-16 16Q0 11 16 16L20 51Q0 57-20 51Z" fill="${shirt}" stroke="none"/>${line(arms[pose]??arms.open,'#e4ab86',9)}${palm}${circle(0,-3,23,'#edb894')}<path d="M-23-5q-4-30 23-26 27-2 23 25L14-15Q-3-8-13-17Z" fill="#65554d" stroke="none"/>${eyes}${mouth}${mood==='sad'?`<path d="M-13 4q-8 10-1 10t1-10" fill="#79b6d0" stroke="none"/>`:''}${mood==='hurt'?line('M-12-12-4-9M4-9 12-12'):''}</g>`;
}
function object(name,x,y,s=1){
 const pieces={
  water:`<path d="M-16-20h32l-3 43h-26Z" fill="#d9eff3"/><path d="M-13 0q13 5 26 0l-2 20h-22Z" fill="#82c0d7" stroke="none"/>`,
  glass:`<path d="M-16-20h32l-3 43h-26Z" fill="#f5faf0"/>${line('M-10-13v23','#d7e7df',2)}`,
  milk:`<path d="M-17-20-8-32h21l5 12v44h-35Z" fill="#f8fbeb"/><path d="M-17-20h35v12h-35" fill="#9ecad0"/><path d="M-8-32v12"/>`,
  plate:`<ellipse cx="0" cy="4" rx="34" ry="15" fill="#faf9ee"/><ellipse cx="0" cy="4" rx="23" ry="9" fill="#dfebdd"/>`,
  bowl:`<path d="M-30-5h60Q26 29 0 29T-30-5" fill="#edb979"/><ellipse cx="0" cy="-5" rx="30" ry="9" fill="#f4dfae"/>`,
  apple:`<path d="M0-17q-21-11-24 10-3 28 24 32 27-4 24-32-3-21-24-10" fill="#db7e6f"/>${line('M0-15 4-28')}<path d="M4-24q15-14 21-2-13 9-21 2" fill="#8ba679"/>`,
  spoon:`<ellipse cx="0" cy="-16" rx="9" ry="15" fill="#d6dfd6"/>${line('M0-1V31','#7e9388',7)}`,
  chair:`${box(-23,-34,46,37,'#d9ab78')}${line('M-23 7h49M-18 7v31M20 7v31','#ad835e',7)}`,
  toilet:`${box(3,-32,25,32,'#edf5ec')}<path d="M-28 0h56q-1 24-23 25v12h-20V22Q-31 20-28 0" fill="#f7faf5"/><ellipse cx="0" cy="0" rx="28" ry="8" fill="#c9e0df"/>`,
  bed:`${box(-45,-17,90,38,'#92b9c2')}${box(-42,-24,30,18,'#f7f4e3')}${line('M-45-25v56M45-10v41','#b39572',6)}`,
  box:`<path d="M-30-16h60v47h-60Z" fill="#d6b286"/><path d="m-30-16 12-15h42l6 15" fill="#ecd6ad"/>${line('M0-16v47','#bd956b')}`,
  openbox:`<path d="M-30-14 0-23 30-14 0-3Z" fill="#997d5e"/><path d="M-30-14 0-3 30-14v42l-30 11-30-11Z" fill="#d6b286"/><path d="m-30-14-12-12 29-9L0-23m30 9 12-12-29-9L0-23" fill="#ecd6ad"/>${line('M0-3v42','#bd956b')}`,
  closedbook:`${box(-12,-27,24,53,'#94bbb9',2)}${line('M-5-24v47','#f6f2da',3)}${circle(4,-9,4,'#efc877')}`,
  cactus:`<path d="M-21 8h42l-6 26h-30Z" fill="#d7a484"/>${line('M0 7v-35M0-8h-16v-14M0-18h15v-12','#8eaa72',12)}${line('M-6-33h-7M6-26h7M-22-18h-7M21-27h7','#577a50',2)}`,
  block:`${box(-18,-18,36,36,'#e4ac63')}${line('M-18-18-7-27h35v35l-10 10M18-18 28-27','#c68e51')}`,
  tower:`${box(-28,9,56,26,'#80b9b0')}${box(-23,-16,46,25,'#e8b06d')}${box(-16,-42,32,26,'#c0b7ce')}`,
  ball:`${circle(0,0,24,'#ecc477')}${line('M-23-5q28-12 39 23M-4-23q13 25-13 41','#bc8f4a')}`,
  redball:`${circle(0,0,24,'#db7e6f')}${line('M-23-5q28-12 39 23M-4-23q13 25-13 41','#b36655')}`,
  gift:`${box(-24,-12,48,37,'#bcb4d3')}${box(-27,-20,54,12,'#d5c9e2')}${line('M0-20v45','#f4e2a2',7)}${line('M0-20q-24-28-24-9t24 9q24-28 24-9t-24 9','#e4bd6f',5)}`,
  book:`<path d="M0-18q-20-12-36-3v47q16-8 36 3 20-11 36-3v-47q-16-9-36 3" fill="#f7efcf"/>${line('M0-18v47','#c49d68')}${circle(-18,1,7,'#e9be78')}${star(18,4,.8)}`,
  hat:`<path d="M-27 0q0-32 27-32T27 0Z" fill="#e5be73"/><ellipse cx="0" cy="1" rx="37" ry="8" fill="#d3a85c"/>`,
  coat:`<path d="m-12-30-23 11-10 33 17 5 7-18v34h42V1l7 18 17-5-10-33-23-11-12 13Z" fill="#92b7bf"/>${line('M0-17v52','#edf4e4')}`,
  shoe:`<path d="M-23-7 0-16 10 1 28 8q6 4 2 15h-58Z" fill="#d58e77"/>${line('M-27 16h59','#f5e7c6',5)}${line('M-8-6 5-8M-3 1 10-1','#f4e5c3')}`,
  sock:`<path d="M-13-32h24V5q27 7 17 24-4 6-18 3l-24-13Z" fill="#eab875"/>${line('M-12-23h22','#faf0cb',7)}`,
  tissue:`${box(-28,6,56,25,'#c4d5b4')}<path d="M-13 6q-12-18 2-31 9 8 25 3-3 14 1 28Z" fill="#fafbf0"/>`,
  towel:`${box(-27,-29,54,59,'#a7c7c2')}${line('M-27 20h54','#f9eed0',7)}`,
  brush:`${line('M-24 16 20-17','#de9f65',7)}${line('M12-19 21-10M18-24 27-15M24-29 33-20','#f3f7e9',5)}`,
  faucet:`${line('M-25 10v-30h40v15','#91a9a4',9)}${line('M-32-22h15','#91a9a4',6)}${line('M15 8v17M8 5v14M22 5v14','#87bfd0',3)}`,
  bath:`<path d="M-43-3h86l-8 34h-68Z" fill="#a6cbd0"/>${line('M-48-4h96','#f9faf0',8)}${circle(-20,-11,11,'#e3f0eb')}${circle(6,-17,13,'#e3f0eb')}${circle(27,-8,9,'#e3f0eb')}`,
  sun:`${circle(0,0,19,'#ecc470')}${line('M0-29v-7M0 29v7M-29 0h-7M29 0h7M-21-21-27-27M21 21l6 6M21-21 27-27M-21 21-27 27','#e6b556',4)}`,
  moon:`<path d="M8-28q-26 12-8 36 15 18 31 0-4 35-33 27-35-12-21-46Q-9-28 8-28" fill="#ebcc83" stroke="none"/>`,
  house:`<path d="M-32-3v42h64V-3" fill="#e7d3a9"/><path d="m-42-3 42-34 42 34" fill="#c68e79"/>${box(-10,10,20,29,'#87b4ac')}${box(15,6,11,12,'#eaf3e7',1)}`,
  tree:`${line('M0 7v38','#aa9271',9)}${circle(0,-18,30,'#abc699')}${circle(-22,-1,19,'#abc699')}${circle(23,-1,19,'#abc699')}`,
  umbrella:`<path d="M-39 0a39 35 0 0 1 78 0q-13-10-26 0-13-10-26 0-13-10-26 0" fill="#dbaa86"/>${line('M0 0v41q0 12-12 5','#81705e',5)}`,
  phone:`${box(-19,-32,38,65,'#5f7d76',7)}${box(-14,-25,28,44,'#d7e8dc',2)}${circle(0,26,3,'#d7e8dc')}${circle(0,-11,10,'#edb894')}${circle(0,-23,4,'#c4c8c2')}<path d="M-10-12q-3-17 10-14 13-3 10 14l-7-7-5 3-6-3Z" fill="#c4c8c2" stroke="none"/>${circle(-4,-11,3,'none')}${circle(4,-11,3,'none')}${line('M-1-11h2M-3-4q3 3 6 0','#5f7d76',1)}${box(-10,1,20,13,'#beb3c6')}`,
  pencil:`<path d="m-25 24 41-49 9 8-41 49-13 5Z" fill="#e0af61"/>${line('M-16 31-24 24','#5d6d60',4)}`,
  cat:`<path d="M-22 1-23-29-7-19q8-4 15 0l16-10-2 30" fill="#dab087"/>${circle(0,0,25,'#dab087')}${circle(-8,-2,2,'#445a4d')}${circle(8,-2,2,'#445a4d')}${line('M0 5v7m-7 0q7 7 14 0M-20 5h-13M20 5h13')}`,
  bird:`<ellipse cx="0" cy="0" rx="24" ry="16" fill="#9bbdd0"/><path d="m-19-4-17-8 3 24 17-11" fill="#82a5bd"/><path d="m22-3 13 6-13 5" fill="#e2b960"/>${circle(13,-5,2,'#40594f')}${line('M-5 14v13M6 15v12')}`,
  dog:`${circle(0,0,25,'#caa681')}<path d="M-18-20q-24-14-24 12t23 12M18-20q24-14 24 12T19 4" fill="#9c795e"/>${circle(-8,-2,2,'#40594f')}${circle(8,-2,2,'#40594f')}${circle(0,7,4,'#40594f')}${line('M0 11v5m-6 0q6 6 12 0')}`,
  ear:`<path d="M-9 26q2-12-9-27-16-26 9-33 26-6 25 19Q14 0 3 5q-10 5-4 15" fill="#edb894"/>${line('M-6-9q-5-15 7-14 14 7-1 18')}`,
  spark:`${star(0,0,2)}${star(-26,23,.8)}${star(28,-18,.6)}`
 };
 return `<g transform="translate(${x} ${y}) scale(${s})">${pieces[name]||pieces.spark}</g>`;
}
const rays=(x,y)=>`<g transform="translate(${x} ${y})">${line('M-8-8-14-16M0-11v-10M8-8 14-16','#c99752',3)}</g>`;
function scene(kind,detail){
 let s='';const child=(x=77,y=65,pose='open',mood='happy',size=1)=>person(x,y,pose,mood,size);
 const friend=(x=171,y=65,pose='open',mood='happy',size=1)=>person(x,y,pose,mood,size,'#d8ab76');
 const obj=(name,x=167,y=102,size=.9)=>object(name,x,y,size);
 if(kind==='greet'){
  s=child(75,70,detail==='meet'?'point':'wave')+friend(167,70,detail==='excuse'?'point':'wave');
  if(detail==='sun')s+=obj('sun',201,33,.55);else if(detail==='bye')s=child(58,74,'wave')+friend(177,72,'walk')+arrow(212,149,'right',.6);
  else if(detail==='meet')s=child(73,70,'reach')+friend(172,70,'offer')+line('M113 107h20','#e4ab86',10)+rays(123,73);
  else if(detail==='excuse')s=child(66,85,'wave','happy',.85)+friend(165,65,'hold')+obj('book',165,109,.7)+rays(47,58);
  else s+=rays(77,27)+rays(169,27);
 }else if(kind==='bed'){
  if(detail==='bedtime')s=obj('bed',158,125,1.35)+child(47,78,'sleep','tired',.85)+arrow(86,142,'right',.55)+obj('moon',190,40,.55);
  else{
   s=obj('bed',120,127,1.55)+`<g transform="translate(73 116) rotate(-90)">${person(0,0,'sleep','closed',.72)}</g>`+box(101,108,84,43,'#a7c8c4',7)+line('M103 117h78','#d8e8d8',3)+obj('moon',196,43,.55);
   if(detail==='dream')s+=`<ellipse cx="115" cy="56" rx="38" ry="24" fill="#fff8e3" stroke-dasharray="4 5"/>`+circle(81,90,4,'#fff8e3')+obj('bird',118,56,.65);
   else s+=star(151,29,.8)+star(160,76,.6);
  }
 }else if(kind==='need'){
  s=child(77,68,detail==='hungry'||detail==='full'?'belly':detail==='cold'?'shiver':'point',detail==='hungry'?'unhappy':detail==='full'?'content':detail==='rest'?'tired':'happy');
  const needs={water:'water',hungry:'plate',full:'plate',toilet:'toilet',rest:'chair',hot:'sun',cold:'coat'};s+=obj(needs[detail]);
  if(detail==='hungry')s+=`<ellipse cx="167" cy="50" rx="29" ry="24" fill="#fffbed" stroke-dasharray="3 4"/>`+obj('apple',168,49,.5)+line('M62 106q6-7 12 0m7 0q6-7 12 0','#c6a579',2);
  if(detail==='full')s+=circle(163,105,2,'#c6a579')+circle(175,109,2,'#c6a579')+obj('spoon',204,115,.5)+line('M49 110q28 22 55 0','#a8bc92',2);
  if(detail==='rest')s=obj('chair',120,121,1)+child(117,76,'sit','tired',.9)+obj('ball',189,145,.45);
  if(detail==='hot')s+=line('M54 48q-8 9 0 14M89 41q-7 9 0 14','#88bfcf');if(detail==='cold')s+=line('M39 69l-5 8 5 8M112 69l5 8-5 8','#81acbf');
 }else if(kind==='feeling'){
  const mood={sad:'sad',tired:'tired',scared:'scared',hurt:'hurt',breath:'closed'}[detail]||'happy';
  s=child(116,65,detail==='excited'?'up':detail==='hurt'?'belly':detail==='breath'?'open':'hold',mood,1.15);
  if(detail==='excited'||detail==='happy')s+=star(49,41,1.2)+star(198,54,1);
  if(detail==='tired')s+=obj('chair',185,118,.6);if(detail==='scared')s+=obj('dog',193,109,.65);
  if(detail==='hurt')s+=line('M107 102l5-7 7 13 6-10','#c37f6e',4);if(detail==='better')s+=heart(182,56,1)+star(54,96,.8);
  if(detail==='breath')s+=line('M147 82q36-15 29-38M151 97q44-3 41-30','#8db8b2',4)+arrow(54,95,'right',.6);
 }else if(kind==='food'){
  s=child(76,57,detail==='no'||detail==='enough'?'stop':'hold');s+=box(24,117,192,12,'#d7b891')+line('M42 129v24M198 129v24','#b99c78',6);
  s+=obj(detail==='milk'?'milk':detail==='apple'?'apple':detail==='hot'?'bowl':'plate',155,100,.8);
  if(detail==='eat')s=child(65,59,'hold','happy',.78)+friend(178,59,'hold','happy',.78)+box(27,119,184,10,'#d7b891')+line('M40 130v26M200 130v26','#b99c78',6)+obj('bowl',72,108,.65)+obj('bowl',172,108,.65)+obj('spoon',116,106,.45);
  if(detail==='more')s+=line('M215 80 189 92','#e4ab86',10)+`<g transform="rotate(65 177 92)">${obj('spoon',177,92,.65)}</g>`+obj('apple',149,87,.33)+line('M93 87 115 103 130 95','#e4ab86',8)+arrow(160,62,'left',.6);
  if(detail==='enough')s+=obj('apple',173,94,.35)+circle(144,102,2,'#c6a579')+circle(152,106,2,'#c6a579')+line('M89 83 99 100 76 103','#e4ab86',8);
  if(detail==='no')s+=line('M214 75 190 85','#e4ab86',9)+obj('apple',183,80,.55);
  if(detail==='little')s+=line('M94 84 109 93 99 72','#e4ab86',8)+line('M98 70 130 79','#7e9388',4)+`<path d="M91 65h12q-6 11-12 0" fill="#e4ae69"/>`+obj('apple',166,89,.45);
  if(detail==='apple'||detail==='yummy')s+=heart(175,43,.9);
  if(detail==='yummy')s+=obj('apple',160,87,.5)+line('M59 81 60 94 73 88','#e4ab86',8);
  if(detail==='hot')s+=line('M144 64q-8-10 0-20M160 60q-8-10 0-20M176 64q-8-10 0-20','#c19c78');
  if(detail==='milk')s+=obj('glass',197,105,.55)+line('M91 82 116 94 129 83','#e4ab86',8);
 }else if(kind==='wash'){
  s=child(91,70,detail==='hands'||detail==='dry'?'hold':'face',detail==='cover'?'closed':'happy');
  if(detail==='bath')s+=obj('bath',114,125,1.55);
  else if(detail==='teeth')s+=line('M108 94 123 85 104 81','#e4ab86',8)+line('M96 80 130 87','#de9f65',5)+box(85,76,16,7,'#fafbf0',2)+line('M86 73v5M91 73v5M96 73v5','#91a9a4',2);
  else if(detail==='tissue')s+=obj('tissue',168,117,.8)+box(82,66,18,18,'#fffcee');
  else if(detail==='cover')s+=line('M76 95 116 98 95 79','#edb894',11)+line('M124 69l13-5M125 78h16','#a3b9ab',2);
  else if(detail==='dry')s+=obj('towel',91,110,.55)+circle(78,108,6,'#edb894')+circle(104,112,6,'#edb894')+line('M76 122q15 7 28 0','#80a8a1',2);
  else if(detail==='hands')s=child(69,74,'armless')+obj('faucet',153,74,.95)+`<ellipse cx="168" cy="138" rx="38" ry="12" fill="#d7e9e8"/>`+line('M53 99 88 121 149 122M86 99 115 114 160 117','#e4ab86',8)+circle(151,114,4,'#e8f5ed')+circle(159,126,4,'#e8f5ed')+line('M160 102v9M168 101v12','#87bfd0',3);
  else s+=obj('faucet',165,84,.9)+line('M154 121q19 17 38 0','#8eb6bd',5)+line('M73 77l-3 6M110 77l3 6','#87bfd0',3);
 }else if(kind==='face'){s=child(120,63,'open',detail==='closed'?'closed':'mouth',1.35);}
 else if(kind==='chair'){s=obj('chair',124,119,1.2)+person(124,76,'sit','happy',1)+arrow(191,111,'left');}
 else if(kind==='dress'){
  s=child(96,65,detail==='self'?'hold':detail==='ready'?'up':'point');
  if(detail==='coat')s=child(115,69,'chest')+obj('coat',115,103,.72)+line('M99 94 95 109 116 100','#e4ab86',8);
  else if(detail==='clothes')s=child(87,73,'up')+obj('coat',102,107,.83)+line('M115 83 141 102','#92b7bf',12)+circle(145,104,5,'#edb894')+obj('sock',187,124,.7)+obj('shoe',188,154,.55);
  else if(detail==='socks')s+=`<ellipse cx="88" cy="151" rx="41" ry="8" fill="#bedde0" stroke="none"/>`+obj('sock',83,128,.38)+obj('sock',108,129,.38)+obj('sock',181,93,.95)+line('M161 131q-7 9 0 12M184 132q-7 9 0 12','#7fb2c7',4);
  else if(detail==='ready')s+=obj('house',187,114,.75)+obj('hat',96,39,.65)+obj('coat',96,102,.7);
  else if(detail==='self')s=obj('chair',86,128,.8)+child(85,77,'sit','happy',.85)+obj('shoe',119,130,.65)+line('M70 100 90 120 110 124M101 100 128 120 119 124','#e4ab86',7)+line('M106 125q-8-10-9-3t12 5q12-12 13-3t-12 3','#f8edd2',2)+star(162,69,.9);
  else if(detail==='small')s=child(62,70,'shrug','unhappy',.85)+line('M133 93v35q18 12 44 9','#edb894',13)+obj('shoe',164,136,.48)+line('M183 124l7-7M187 134h10M181 144l7 6','#c99752',3);
  else{
   s=obj('chair',63,123,.7)+child(63,73,'sit','happy',.85)+`<ellipse cx="176" cy="116" rx="54" ry="48" fill="#fff9e8" stroke="none"/>`;
   if(detail==='shoes-on')s+=line('M157 79v46l22 5','#edb894',13)+obj('shoe',175,138,.85)+`<g transform="rotate(90 192 92)">${arrow(192,92,'right',.65)}</g>`;
   else s+=line('M142 79v55q12 7 26 2','#edb894',13)+obj('shoe',206,139,.68)+arrow(186,106,'right',.6);
  }
 }else if(kind==='help'){
  s=child(77,77,'reach',detail==='care'?'sad':'happy',.9)+friend(170,70,'offer','happy',1);
  if(detail==='zip')s+=obj('coat',77,110,.65)+line('M77 100v27','#f8f0d4',3)+box(73,110,8,8,'#ddaa64',2)+line('M153 94 123 111 81 114','#e4ab86',9);
  else if(detail==='care')s+=line('M153 94 127 111 98 98','#e4ab86',9)+heart(124,55,.7);
  else if(detail==='box')s+=obj('box',125,129,.9)+line('M92 107 105 124M153 102 142 123','#e4ab86',8)+line('M97 132h8M142 132h8','#997d5e',4);
  else s+=obj('tower',124,127,.85)+obj('block',106,76,.4)+line('M91 99 110 90M153 99 143 125','#e4ab86',8);
 }else if(kind==='together'){
  if(detail==='hug')s=child(75,87,'armless','happy',.85)+friend(172,65,'offer','happy',1.1)+line('M89 105 109 101M60 107 49 91','#e4ab86',7)+heart(123,59,.85);
  else s=child(96,76,'hold','happy',.95)+friend(147,69,'hold')+line('M80 100q16 26 68 13M163 95q-11 26-56 21','#e4ab86',9)+heart(125,29,1.3);
 }else if(kind==='exchange'){
  s=child(70,67,'reach',detail==='sorry'?'unhappy':'happy')+friend(176,67,detail==='welcome'||detail==='okay'?'open':'offer');
  const item={gift:'gift',welcome:'gift',sorry:'water',okay:'water',spoon:'spoon',yours:'ball',mine:'ball'}[detail];s+=obj(item,124,110,.65);
  if(detail==='sorry'||detail==='okay'){
   s=child(69,69,detail==='sorry'?'chest':'open',detail==='sorry'?'unhappy':'happy')+friend(178,69,detail==='okay'?'offer':'open');
   s+=`<g transform="rotate(65 126 132)">${obj('water',126,132,.6)}</g><ellipse cx="148" cy="150" rx="30" ry="7" fill="#a1d0d5" stroke="none"/>`;
   if(detail==='okay')s+=line('M160 94 128 108 90 96','#e4ab86',8)+heart(122,43,.65);
  }
  if(detail==='spoon')s=child(68,68,'reach')+friend(178,68,'offer')+`<g transform="rotate(90 124 105)">${obj('spoon',124,105,.85)}</g>`+arrow(126,139,'left',.6);
  if(detail==='yours')s=child(65,69,'reach')+friend(172,69,'hold')+obj('ball',168,108,.68)+arrow(121,109,'right',.55);
  if(detail==='mine')s=child(80,69,'hold')+friend(179,69,'open')+obj('ball',78,108,.7)+line('M97 92 109 106 84 108','#e4ab86',7);
  if(detail==='welcome')s+=heart(122,40,.7);if(detail==='gift')s+=line('M54 93 47 109 67 101','#e4ab86',7)+rays(71,27);
 }else if(kind==='play'){
  s=child(62,70,detail==='done'?'up':'reach','happy',.9)+friend(184,70,detail==='catch'?'up':'offer','happy',.9);
  s+=obj(['tower','again','done'].includes(detail)?'tower':'ball',122,125,.85);
  if(detail==='roll')s=child(59,83,'kneel','happy',.85)+friend(182,83,'kneel','happy',.85)+obj('ball',124,142,.6)+line('M87 139h16M84 146h16','#8caa75',3)+arrow(136,165,'right',.6);
  if(detail==='catch')s=child(56,80,'reach','happy',.9)+friend(181,77,'up','happy',.9)+line('M94 110Q126 17 164 57','#83aaa7',3)+obj('ball',151,42,.58);
  if(detail==='my-turn')s=child(70,72,'hold','happy',.9)+friend(181,72,'open','happy',.9)+obj('ball',72,110,.65)+line('M54 94 48 106 63 101','#e4ab86',7);
  if(detail==='your-turn')s=child(62,72,'reach','happy',.9)+friend(177,72,'hold','happy',.9)+obj('ball',177,110,.65)+arrow(121,113,'right',.65);
  if(detail==='join')s=child(39,94,'wave','happy',.72)+friend(125,74,'reach','happy',.8)+person(194,80,'offer','happy',.75,'#b7acd0')+obj('ball',160,132,.6)+arrow(80,140,'right',.5);
  if(detail==='tower')s+=obj('block',113,77,.42)+line('M78 96 103 80M168 92 146 87','#e4ab86',7);
  if(detail==='done')s+=star(118,34,1.4);
  if(detail==='fun')s=child(66,75,'up','content',.9)+friend(177,75,'up','content',.9)+obj('ball',120,145,.6)+star(122,45,1.2);
  if(detail==='again')s=child(65,83,'kneel','happy',.9)+friend(180,73,'up','happy',.9)+obj('block',115,138,.6)+`<g transform="rotate(28 150 142)">${obj('block',150,142,.45)}</g>`+line('M102 80q27-30 49-3m-1-13 2 14-13-3','#89a978',4);
 }else if(kind==='tidy'){
  s=child(65,72,'reach')+obj('openbox',174,125,.95);
  if(detail==='box')s+=obj('block',161,78,.45)+line('M82 96 125 96 151 81','#e4ab86',8)+`<g transform="rotate(90 174 94)">${arrow(174,94,'right',.45)}</g>`;
  if(detail==='blocks')s=child(96,83,'kneel','happy',.95)+obj('block',123,142,.5)+obj('block',176,148,.45)+line('M80 105 94 135 112 140M112 105 129 126 126 139','#e4ab86',8);
  if(detail==='clean')s=child(48,82,'kneel','happy',.8)+friend(193,72,'offer','happy',.85)+obj('openbox',151,122,.9)+obj('ball',80,138,.5)+obj('block',164,82,.4)+line('M179 92 165 85','#e4ab86',7);
  if(detail==='where')s=child(59,79,'shrug','happy',.85)+obj('block',102,115,.5)+obj('openbox',177,135,.7)+line('M149 39h58v48h-58M151 83h54','#b1916b',5)+obj('closedbook',165,65,.55)+obj('closedbook',186,65,.55)+`<path d="M116 109q14-29 31-39M116 112q20 7 35 19" stroke="#a8ba99" stroke-dasharray="3 5"/>`;
  if(detail==='book')s=child(66,74,'reach')+line('M157 49h58v99h-58M159 104h54M159 146h54','#b1916b',5)+obj('closedbook',172,85,.62)+obj('closedbook',195,124,.65)+obj('closedbook',142,89,.7)+line('M81 98 118 115 141 107','#e4ab86',8)+arrow(171,65,'right',.4);
  if(detail==='done')s=child(56,80,'up','happy',.8)+friend(182,80,'up','happy',.8)+obj('box',123,129,.9)+star(121,54,1.15);
 }else if(kind==='search'){
  s=child(67,72,detail==='found'?'hold':'shrug',detail==='missing'?'unhappy':'happy')+obj('openbox',174,124,1);
  if(detail==='hat')s=child(63,80,'kneel','happy',.8)+obj('hat',181,140,.55)+obj('chair',173,106,.95)+line('M88 115 139 132','#a5b49b',2);
  if(detail==='found')s+=obj('ball',67,110,.65)+rays(65,39);
  if(detail==='missing')s+=`<ellipse cx="170" cy="45" rx="28" ry="23" fill="#fffbed" stroke-dasharray="3 4"/><g opacity=".55">${obj('ball',170,46,.55)}</g>`+circle(139,72,3,'#fffbed');
 }else if(kind==='outside'){
  s=obj('tree',205,74,1)+child(detail==='close'?102:77,76,detail==='look'||detail==='touch'?'stop':'point','happy',.8)+friend(detail==='close'?145:158,58,'point','happy',1.05);
  if(detail==='hand')s+=line('M90 95 112 108 140 84','#edb894',9)+circle(113,107,5,'#edb894');
  if(detail==='rain')s+=obj('umbrella',117,39,1.4)+line('M28 36 24 46M53 18 49 28M206 27 202 37M220 51 216 61','#82b1c5',3);
  if(detail==='home')s=obj('house',190,108,1.05)+child(49,87,'walk','happy',.75)+friend(108,69,'walk','happy',.95)+arrow(147,158,'right',.55);
  if(detail==='step')s=obj('tree',205,70,.7)+friend(184,63,'offer','happy',1)+`<path d="M96 159v-15h34v-15h34v30Z" fill="#b7c2b0"/>`+child(73,87,'step','happy',.8)+arrow(140,111,'left',.5);
  if(detail==='touch')s=child(66,84,'reach','happy',.8)+friend(183,69,'stop','happy',.95)+obj('cactus',126,125,.85)+line('M145 102 138 112','#e4ab86',6);
  if(detail==='look')s+=line('M13 151h216M32 146l7 9M60 146l7 9M188 146l7 9','#e9debb',6);
  if(detail==='wait')s=box(44,127,151,9,'#d1ae82')+line('M53 134v24M183 134v24','#b1916b',6)+child(85,72,'sit','happy',.85)+friend(158,63,'sit','happy',.95)+circle(199,40,20,'#fffbed')+line('M199 25v15l10 6','#8aa68b',3);
  if(detail==='slow')s=obj('tree',206,77,.8)+child(78,83,'walk','happy',.8)+friend(151,65,'walk','happy',1)+line('M48 155h8m20 0h8m20 0h8','#a1b18a',4);
  if(detail==='see')s=friend(52,64,'open','happy',1)+child(176,92,'hold','happy',.75)+obj('ball',179,127,.47)+`<path d="M71 62 162 89" stroke="#90b79d" stroke-dasharray="3 5"/>`+obj('tree',218,83,.5);
  if(detail==='close')s+=heart(122,49,.65);
 }else if(kind==='family'){
  s=child(70,78,detail==='draw'?'hold':'reach','happy',.85)+friend(169,63,'offer','happy',1.05);
  if(['book','story'].includes(detail))s+=obj('book',119,115,.9)+line('M82 99 99 120M151 88 141 118','#e4ab86',7);
  if(detail==='story')s+=`<ellipse cx="123" cy="40" rx="34" ry="25" fill="#fffbed" stroke-dasharray="3 4"/>`+obj('house',123,38,.5);
  if(detail==='play')s+=obj('ball',110,111,.68)+line('M82 97 96 113','#e4ab86',7);
  if(detail==='doing')s=child(56,87,'shrug','happy',.8)+friend(164,70,'hold','happy',1)+obj('tower',161,137,.7)+obj('block',160,95,.45)+line('M146 94 151 100M180 94 169 100','#e4ab86',7);
  if(detail==='draw')s+=box(33,121,112,32,'#fff9e8')+obj('sun',63,137,.25)+line('M81 100 99 114 113 119','#e4ab86',7)+line('M104 109 125 140','#d7a256',6)+line('M124 139 128 145','#5d6d60',3)+line('M100 141q9-5 19 0','#83aaa7',2);
  if(detail==='phone')s+=obj('phone',118,95,1.25)+line('M84 102 97 116M153 91 140 113','#e4ab86',7);
  if(detail==='come')s=child(63,79,'wave','happy',.85)+friend(176,66,'walk','happy',1)+arrow(116,138,'left',.7);
  if(detail==='look')s=child(64,82,'up','happy',.85)+friend(169,63,'open','happy',1.05)+`<path d="M150 62 82 78" stroke="#94b59e" stroke-dasharray="3 5"/>`+rays(65,38);
  if(detail==='listen')s=child(68,81,'chest','happy',.85)+friend(171,64,'ears','happy',1.05)+line('M93 80q16-13 24 1M100 70q24-14 31 12','#96bcae',3);
 }else if(kind==='explore'){
  s=child(64,76,detail==='dog'?'ears':'point','happy',.85);
  const name={mystery:'box',cat:'cat',bird:'bird',red:'apple',big:'ball',small:'ball',dog:'dog'}[detail];
  if(name)s+=obj(name,167,102,detail==='big'?1.6:detail==='small'?.42:1);
  if(detail==='bird')s+=obj('tree',186,128,.55);if(detail==='dog')s+=line('M205 87q13 11 0 21M218 81q18 19 0 35','#a6b994',3);
  if(detail==='colors')s+=obj('redball',166,115,.95)+circle(140,53,11,'#d78676')+circle(168,53,11,'#85b0ca')+circle(196,53,11,'#e4bf6c');
  if(detail==='count'||detail==='two'){
   s+=obj('apple',143,116,.65)+obj('apple',190,116,.65);
   if(detail==='count')s+=`<path d="M93 91 143 83 190 83" stroke="#a8ba99" stroke-dasharray="3 5"/>`+circle(143,83,3,'#a8ba99')+circle(190,83,3,'#a8ba99');
   else s+=line('M92 92 104 78M104 78l-3-13M104 78l6-11','#e4ab86',4);
  }
  if(detail==='red')s+=circle(203,45,15,'#d78676');if(detail==='mystery')s+=rays(168,58);
 }else if(kind==='kindness'){
  s=child(68,73,detail==='stop'||detail==='dislike'?'stop':'reach',detail==='dislike'?'unhappy':'happy',.9)+friend(180,68,'offer','happy',.95);
  if(detail==='share')s+=obj('apple',77,110,.5)+obj('apple',129,105,.5)+line('M162 93 146 107','#e4ab86',7)+heart(126,49,.7);
  else if(detail==='together')s+=obj('box',124,121,.95)+line('M82 95 100 120M163 92 149 120','#e4ab86',8)+line('M98 123h9M144 123h9','#997d5e',4);
  else if(detail==='first')s=child(64,83,'reach','happy',.85)+friend(164,70,'walk','happy',.95)+obj('ball',195,147,.5)+arrow(122,140,'right',.6);
  else if(detail==='back')s+=obj('ball',128,108,.67)+line('M82 94 111 111M163 91 145 108','#e4ab86',7)+arrow(123,144,'left',.6);
  else if(detail==='turn')s=child(65,77,'wave','happy',.9)+friend(178,72,'hold','happy',.95)+obj('ball',177,110,.66)+arrow(117,137,'left',.65);
  else if(detail==='stop')s+=line('M162 91 132 81 96 76','#e4ab86',7)+line('M94 89V67M88 80l13-2','#e4ab86',5)+obj('ball',151,145,.45);
  else if(detail==='dislike')s+=obj('ball',133,126,.75)+line('M114 115 107 108M110 127h-10','#a6b994',2);
  else if(detail==='job')s=child(60,77,'up','happy',.9)+friend(184,73,'clap','happy',.95)+obj('tower',125,124,.9)+star(124,43,1.15)+line('M203 103l7-4M205 112h8M204 120l7 4','#c99752',2);
  else if(detail==='encourage')s=child(65,81,'reach','happy',.9)+friend(182,74,'up','happy',.95)+box(103,130,48,22,'#80b9b0')+box(108,109,38,21,'#e8b06d')+obj('block',102,91,.42)+line('M81 103 99 99','#e4ab86',7);
 }
 return s;
}
export function lessonIllustration(id){
 const recipe=ILLUSTRATION_RECIPES[id];if(!recipe)return '';
 return `<svg class="lesson-illustration" data-illustration="${id}" viewBox="0 0 240 180" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" stroke="#40594f" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" fill="none"><g stroke="none">${box(0,0,240,180,'#f3f2dc',24)}${circle(188,38,48,'#e4edda')}<ellipse cx="120" cy="158" rx="99" ry="11" fill="#dfe7cd"/></g>${scene(...recipe)}</svg>`;
}
