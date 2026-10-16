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
  return `${ell(0,93,48,8,'#6b7643','opacity=".13"')}${line('M-29 66l-9 19M27 67l9 19',C.leaf,13)}
    <g class="buddy-arm${wave?' buddy-wave':''}">${line(wave?'M-36 32Q-63 18-61-6':'M-36 35Q-53 48-49 57',C.green,15)}${wave?`${line('M-62-5l-5-9M-59-5l2-11',C.green,6)}`:''}</g>${line(asking?'M37 34Q56 32 59 15':'M37 34Q58 51 50 60',C.green,15)}
    <path d="M-41 16C-47-18-26-48 0-48S48-22 43 15L39 61C34 83-29 87-38 63Z" fill="${C.mint}" stroke="#6f9360" stroke-width="3"/>
    <path d="M-31 17C-36-11-22-34-2-37" stroke="#f7f9e8" stroke-width="7" stroke-linecap="round"/>
    ${line('M1-48Q-2-63 5-74',C.leaf,5)}${leaf(3,-60,.66,45)}${leaf(7,-66,.57,135)}
    ${sleepy?line('M-23 6q7 8 14 0M12 6q7 8 14 0',C.ink,3.5):`${ell(-16,5,3.8,5,C.ink)}${ell(17,5,3.8,5,C.ink)}`}
    ${ell(-27,18,8,5,C.pink)}${ell(28,18,8,5,C.pink)}
    <g class="buddy-mouth">${asking?ell(1,23,4,5,C.ink):sleepy?line('M-3 24q5 3 9 0',C.ink,2.5):`<path d="M-9 20Q1 25 11 20Q4 38-4 30Z" fill="${C.ink}"/>`}</g>
    <path d="M-18 49Q0 39 19 49L17 68Q0 75-16 68Z" fill="#a5be8b"/>
    ${leaf(3,62,.28,35)}`;
}

export function buddy(mood='happy') { return tag(at(90,91,.92,sprout(mood)),'0 0 180 190','class="buddy-svg"'); }

