import {createState,dayKey,getDailyPlan,recordResult,getStats,validateImport} from './learning.js';
import {playFile,stopAudio,startRecording,stopRecording,clearRecording,recordingSupported,cacheAllAudio,cachedAudioCount} from './media.js';

const KEY='english-sprout-state-v1';
const PUBLISHED_URL='https://jamstrak.github.io/english-sprout/';
const app=document.querySelector('#app');
let curriculum,state,view='home',session=null,libraryTheme='all',search='',recording=false,recordPending=false,recordedURL=null,toastTimer,offlineBusy=false,installEvent,waitingSW,screenGeneration=0;
let storageOK=true;
const icons={
 home:'<path d="m3 10 9-7 9 7v10H5V10m4 10v-7h6v7"/>',
 book:'<path d="M12 5v16M3 4c4-1 7 0 9 2 2-2 5-3 9-2v14c-4-1-7 0-9 2-2-2-5-3-9-2Z"/>',
 sprout:'<path d="M12 21v-9M12 15C4 15 3 10 4 5c6 0 9 3 8 10Zm0-4C12 4 16 2 21 3c0 6-3 9-9 8Z"/>',
 speaker:'<path d="m11 4-6 5H2v6h3l6 5Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
 replay:'<path d="M3 10a9 9 0 1 1 2 9M3 3v7h7"/>',
 gear:'<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
 heart:'<path d="M12 20S2 14 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 6-10 12-10 12Z"/>'
};
const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.sprout}</svg>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lessonById=id=>curriculum.lessons.find(l=>l.id===id);
const themeById=id=>curriculum.themes.find(t=>t.id===id)||{name:'生活英语',icon:'🌱',color:'#e9efd7'};
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4400);}
function storageWarning(message){const el=document.querySelector('#storage-warning');el.textContent=message;el.hidden=false;storageOK=false;}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));return true;}catch{storageWarning('浏览器未能保存进度。请在家长页导出备份，再检查存储空间或浏览器设置。');return false;}}
function load(){
  const fresh=createState(dayKey());
  try{const raw=localStorage.getItem(KEY);return raw?validateImport(JSON.parse(raw),curriculum.lessons):fresh;}
  catch{storageWarning('原有记录暂时无法读取。为保护它，本次不会自动覆盖；请先到家长页导出原始记录。');return fresh;}
}
const daily=()=>getDailyPlan(state,curriculum.lessons,dayKey());
const stats=()=>getStats(state,curriculum.lessons,dayKey());
function dateLabel(){return new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date());}
function completeToday(p){return (!p.newLessonId||p.newDone)&&p.dueIds.length===0;}

