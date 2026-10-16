/* Original, text-free paper-toy illustrations for 小芽英语. */
let serial = 0;
const C = { ink:'#4b5544',green:'#75995f',leaf:'#547d49',mint:'#d9e7c5',cream:'#fff8e7',orange:'#d68862',yellow:'#efc66c',blue:'#9fc8c6',pink:'#e7b9a9',wood:'#c7a67c',dark:'#836b51' };
const tag = (body, box='0 0 400 300', extra='') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" fill="none" aria-hidden="true" focusable="false" ${extra}>${body}</svg>`;
const line = (d,color=C.ink,width=4,extra='') => `<path d="${d}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const ell = (cx,cy,rx,ry,fill,extra='') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const rect = (x,y,w,h,r,fill,extra='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const dot = (x,y,r,fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const at = (x,y,s,body,rotate=0) => `<g transform="translate(${x} ${y}) scale(${s}) rotate(${rotate})">${body}</g>`;
const grain = (id) => `<defs><pattern id="${id}" width="27" height="27" patternUnits="userSpaceOnUse">${dot(4,7,.7,'#826e40')}${dot(19,21,.55,'#826e40')}${line('M15 4h2','#fff',1)}</pattern></defs><rect width="400" height="300" fill="url(#${id})" opacity=".055" pointer-events="none"/>`;
const spark = (x,y,s=1,color=C.yellow) => at(x,y,s,`<path d="M0-12Q2-2 12 0Q2 2 0 12Q-2 2-12 0Q-2-2 0-12" fill="${color}"/>`);
const leaf = (x,y,s=1,rotate=0) => at(x,y,s,`<path d="M0 0C-26-1-27-23-26-27C-5-29 5-13 0 0Z" fill="${C.green}"/>${line('M-21-22L0 0',C.leaf,2)}`,rotate);

function sprout(mood='happy') {
  const sleepy = /sleep|bed|calm/.test(mood), asking = /ask|request|thinking|listen/.test(mood), wave = /wave|happy|resolved|celebrate/.test(mood);
  const pointing = /point/.test(mood), listening = /listening/.test(mood), helping = /helping|inviting|story/.test(mood), reading = /reading/.test(mood);
  const leftArm = pointing?'M-36 32Q-57 17-77 2':helping?'M-36 34Q-58 43-77 31':wave?'M-36 32Q-63 18-61-6':'M-36 35Q-53 48-49 57';
  const rightArm = listening?'M37 34Q61 20 42 0':helping?'M37 34Q58 43 69 27':asking?'M37 34Q56 32 59 15':'M37 34Q58 51 50 60';
  return `${ell(0,93,48,8,'#6b7643','opacity=".13"')}${line('M-29 66l-9 19M27 67l9 19',C.leaf,13)}
    <g class="buddy-arm${wave?' buddy-wave':''}">${line(leftArm,C.green,15)}${pointing?line('M-77 2l-12-8',C.green,6):wave?line('M-62-5l-5-9M-59-5l2-11',C.green,6):''}</g>${line(rightArm,C.green,15)}
    <path d="M-41 16C-47-18-26-48 0-48S48-22 43 15L39 61C34 83-29 87-38 63Z" fill="${C.mint}" stroke="#6f9360" stroke-width="3"/>
    <path d="M-31 17C-36-11-22-34-2-37" stroke="#f7f9e8" stroke-width="7" stroke-linecap="round"/>
    ${line('M1-48Q-2-63 5-74',C.leaf,5)}${leaf(3,-60,.66,45)}${leaf(7,-66,.57,135)}
    ${sleepy?line('M-23 6q7 8 14 0M12 6q7 8 14 0',C.ink,3.5):`${ell(pointing?-21:-16,reading?12:5,3.8,5,C.ink)}${ell(pointing?12:17,reading?12:5,3.8,5,C.ink)}`}
    ${ell(-27,18,8,5,C.pink)}${ell(28,18,8,5,C.pink)}
    <g class="buddy-mouth">${asking?ell(1,23,4,5,C.ink):sleepy?line('M-3 24q5 3 9 0',C.ink,2.5):`<path d="M-9 20Q1 25 11 20Q4 38-4 30Z" fill="${C.ink}"/>`}</g>
    <path d="M-18 49Q0 39 19 49L17 68Q0 75-16 68Z" fill="#a5be8b"/>
    ${leaf(3,62,.28,35)}${listening?`${ell(45,4,8,11,C.green)}${line('M50-4q9 8 0 16',C.leaf,2.4)}`:''}`;
}

export function buddy(mood='happy') { return tag(at(90,91,.92,sprout(mood)),'0 0 180 190','class="buddy-svg"'); }

export function icon(name,size=32) {
  name=({house:'home',replay:'again',sparkle:'star'})[name]||name;
  const paths = {
    back: line('M19 5L8 16l11 11'), close:line('M8 8l16 16M24 8L8 24'),
    play:'<path d="M11 6L27 16L11 26Z" fill="currentColor"/>', pause:`${rect(8,5,6,22,2,'currentColor')}${rect(20,5,6,22,2,'currentColor')}`,
    sound: `<path d="M5 12H10L17 6V26L10 20H5Z" fill="currentColor"/>${line('M22 11q6 5 0 10M26 7q10 9 0 18','currentColor',2.7)}`,
    mic:`${rect(11,3,10,17,5,'currentColor')}${line('M6 15v2a10 10 0 0020 0v-2M16 27v4M11 31h10','currentColor',3)}`,
    'voice-replay':`${rect(8,3,8,13,4,'currentColor')}${line('M4 12v2a8 8 0 0016 0v-2M12 22v6M8 28h8M24 18a7 7 0 11-4 11M24 13v6h-6','currentColor',2.5)}`,
    stop:rect(7,7,18,18,4,'currentColor'), again: `${line('M26 14a11 11 0 10-2 10','currentColor',3)}${line('M26 5v9h-9','currentColor',3)}`,
    help:`${dot(16,16,13,'currentColor')}<path d="M11 11a5 5 0 019 2c0 3-4 3-4 6" stroke="#fff8e7" stroke-width="2.6" stroke-linecap="round"/>${dot(16,24,1.5,'#fff8e7')}`,
    home:`<path d="M3 15L16 4l13 11" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${rect(7,14,18,16,3,'currentColor')}${rect(13,21,6,9,2,'#fff8e7')}`,
    parent:`${dot(11,8,5,'currentColor')}${dot(24,15,4,'currentColor')}<path d="M2 28v-8a9 9 0 0118 0v8M17 29v-5a7 7 0 0114 0v5" fill="currentColor"/>`,
    check:line('M5 16l8 8L28 7','currentColor',4), next:line('M12 5l11 11-11 11','currentColor',4),
    lock:`${line('M9 13V9a7 7 0 0114 0v4','currentColor',3)}${rect(5,12,22,18,4,'currentColor')}${dot(16,20,2.5,'#fff8e7')}${rect(15,20,2,5,1,'#fff8e7')}`,
    gift:`${rect(5,14,22,16,3,'currentColor')}${rect(3,10,26,6,2,'currentColor')}${line('M16 12v17','#fff8e7',3)}${line('M16 10C3 11 6-4 13 3L16 10C29 11 26-4 19 3Z','currentColor',2.5)}`,
    hand:`<path d="M10 17V7a2 2 0 014 0v9V4a2 2 0 014 0v12V7a2 2 0 014 0v11-6a2 2 0 014 0v10q0 9-10 9c-4 0-6-3-9-6l-4-5q-2-4 2-3l5 4" fill="currentColor"/>`,
    wave:`<path d="M11 18V8a2 2 0 014 0v8V5a2 2 0 014 0v12V8a2 2 0 014 0v11-6a2 2 0 014 0v9q0 9-9 9c-4 0-6-3-9-6l-4-5q-2-4 2-3l4 3" fill="currentColor"/>${line('M3 8l2 2M6 3l2 2M29 4l1-2','currentColor',2)}`,
    tap:`<path d="M13 18V6a3 3 0 016 0v10l7 1q5 1 4 6l-2 8H16l-8-9q-3-5 1-5l4 3Z" fill="#fff8e7" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/>${line('M7 7H4M10 2L8 0M25 5l3-2','currentColor',2)}`,
    place:`${line('M5 24v6h24v-6M17 4v16M10 14l7 7 7-7','currentColor',3)}${line('M4 24h4M26 24h4','currentColor',3)}`,
    ear:`${line('M10 21c-9-11 5-24 15-13 6 8-3 12-6 15-2 2 0 7-5 7-3 0-5-2-5-4M14 17c-6-8 8-12 7-3 0 3-4 3-5 6','currentColor',3)}`,
    book:`<path d="M3 5q8-3 13 2 5-5 13-2v23q-8-3-13 1-5-4-13-1Z" fill="currentColor"/>${line('M16 8v18','#fff8e7',2)}`,
    settings:`${dot(16,16,10,'currentColor')}${dot(16,16,4,'#fff8e7')}${[0,45,90,135].map(a=>`<path d="M16 1v6M16 25v6" stroke="currentColor" stroke-width="5" transform="rotate(${a} 16 16)"/>`).join('')}`,
    download:`${line('M16 3v18M9 15l7 7 7-7M4 25v5h24v-5','currentColor',3)}`,
    trash:`${line('M5 8h22M12 4h8M9 9l1 20h12l1-20M14 13v10M18 13v10','currentColor',3)}`,
    moon:`<path d="M23 4A13 13 0 1110 25A14 14 0 0023 4Z" fill="currentColor"/>`,
    sun:`${dot(16,16,7,'currentColor')}${[0,45,90,135].map(a=>`<path d="M16 1v4M16 27v4" stroke="currentColor" stroke-width="2.5" transform="rotate(${a} 16 16)"/>`).join('')}`,
    star:'<path d="M16 2l4.4 9 9.6 1.4-7 7 1.6 10-8.6-4.7-8.6 4.7L9 19.4l-7-7 9.6-1.4Z" fill="currentColor"/>',
    arrow:line('M5 16h23M20 8l8 8-8 8','currentColor',3), eye:`${line('M2 16Q16-3 30 16Q16 35 2 16Z','currentColor',2.5)}${dot(16,16,5,'currentColor')}`,
    heart:'<path d="M16 29C-5 14 3 0 14 8l2 2 2-2C29-1 38 14 16 29Z" fill="currentColor"/>',
    cloud:`<path d="M8 25C-3 25-2 11 8 11 8-3 29-2 28 14 37 17 32 27 25 25Z" fill="currentColor"/>`,
    plus:line('M16 5v22M5 16h22','currentColor',4),
    world:`${line('M5 29h25M9 28V15M23 27V10','currentColor',3)}${dot(10,11,7,'currentColor')}${dot(23,7,6,'currentColor')}${dot(28,14,5,'currentColor')}${line('M14 28q4-12 8 0','currentColor',3)}`,
  };
  const key=Object.prototype.hasOwnProperty.call(paths,name)?name:'star';
  return tag(paths[key],'0 0 34 34',`width="${Number(size)||32}" height="${Number(size)||32}" class="ui-icon" data-icon="${key}"`);
}

function toy(name, resolved=true) {
  const stroke = `stroke="${C.dark}" stroke-width="2"`;
  // Rewards have their own silhouettes, even when their names contain another toy.
  if(name==='sun-lamp') return `${line('M0-9v48',C.wood,7)}${ell(0,39,25,7,C.wood)}${dot(0,-12,28,C.yellow)}${[0,45,90,135].map(a=>`<path d="M0-49v6M0 20v6" stroke="${C.yellow}" stroke-width="4" stroke-linecap="round" transform="rotate(${a} 0 -12)"/>`).join('')}${dot(-8,-15,2,C.dark)}${dot(8,-15,2,C.dark)}${line('M-6-6q6 6 12 0',C.dark,2)}`;
  if(name==='cloud-cushion') return `<path d="M-28 28C-57 26-51-8-29-8C-27-42 16-44 22-14C52-21 61 22 32 28Z" fill="#e5ebdc" stroke="#b2c6b9" stroke-width="2"/>${line('M-35 15q7 7 15 5M34 10q-1 9-10 11','#fdfbef',4)}`;
  if(name==='apple-plate') return `${ell(0,20,47,17,C.cream)}${ell(0,20,39,11,'#e0b185')}${ell(0,20,33,8,'#f5d7a7')}${at(1,-4,.64,toy('apple'))}`;
  if(name==='book-shelf') return `${rect(-45,-47,90,91,7,C.wood)}${rect(-36,-37,72,64,3,'#f3dab1')}${rect(-36,-4,72,8,2,'#b59065')}${rect(-29,-29,13,25,2,C.orange)}${rect(-13,-32,12,28,2,C.green)}${rect(5,-27,12,23,2,C.blue)}${rect(19,-33,12,29,2,C.yellow)}${at(-14,17,.45,toy('book'))}${rect(14,8,15,21,2,C.green)}${line('M-33 43v8M33 43v8',C.dark,5)}`;
  if(name==='story-chair') return `${at(0,-7,.85,toy('chair'))}${line('M-45 30q45 28 90 0',C.dark,7)}${rect(-20,-30,40,22,6,C.green)}${at(0,3,.38,toy('book'))}`;
  if(name==='sock-basket') return `${at(-12,-9,.58,toy('sock'),-18)}${at(15,-8,.53,toy('sock'),18)}${at(0,15,.83,toy('basket'))}`;
  if(name==='coat-hook') return `${line('M0-46v88M-29 43h58M0-16l-22-12M0-32l22-12',C.wood,7)}${leaf(1,-37,.44,132)}${at(-18,8,.61,toy('coat'))}${dot(22,-44,4,C.orange)}`;
  if(name==='bird-mobile') return `${line('M0-53v10M-43-29Q0-55 43-29',C.wood,3)}${line('M-29-34v26M25-35v14M0-42v52',C.dark,1.5)}${at(-28,5,.48,toy('bird'))}${at(25,-4,.4,toy('bird'),-8)}${spark(0,23,1.2)}${spark(34,29,.5)}`;
  if(name==='cat-plush') return `${ell(0,24,26,29,C.pink)}${ell(-19,43,12,7,C.pink)}${ell(19,43,12,7,C.pink)}${line('M25 28q25 2 17-22',C.pink,10)}${ell(0,25,15,17,'#f3d4bd')}${at(0,-17,.83,toy('cat'))}`;
  if(name==='dog-toy') return `${rect(-31,4,65,30,13,C.wood)}${line('M-31 13q-24-14-21-25',C.dark,9)}${dot(-20,34,9,C.orange)}${dot(25,34,9,C.orange)}${dot(-20,34,3,C.cream)}${dot(25,34,3,C.cream)}${at(22,-9,.71,toy('dog'))}`;
  if(name==='leaf-soap') return `${ell(0,21,41,12,'#d6ccb0')}${rect(-29,-19,58,38,13,C.mint)}${leaf(7,7,.55,10)}${dot(27,-29,8,'#fffdf4')}${dot(39,-12,5,'#fffdf4')}`;
  if(name==='star-blanket') return `${rect(-43,-33,86,67,8,C.blue)}${line('M-34 27h68','#dae9d9',3)}${spark(-18,-12,.75,'#fff1bd')}${spark(17,8,.9,'#fff1bd')}${spark(24,-21,.42,'#fff1bd')}${[-33,-20,-7,6,19,32].map(x=>line(`M${x} 33v5`,C.blue,2)).join('')}`;
  if(name==='snail') return `${line('M-23 23H23q20 1 21-11l-1-14',C.mint,14)}${dot(41,-7,10,C.mint)}${line('M37-15l-6-12M45-15l6-12',C.green,2.5)}${dot(31,-27,3,C.ink)}${dot(51,-27,3,C.ink)}${dot(-5,1,29,C.orange)}${line('M-19 13C-44-14 6-38 15-5 24 22-16 25-13 3q2-12 12-7',C.cream,4)}`;
  if(name==='bear') return `${dot(-24,-29,12,C.wood)}${dot(23,-29,12,C.wood)}${ell(0,5,34,37,C.wood)}${dot(-12,-4,3,C.ink)}${dot(12,-4,3,C.ink)}${ell(0,14,16,12,'#e9d4b0')}${ell(0,9,6,4,C.dark)}${line('M0 13v5M-6 19q6 5 12 0',C.dark,2)}`;
  if(name==='jug') return `<path d="M-29-35H20L31-20V23Q0 40-26 25Z" fill="#b5d0cd"/>${line('M28-23C64-24 63 24 29 18','#88aeb1',8)}${ell(-5,-34,24,6,'#e3ede1')}<path d="M-19-6Q-2 1 22-5V20Q-1 31-20 20Z" fill="#8cbcc4"/>${line('M-17-24v11','#f2f7ed',4)}`;
  if(name==='paper') return `${rect(-37,-23,62,43,3,C.orange,'transform="rotate(-9)"')}${rect(-26,-27,62,45,3,C.blue,'transform="rotate(8)"')}${rect(-30,-17,62,45,3,C.yellow)}${leaf(3,13,.52,-12)}`;
  if(name==='backpack') return `${line('M-13-29q0-22 26 0',C.dark,6)}${rect(-31,-27,62,69,12,C.orange)}${rect(-28,-23,56,29,10,'#e3a882')}${rect(-20,15,40,20,6,'#e4b089')}${resolved?`${line('M0-2v-17',C.cream,5)}${rect(-7,-21,14,11,3,C.wood)}`:`${line('M0-2v15',C.cream,5)}${rect(-7,10,14,11,3,C.wood)}`}`;
  if(name==='tent') return `<path d="M0-47L58 37H-58Z" fill="${C.orange}"/><path d="M0-47L17 37H-58Z" fill="#e8b584"/><path d="M0-26L-25 37H29Z" fill="#705f50"/>${line('M0-47v-11',C.wood,4)}${line('M-56 38h114',C.wood,4)}`;
  if (/ball|football/.test(name)) return `${dot(0,0,27,C.orange)}<path d="M-25-8Q0 3 24-10M-20 19Q1-1-1-26M17 22Q2-4-1-26" stroke="#fff0cf" stroke-width="7"/>`;
  if (/book|story/.test(name)) return `<path d="M-36-24Q-15-28 0-19Q16-28 37-24V27Q15 23 0 31Q-16 23-36 27Z" fill="${C.blue}" ${stroke}/><path d="M-30-20Q-13-22 0-15Q13-22 30-20V20Q11 18 0 25Q-12 18-30 20Z" fill="#fff7df"/>${line('M0-15v39','#b6c5b5',2)}${leaf(-12,5,.45,-20)}${spark(17,1,.8)}`;
  if (/cup|water|milk/.test(name)) {const blue=name==='blue-cup';return `${ell(0,29,31,5,'#7c6a4c','opacity=".14"')}${line('M22-16C53-24 51 23 24 16',blue?'#82abae':C.orange,9)}<path d="M-24-23H24L20 23Q0 33-20 23Z" fill="${blue?C.blue:C.orange}"/>${ell(0,-23,24,7,blue?'#d4e3d6':'#f3c8a5')}${ell(0,-23,18,4,resolved?'#91bec7':blue?'#72999a':'#9e674a')}${line('M-15-13v27',blue?'#d2e5dc':'#edb18d',4)}`;}
  if (/spoon/.test(name)) return `${ell(0,-19,14,20,C.wood)}${rect(-4,-5,8,48,4,C.wood)}${ell(-3,-22,7,12,'#dfc49d')}`;
  if (/bowl|plate|snack/.test(name)) return `${ell(0,20,40,10,'#8a7a59','opacity=".12"')}<path d="M-38-4H38Q32 29 0 30Q-32 29-38-4" fill="${C.blue}"/>${ell(0,-4,38,10,'#dbe9d9')}${resolved?`${dot(-13,-8,9,C.orange)}${dot(7,-10,10,C.yellow)}${dot(22,-4,7,C.green)}`:''}`;
  if (/apple/.test(name)) return `<path d="M0-17C-29-32-45 15-16 31Q-6 36 0 30Q9 36 19 29C45 8 25-31 0-17" fill="${C.orange}"/>${line('M0-17q-3-9 3-18',C.dark,5)}${leaf(4,-24,.5,120)}${line('M-19-8q-10 10-5 23','#efb48d',5)}`;
  if (/sofa|bench/.test(name)) return `${rect(-52,-23,104,53,14,C.green)}${rect(-59,0,19,39,8,C.leaf)}${rect(40,0,19,39,8,C.leaf)}${rect(-38,4,76,25,8,'#a0b485')}${rect(-40,34,9,13,3,C.wood)}${rect(31,34,9,13,3,C.wood)}${rect(-33,-16,28,24,7,C.yellow)}`;
  if (/chair|stool/.test(name)) return `${rect(-27,-38,54,43,9,C.wood)}${rect(-32,0,64,13,6,'#ddb88c')}${line('M-22 10l-5 37M22 10l5 37',C.dark,7)}${line('M-16-25h32',C.cream,4)}`;
  if (/table/.test(name)) return `${line('M-32 5l-6 44M32 5l6 44',C.dark,8)}${rect(-50,-7,100,18,9,C.wood)}${line('M-36-1h70','#e1c298',3)}`;
  if (/rug|mat/.test(name)) return `${ell(0,3,57,29,C.orange)}${ell(0,3,45,20,'#e6ad88')}${line('M-37 4h74',C.cream,3)}${[-45,-30,-15,0,15,30,45].map(x=>line(`M${x} 25v6`,C.orange,2)).join('')}`;
  if (/pillow|cushion/.test(name)) return `<path d="M-35-25Q0-17 35-25Q27 0 35 25Q0 18-35 25Q-28 0-35-25" fill="${C.yellow}" ${stroke}/>${line('M-23-14Q0-10 23-14M-22 14Q0 10 22 14','#e1b257',2)}`;
  if (/blanket/.test(name)) return `${rect(-37,-28,74,56,7,C.blue)}${line('M-25-27v54M0-27v54M25-27v54','#d3e2d2',4)}${line('M-36-14h72M-36 10h72','#d3e2d2',4)}`;
  if (/lamp|light/.test(name)) return `${line('M0-5v42',C.wood,6)}${ell(0,42,22,6,C.wood)}<path d="M-18-34H18L32 0H-32Z" fill="${C.yellow}"/>${ell(0,0,32,5,'#e2b56b')}${line('M-13-27L-21-7',C.cream,4)}`;
  if (/plant|flower|sprout/.test(name)) return `${line('M0 1v-42',C.leaf,5)}${leaf(0,-19,.7,20)}${leaf(1,-32,.6,130)}<path d="M-25-3H25L18 32H-18Z" fill="${C.orange}"/>${rect(-29,-7,58,11,4,'#e2a37e')}`;
  if (/bird|nest/.test(name)) return `${ell(-1,5,29,22,C.yellow)}${dot(17,-10,18,C.yellow)}<path d="M31-14l17 7-17 5M-24 7l-20-17 3 27" fill="${C.orange}"/>${dot(22,-13,3,C.ink)}<path d="M-17 1Q2-10 12 7Q0 24-17 1" fill="#dcaa57"/>${line('M-7 26v8M8 26v8',C.dark,3)}`;
  if (/cat/.test(name)) return `<path d="M-27-6L-29-34-6-21Q7-24 16-19L34-35 32-5" fill="${C.pink}"/>${ell(3,4,36,29,C.pink)}${ell(-9,0,3,4,C.ink)}${ell(17,0,3,4,C.ink)}${dot(4,10,3,C.orange)}${line('M4 13q-4 6-9 0M4 13q4 6 9 0',C.ink,2)}${line('M-37 6l12 4M-37 15l12-1M29 11l14-5M30 15l14 2',C.dark,2)}`;
  if (/dog/.test(name)) return `${ell(-24,-4,13,26,C.dark,'transform="rotate(25 -24 -4)"')}${ell(25,-4,13,26,C.dark,'transform="rotate(-25 25 -4)"')}${ell(0,1,29,31,C.wood)}${dot(-11,-3,3,C.ink)}${dot(12,-3,3,C.ink)}${ell(0,13,15,11,'#e5d3ad')}${ell(0,9,6,4,C.ink)}${line('M0 13v4q7 8 10 0',C.ink,2)}`;
  if (/sock/.test(name)) return `<path d="M-15-35H14V5L30 16Q45 29 23 37Q14 40 3 29L-19 12Z" fill="${C.yellow}"/>${rect(-16,-35,31,10,3,C.orange)}${line('M-13-12h25M-13-1h25',C.cream,5)}`;
  if (/shoe/.test(name)) return `<path d="M-29-13L-7-22 4-3 29 4Q45 11 34 26H-30Q-40 12-29-13Z" fill="${C.green}"/>${line('M-32 25h64',C.cream,7)}${line('M-5-4l-7 6M3 2l-8 6M12 6l-8 6',C.cream,3)}`;
  if (/coat|zip/.test(name)) return `<path d="M-16-34L-38-20-49 8-30 16-23 2-22 37H23L24 2 31 16 50 8 38-20 16-34Q0-16-16-34" fill="${C.orange}"/>${line(resolved?'M0-22v57':'M-12-28L0 5 12-28M0 5v30',C.cream,4)}${rect(-3,resolved?-19:5,7,10,2,C.wood)}`;
  if (/towel/.test(name)) return `${rect(-29,-35,58,70,6,C.blue)}${line('M-21 22h42M-21 28h42','#d9e9dd',3)}${line('M-30-36H31',C.wood,7)}`;
  if (/soap/.test(name)) return `${ell(0,17,40,13,'#d0c9a6')}${rect(-29,-19,58,33,11,C.pink)}${ell(-4,-9,16,6,'#f5d9c9')}${dot(27,-28,8,'#fff')}${dot(37,-12,5,'#fff')}`;
  if (/basket/.test(name)) return `${line('M-29-11q0-48 58 0',C.dark,7)}<path d="M-40-9H40L31 32H-31Z" fill="${C.wood}"/>${line('M-29 4h58M-26 17h52M-14-8v38M5-8v38M23-8l-4 38','#dfc299',4)}`;
  if (/clock/.test(name)) return `${dot(0,0,34,C.green)}${dot(0,0,27,C.cream)}${line('M0-17V0L13 9',C.ink,4)}${dot(0,0,3,C.orange)}${[0,90,180,270].map(r=>`<path d="M0-23v3" stroke="${C.wood}" stroke-width="3" transform="rotate(${r})"/>`).join('')}`;
  if (/moon|star/.test(name)) return /moon/.test(name)?`<path d="M19-36A37 37 0 11-22 22A40 40 0 0019-36Z" fill="${C.yellow}"/>${spark(29,18,.6)}`:spark(0,0,3,C.yellow);
  if (/picture|frame|art/.test(name)) return `${rect(-38,-32,76,64,6,C.wood)}${rect(-29,-23,58,46,2,C.cream)}${dot(14,-10,7,C.yellow)}<path d="M-29 23L-9-4 8 14 17 3 29 23Z" fill="${C.green}"/>`;
  if (/bridge/.test(name)) return `${rect(-41,4,19,36,3,C.orange)}${rect(22,4,19,36,3,C.blue)}${rect(-47,-10,94,18,4,C.wood)}${rect(-10,-37,22,25,3,C.yellow)}`;
  if (/block|tower/.test(name)) return `${rect(-32,4,30,30,3,C.orange)}${rect(2,4,30,30,3,C.blue)}${rect(-16,-26,32,29,3,C.yellow)}<path d="M-21-28L0-48 22-28Z" fill="${C.green}"/>`;
  if (/box|chest/.test(name)) return `${rect(-43,-8,86,47,7,C.wood)}${rect(-36,-1,72,32,5,'#dfbb8b')}${line('M-27 0v28M27 0v28','#c9a372',3)}${resolved?`<g transform="translate(-39 -9) rotate(-35)">${rect(0,-13,84,15,5,'#b68e65')}</g>${at(-8,-12,.5,toy('ball'))}${at(24,-2,.45,toy('block'))}`:`${rect(-46,-18,92,16,5,'#b68e65')}${rect(-7,-6,14,18,3,C.yellow)}${dot(0,2,2,C.dark)}`}`;
  if (/bed/.test(name)) return `${rect(-52,-25,104,65,10,C.wood)}${rect(-45,-18,90,43,8,C.blue)}${rect(-35,-15,32,21,7,C.cream)}${rect(-8,-17,53,42,5,'#a1bd96')}${line('M-44 36v12M44 36v12',C.dark,7)}`;
  return `${rect(-31,-24,62,52,11,C.yellow)}${leaf(5,10,.7,15)}`;
}

export function itemArt(itemId='plant') { return tag(at(60,62,1,toy(String(itemId))),'0 0 120 120','class="item-svg"'); }

const themeNames = ['hello','food','play','care','outside','bed'];
export function themeArt(themeId) {
  const theme = themeNames.includes(themeId)?themeId:'play';
  let body='';
  if(theme==='hello') body=`${rect(34,48,112,131,48,'#d6b28a')}${rect(44,57,92,121,42,'#f6dfa9')}${line('M90 64v112','#d4b785',2)}${dot(117,119,5,C.dark)}${at(137,117,.57,sprout('wave'))}${at(55,162,.4,toy('plant'))}${spark(181,69,.7)}`;
  if(theme==='food') body=`${ell(106,158,87,28,'#e3bf98')}${rect(34,144,149,12,6,C.wood)}${at(64,111,.8,toy('cup'))}${at(140,118,.78,toy('bowl'))}${at(160,70,.4,toy('apple'))}${spark(114,52,.65)}`;
  if(theme==='play') body=`${at(72,132,.9,toy('box',true))}${at(158,145,.85,toy('ball'))}${at(156,82,.68,toy('block'))}${spark(60,54,.8)}`;
  if(theme==='care') body=`${at(83,106,1,toy('coat'))}${at(159,143,.7,toy('shoe'))}${at(159,80,.55,toy('soap'))}${dot(194,56,6,'#f9fcf6')}${dot(186,31,4,'#f9fcf6')}`;
  if(theme==='outside') body=`${line('M59 151V64',C.wood,12)}${dot(58,62,37,'#a0ba85')}${dot(35,88,29,'#a0ba85')}${dot(79,87,33,'#a0ba85')}${at(138,121,.85,toy('bird'))}${at(91,165,.43,toy('cat'))}${dot(174,44,18,C.yellow)}`;
  if(theme==='bed') body=`${at(74,95,.68,toy('moon'))}${at(127,143,.94,toy('bed'))}${at(166,92,.5,toy('book'))}${spark(151,40,.6)}${spark(189,64,.4)}`;
  return tag(`${ell(110,174,84,13,'#786c43','opacity=".08"')}${body}`,'0 0 220 200','class="theme-illustration"');
}

function windowArt(night=false) {
  return `${rect(31,30,94,97,46,'#d8c8a6')}${rect(37,36,82,85,39,night?'#687e86':'#c4dfd6')}${night?`${dot(67,60,13,C.yellow)}${spark(97,82,.35,'#f3e2ad')}`:`${dot(91,58,15,'#f4d58c')}<path d="M38 98Q69 72 82 96Q107 82 119 94V121H38Z" fill="#a4bd91"/>`}${line('M78 38v82M38 84h80','#fff0d5',5)}${rect(26,120,104,10,5,'#d0b38d')}`;
}
function backdrop(theme) {
  if(theme==='outside') return `<path d="M0 0H400V300H0Z" fill="#e8efd9"/>${dot(330,51,24,'#f3d891')}<path d="M0 170Q78 120 162 174Q272 123 400 172V300H0Z" fill="#c7d6ac"/><path d="M0 220Q99 175 206 220Q288 175 400 205V300H0Z" fill="#aabe8e"/>${line('M32 165V75',C.wood,16)}${dot(25,69,45,'#8fae79')}${dot(60,90,35,'#9ab783')}${line('M358 175V102',C.wood,12)}${dot(363,83,38,'#a1ba88')}<path d="M110 300Q135 212 270 194L293 208Q193 246 199 300" fill="#e7d5ad"/>`;
  const bed = theme==='bed';
  return `${rect(0,0,400,300,0,bed?'#e3e5db':'#f4ebd7')}${windowArt(bed)}<path d="M0 207H400V300H0Z" fill="${bed?'#c2b298':'#ddc4a2'}"/>${line('M0 208h400','#c7ad8c',5)}${line('M0 263h400M88 209L69 300M285 210l29 90','#cfb592',2)}${bed?`${spark(302,39,.55,'#d2b872')}${spark(329,73,.35,'#d2b872')}`:`${rect(273,51,69,65,5,'#c6a77d')}${rect(281,59,53,49,2,'#faf4e1')}${at(309,91,.49,toy('plant'))}`}`;
}

// A setting is an actual picture, not a keyword to be guessed from its title.
// The coat scene is deliberately shared by two help events.
const sceneDefinitions = {
  'hello-morning': ['hello','morning'], 'garden-morning': ['outside','morning'],
  'hello-welcome': ['hello','meeting'], 'park-new-friend': ['outside','meeting'],
  'hello-goodbye': ['hello','leaving'], 'park-goodbye': ['outside','leaving'],
  'food-water': ['food','water'], 'bed-water': ['bed','water'],
  'food-more': ['outside','more'], 'drawing-more': ['play','more'],
  'food-no-thanks': ['food','decline'], 'park-decline': ['outside','decline'],
  'play-box': ['play','open-box'], 'coat-zip': ['care','zip-coat'],
  'play-ball': ['outside','invite'], 'blocks-invite': ['play','invite'],
  'play-bridge': ['outside','bridge'], 'basket-lift': ['play','lift'],
  'care-hands': ['care','wash'], 'picnic-wash': ['outside','wash'],
  'backpack-buckle': ['care','open-buckle'],
  'care-socks': ['outside','wet-socks'], 'spilled-water-socks': ['food','wet-socks'],
  'outside-cat': ['outside','discover'], 'window-snail': ['hello','discover'],
  'outside-bird': ['outside','look'], 'window-bird': ['hello','look'],
  'outside-dog': ['outside','hear'], 'window-dog': ['hello','hear'],
  'bed-book': ['bed','read-together'], 'garden-book': ['outside','read-together'],
  'bed-story': ['bed','tell-story'], 'rain-story': ['hello','tell-story'],
  'bed-night': ['bed','sleep'], 'camp-night': ['outside','sleep'],
};
const sceneAliases = { 'care-zip':'coat-zip', hello:'hello-welcome', food:'food-water', play:'play-box', care:'care-hands', outside:'outside-cat', bed:'bed-night' };
function eventInfo(value) {
  const raw=typeof value==='string'?{scene:value}:value||{};
  const candidates=[raw.settingId,raw.context?.settingId,raw.sceneId,raw.scene,raw.id];
  for(const candidate of candidates) {
    const id=sceneAliases[candidate]||candidate;
    if(sceneDefinitions[id]) return {id,theme:sceneDefinitions[id][0],action:sceneDefinitions[id][1]};
  }
  return {id:'unknown',theme:'play',action:'neutral'};
}

// These cue groups name the actual painted objects for the scene contract tests.
const part = (cue,body) => `<g data-cue="${cue}">${body}</g>`;
const object = (name,x,y,scale=1,resolved=true,rotate=0) => at(x,y,scale,toy(name,resolved),rotate);
const friend = (x,y,scale=1,pose='quiet') => at(x,y,scale,sprout(pose));
const shadow = (x,y,rx=38) => ell(x,y,rx,7,'#6b6349','opacity=".14"');
function bear(pose='quiet') {
  const leaving=pose==='leaving', waving=pose==='wave';
  return `${shadow(0,92,39)}${line(leaving?'M-16 60l-13 23M15 60l22 13':'M-17 61v23M17 61v23',C.dark,17)}${ell(0,40,32,37,C.wood)}${ell(0,41,20,25,'#ead2a7')}${line(waving?'M-24 29Q-49 10-45-11':'M-25 30l-17 24',C.wood,14)}${line('M25 30l17 22',C.wood,14)}${leaving?`${rect(-30,7,29,48,11,C.orange)}${line('M-15 8v32',C.cream,3)}${ell(10,-13,29,32,C.wood)}${dot(-7,-39,11,C.wood)}${dot(29,-15,3,C.ink)}${ell(32,-2,13,10,'#ead2a7')}${dot(41,-5,4,C.dark)}`:at(0,-15,.89,toy('bear'))}`;
}
function animal(name) {
  const cat=name==='cat',color=cat?C.pink:C.wood;
  return `${shadow(0,66,36)}${line(cat?'M25 37Q64 53 58 18':'M-24 32Q-53 23-48 7',color,10)}${ell(0,34,29,31,color)}${ell(-18,62,13,7,color)}${ell(18,62,13,7,color)}${ell(0,35,17,23,cat?'#f1d3c0':'#e8d4b0')}${at(0,-7,.9,toy(name))}`;
}
function palm(kind='open',color='#efcbaa') {
  if(kind==='point') return `<path d="M-15 39L-10 10-31-3Q-38-11-30-13L-7-3-10-38Q-10-46-3-45L3-7 11-11 29-3 25 27 17 43Z" fill="${color}" stroke="#d6af90" stroke-width="2"/>`;
  return `<path d="M-22 36L-30 11Q-34 1-27-2L-14 11-17-22Q-18-31-11-32L-5-7-5-35Q-4-43 3-39L7-9 11-31Q15-39 20-31L18-5 25-20Q31-27 35-18L29 13Q27 35 15 41Z" fill="${color}" stroke="#d6af90" stroke-width="2"/>`;
}
function hands(clean=false,paint=false) {
  return `${at(-28,0,.67,palm(),-30)}${at(27,0,.67,palm(),18)}${clean?`${spark(-21,-18,.4,'#fffdf1')}${spark(29,8,.35,'#fffdf1')}`:`${ell(-25,6,6,4,paint?C.orange:'#9d805b')}${ell(-13,-1,5,4,paint?C.blue:'#9d805b')}${ell(36,10,6,4,paint?C.green:'#9d805b')}`}`;
}
function picnicMat() {return `<path d="M64 198L251 187 290 271 34 275Z" fill="#edc8a2"/>${line('M81 197L65 274M130 194l-2 80M184 193l14 79M237 188l26 84M50 230l221-4','#fff0d4',9)}`;}
function door(open=true) {
  return `${rect(15,34,132,227,58,C.wood)}${rect(26,45,110,213,49,open?'#9fba97':'#f3d5a1')}${open?`<path d="M27 49L92 75V256H27Z" fill="#efd4a2"/>${dot(77,165,5,C.dark)}`:dot(119,168,5,C.dark)}${rect(12,253,141,11,5,C.dark)}`;
}
function dawnWindow() {
  return `${rect(23,20,154,132,55,C.wood)}${rect(31,28,138,116,47,'#f1d8b2')}${dot(101,111,29,C.yellow)}<path d="M32 117Q67 95 100 116Q130 96 169 117V144H32Z" fill="#afc199"/>${line('M100 29v114M32 97h137','#fff4db',6)}${line('M62 74l-9-10M100 66V54M135 74l10-11',C.yellow,4)}`;
}
function bigWindow(night=false,rain=false) {
  return `${rect(24,23,200,146,55,C.wood)}${rect(33,32,182,128,48,night?'#687e86':'#cadfd6')}${night?object('moon',165,68,.39):rain?`${ell(91,63,37,17,'#aebfc0')}${ell(128,62,32,16,'#aebfc0')}${line('M65 88l-7 13M100 89l-7 13M137 89l-7 13M168 95l-7 13M91 121l-7 13M141 126l-7 13','#86aab1',4)}`:`${dot(169,64,17,C.yellow)}<path d="M34 140Q81 93 118 136Q170 108 214 143V160H34Z" fill="#aac197"/>`}${line('M124 33v127M35 112h179','#f9ecd3',6)}${rect(17,159,215,13,5,C.wood)}`;
}
function plainRoom(night=false) {
  return `${rect(0,0,400,300,0,night?'#dce1d9':'#f4ebd7')}${rect(0,211,400,89,0,night?'#bbad95':'#ddc4a2')}${line('M0 212h400M0 269h400','#c4aa87',3)}`;
}
function table() {return `${rect(44,203,294,18,9,C.wood)}${line('M70 222l-7 69M307 222l8 69',C.dark,10)}`;}
function biscuit(x,y,s=.6) {return at(x,y,s,`${dot(0,0,29,'#dba86d')}${dot(-10,-10,3,C.dark)}${dot(10,-5,3,C.dark)}${dot(-5,12,3,C.dark)}${dot(13,14,3,C.dark)}`);}
function drops(x,y,s=1) {return at(x,y,s,`<path d="M0-15Q-16 5 0 8Q16 5 0-15M24 4Q13 20 24 21Q35 20 24 4" fill="#78afb9"/>`);}
function soundWaves(x,y,s=1) {return at(x,y,s,line('M0-14q17 14 0 28M13-23q28 23 0 46','#bc914c',4));}
function wornSocks(dry=false) {
  return `${line('M-25-62v31M24-62v31','#efcbaa',23)}${at(-27,-5,.84,toy('sock'),8)}${at(25,-5,.84,toy('sock'),-14)}${dry?'':`${ell(-20,10,14,7,'#79b3bf','opacity=".78"')}${ell(29,9,15,9,'#79b3bf','opacity=".78"')}${drops(42,26,.7)}`}`;
}
function buckleBag(open=false) {
  return `${line('M-14-41q0-22 28 0',C.dark,6)}${rect(-42,-37,84,88,15,C.orange)}${rect(-35,15,70,29,7,'#e9b68a')}${open?`<path d="M-41-35Q0-82 41-35L32-22Q0-48-32-22Z" fill="#edbb90"/>${ell(0,-29,34,10,'#8e674b')}${line('M0-56v21M0-5v22',C.cream,7)}${rect(-9,-40,18,12,3,C.wood)}${rect(-9,0,18,13,3,C.wood)}`:`${rect(-42,-38,84,44,14,'#e9b68a')}${line('M0-25v45',C.cream,7)}${rect(-10,-6,20,19,4,C.wood)}${rect(-5,-2,10,11,2,C.dark)}`}`;
}
function storyBubble(active=false) {
  return `${ell(174,77,67,49,'#fffaf0')}${dot(234,121,7,'#fffaf0')}${dot(248,136,4,'#fffaf0')}${active?`${at(149,90,.53,toy('plant'))}${at(194,68,.5,toy('bird'))}${spark(155,48,.5)}${line('M183 88q12 7 23 0',C.orange,2)}`:`${at(174,78,.65,toy('moon'))}`}`;
}

export function sceneArt(eventOrScene,phase='before') {
  const {theme,id,action}=eventInfo(eventOrScene);
  const done=/resolved|complete|success|reward|end/.test(phase), request=/request|speak|listen|observe|challenge/.test(phase);
  let scene='',objects='',people='';
  // Morning is waking up or a low sunrise; meeting always has a new person;
  // goodbye always has a departing person and a travel path.
  if(action==='morning') {
    const garden=id==='garden-morning';
    scene=garden?`${rect(0,0,400,300,0,'#f3dfbc')}${dot(199,136,38,C.yellow)}${line('M199 84V68M151 100l-12-12M245 100l12-12',C.yellow,5)}<path d="M0 163Q87 123 183 162Q302 126 400 161V300H0Z" fill="#bdcca2"/>`:plainRoom()+part('dawn-window',dawnWindow());
    if(garden) {
      objects=part('morning-garden',object('plant',89,233,1.04)+object('plant',173,251,.7)+object('jug',done?238:292,211,.6,true,done?-40:0)+(done?line('M220 203q-27 0-36 25','#86b8bb',4):''));
      people=part('morning-greeting',friend(286,145,.81,done?'wave':request?'asking':'quiet'));
    } else {
      objects=part('waking-bed',object('bed',132,248,1.66)+object('pillow',85,211,.68)+(done?'':object('blanket',148,220,.96)));
      people=part('morning-greeting',friend(done?275:137,done?158:168,.76,done?'wave':request?'asking':'sleep'));
      objects+=part('morning-slippers',object('shoe',254,264,.49)+object('shoe',299,264,.49));
    }
  } else if(action==='meeting') {
    const park=id==='park-new-friend';scene=park?backdrop('outside'):plainRoom()+door(true);
    objects=park?part('park-bench',object('bench',111,239,.84)):part('welcome-doormat',object('welcome-mat',100,270,.95));
    const distance=done?31:0;
    people=part('new-friend',at(park?124+distance:174+distance,162,.8,bear(done?'wave':'quiet')))+part('meeting-greeting',friend(315-distance,155,.78,done||request?'wave':'quiet'));
    if(done) objects+=part('friendly-handshake',line('M235 181q16 11 32 0',C.green,11)+ell(245,184,12,8,C.wood));
  } else if(action==='leaving') {
    const park=id==='park-goodbye';scene=park?backdrop('outside'):plainRoom()+door(true);
    objects=part('leaving-path',`<path d="M138 294Q258 249 375 175L400 213Q301 284 239 300Z" fill="#f0ddb8"/>${ell(251,264,10,4,C.dark,'transform="rotate(-28 251 264)" opacity=".4"')}${ell(279,246,10,4,C.dark,'transform="rotate(-28 279 246)" opacity=".4"')}`);
    people=part('farewell-wave',friend(park?104:151,164,.75,'wave'))+part('departing-backpack-friend',at(done?351:285,done?145:180,done?.52:.75,bear('leaving')));
  } else if(action==='water') {
    const bedtime=id==='bed-water';scene=bedtime?plainRoom(true)+windowArt(true):backdrop('food');
    objects=bedtime?part('bedside-table',object('bed',92,247,1.31)+object('table',233,240,1.02)):table()+part('just-played-ball',object('ball',64,267,.55));
    const cupX=bedtime?220:133,cupY=bedtime?204:174,jugX=done?cupX+65:bedtime?310:255;
    objects+=part(done?'filled-water-cup':'empty-water-cup',object('blue-cup',cupX,cupY,.93,done));
    objects+=part('water-jug',object('jug',jugX,done?cupY-34:cupY-1,.8,true,done?-40:0));
    if(done)objects+=part('pouring-water',line(`M${cupX+36} ${cupY-47}Q${cupX+11} ${cupY-40} ${cupX+2} ${cupY-21}`,'#83b7c0',5));
    people=part('water-request',friend(332,bedtime?131:126,.61,done?'happy':request?'asking':'quiet'))+part('reaching-for-water',at(bedtime?182:101,285,.72,palm('open'),-20));
  } else if(action==='more') {
    const drawing=id==='drawing-more';scene=drawing?backdrop('play'):backdrop('outside');objects=drawing?table():picnicMat();
    objects+=part(done?'refilled-bowl':'empty-bowl',object('bowl',126,drawing?179:230,.96,false)+(done?(drawing?object('paper',124,166,.48):object('apple',124,209,.47)):''));
    objects+=part(drawing?'spare-drawing-paper':'spare-fruit',drawing?object('paper',253,177,.77):object('basket',241,218,.85)+object('apple',240,195,.5));
    if(drawing)objects+=part('drawing-tools',line('M174 190l30-32',C.orange,8)+line('M192 197l34-20',C.green,8)+rect(151,134,40,35,3,'#fff8e7')+leaf(169,159,.35));
    people=part('asking-for-more',friend(325,137,.68,done?'helping':request?'asking':'quiet'))+part('upturned-request-hand',at(150,done?270:263,.76,palm('open'),-68));
  } else if(action==='decline') {
    const park=id==='park-decline';scene=park?backdrop('outside'):backdrop('food');objects=park?picnicMat():table();
    objects+=park?part('picnic-basket',object('basket',84,235,.75)):part('finished-meal',ell(103,185,46,13,'#fff5dc')+biscuit(90,184,.15)+biscuit(113,184,.12)+object('spoon',53,180,.55,false,-38));
    objects+=part(park?'offered-juice':'offered-biscuit',park?object('cup',done?282:211,205,.75,true):biscuit(done?278:210,171,.7));
    people=part('offering-friend',friend(329,139,.67,done?'quiet':'helping'))+part('polite-stop-palm',at(park?145:145,park?189:169,1.03,palm(),-10));
    // The offered object withdraws; no cross, punishment, or consumption reward.
    if(done)objects+=part('offer-withdrawn',line(park?'M236 199q12-10 27-8':'M235 164q14-10 29-5',C.orange,3));
  } else if(action==='open-box') {
    scene=backdrop('play');objects=object('rug',181,263,2);
    objects+=part(done?'opened-toy-box':'stuck-toy-box',object('box',163,220,1.35,done));
    people=part('box-helper',friend(done?275:309,153,.78,done?'helping':request?'asking':'quiet'))+part('pulling-box-lid',at(113,done?195:215,.61,palm('open'),-94));
    if(!done)objects+=part('stuck-latch',line('M149 182l-7-10M170 179l2-11M186 187l9-7',C.orange,3));
  } else if(action==='zip-coat') {
    scene=plainRoom()+windowArt();
    objects=part('wearing-coat',ell(150,116,28,31,'#efcbaa')+`<path d="M123 111Q121 82 148 83Q179 83 178 112Q163 100 151 105Q135 93 123 111Z" fill="${C.dark}"/>`+dot(140,117,2.5,C.ink)+dot(160,117,2.5,C.ink)+line(done?'M142 130q8 8 16 0':'M144 133q6-3 12 0',C.ink,2)+line('M132 235v37M171 235v37',C.dark,15)+object('coat',150,190,1.44,done));
    objects+=part(done?'closed-zipper':'stuck-zipper',at(150,done?175:202,.55,palm('point'),done?165:24));
    people=part('zipper-helper',friend(done?268:307,160,.76,done?'helping':request?'asking':'quiet'));
    if(!done)objects+=line('M162 189l10-8M162 204h13',C.orange,3);
  } else if(action==='invite') {
    const blocks=id==='blocks-invite';scene=blocks?backdrop('play'):backdrop('outside');
    objects=blocks?object('rug',196,264,1.84):'';
    objects+=part(blocks?'shared-building-blocks':'shared-ball',blocks?object(done?'bridge':'block',188,236,1.05)+rect(done?233:244,done?227:250,23,23,3,C.blue):object('ball',done?229:146,247,.97));
    people=part('inviting-friend',friend(done?274:323,156,.78,done?'helping':request?'inviting':'quiet'))+part('playmate',at(done?112:70,done?173:174,.66,bear(done?'wave':'quiet')));
    if(done&&!blocks)objects+=part('rolling-ball',line('M164 254q14-15 28-9M179 266h18',C.orange,3));
  } else if(action==='bridge') {
    scene=backdrop('outside');objects=part('river-gap',`<path d="M148 163Q118 199 151 236Q178 268 145 300H235Q261 262 222 233Q195 200 220 163Z" fill="#91bfbe"/>${line('M160 190h17M194 281h20','#d7e9dc',4)}`);
    objects+=part(done?'placed-bridge-plank':'unplaced-bridge-plank',rect(86,235,39,30,4,C.orange)+rect(244,235,38,30,4,C.blue)+at(185,done?229:218,1,rect(-85,-9,170,18,4,C.wood),done?0:-21));
    people=part('bridge-helper',friend(321,151,.72,done?'helping':request?'asking':'quiet'))+part('lifting-plank-together',at(99,done?232:249,.65,palm(),-75)+line(done?'M275 178Q258 193 261 229':'M275 178q-10 15-2 29',C.green,10));
  } else if(action==='lift') {
    scene=backdrop('play');objects=object('rug',188,274,1.75);
    objects+=part(done?'lifted-heavy-basket':'heavy-basket-on-floor',object('basket',175,done?191:246,1.5)+object('ball',158,done?155:210,.61)+object('block',196,done?169:224,.5));
    people=part('basket-helper',friend(done?285:321,155,.74,done?'helping':request?'asking':'quiet'))+part('basket-handles',at(108,done?171:230,.75,palm(),-85)+line(done?'M261 183L220 171':'M265 188l-13 29',C.green,12));
    if(done)objects+=part('basket-clear-of-ground',shadow(175,278,65));
  } else if(action==='wash') {
    const picnic=id==='picnic-wash';scene=picnic?backdrop('outside'):plainRoom()+windowArt();
    objects=picnic?picnicMat()+part('outdoor-water-bowl',object('bowl',157,239,1.45,false)+ell(157,232,45,9,'#94c5cc')+object('leaf-soap',80,220,.61)+object('paper',85,267,.42)):
      part('washbasin',rect(53,201,194,91,9,C.wood)+rect(43,184,215,20,10,'#f8f5e6')+ell(151,192,65,14,'#a8c9c6')+line('M154 157v-31q0-21 28-21',C.dark,10)+object('soap',76,173,.55)+object('towel',235,114,.62));
    objects+=part(done?'clean-hands':picnic?'painty-hands':'muddy-hands',at(156,picnic?204:169,1.12,hands(done,picnic)));
    if(done)objects+=part('washing-water',picnic?drops(169,218,.6):line('M154 151v35','#86bac2',6));
    people=part('washing-helper',friend(328,157,.72,done?'happy':request?'pointing':'quiet'));
  } else if(action==='open-buckle') {
    scene=plainRoom()+door(false);objects=part(done?'opened-backpack-buckle':'closed-backpack-buckle',at(167,197,1.23,buckleBag(done)))+object('shoe',232,273,.58);
    people=part('buckle-helper',friend(done?275:323,153,.73,done?'helping':request?'asking':'quiet'))+part('pulling-buckle',at(138,done?193:220,.64,palm('point'),-35));
  } else if(action==='wet-socks') {
    const spill=id==='spilled-water-socks';scene=spill?plainRoom()+windowArt():backdrop('outside');
    objects=part(spill?'spilled-cup':'rain-puddle',ell(149,265,83,15,'#9bc3c7')+(spill?object('blue-cup',74,229,.79,false,-78):drops(78,224,.7)));
    // The shins enter from the bottom edge: these are the child's own feet,
    // seen looking down, rather than detached socks floating in the scene.
    objects+=part(done?'dry-socks-on-feet':'wet-socks-on-feet',at(165,242,1.07,wornSocks(done),180))+part('dry-replacement-socks',object('basket',303,255,.87)+object('sock',done?304:288,done?251:221,.53,true,-16)+(done?'':object('sock',320,224,.48,true,20)));
    people=part('noticing-wet-feet',friend(317,121,.6,done?'happy':request?'pointing':'quiet'));
  } else if(action==='discover') {
    const snail=id==='window-snail';scene=snail?plainRoom()+bigWindow():backdrop('outside');
    objects=part(snail?'snail-on-sill':'cat-in-bush',snail?object('snail',111,139,1.02):at(130,206,1.06,animal('cat'))+(done?'':ell(83,243,54,25,'#8eaa75')+ell(161,252,59,22,'#a1b985')));
    people=part('curious-pointing-hand',at(snail?191:201,snail?228:278,.8,palm('point'),snail?-36:-24))+part('curious-friend',friend(done?277:318,165,.77,done?'pointing':request?'asking':'quiet'));
  } else if(action==='look') {
    const window=id==='window-bird';scene=window?plainRoom()+bigWindow():backdrop('outside');
    objects=part(window?'bird-on-windowsill':'bird-on-branch',window?object('bird',111,141,.9):line('M43 117Q129 139 217 105',C.dark,11)+object('bird',155,102,.95)+leaf(72,123,.7,-30));
    people=part(done?'looking-at-bird':'friend-looking-down',friend(299,174,.86,done?'pointing':'reading'));
    // The large pointing arm connects the speaker with the bird, unlike discovery.
    people+=part('pointing-out-the-bird',at(window?220:244,258,.91,palm('point'),window?-34:-26));
    if(!done)objects+=part('distracting-ground-toy',object('ball',318,266,.46));
  } else if(action==='hear') {
    const window=id==='window-dog';scene=window?plainRoom()+bigWindow():backdrop('outside');
    objects=part(window?'dog-outside-window':'dog-behind-bush',window?object('dog',109,137,.91):at(115,207,1.04,animal('dog')));
    if(!done)objects+=part('partly-hidden-dog',window?rect(42,154,167,14,4,C.wood):ell(83,237,58,31,'#8ba676')+ell(139,248,57,27,'#a2b984'));
    objects+=part('barking-sound',soundWaves(window?160:169,window?120:173,.85));
    if(window)objects+=part('paused-reading',object('book',276,254,.72));
    people=part('cupped-ear-listener',friend(done?279:310,167,.82,'listening'));
    if(done)objects+=part('sound-located',line(window?'M230 125q-20-7-35 1':'M233 169q-15-6-25 3',C.yellow,3));
  } else if(action==='read-together') {
    const garden=id==='garden-book';scene=garden?backdrop('outside'):plainRoom(true)+windowArt(true);
    objects=part(garden?'reading-bench':'reading-cushions',garden?object('bench',194,241,1.61):object('cloud-cushion',118,247,1.02)+object('cloud-cushion',285,247,1.02));
    people=part('two-readers',at(done?135:101,168,.68,bear('quiet'))+friend(done?247:301,158,.7,done?'reading':request?'inviting':'quiet'));
    objects+=part(done?'shared-open-picture-book':'waiting-picture-book',object('book',done?192:181,done?203:244,done?1.22:1.08));
  } else if(action==='tell-story') {
    const rain=id==='rain-story';scene=plainRoom(!rain)+(rain?bigWindow(false,true):windowArt(true));
    objects=part(rain?'rainy-day-chairs':'storytime-bed',rain?object('chair',116,244,1.18)+object('chair',300,243,1.12):object('bed',122,248,1.6)+object('lamp',355,231,.62));
    people=part('story-listener',at(118,rain?175:180,.68,bear('quiet')))+part('storyteller',friend(299,169,.72,done?'story':request?'asking':'quiet'));
    if(!rain)objects+=part('listener-blanket',rect(78,216,94,39,8,C.blue)+spark(124,234,.75,'#e9e8c6'));
    objects+=part(done?'imagined-bird-story':'story-request-bubble',storyBubble(done));
  } else if(action==='sleep') {
    const camp=id==='camp-night';scene=camp?`${rect(0,0,400,300,0,'#657b80')}${object('moon',326,62,.68)}${spark(71,41,.45)}${spark(202,65,.5)}<path d="M0 221Q98 180 187 221Q302 181 400 218V300H0Z" fill="#90a082"/>`:plainRoom(true)+part('night-window',bigWindow(true));
    objects=part(camp?'night-tent':'night-bed',camp?object('tent',122,204,1.8):object('bed',172,248,1.74));
    people=part(done?'sleeping-buddy':'sleepy-buddy',friend(camp?272:171,camp?done?191:166:done?184:163,.68,done?'sleep':'calm'));
    objects+=part(camp?'sleeping-bag':'tucked-in-blanket',camp?rect(235,done?218:248,79,done?65:33,28,C.blue)+spark(275,done?251:264,.9,'#eef0cd'):rect(108,done?214:247,132,done?46:17,9,'#a0b98f')+line(done?'M119 229h108':'M119 255h108','#cbd8ae',4));
    if(!camp)objects+=part(done?'dimmed-bedside-lamp':'lit-bedside-lamp',object('lamp',327,218,.82)+(done?'':ell(327,187,43,33,C.yellow,'opacity=".16"')));
  } else {
    scene=plainRoom();people=friend(200,159,.93,'quiet');
  }
  // Draw people before the foreground objects so hands, books and blankets sit
  // where they are used, rather than floating next to a generic mascot.
  const invitation=request?`<g class="scene-invitation">${soundWaves(361,76,.32)}</g>`:'';
  return tag(scene+people+objects+invitation+grain(`xygrain${++serial}`),'0 0 400 300',`class="scene-svg scene-${theme} phase-${done?'resolved':request?'request':'before'}" data-scene="${id}" data-action="${action}"`);
}

export function roomArt() {
  return tag(`${rect(0,0,600,420,0,'#f3e9d2')}<path d="M0 278H600V420H0Z" fill="#d9bd96"/>${line('M0 279h600','#c4a984',7)}${line('M0 348h600M150 280l-28 140M430 280l39 140','#cbb08c',2)}${at(44,17,1.37,windowArt())}${rect(390,77,125,13,5,C.wood)}${at(424,59,.54,toy('plant'))}${rect(477,36,19,39,3,C.orange)}${rect(499,43,12,32,2,C.green)}${at(516,248,1.1,sprout('happy'))}${ell(291,353,145,34,'#c6a57d','opacity=".18"')}`,'0 0 600 420','class="room-svg"');
}