export function icon(name,size=32) {
  name=({house:'home',replay:'again',sparkle:'star'})[name]||name;
  const paths = {
    back: line('M19 5L8 16l11 11'), close:line('M8 8l16 16M24 8L8 24'),
    play:'<path d="M11 6L27 16L11 26Z" fill="currentColor"/>', pause:`${rect(8,5,6,22,2,'currentColor')}${rect(20,5,6,22,2,'currentColor')}`,
    sound: `<path d="M5 12H10L17 6V26L10 20H5Z" fill="currentColor"/>${line('M22 11q6 5 0 10M26 7q10 9 0 18','currentColor',2.7)}`,
    mic:`${rect(11,3,10,17,5,'currentColor')}${line('M6 15v2a10 10 0 0020 0v-2M16 27v4M11 31h10','currentColor',3)}`,
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
  return tag(paths[name] || paths.star,'0 0 34 34',`width="${Number(size)||32}" height="${Number(size)||32}" class="ui-icon"`);
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

function eventInfo(value) {
  if(typeof value==='string') {
    const prefix=value.split('-')[0];
    return {theme:themeNames.includes(value)?value:themeNames.includes(prefix)?prefix:'play',id:value};
  }
  const raw = value||{};
  const scene=String(raw.sceneId||raw.scene||raw.id||'');
  const id=String(raw.settingId||raw.context?.settingId||scene);
  const prefix=scene.split('-')[0];
  let theme=(themeNames.includes(prefix)?prefix:null)||raw.themeId||raw.theme||'play';
  if(typeof theme==='object') theme=theme.id;
  return {theme:themeNames.includes(theme)?theme:'play',id};
}

function hands(clean=false) {
  const hand=`<path d="M-20 21V-3Q-27-14-18-17L-8-8V-27Q-8-36-1-33L2-14V-35Q6-43 11-34L13-14V-30Q17-37 22-28L22-9V-20Q28-27 31-18V9Q30 30 10 33Z" fill="#efcbaa" stroke="#d6af90" stroke-width="2"/>`;
  return `${at(-25,0,.66,hand,-30)}${at(27,0,.66,hand,18)}${clean?`${spark(-21,-18,.4,'#fffdf1')}${spark(29,8,.35,'#fffdf1')}`:`${ell(-25,6,6,4,'#9d805b')}${ell(-13,-1,5,4,'#9d805b')}${ell(36,10,6,4,'#9d805b')}`}`;
}

function picnicMat() {return `<path d="M64 198L251 187 290 271 34 275Z" fill="#edc8a2"/>${line('M81 197L65 274M130 194l-2 80M184 193l14 79M237 188l26 84M50 230l221-4', '#fff0d4',9)}`;}

export function sceneArt(eventOrScene,phase='before') {
  const {theme,id}=eventInfo(eventOrScene), done=/resolved|complete|success|reward|end/.test(phase), request=/request|speak|listen|observe|challenge/.test(phase);
  const uid=`xygrain${++serial}`;
  let scene=backdrop(theme), objects='', person=at(294,168,.7,sprout(done?'celebrate':request?'asking':'happy'));
  if(theme==='hello') {
    scene = `${rect(0,0,400,300,0,'#e9eedb')}<path d="M0 224Q100 196 207 225Q300 202 400 224V300H0Z" fill="#c2cfa7"/>${rect(27,40,177,219,68,'#d1ad80')}${rect(40,53,150,206,59,'#f5d8a3')}${done?`<path d="M47 63L151 89V255H47Z" fill="#b6c7aa"/>${line('M147 91v160','#8fa587',3)}`:`${line('M116 61v188','#e2be89',2)}${dot(166,170,7,C.dark)}`}${rect(25,251,187,12,6,C.wood)}${at(215,239,.58,toy('plant'))}${at(73,264,.68,toy('rug'))}`;
    const goodbye=/bye|later|goodbye|farewell|03/.test(id);
    person=at(goodbye&&done?350:282,175,goodbye&&done?.43:.72,sprout('wave'));
    if(/morning|01/.test(id)) objects+=`${dot(333,56,27,C.yellow)}${spark(373,88,.45)}`;
    if(/friend|welcome|new|02/.test(id)) objects+=at(188,222,.48,toy('basket'));
  }
  if(theme==='food') {
    objects=`${ell(199,254,131,21,'#b7956a','opacity=".2"')}${rect(58,201,250,17,8,C.wood)}${line('M83 216l-9 76M281 217l10 75',C.dark,10)}`;
    if(/water|drink|01/.test(id)) objects+=`${at(129,172,.9,toy('blue-cup',done))}${at(done?212:232,163,.85,toy('jug'),done?-18:0)}${done?`${spark(119,113,.7)}${spark(160,128,.45)}`:''}`;
    else if(/more|picnic|02/.test(id)) objects+=`${at(135,174,.95,toy('bowl',done))}${at(216,170,.7,toy('basket'))}${done?at(137,154,.45,toy('apple')):at(214,155,.45,toy('apple'))}`;
    else objects+=`${at(124,176,.82,toy('bowl',false))}${at(done?242:171,169,.58,toy('apple'))}${at(222,195,.5,toy('spoon'),-55)}`;
    person=at(325,152,.7,sprout(done?'happy':request?'asking':'happy'));
  }
  if(theme==='play') {
    objects=`${at(194,257,1.8,toy('rug'))}`;
    if(/ball|invite|02/.test(id)) objects+=at(done?240:128,239,.9,toy('ball'));
    else if(/bridge|build|tower|03/.test(id)) objects+=done?at(163,226,1.24,toy('bridge')):`${at(125,254,.76,toy('block'))}${rect(169,254,65,17,4,C.wood)}${rect(208,221,24,31,4,C.blue)}`;
    else objects+=at(155,231,1.18,toy('box',done));
  }
  if(theme==='care') {
    if(/wash|hand|01/.test(id)) {
      objects=`${rect(48,182,174,98,9,C.wood)}${rect(35,174,198,17,8,'#f6f6e7')}${ell(133,181,64,15,'#a8c9c6')}${line('M140 153v-24q0-21 24-21h9',C.dark,10)}${at(65,165,.55,toy('soap'))}${at(213,119,.7,toy('towel'))}${done?`${line('M141 155v24','#9fc8c6',5)}${spark(80,122,.8)}`:''}${at(134,165,.8,hands(done))}`;
    } else if(/sock|wet|03/.test(id)) objects=`${at(125,229,.9,toy('sock'),-18)}${at(done?201:124,done?222:258,.72,toy(done?'sock':'basket'))}${done?`${spark(158,170,.7)}${at(195,263,.5,toy('shoe'))}`:`${ell(145,268,50,8,'#9fc8c6')}${dot(169,233,5,C.blue)}`}`;
    else objects=`${line('M115 102v150M75 251h80M88 111h55',C.wood,9)}${at(115,164,1.25,toy('coat',done))}${done?spark(150,112,.7):''}`;
  }
  if(theme==='outside') {
    if(/bird|look|02/.test(id)) objects=`${line('M190 119h112',C.dark,9)}${at(done?246:258,99,.75,toy('bird'))}${done?`${spark(285,58,.6)}${spark(220,66,.4)}`:''}`;
    else if(/dog|sound|03/.test(id)) objects=`${at(115,204,.93,toy('dog'))}${done?'':`${ell(90,231,48,29,'#8da879')}${ell(128,240,52,28,'#a1b985')}`}${line('M154 166q15 12 0 24M166 158q22 20 0 40','#d4aa61',3)}`;
    else objects=`${at(118,207,.94,toy('cat'))}${done?'':`${ell(88,230,43,31,'#8eab7a')}${ell(140,239,45,27,'#a5bc89')}`}`;
    person=at(294,177,.73,sprout(done?'happy':request?'asking':'happy'));
  }
  if(theme==='bed') {
    const night=/night|blanket|03/.test(id);
    objects=`${at(162,243,1.55,toy('bed'))}${at(341,208,.78,toy('lamp'))}`;
    if(night) {person=at(154,185,.58,sprout(done?'sleep':'calm'));objects+=done?`${rect(91,213,146,44,9,'#9ab58f')}${line('M105 228h115','#b8cba5',3)}`:at(95,260,.6,toy('blanket'));}
    else {objects+=at(done?207:109,done?191:169,.83,toy('book'));person=at(done?246:283,178,.67,sprout(done?'happy':request?'asking':'happy'));}
  }
  // A transfer event must change its actual setting or object, not just its title.
  if(id==='food-more') {
    scene=backdrop('outside');objects=picnicMat()+at(129,231,.82,toy('bowl',done))+at(220,216,.8,toy('basket'))+at(done?129:220,done?213:194,.4,toy('apple'));person=at(305,163,.69,sprout(done?'happy':'asking'));
  }
  if(id==='play-ball') {
    scene=backdrop('outside');objects=at(done?233:125,247,1,toy('ball'));person=at(297,165,.73,sprout(done?'celebrate':'happy'));
  }
  if(id==='play-bridge') {
    scene=backdrop('outside');objects=`<path d="M139 178Q112 205 141 233Q164 264 132 300H221Q251 263 209 235Q185 206 210 178Z" fill="#a4c9c5"/>${line('M161 197h15M177 277h20','#dbece0',3)}`+(done?at(177,233,1.24,toy('bridge')):`${rect(91,220,27,37,4,C.orange)}${rect(238,218,27,38,4,C.blue)}${at(190,228,1,rect(-43,-9,86,18,4,C.wood),-21)}`);
  }
  if(id==='garden-morning') {
    scene=backdrop('outside');objects=`${at(130,228,.85,toy('plant'))}${at(done?205:253,199,.61,toy('jug'),done?-35:0)}${done?line('M197 189q-18 0-28 23','#87b6b3',3):''}`;person=at(289,157,.72,sprout(done?'wave':'happy'));
  }
  if(id==='park-new-friend'||id==='park-goodbye') {
    scene=backdrop('outside');objects=`${at(id==='park-goodbye'&&done?135:127,id==='park-goodbye'&&done?175:204,id==='park-goodbye'&&done?.56:.88,toy('bear'))}${id==='park-goodbye'?at(done?145:148,done?188:229,.42,toy('backpack')):''}`;person=at(297,176,.73,sprout(done?'wave':'happy'));
  }
  if(id==='bed-water') {
    scene=backdrop('bed');objects=`${at(119,241,1.35,toy('bed'))}${at(241,236,.73,toy('table'))}${at(224,210,.66,toy('blue-cup',done))}${at(done?274:317,done?185:194,.58,toy('jug'),done?-24:0)}`;person=at(328,161,.67,sprout(done?'happy':'asking'));
  }
  if(id==='drawing-more') {
    scene=backdrop('play');objects=`${at(173,242,2.1,toy('table'))}${at(105,207,.7,toy('bowl',false))}${at(242,189,.76,toy('paper'))}${done?at(111,192,.48,toy('paper')):''}${line('M168 214l30-22',C.green,8)}${line('M185 217l33-12',C.orange,8)}`;person=at(318,154,.67,sprout(done?'happy':'asking'));
  }
  if(id==='park-decline') {
    scene=backdrop('outside');objects=picnicMat()+at(104,220,.7,toy('basket'))+at(done?274:192,211,.78,toy('cup'));person=at(306,166,.73,sprout(done?'happy':'asking'));
  }
  if(id==='coat-zip') {
    scene=backdrop('care');objects=`${line('M115 102v150M75 251h80M88 111h55',C.wood,9)}${at(115,164,1.25,toy('coat',done))}${done?spark(150,112,.7):''}`;person=at(294,168,.7,sprout(done?'celebrate':'asking'));
  }
  if(id==='blocks-invite') {
    scene=backdrop('play');objects=at(184,260,1.8,toy('rug'))+at(133,238,.8,toy(done?'bridge':'block'))+rect(202,246,24,24,3,C.blue);person=at(done?254:320,done?187:166,.72,sprout(done?'celebrate':'happy'));
  }
  if(id==='basket-lift') {
    scene=backdrop('play');objects=`${at(166,done?201:246,1.5,toy('basket'))}${at(152,done?168:214,.65,toy('ball'))}${at(185,done?182:228,.48,toy('block'))}${done?`${line('M104 216l-15 20M225 210l18 20',C.green,12)}${ell(170,275,64,9,'#7a684a','opacity=".15"')}`:''}`;person=at(done?271:308,168,.72,sprout(done?'celebrate':'asking'));
  }
  if(id==='picnic-wash') {
    scene=backdrop('outside');objects=picnicMat()+at(87,245,.65,toy('basket'))+at(184,236,1.15,toy('bowl',false))+at(191,203,.89,hands(done))+at(129,211,.55,toy('leaf-soap'))+(done?spark(178,173,.6):'');person=at(311,168,.73,sprout(done?'happy':'asking'));
  }
  if(id==='backpack-buckle') {
    scene=backdrop('hello');objects=at(141,208,1.2,toy('backpack',done))+at(213,253,.6,toy('shoe'))+(done?spark(157,139,.65):'');person=at(303,171,.75,sprout(done?'happy':'asking'));
  }
  if(id==='spilled-water-socks') {
    scene=backdrop('food');objects=`${at(109,207,.7,toy('blue-cup',false),-83)}${ell(139,252,65,12,'#a4c9c5')}${at(169,228,.77,toy('sock'),-21)}${at(228,243,.75,toy('basket'))}${done?at(197,191,.65,toy('sock'),16):`${dot(166,198,5,C.blue)}${dot(182,211,4,C.blue)}`}`;person=at(314,171,.72,sprout(done?'happy':'asking'));
  }
  if(id==='window-snail'||id==='window-bird'||id==='window-dog') {
    scene=backdrop(id==='window-dog'?'bed':'hello');objects=`${at(102,110,id==='window-snail'?.48:.59,toy(id==='window-snail'?'snail':id==='window-bird'?'bird':'dog'))}${id==='window-dog'?`${line('M137 86q14 12 0 24M147 79q22 20 0 40','#c5a664',3)}${at(250,243,.6,toy('book'))}`:''}${done?spark(134,68,.48):''}`;person=at(done?225:305,174,.73,sprout(done?'happy':'asking'));
  }
  if(id==='garden-book') {
    scene=backdrop('outside');objects=`${at(165,243,1.42,toy('bench'))}${at(done?180:121,208,.72,toy('book'))}`;person=at(done?245:316,done?167:174,.69,sprout(done?'happy':'asking'));
  }
  if(id==='rain-story') {
    scene=backdrop('hello')+line('M46 56l-4 9M68 47l-4 9M97 55l-4 9M58 94l-4 9M104 92l-4 9','#88b3b6',3);objects=at(145,232,1.27,toy('chair'))+at(274,233,1.13,toy('chair'))+at(done?231:125,done?196:202,.67,toy('book'));person=at(280,168,.68,sprout(done?'happy':'asking'));
  }
  if(id==='camp-night') {
    scene=`${rect(0,0,400,300,0,'#667e80')}${dot(333,47,20,'#e7d294')}${spark(73,45,.4,'#f4e3b1')}${spark(213,61,.5,'#f4e3b1')}<path d="M0 210Q80 177 172 210Q290 181 400 215V300H0Z" fill="#8b9c7d"/>`;objects=at(153,192,1.65,toy('tent'))+at(done?264:318,260,.91,toy('star-blanket'));person=at(done?166:293,done?192:177,.57,sprout(done?'sleep':'happy'));
  }
  scene += objects+person;
  if(done) scene+=`${spark(230,52,.7)}${spark(263,88,.45)}`;
  if(request) scene+=`<g class="scene-invitation">${ell(327,87,27,21,'#fffcf0')}${dot(319,87,3,C.green)}${dot(328,87,3,C.green)}${dot(337,87,3,C.green)}<path d="M316 103l-5 13 17-10" fill="#fffcf0"/></g>`;
  return tag(scene+grain(uid),'0 0 400 300',`class="scene-svg scene-${theme} phase-${done?'resolved':request?'request':'before'}"`);
}

export function roomArt() {
  return tag(`${rect(0,0,600,420,0,'#f3e9d2')}<path d="M0 278H600V420H0Z" fill="#d9bd96"/>${line('M0 279h600','#c4a984',7)}${line('M0 348h600M150 280l-28 140M430 280l39 140','#cbb08c',2)}${at(44,17,1.37,windowArt())}${rect(390,77,125,13,5,C.wood)}${at(424,59,.54,toy('plant'))}${rect(477,36,19,39,3,C.orange)}${rect(499,43,12,32,2,C.green)}${at(516,248,1.1,sprout('happy'))}${ell(291,353,145,34,'#c6a57d','opacity=".18"')}`,'0 0 600 420','class="room-svg"');
}