function shell(content){
  app.innerHTML=`<header class="header"><a href="#home" class="brand" aria-label="英语小芽首页"><img src="./icons/icon.svg" alt="" width="43" height="43"><span>英语小芽<small>little words, big world</small></span></a><nav class="top-nav" aria-label="主要导航">${navItems()}</nav><button class="parent-link ${view==='parent'?'active':''}" data-go="parent">${icon('gear')}<span>家长陪伴</span></button></header><main id="main" tabindex="-1">${content}</main><footer class="footer"><span>每天一点点，英语慢慢长大。</span><span class="connection">${navigator.onLine?'本机保存 · 无广告':'离线模式 · 本机保存'}</span></footer><nav class="bottom-nav" aria-label="手机导航">${navItems()}<button data-go="parent" class="${view==='parent'?'active':''}">${icon('gear')}<span>家长</span></button></nav>`;
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
}
function navItems(){return [['home','home','今日练习'],['library','book','短句小书'],['garden','sprout','成长花园']].map(([id,i,label])=>`<button data-go="${id}" class="${view===id?'active':''}" ${view===id?'aria-current="page"':''}>${icon(i)}<span>${label}</span></button>`).join('');}
function navigate(next){stopAudio();clearRecording();session=null;view=next;location.hash=next;render();window.scrollTo({top:0,behavior:'instant'});}
function render(){if(view==='home')renderHome();else if(view==='library')renderLibrary();else if(view==='garden')renderGarden();else if(view==='parent')renderParent();else renderHome();}
function renderHome(){
  const p=daily(),s=stats(),l=lessonById(p.newLessonId),done=completeToday(p);
  const learned=s.learnedCount||0;
  const completed=(p.newDone?1:0)+(p.reviewDone||0),remaining=(p.newLessonId&&!p.newDone?1:0)+p.dueIds.length;
  shell(`<div class="day-line"><span>${icon('sprout')} ${esc(state.settings.nickname||'小芽')}的英语小花园</span><time>${dateLabel()}</time></div>
  <section class="hero"><div class="hero-copy"><span class="eyebrow">A LITTLE ENGLISH, EVERY DAY</span><h1>${done?'今天的小芽，<br>又长大一点。':'每天一句，<br>打开<span>小小世界。</span>'}</h1><p>${done?'练习完成啦！把今天的话，带进真实生活里。':'听一听，说一说。和孩子一起，<br class="desktop-break">把英语变成生活里自然的一句话。'}</p><div class="hero-tags"><span>${icon('clock')} 每天约 5 分钟</span><span>${icon('heart')} 4—7 岁亲子共学</span></div></div><img class="hero-art" src="./illustrations/garden.svg" alt="小兔抱着一本书，在花园里说 Hello" width="600" height="440"></section>
  <div class="dashboard"><section class="today-panel"><div class="section-heading"><h2>今天的小任务 <span class="tiny-pill">${done?'已完成':`${completed} / ${completed+remaining}`}</span></h2><span>轻轻松松，慢慢记住</span></div>
  <div class="today-card"><div class="lesson-top"><span class="badge">${p.newDone?'✓ 今天已学':'✦ 今天的新短句'}</span><span class="theme-name">${l?esc(themeById(l.theme).name):'温故知新'}</span></div><div class="phrase-preview"><div><p class="english">${l?esc(l.english):'Let’s say it again!'}</p><p class="translation">${l?esc(l.chinese):'把学过的英语，再说一说。'}</p></div><button class="sound-button" id="preview-audio" aria-label="听今天的短句">${icon('speaker')}</button></div><p class="scene">${l?esc(l.scene):'120 个短句已经见过面，复习会继续陪你成长。'}</p><div class="card-divider"></div><div class="mini-steps"><span><i>1</i>听一听</span><b>···</b><span><i>2</i>选一选</span><b>···</b><span><i>3</i>说一说</span></div><button class="primary full" id="start-today">${done?'去短句小书逛逛':'开始今天的练习'} ${icon('arrow')}</button><p class="card-foot">${done?'今天已经很棒啦，不用赶进度。':`1 个新短句${p.dueIds.length?` · ${p.dueIds.length} 个复习短句`:' · 第一次见面，先轻松开始'} · 随时可以休息`}</p></div></section>
  <aside class="side-stack"><section class="review-card"><div class="round-icon">${icon('replay')}</div><div><h3>和老朋友再见面</h3><p>${p.dueIds.length?`今天有 ${p.dueIds.length} 个短句等你复习。`:'今天的复习已安排妥当。'}<br>${p.extraDueCount?`其余 ${p.extraDueCount} 句会慢慢安排，不用赶。`:'隔一段时间再想起，会记得更牢。'}</p></div><span class="review-number">${p.dueIds.length}<small>句待复习</small></span></section>
  <section class="week-card"><div class="section-heading"><h3>这一周的小脚印</h3><span>不赶路，只成长</span></div><div class="week-days">${(s.last7Days||[]).map(d=>`<div class="week-day ${d.practiced?'practiced':''} ${d.date===dayKey()?'is-today':''}"><span>${['日','一','二','三','四','五','六'][new Date(d.date+'T12:00:00').getDay()]}</span><i>${d.practiced?icon('check'):'·'}</i></div>`).join('')}</div><div class="week-bottom"><strong>${learned}<span> 句已经见过面</span></strong><span>🌿</span></div></section>
  <div class="parent-note">${icon('heart')}<p>陪伴小贴士<br><strong>先让孩子听和猜，再给提示。<br>愿意开口，比说得完美更重要。</strong></p></div></aside></div>
  <section class="worlds"><div class="section-heading"><h2>在生活里，遇见英语</h2><button class="text-button" data-go="library">看看全部 ${icon('arrow')}</button></div><div class="world-grid">${curriculum.themes.slice(0,4).map(t=>`<button class="world-card" data-theme="${esc(t.id)}"><span class="world-emoji">${esc(t.icon)}</span><span><strong>${esc(t.name)}</strong><small>10 个生活短句</small></span>${icon('arrow')}</button>`).join('')}</div></section>`);
  document.querySelector('#start-today').onclick=()=>completeToday(daily())?navigate('library'):startDaily();
  document.querySelector('#preview-audio').onclick=()=>l?playLesson(l):toast('打开短句小书，选一句来听吧。');
  document.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>{libraryTheme=b.dataset.theme;navigate('library');});
}

async function playLesson(l,slow=false){try{await playFile(l.audio,slow);}catch{toast('声音暂时没有打开，请联网下载离线声音后再试。');}}
function playPrompt(name){playFile(`audio/ui/${name}.mp3`).catch(()=>toast('引导声音暂不可用，请看屏幕上的提示。'));}
function startDaily(){
  const p=daily();const ids=[...(!p.newDone&&p.newLessonId?[p.newLessonId]:[]),...p.dueIds];
  if(!ids.length){toast('今天的练习已经完成，去生活里试一试吧。');return;}
  session={ids,index:0,newId:!p.newDone?p.newLessonId:null,day:dayKey(),step:p.newLessonId&&!p.newDone?'listen':'remember',preview:false,choice:null,revealed:false};renderSession();
}
function startPreview(id){session={ids:[id],index:0,newId:null,day:dayKey(),step:'listen',preview:true,choice:null,revealed:false};renderSession();window.scrollTo({top:0,behavior:'instant'});}
function sessionCurrent(){return lessonById(session.ids[session.index]);}
function renderSession(){
  if(!session)return;screenGeneration++;stopAudio();clearRecording();recordedURL=null;recording=false;recordPending=false;
  const l=sessionCurrent(),t=themeById(l.theme),isReview=l.id!==session.newId&&!session.preview;
  const label={listen:'先听一听',choose:'听音选一选',remember:'还记得怎么说吗？',speak:'轮到你开口啦'}[session.step];
  app.innerHTML=`<div class="practice-shell"><header class="practice-header"><button class="circle-btn" id="exit-session" aria-label="退出练习">${icon('close')}</button><div class="practice-progress"><span>${session.preview?'自由练习 · 不改变复习计划':`${session.index+1} / ${session.ids.length} 个短句`}</span><div class="progress-track"><i style="width:${(session.index+1)/session.ids.length*100}%"></i></div></div><button class="circle-btn" id="guide-audio" aria-label="听中文引导">${icon('speaker')}</button></header>
  <main class="practice-main"><div class="practice-label"><span class="badge">${session.preview?'短句小书':isReview?'🌿 复习老朋友':'✦ 认识新朋友'}</span><span>${esc(t.name)}</span></div><h1 class="practice-title">${label}</h1><p class="practice-scene">${esc(l.scene)}</p><div class="picture-token" aria-hidden="true">${session.step==='choose'?'👂':esc(l.emoji)}</div>${practiceBody(l)}<div class="practice-bottom"><span>${icon('heart')} ${session.preview?'随便听，随便说，不用记成绩。':'想不起来也没关系，我们一起再试一次。'}</span></div></main></div>`;
  document.querySelector('#exit-session').onclick=()=>{clearRecording();stopAudio();session=null;render();};
  document.querySelector('#guide-audio').onclick=()=>playPrompt(({listen:'listen',choose:'choose',remember:'review',speak:'speak'})[session.step]);
  document.querySelectorAll('[data-listen]').forEach(b=>b.onclick=()=>playLesson(l,b.dataset.listen==='slow'));
  document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{session.step=b.dataset.step;session.choice=null;renderSession();});
  document.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>chooseAnswer(Number(b.dataset.choice)));
  document.querySelectorAll('[data-rating]').forEach(b=>b.onclick=()=>finishLesson(b.dataset.rating));
  document.querySelector('#reveal')?.addEventListener('click',()=>{session.revealed=true;document.querySelector('#answer-area').innerHTML=phraseMarkup(l);document.querySelector('#reveal').remove();playLesson(l);});
  document.querySelector('#record')?.addEventListener('click',toggleRecording);
  document.querySelector('#replay-record')?.addEventListener('click',()=>{if(recordedURL)playFile(recordedURL).catch(()=>toast('回听失败，可以重新录一遍。'));});
  window.scrollTo({top:0,behavior:'instant'});
}
function phraseMarkup(l){return `<p class="practice-english" lang="en">${esc(l.english)}</p><p class="practice-chinese">${esc(l.chinese)}</p>`;}
function listeningButtons(){return `<div class="listen-buttons"><button class="primary" data-listen="normal">${icon('speaker')} 听一听</button><button class="secondary" data-listen="slow">慢一点听</button></div>`;}
function practiceBody(l){
  if(session.step==='listen')return `<div class="phrase-box">${phraseMarkup(l)}</div>${listeningButtons()}<div class="action-note"><span>一起做一做</span><p>${esc(l.action)}</p></div><button class="primary next-button" data-step="choose">听过啦，来试试 ${icon('arrow')}</button>`;
  if(session.step==='remember')return `<div class="recall-box"><p class="practice-chinese">${esc(l.chinese)}</p><p>先不看答案，试着自己说出来。</p></div><button class="primary next-button" data-step="speak">我来说一说 ${icon('arrow')}</button><button class="text-button centered" data-step="listen">还想不起来，听听提示</button>`;
  if(session.step==='choose')return `<div class="quiz-listen">${listeningButtons()}<p>这句话是什么意思？请选一张卡。</p></div><div class="choices">${l.choices.map((c,i)=>`<button class="choice" data-choice="${i}"><span>${esc(c.emoji)}</span><strong>${esc(c.label)}</strong><i>${String.fromCharCode(65+i)}</i></button>`).join('')}</div><div id="quiz-feedback" class="quiz-feedback" aria-live="polite"></div><button id="quiz-next" class="primary next-button" data-step="speak" hidden>接下来，说一说 ${icon('arrow')}</button><p class="small-note">还不识字？家长可以读出三个选项。</p>`;
  return `<div id="answer-area" class="phrase-box">${session.revealed||session.preview||l.id===session.newId?phraseMarkup(l):`<p class="practice-chinese">${esc(l.chinese)}</p><p class="soft-copy">想一想，你会怎么说？</p>`}</div>${!session.revealed&&!session.preview&&l.id!==session.newId?'<button id="reveal" class="secondary centered">看答案，听提示</button>':listeningButtons()}<div class="record-box"><button id="record" class="record-button">${icon('mic')} <span>录下我的声音</span></button><button id="replay-record" class="secondary" disabled>${icon('replay')} 听听自己</button><p id="record-status">可选 · 最长 15 秒 · 只在本机临时回听</p></div><div class="parent-prompt"><span>生活里试一试</span><p>${esc(l.action)}</p><small>${esc(l.parentTip)}</small></div><div class="rating-label">${session.preview?'练习完成后，回到小书吧。':'和家长一起选：刚才说得怎么样？'}</div><div class="rating-buttons">${session.preview?'<button class="primary" data-rating="good">练习好了 ✓</button>':'<button data-rating="again"><span>🌧️</span>再练一练</button><button data-rating="help"><span>🌤️</span>提示后会说</button><button data-rating="good"><span>☀️</span>自己会说</button>'}</div><p class="small-note">不自动打分，也不评判口音。家长根据刚才的真实表现选择。</p>`;
}
function chooseAnswer(index){
  const l=sessionCurrent();const right=index===l.answerIndex;
  document.querySelectorAll('[data-choice]').forEach(b=>b.classList.toggle('incorrect',Number(b.dataset.choice)===index&&!right));
  const f=document.querySelector('#quiz-feedback');f.textContent=right?'选对啦！接下来用自己的声音说一遍。':'再听一次，慢慢找，不着急。';f.className='quiz-feedback '+(right?'correct':'gentle');
  if(right){document.querySelector(`[data-choice="${index}"]`).classList.add('correct');document.querySelector('#quiz-next').hidden=false;document.querySelectorAll('[data-choice]').forEach(b=>b.disabled=true);}else playLesson(l);
}
async function toggleRecording(){
  const b=document.querySelector('#record'),status=document.querySelector('#record-status');
  if(recordPending)return;
  if(recording){stopRecording();recording=false;b.classList.remove('recording');b.innerHTML=`${icon('mic')} <span>再录一次</span>`;return;}
  if(!recordingSupported()){status.textContent='这个浏览器暂不支持录音。直接开口说也可以完成练习。';return;}
  recordPending=true;b.disabled=true;const active=session,generation=screenGeneration;
  try{await startRecording(url=>{
    if(session!==active||generation!==screenGeneration)return;
    recording=false;recordedURL=url;
    const record=document.querySelector('#record');if(!record)return;
    record.classList.remove('recording');record.innerHTML=`${icon('mic')} <span>再录一次</span>`;
    document.querySelector('#replay-record').disabled=!url;
    document.querySelector('#record-status').textContent=url?'录好啦，听听自己！离开这张卡后录音就会删除。':'没有录到声音，可以再试一次。';
  });if(session!==active||generation!==screenGeneration){clearRecording();return;}recording=true;b.classList.add('recording');b.innerHTML=`${icon('mic')} <span>停止录音</span>`;status.textContent='正在听你的声音…再点一次停止（最多 15 秒）';document.querySelector('#replay-record').disabled=true;
  }catch(e){if(e.name!=='AbortError'&&generation===screenGeneration)status.textContent=e.name==='NotAllowedError'?'没有开启麦克风。可以在浏览器中允许，也可以直接开口练习。':'麦克风暂时不可用，直接开口练习也很好。';}
  finally{if(generation===screenGeneration){recordPending=false;b.disabled=false;}}
}
function finishLesson(rating){
  if(session.preview){session=null;clearRecording();stopAudio();view='library';location.hash='library';renderLibrary();return;}
  if(dayKey()!==session.day){session=null;clearRecording();render();toast('新的一天开始啦，已为你重新安排今天的练习。');return;}
  const l=sessionCurrent();
  try{state=recordResult(state,l.id,rating,session.day,{isNew:l.id===session.newId});}catch(e){toast(e.message);return;}
  if(storageOK)save();
  clearRecording();session.index++;
  if(session.index>=session.ids.length){renderCompletion();return;}
  session.step=session.ids[session.index]===session.newId?'listen':'remember';session.revealed=false;session.choice=null;renderSession();
}
function renderCompletion(){
  const count=session.ids.length;session=null;stopAudio();clearRecording();
  shell(`<section class="completion"><span class="eyebrow">A LITTLE STEP, A LOVELY DAY</span><div class="completion-flower">🌻<span>✦</span><i>✦</i></div><h1>今天，又长大一点！</h1><p>和 ${count} 个英语短句见了面。<br>明天，小芽还在这里等你。</p><div class="completion-note">${icon('heart')} 今天选一句，在吃饭、玩耍或睡前用出来吧。</div><button class="primary" data-go="home">收好今天的小进步 ${icon('check')}</button><button class="text-button centered" data-go="garden">看看我的成长花园</button><p class="small-note">记不住也没关系，后面的复习会再遇见它。</p></section>`);
}

function renderLibrary(){
  const filtered=curriculum.lessons.filter(l=>(libraryTheme==='all'||l.theme===libraryTheme)&&(!search||`${l.english} ${l.chinese}`.toLowerCase().includes(search.toLowerCase())));
  shell(`<section class="page-intro"><span class="eyebrow">MY LITTLE PHRASE BOOK</span><h1>短句小书</h1><p>好奇哪一句，就打开听听。自由练习不会改变每日复习计划。</p></section><div class="library-toolbar"><div class="theme-filters"><button data-filter="all" class="${libraryTheme==='all'?'selected':''}">全部短句</button>${curriculum.themes.map(t=>`<button data-filter="${esc(t.id)}" class="${libraryTheme===t.id?'selected':''}">${esc(t.icon)} ${esc(t.name)}</button>`).join('')}</div><label class="search-label"><span>找一句话</span><input id="phrase-search" type="search" placeholder="中文或英文都可以" value="${esc(search)}" maxlength="60"></label></div><p class="results-count">${filtered.length} 个短句 · ${stats().learnedCount} 个已学习</p><div class="phrase-grid">${filtered.map(l=>`<button class="phrase-tile" data-preview="${esc(l.id)}"><div class="tile-top"><span>${esc(l.emoji)}</span><small>${state.cards[l.id]?'🌱 学过啦':esc(themeById(l.theme).name)}</small></div><strong lang="en">${esc(l.english)}</strong><span class="tile-translation">${esc(l.chinese)}</span><div class="tile-bottom"><span>听一听 · 说一说</span>${icon('arrow')}</div></button>`).join('')}</div>${!filtered.length?'<div class="empty-state">这次没有找到。换一个词试试吧。</div>':''}`);
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{libraryTheme=b.dataset.filter;renderLibrary();});
  document.querySelector('#phrase-search').oninput=e=>{const pos=e.target.selectionStart;search=e.target.value;renderLibrary();const input=document.querySelector('#phrase-search');input.focus();try{input.setSelectionRange(pos,pos);}catch{}};
  document.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>startPreview(b.dataset.preview));
}
function renderGarden(){
  const s=stats();const learned=s.learnedCount||0;
  shell(`<section class="page-intro"><span class="eyebrow">GROW AT YOUR OWN PACE</span><h1>每一点努力，都在长大</h1><p>没有排行榜，没有断签惩罚。我们只收藏属于你的进步。</p></section><div class="garden-summary"><div><strong>${learned}</strong><span>个短句已学习</span></div><div><strong>${s.practicedDays||0}</strong><span>天留下小脚印</span></div><div><strong>${s.familiarCount||0}</strong><span>个短句多次说出</span></div></div><section class="garden-meadow"><div class="section-heading"><h2>我的小花园</h2><span>每学一个短句，种下一颗小芽</span></div><div class="plant-grid">${Array.from({length:Math.max(12,Math.min(120,Math.ceil((learned+1)/12)*12))},(_,i)=>`<div class="plant ${i<learned?'grown':''}" title="${i<learned?'第 '+(i+1)+' 个短句':'等一颗新的小芽'}"><span>${i<learned?['🌱','🌷','🌿','🌻','🌼','🍀'][i%6]:'·'}</span><small>${String(i+1).padStart(2,'0')}</small></div>`).join('')}</div></section><section class="review-explanation"><div><h2>记忆，也需要慢慢浇水</h2><p>先尝试自己回想，再听提示。根据每次表现，复习间隔会逐渐拉长；觉得困难的短句，会更早回来。</p><div class="intervals">${[1,3,7,14,30,60].map(d=>`<span>${d}<small>天后</small></span>`).join('<i>→</i>')}</div><p class="small-note">这是可调整的练习安排，不是每个孩子都相同的记忆曲线，也不是掌握程度诊断。</p></div><img src="./illustrations/garden.svg" alt="小兔在花园里读书" width="220" height="165"></section>`);
}
function renderParent(){
  shell(`<section class="page-intro"><span class="eyebrow">A LITTLE HELP FROM GROWN-UPS</span><h1>陪孩子，慢慢说</h1><p>不用上课一样认真。每天留一点时间，让一句英语走进生活。</p></section><div class="parent-grid"><section class="settings-card"><h2>我们的练习习惯</h2><label class="field">孩子的小昵称<input id="nickname" value="${esc(state.settings.nickname)}" maxlength="12" autocomplete="off"><small>仅保存在这台设备，不需要真实姓名。</small></label><label class="field">每天最多复习几句<select id="daily-reviews">${[3,5,8].map(n=>`<option value="${n}" ${state.settings.dailyReviews===n?'selected':''}>${n} 句${n===5?'（默认）':''}</option>`).join('')}</select><small>每天 1 个新短句，旧短句少量复习。累了就休息。</small></label><button class="primary" id="save-settings">保存设置 ${icon('check')}</button></section>
  <section class="settings-card"><h2>把小芽放进口袋</h2><p>手机和电脑打开同一个网址即可使用。iPhone：Safari 分享 → 添加到主屏幕；Android：浏览器菜单 → 安装应用 / 添加到主屏幕。</p><button class="secondary" id="install-app">${icon('download')} 添加到主屏幕</button><hr><h3>下载离线声音</h3><p>所有短句的示范音频随应用提供。第一次联网保存后，可以离线听和练习。</p><button class="primary" id="offline-audio" ${offlineBusy?'disabled':''}>${icon('download')} ${offlineBusy?'正在保存声音…':'保存全部离线声音'}</button><p id="offline-status" class="small-note" aria-live="polite">正在检查本机离线内容…</p>${waitingSW?'<button class="secondary" id="update-app">新版本已准备好，重新打开</button>':''}</section>
  <section class="settings-card"><h2>进度备份与换设备</h2><p><strong>手机和电脑的进度分别保存在各自浏览器，不会自动同步。</strong>在旧设备导出，再把文件传到新设备导入即可。清理浏览器数据或卸载可能清除进度，请定期备份。</p><div class="button-row"><button class="secondary" id="export-progress">${icon('download')} 导出进度</button><button class="secondary" id="import-progress">导入进度</button></div><input id="import-file" type="file" accept="application/json,.json" hidden><p id="import-status" class="small-note" aria-live="polite"></p>${!storageOK?'<button class="secondary" id="export-raw">导出原始记录</button>':''}</section>
  <section class="settings-card"><h2>怎样陪伴更有效</h2><ol class="parent-tips"><li><strong>听懂场景。</strong>先听示范，做动作、指物品，不要求识字。</li><li><strong>留出回想。</strong>复习时等几秒再提示，帮孩子找回这句话。</li><li><strong>一起开口。</strong>录音可选，只用于回听；不做自动评分。</li><li><strong>生活里再用。</strong>喝水、出门、玩玩具时，自然地说一次。</li></ol><p class="small-note">“自己会说”由亲子观察填写，不等于语音识别判定。正确选择图片也不等于会说。4—7 岁建议家长陪伴。</p></section>
  <section class="settings-card wide"><h2>关于英语小芽</h2><p>内置 120 个生活短句 · 无广告 · 无付费 API · 无账户 · 无录音上传。示范音频为本地合成语音，不是真人录音。录音离开练习卡即删除。</p><p>间隔复习结合主动回想，有助于安排练习；本工具不保证特定学习效果，也不能替代真实交流。完成全部新句后，已有短句仍会继续复习。</p><div class="button-row"><a class="text-button" href="https://www.learningscientists.org/blog/2022/2/3-1" target="_blank" rel="noopener noreferrer">家长阅读：幼儿的间隔回想研究 ↗</a><button class="text-button danger" id="reset-progress">重新开始学习</button></div><p class="small-note">v1.0.0 · 静态网页应用。网站托管方会收到正常访问请求；学习进度和录音不发送给我们。</p></section></div>`);
  document.querySelector('#save-settings').onclick=()=>{if(!storageOK){toast('请先备份原始记录，再导入有效备份或重新开始。');return;}state.settings.nickname=document.querySelector('#nickname').value.trim().slice(0,12)||'小芽';state.settings.dailyReviews=Number(document.querySelector('#daily-reviews').value);if(save())toast('保存好啦，按自己的节奏来。');};
  document.querySelector('#install-app').onclick=async()=>{if(installEvent){await installEvent.prompt();installEvent=null;}else toast('iPhone 用 Safari 的“分享”，Android 用浏览器菜单，选择“添加到主屏幕”。');};
  const install=document.querySelector('#install-app');
  install.insertAdjacentHTML('afterend',`<div class="phone-share"><img src="./icons/phone-qr.png" width="112" height="112" alt="手机扫码打开英语小芽"><div><strong>换到手机，接着练</strong><p>扫码或复制网址，在手机浏览器打开。进度可通过备份转移。</p><button class="text-button" id="copy-link">复制手机网址 ${icon('arrow')}</button></div></div>`);
  document.querySelector('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(PUBLISHED_URL);toast('网址已复制，可以发到手机打开。');}catch{toast(PUBLISHED_URL);}};
  document.querySelector('#offline-audio').onclick=downloadOffline;
  const files=curriculum.lessons.map(l=>l.audio);
  cachedAudioCount(files).then(n=>{const el=document.querySelector('#offline-status');if(el)el.textContent=`本机已保存 ${n} / ${files.length} 句声音${n===files.length?' · 可离线播放':''}。浏览器清理缓存后需重新保存。`;}).catch(()=>{});
  document.querySelector('#export-progress').onclick=()=>downloadJSON({app:'english-sprout',version:1,exportedAt:new Date().toISOString(),state},`英语小芽-进度-${dayKey()}.json`);
  document.querySelector('#export-raw')?.addEventListener('click',()=>{try{downloadJSON({raw:localStorage.getItem(KEY)},`英语小芽-原始记录-${dayKey()}.json`);}catch{toast('当前浏览器无法读取存储，请先保留此页面。');}});
  document.querySelector('#import-progress').onclick=()=>document.querySelector('#import-file').click();
  document.querySelector('#import-file').onchange=importProgress;
  document.querySelector('#reset-progress').onclick=()=>confirmDialog('重新开始学习？','这会清除这台设备的学习记录。建议先导出备份，声音缓存会保留。','清除并重新开始',()=>{state=createState(dayKey());storageOK=true;document.querySelector('#storage-warning').hidden=true;const saved=save();navigate('home');if(saved)toast('新的小花园准备好了。');});
  document.querySelector('#update-app')?.addEventListener('click',()=>{waitingSW?.postMessage('ACTIVATE_UPDATE');navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});});
}
async function downloadOffline(){
  if(offlineBusy)return;
  if(!('serviceWorker' in navigator)||!window.isSecureContext){toast('请使用 HTTPS 网址或本机启动入口保存离线内容。');return;}
  offlineBusy=true;const button=document.querySelector('#offline-audio');button.disabled=true;
  const update=t=>{const el=document.querySelector('#offline-status');if(el)el.textContent=t;};
  try{
    await Promise.race([navigator.serviceWorker.ready,new Promise((_,rej)=>setTimeout(()=>rej(new Error('离线服务尚未准备好，请联网刷新后再试。')),12000))]);
    const ui=['listen','choose','speak','reveal','complete','review','record','welcome'].map(n=>`audio/ui/${n}.mp3`);
    await cacheAllAudio([...curriculum.lessons.map(l=>l.audio),...ui],(n,total)=>update(`正在保存声音 ${n} / ${total}，请保持页面打开…`));
    if(navigator.storage?.persist)await navigator.storage.persist().catch(()=>false);
    update('所有短句与引导声音已保存，可以离线练习。清理浏览器数据后需重新下载。');toast('离线小书准备好了！');
  }catch(e){update(e.message||'没有全部保存成功，已保存的会保留，可以稍后继续。');}
  finally{offlineBusy=false;const b=document.querySelector('#offline-audio');if(b)b.disabled=false;}
}
function downloadJSON(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function importProgress(event){
  const file=event.target.files[0];if(!file)return;event.target.value='';
  try{if(file.size>2*1024*1024)throw new Error('备份文件过大，请选择英语小芽导出的进度文件。');const data=JSON.parse(await file.text());if(data.app!=='english-sprout'||data.version!==1)throw new Error('这不是英语小芽的进度备份。');const imported=validateImport(data.state,curriculum.lessons);
    confirmDialog('用备份恢复进度？',`将替换这台设备的当前记录。备份中有 ${Object.keys(imported.cards).length} 个已学短句；不会合并两台设备的记录。`,'确认恢复',()=>{state=imported;storageOK=true;document.querySelector('#storage-warning').hidden=true;const saved=save();renderParent();if(saved)toast('进度已经恢复。');});
  }catch(e){const message='没有导入：'+(e.message||'文件内容无法识别，原有进度没有改变。');const status=document.querySelector('#import-status');if(status)status.textContent=message;else toast(message);}
}
function confirmDialog(title,body,label,onConfirm){
  const d=document.createElement('dialog');d.className='confirm-dialog';d.innerHTML=`<h2>${esc(title)}</h2><p>${esc(body)}</p><div class="button-row"><button class="secondary" data-cancel>先不改</button><button class="primary" data-confirm>${esc(label)}</button></div>`;document.body.append(d);d.showModal();d.querySelector('[data-cancel]').onclick=()=>d.close();d.querySelector('[data-confirm]').onclick=()=>{d.close();onConfirm();};d.onclose=()=>d.remove();
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;});
window.addEventListener('hashchange',()=>{const v=location.hash.slice(1);if(['home','library','garden','parent'].includes(v)&&v!==view){clearRecording();stopAudio();session=null;view=v;render();}});
window.addEventListener('online',()=>{if(!session)render();});window.addEventListener('offline',()=>{if(!session)render();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopAudio();if(recording)stopRecording();}else if(!session)render();});
window.addEventListener('pagehide',()=>{stopAudio();clearRecording();});
window.addEventListener('storage',e=>{if(e.key===KEY){if(session){toast('另一个页面更新了进度，请退出本轮再继续。');session=null;clearRecording();}state=load();render();}});
async function init(){
  try{const response=await fetch('./data/curriculum.json');if(!response.ok)throw new Error('课程读取失败');curriculum=await response.json();state=load();view=['library','garden','parent'].includes(location.hash.slice(1))?location.hash.slice(1):'home';render();
    if('serviceWorker' in navigator&&window.isSecureContext){navigator.serviceWorker.register('./sw.js').then(reg=>{if(reg.waiting)waitingSW=reg.waiting;reg.addEventListener('updatefound',()=>{const w=reg.installing;w?.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller){waitingSW=w;toast('小芽有新版本啦，可在家长页更新。');}});});}).catch(()=>toast('离线功能暂未准备好，联网练习仍可使用。'));}
  }catch{app.innerHTML='<div class="boot"><span>🌱</span><h1>小芽还没准备好</h1><p>请检查网络，重新打开。如果尚未下载离线内容，需要先联网一次。</p><button class="primary" id="retry">重新打开</button></div>';document.querySelector('#retry').onclick=()=>location.reload();}
}
init();
