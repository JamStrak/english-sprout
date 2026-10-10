import {createState,dayKey,getDailyPlan,recordResult,getStats,validateImport,getCheckupPlan,recordCheckup} from './learning.js';
import {playFile,stopAudio,preloadAudio,isAudioLoading,startRecording,stopRecording,clearRecording,recordingSupported,cacheAllAudio,cachedAudioCount} from './media.js';
import {VOICE_STORAGE_KEY,VOICES,UI_PROMPTS,normalizeVoice,readVoicePreference,saveVoicePreference,voiceAudioPath,englishAudioFiles} from './voices.js';
import {lessonIllustration} from './illustrations.js';
import {getGarden,recordGardenAction,PLANTS} from './garden.js';
import {avatarMarkup,openAvatarPicker,AVATAR_STORAGE_KEY} from './avatars.js';
import {installInteractionFeedback} from './feedback.js';

const KEY='english-sprout-state-v1';
const PUBLISHED_URL='https://jamstrak.github.io/english-sprout/';
const app=document.querySelector('#app');
let curriculum,state,view='home',session=null,libraryTheme='all',search='',recording=false,recordPending=false,recordedURL=null,toastTimer,offlineBusy=false,offlineDownloadGeneration=0,installEvent,waitingSW,screenGeneration=0;
let storageOK=true;
let selectedVoice=readVoicePreference();
let audioSequence=Promise.resolve(),audioGeneration=0;
let audioWaitTimer;
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
function resetRecording(){clearRecording();recordedURL=null;recording=false;recordPending=false;}
const daily=()=>getDailyPlan(state,curriculum.lessons,dayKey());
const stats=()=>getStats(state,curriculum.lessons,dayKey());
function warmLessons(ids){
  const voices=[selectedVoice,...VOICES.map(v=>v.id).filter(id=>id!==selectedVoice)];
  preloadAudio([...new Set(ids.filter(Boolean))].slice(0,3).flatMap(id=>{const lesson=lessonById(id);return lesson?voices.map(voice=>voiceAudioPath(lesson.audio,voice)):[];}));
}
function nextLessonId(id){return curriculum.lessons[curriculum.lessons.findIndex(l=>l.id===id)+1]?.id;}
function dateLabel(){return new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date());}
function completeToday(p){return (!p.newLessonId||p.newDone)&&p.dueIds.length===0;}

function shell(content){
  app.innerHTML=`<header class="header"><a href="#home" class="brand" aria-label="英语小芽首页"><img src="./icons/icon.svg" alt="" width="43" height="43"><span>英语小芽<small>little words, big world</small></span></a><nav class="top-nav" aria-label="主要导航">${navItems()}</nav><button class="parent-link ${view==='parent'?'active':''}" data-go="parent">${icon('gear')}<span>家长陪伴</span></button></header><main id="main" tabindex="-1">${content}</main><footer class="footer"><span>每天一点点，英语慢慢长大。</span><span class="connection">${navigator.onLine?'本机保存 · 无广告':'离线模式 · 本机保存'}</span></footer><nav class="bottom-nav" aria-label="手机导航">${navItems()}<button data-go="parent" class="${view==='parent'?'active':''}">${icon('gear')}<span>家长</span></button></nav>`;
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
  bindAvatar();
}
function bindAvatar(){document.querySelectorAll('#avatar-open,[data-edit-avatar]').forEach(button=>button.onclick=()=>{stopPlayback();openAvatarPicker({notify:toast,onSave:()=>document.querySelectorAll('[data-user-avatar]').forEach(el=>el.innerHTML=avatarMarkup())});});}
function navItems(){return [['home','home','今日练习'],['library','book','短句小书'],['garden','sprout','成长花园']].map(([id,i,label])=>`<button data-go="${id}" class="${view===id?'active':''}" ${view===id?'aria-current="page"':''}>${icon(i)}<span>${label}</span></button>`).join('');}
function navigate(next){stopPlayback();resetRecording();session=null;view=next;location.hash=next;render();window.scrollTo({top:0,behavior:'instant'});}
function render(){if(view==='home')renderHome();else if(view==='library')renderLibrary();else if(view==='garden')renderGarden();else if(view==='parent')renderParent();else renderHome();}
function renderHome(){
  const p=daily(),s=stats(),l=lessonById(p.newLessonId),done=completeToday(p);
  const heroAction=l?{label:p.newDone?'再听今天这句':'点这里，学今天这句',start:()=>p.newDone?startPreview(l.id):startNewLesson()}:p.dueIds.length?{label:`复习这 ${p.dueIds.length} 句`,start:startReview}:getCheckupPlan(state,curriculum.lessons,dayKey()).due?{label:'去玩记忆小游戏',start:startCheckup}:{label:'去我的花田',start:()=>navigate('garden')};
  const learned=s.learnedCount||0;
  const completed=(p.newDone?1:0)+(p.reviewDone||0),remaining=(p.newLessonId&&!p.newDone?1:0)+p.dueIds.length;
  shell(`<div class="day-line"><button id="avatar-open" class="profile-button" aria-label="换我的动物头像"><span data-user-avatar>${avatarMarkup()}</span><span><strong>${esc(state.settings.nickname||'小芽')}的英语小花园</strong><small>点头像，换个小模样</small></span></button><time>${dateLabel()}</time></div>
  <section class="hero daily-hero" data-feedback-target aria-labelledby="daily-title"><div class="daily-heading"><span class="badge">${p.newDone?'✓ 今天已学过':'✦ 每天一个小发现'}</span><span class="daily-day">${l?esc(themeById(l.theme).name):'继续长大'}</span></div><div class="daily-hero-body"><div class="hero-copy"><h1 id="daily-title">每天一句<span>今天，一起说</span></h1><button class="daily-words" id="daily-words" aria-label="${l?'学习：'+esc(l.chinese):heroAction.label}"><strong lang="en">${l?esc(l.english):'Let’s say it again!'}</strong><span>${l?esc(l.chinese):'和学过的短句，再见个面。'}</span></button><button class="primary hero-start" id="hero-start">${icon('speaker')} ${heroAction.label} ${icon('arrow')}</button><p class="daily-foot">${p.newDone?'今天已经很棒啦，再听一次也开心。':'听一听 · 选一选 · 说一说，收下一颗小种子'}</p></div><button class="hero-art daily-art" id="daily-picture" data-audio-lesson="${l?.id||''}" aria-label="${l?'点图片开始学习：'+esc(l.chinese):heroAction.label}">${l?lessonIllustration(l.id):'<img src="./illustrations/garden.svg" alt="小兔的英语花园">'}<span class="picture-play">${icon('speaker')} 点我一起说</span></button></div><div class="daily-voice-bar">${voiceButtons()}<button class="sound-button" id="preview-audio" data-audio-lesson="${l?.id||''}" aria-label="听今天的短句">${icon('speaker')}</button>${audioStatusMarkup()}</div></section>
  <div class="dashboard"><section class="today-panel"><div class="section-heading"><h2>今天的小任务 <span class="tiny-pill">${done?'已完成':`${completed} / ${completed+remaining}`}</span></h2><span>轻轻松松，慢慢记住</span></div>
  <div class="today-card task-summary"><div class="task-row"><span class="task-symbol">${p.newDone?'🌸':'🌱'}</span><span><strong>${p.newDone?'今天的新句，已见过面':'今天认识一个新短句'}</strong><small>${l?esc(l.chinese):'120 句已经见过面，继续在生活里用起来。'}</small></span><span class="task-check">${p.newDone?'✓':'1'}</span></div><div class="task-row"><span class="task-symbol">🌿</span><span><strong>${p.dueIds.length?'还有 '+p.dueIds.length+' 句老朋友':'今天的复习，已安排妥当'}</strong><small>每天一点点，想不起来也没关系。</small></span><span class="task-check">${p.dueIds.length||'✓'}</span></div><button class="primary full" id="start-today">${done?'去短句小书逛逛':'一起完成今天的练习'} ${icon('arrow')}</button><p class="card-foot">${done?'今天已经很棒啦，不用赶进度。':'想休息，随时都可以停下来。'}</p></div></section>
  <aside class="side-stack"><section class="review-card"><div class="round-icon">${icon('replay')}</div><div><h3>和老朋友再见面</h3><p>${p.dueIds.length?`今天有 ${p.dueIds.length} 个短句等你复习。`:'今天的复习已安排妥当。'}<br>${p.extraDueCount?`其余 ${p.extraDueCount} 句会慢慢安排，不用赶。`:'隔一段时间再想起，会记得更牢。'}</p></div><span class="review-number">${p.dueIds.length}<small>句待复习</small></span></section>
  <section class="week-card"><div class="section-heading"><h3>这一周的小脚印</h3><span>不赶路，只成长</span></div><div class="week-days">${(s.last7Days||[]).map(d=>`<div class="week-day ${d.practiced?'practiced':''} ${d.date===dayKey()?'is-today':''}"><span>${['日','一','二','三','四','五','六'][new Date(d.date+'T12:00:00').getDay()]}</span><i>${d.practiced?icon('check'):'·'}</i></div>`).join('')}</div><div class="week-bottom"><strong>${learned}<span> 句已经见过面</span></strong><span>🌿</span></div></section>
  <div class="parent-note">${icon('heart')}<p>陪伴小贴士<br><strong>先让孩子听和猜，再给提示。<br>愿意开口，比说得完美更重要。</strong></p></div></aside></div>
  <section class="worlds"><div class="section-heading"><h2>在生活里，遇见英语</h2><button class="text-button" data-go="library">看看全部 ${icon('arrow')}</button></div><div class="world-grid">${curriculum.themes.slice(0,4).map(t=>`<button class="world-card" data-theme="${esc(t.id)}"><span class="world-emoji">${esc(t.icon)}</span><span><strong>${esc(t.name)}</strong><small>10 个生活短句</small></span>${icon('arrow')}</button>`).join('')}</div></section>`);
  document.querySelector('#hero-start').onclick=heroAction.start;
  document.querySelector('#daily-picture').onclick=heroAction.start;
  document.querySelector('#daily-words').onclick=heroAction.start;
  document.querySelector('.daily-hero').onclick=event=>{if(!event.target.closest('button,a,input,select'))heroAction.start();};
  bindVoiceSelectors();
  document.querySelector('#start-today').onclick=()=>completeToday(daily())?navigate('library'):startDaily();
  document.querySelector('#preview-audio').onclick=()=>l?playLesson(l):toast('打开短句小书，选一句来听吧。');
  document.querySelector('.hero').insertAdjacentHTML('afterend',reviewPanel(p)+checkupPanel());
  document.querySelector('#start-review')?.addEventListener('click',startReview);
  document.querySelectorAll('[data-review-listen]').forEach(button=>button.onclick=()=>playLesson(lessonById(button.dataset.reviewListen)));
  document.querySelector('#start-checkup')?.addEventListener('click',startCheckup);
  document.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>{libraryTheme=b.dataset.theme;navigate('library');});
  warmLessons([p.newLessonId,...p.dueIds.slice(0,2)]);
}
function reviewPanel(plan){
  return `<section class="today-review"><div class="section-heading"><div><span class="eyebrow">REMEMBER TOGETHER</span><h2>今天复习这 ${plan.dueIds.length} 句</h2></div>${plan.dueIds.length?'<button class="primary" id="start-review">一起复习 '+icon('replay')+'</button>':''}</div>${plan.dueIds.length?`<div class="review-lesson-grid">${plan.dueIds.map(id=>{const lesson=lessonById(id);return `<button class="review-lesson-card" data-review-id="${id}" data-review-listen="${id}" data-audio-lesson="${id}" aria-label="听复习短句：${esc(lesson.chinese)}">${lessonIllustration(id)}<span><strong>${esc(lesson.chinese)}</strong><small>${esc(lesson.scene)}</small></span><span class="sound-button" aria-hidden="true">${icon('speaker')}</span></button>`;}).join('')}</div><p class="small-note">先看图回想，再听提示。今天只复习这些，漏一天也不用补赶。</p>`:'<p class="small-note">今天没有待复习短句。学过的句子会按间隔回来，不用额外赶进度。</p>'}</section>`;
}
function checkupPanel(){
  const plan=getCheckupPlan(state,curriculum.lessons,dayKey());
  const learned=Object.values(state.cards),reviewedToday=learned.length&&learned.every(card=>card.lastReviewed===dayKey());
  const message=plan.due?`${plan.ids.length} 张熟悉的图片，先自己说，再听音选图。`:plan.nextDate>dayKey()?`${plan.nextDate} 再来玩。先积累熟悉的生活短句吧。`:reviewedToday?'今天的句子已经练过啦，明天再看图回想。':'先积累几个生活短句，过几天再来玩记忆小游戏。';
  return `<section class="checkup-invite"><span class="checkup-symbol" aria-hidden="true">${icon('book')}${icon('speaker')}</span><div><h2>每周记忆小游戏</h2><p>${message}</p><small>和家长一起玩，没有倒计时；听懂和开口分别记录。</small></div>${plan.due?'<button class="primary" id="start-checkup">开始小游戏 '+icon('arrow')+'</button>':''}</section>`;
}

function audioStatusMarkup(){return '<div class="audio-status" data-audio-state="idle" role="status" aria-live="polite"><span class="sound-waves" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="audio-status-copy">点名字换声音，点画面听一听</span></div>';}
function showAudioState(next,label='',lessonId=null){
  clearTimeout(audioWaitTimer);
  document.body.dataset.playing=next;
  document.querySelectorAll('.audio-status').forEach(el=>{el.dataset.audioState=next;el.querySelector('.audio-status-copy').textContent=next==='loading'?'声音马上来啦…':next==='playing'?label:next==='error'?'声音没打开，点一下再试试':label?'听完啦，再点一次还可以听':'点名字换声音，点画面听一听';});
  document.querySelectorAll('[data-audio-lesson],.scene-picture,.listening-cue,[data-listen],#preview-audio').forEach(el=>{const active=next==='playing'&&!!lessonId&&(!el.hasAttribute('data-audio-lesson')||el.dataset.audioLesson===lessonId);el.classList.toggle('is-playing',active);el.dataset.audioState=active?'playing':next==='loading'?'loading':'idle';});
  document.querySelectorAll('[data-voice]').forEach(el=>el.classList.toggle('voice-speaking',next==='playing'&&el.dataset.voice===selectedVoice&&!!lessonId));
  if(next==='loading')audioWaitTimer=setTimeout(()=>{document.querySelectorAll('.audio-status[data-audio-state="loading"] .audio-status-copy').forEach(el=>el.textContent='正在把声音接过来，等一下就好，不用再点哦');},2500);
}
function stopPlayback(){audioGeneration++;stopAudio();audioSequence=Promise.resolve();showAudioState('idle');}
function queueAudio(items){
  const generation=audioGeneration;
  audioSequence=audioSequence.catch(()=>{}).then(async()=>{
    for(const item of items){
      if(generation!==audioGeneration)return;
      const audio=await playFile(item.file,item.slow,status=>{if(generation===audioGeneration)showAudioState(status,item.label||'正在听你的声音',item.lessonId);});
      if(!audio||generation!==audioGeneration)return;
      if(!audio.ended)await new Promise(resolve=>{const done=()=>{audio.removeEventListener('ended',done);audio.removeEventListener('pause',done);audio.removeEventListener('error',done);resolve();};audio.addEventListener('ended',done);audio.addEventListener('pause',done);audio.addEventListener('error',done);});
    }
  }).catch(()=>{if(generation===audioGeneration){showAudioState('error');toast('声音暂时没有打开，请联网保存离线声音后再试。');}});
  return audioSequence;
}
function playLesson(l,slow=false){if(!l)return;if(recordPending||recording){toast('先结束录音，再来听示范吧。');return;}const file=voiceAudioPath(l.audio,selectedVoice);if(isAudioLoading(file,slow))return audioSequence;stopPlayback();return queueAudio([{file,slow,lessonId:l.id,label:`${VOICES.find(v=>v.id===selectedVoice).name}${slow?' 慢慢说':' 正在说'} · ${l.english}`}]);}
function voiceButtons(){return `<div class="voice-buttons" role="group" aria-label="选择示范声音">${VOICES.map(voice=>`<button class="voice-button ${selectedVoice===voice.id?'selected':''}" data-voice="${voice.id}" aria-pressed="${selectedVoice===voice.id}"><span class="voice-face" aria-hidden="true">${voice.id==='aiden'?'🐻':'🦊'}</span><span>${voice.name}<small>${voice.id==='aiden'?'小熊伙伴':'小狐伙伴'}</small></span><span class="voice-tick" aria-hidden="true">✓</span></button>`).join('')}</div>`;}
function syncVoiceSelectors(){document.querySelectorAll('[data-voice]').forEach(button=>{const active=button.dataset.voice===selectedVoice;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});}
function bindVoiceSelectors(){document.querySelectorAll('[data-voice]').forEach(button=>button.onclick=()=>{if(recordPending||recording){toast('先结束录音，再来换伙伴吧。');return;}const next=normalizeVoice(button.dataset.voice);selectedVoice=next;syncVoiceSelectors();if(!saveVoicePreference(next))toast('音色已切换，但本机暂时无法保存偏好。');const l=session?sessionCurrent():lessonById(daily().newLessonId)||curriculum.lessons[0];if(session)revealHint(l);playLesson(l);});}
function playPrompt(name){if(recordPending||recording)return;stopPlayback();return queueAudio([{file:`audio/ui/${name}.mp3`,label:'正在听玩法提示'}]);}
function guideStage(){if(session&&['listen','choose'].includes(session.step))playLesson(sessionCurrent());}
function startNewLesson(){const p=daily();if(!p.newLessonId||p.newDone)return;session={ids:[p.newLessonId],index:0,newId:p.newLessonId,day:dayKey(),step:'listen',preview:false,choice:null,revealed:false};renderSession();guideStage();}
function startDaily(){
  const p=daily();const ids=[...(!p.newDone&&p.newLessonId?[p.newLessonId]:[]),...p.dueIds];
  if(!ids.length){toast('今天的练习已经完成，去生活里试一试吧。');return;}
  session={ids,index:0,newId:!p.newDone?p.newLessonId:null,day:dayKey(),step:p.newLessonId&&!p.newDone?'listen':'remember',preview:false,choice:null,revealed:false};renderSession();guideStage();
}
function startPreview(id){session={ids:[id],index:0,newId:null,day:dayKey(),step:'listen',preview:true,returnView:view,choice:null,revealed:false};renderSession();guideStage();window.scrollTo({top:0,behavior:'instant'});}
function startReview(){const ids=daily().dueIds;if(!ids.length){renderHome();return;}session={ids,index:0,newId:null,day:dayKey(),step:'remember',preview:false,choice:null,revealed:false};renderSession();guideStage();}
function startCheckup(){const plan=getCheckupPlan(state,curriculum.lessons,dayKey());if(!plan.due)return;session={ids:plan.ids,index:0,newId:null,day:dayKey(),step:'speak',preview:false,checkup:true,results:[],firstTryCorrect:null,choice:null,revealed:false};renderSession();}
function sessionCurrent(){return lessonById(session.ids[session.index]);}
function choiceOrder(l){
  session.choiceOrders??={};
  if(!session.choiceOrders[l.id]){
    const order=l.choices.map((_,i)=>i);
    for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    session.choiceOrders[l.id]=order;
  }
  return session.choiceOrders[l.id];
}
function revealHint(l){
  if(!session||!['remember','speak'].includes(session.step)||session.revealed)return;
  session.revealed=true;
  const area=document.querySelector('#answer-area');if(area)area.innerHTML=phraseMarkup(l);
  const reveal=document.querySelector('#reveal');if(reveal){reveal.insertAdjacentHTML('afterend',listeningButtons());reveal.remove();bindListeningButtons(l);}
  const recall=document.querySelector('.recall-box');if(recall)recall.innerHTML=phraseMarkup(l);
  if(session.checkup)document.querySelector('[data-rating="good"]')?.setAttribute('disabled','');
}
function bindListeningButtons(l){document.querySelectorAll('[data-listen]').forEach(b=>b.onclick=()=>{revealHint(l);playLesson(l,b.dataset.listen==='slow');});}
function renderSession(){
  if(!session)return;screenGeneration++;stopPlayback();resetRecording();recordedURL=null;recording=false;recordPending=false;
  session.rewardStart??=getGarden(state,session.day).earned;
  const l=sessionCurrent(),t=themeById(l.theme),isReview=l.id!==session.newId&&!session.preview;
  const label={listen:'先听一听',choose:'听音选一选',remember:'还记得怎么说吗？',speak:'轮到你开口啦'}[session.step];
  app.innerHTML=`<div class="practice-shell ${session.checkup?'is-checkup':''}"><header class="practice-header"><button class="circle-btn" id="exit-session" aria-label="退出练习">${icon('close')}</button><div class="practice-progress"><span>${session.preview?'自由练习 · 不改变复习计划':`${session.checkup?'记忆小游戏 · ':''}${session.index+1} / ${session.ids.length} 个短句`}</span><div class="progress-track"><i style="width:${(session.index+1)/session.ids.length*100}%"></i></div></div><button class="help-button" id="guide-audio" aria-label="听中文引导"><span aria-hidden="true">?</span> 听玩法</button></header>
  <main class="practice-main" data-lesson-id="${l.id}"><div class="practice-label"><span class="badge">${session.checkup?'每周记忆小游戏':session.preview?'短句小书':isReview?'🌿 复习老朋友':'✦ 认识新朋友'}</span><span>${session.checkup?'家长陪伴':esc(t.name)}</span></div><h1 class="practice-title">${label}</h1><p class="practice-scene">${session.checkup?(session.step==='choose'?'先听声音，再选一张图片。':'看图，试着自己说。'):esc(l.scene)}</p>${voiceButtons()}${audioStatusMarkup()}${session.step==='choose'?`<button class="listening-cue" data-listen="normal" aria-label="点击画面重听短句">${icon('speaker')}<span>点我再听一次</span></button>`:`<button class="scene-picture" data-listen="normal" data-audio-lesson="${l.id}" aria-label="${session.step==='remember'||session.checkup&&!session.revealed?'听提示：':'播放：'}${esc(l.chinese)}">${lessonIllustration(l.id)}<span class="picture-play">${icon('speaker')} ${session.step==='remember'||session.checkup&&!session.revealed?'想不起来？点图听提示':'点画面，听我说'}</span></button>`}${practiceBody(l)}<div class="practice-bottom"><span>${icon('heart')} ${session.preview?'随便听，随便说，不用记成绩。':'想不起来也没关系，我们一起再试一次。'}</span></div></main></div>`;
  document.querySelector('#exit-session').onclick=()=>{resetRecording();stopPlayback();session=null;render();};
  document.querySelector('#guide-audio').onclick=()=>playPrompt(({listen:'listen',choose:'choose',remember:'review',speak:session.checkup&&!session.revealed?'checkup':'speak'})[session.step]);
  bindListeningButtons(l);
  bindVoiceSelectors();
  document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{session.step=b.dataset.step;session.choice=null;renderSession();guideStage();});
  document.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>chooseAnswer(Number(b.dataset.choice)));
  document.querySelectorAll('[data-rating]').forEach(b=>b.onclick=()=>finishLesson(b.dataset.rating));
  document.querySelector('[data-checkup-next]')?.addEventListener('click',finishCheckupCard);
  document.querySelector('#reveal')?.addEventListener('click',()=>{revealHint(l);playLesson(l);});
  document.querySelector('#record')?.addEventListener('click',toggleRecording);
  document.querySelector('#replay-record')?.addEventListener('click',()=>{if(recordedURL){stopPlayback();queueAudio([{file:recordedURL,label:'正在听你自己的声音'}]);}});
  warmLessons([l.id,session.ids[session.index+1]||(session.preview?nextLessonId(l.id):null)]);
  window.scrollTo({top:0,behavior:'instant'});
}
function phraseMarkup(l){return `<p class="practice-english" lang="en">${esc(l.english)}</p><p class="practice-chinese">${esc(l.chinese)}</p>`;}
function listeningButtons(){return `<div class="listen-buttons"><button class="primary" data-listen="normal">${icon('speaker')} 听一听</button><button class="secondary" data-listen="slow">慢一点听</button></div><p class="small-note">先听完整句，难处慢听，再回到原速跟着说。</p>`;}
function practiceBody(l){
  if(session.step==='listen')return `<div class="phrase-box">${phraseMarkup(l)}</div>${listeningButtons()}<div class="action-note"><span>一起做一做</span><p>${esc(l.action)}</p></div><button class="primary next-button" data-step="choose">听过啦，来试试 ${icon('arrow')}</button>`;
  if(session.step==='remember')return `<div class="recall-box"><p class="practice-chinese">${esc(l.chinese)}</p><p>先看图，试着自己说出来。</p></div><button class="primary next-button" data-step="speak">我来说一说 ${icon('mic')}</button><button class="text-button centered" data-step="listen">还想不起来，听听提示</button>`;
  if(session.step==='choose')return `<div class="quiz-listen">${listeningButtons()}<p>听到的是哪张图？点一点。</p></div><div class="choices">${choiceOrder(l).map((choiceIndex,i)=>{const c=l.choices[choiceIndex],picture=curriculum.lessons.find(lesson=>lesson.chinese===c.label);return `<button class="choice" data-choice="${choiceIndex}" aria-label="${esc(c.label)}">${picture?lessonIllustration(picture.id):''}<strong>${esc(c.label)}</strong><i>${String.fromCharCode(65+i)}</i></button>`;}).join('')}</div><div id="quiz-feedback" class="quiz-feedback" aria-live="polite"></div><button id="quiz-next" class="primary next-button" ${session.checkup?'data-checkup-next':'data-step="speak"'} hidden>${session.checkup?'下一张图片':'轮到你说'} ${icon('arrow')}</button><p class="small-note">图片帮助理解；抽象礼貌用语请家长用动作和生活情境解释。</p>`;
  const hiddenAnswer=!session.revealed&&!session.preview&&(session.checkup||l.id!==session.newId);
  return `<div id="answer-area" class="phrase-box">${hiddenAnswer?(session.checkup?'<p class="soft-copy">看图，试着自己说。不着急。</p>':`<p class="practice-chinese">${esc(l.chinese)}</p><p class="soft-copy">想一想，你会怎么说？</p>`):phraseMarkup(l)}</div>${hiddenAnswer?'<button id="reveal" class="secondary centered">'+icon('speaker')+' 看答案，听提示</button>':listeningButtons()}<div class="record-box"><button id="record" class="record-button">${icon('mic')} <span>录下我的声音</span></button><button id="replay-record" class="secondary" disabled>${icon('replay')} 听听自己</button><p id="record-status">可选 · 最长 15 秒 · 只在本机临时回听</p></div>${session.checkup?'':`<div class="parent-prompt"><span>生活里试一试</span><p>${esc(l.action)}</p><small>${esc(l.parentTip)}</small></div>`}<div class="rating-label">${session.preview?'练习好了，就收下这份开心吧。':'请家长根据刚才的实际表现选择'}</div><div class="rating-buttons">${session.preview?'<button class="primary" data-rating="good">练习好了 ✓</button>':`<button data-rating="again"><span>🌱</span>还要练练</button><button data-rating="help"><span>🌿</span>提示后会说</button><button data-rating="good" ${session.checkup&&session.revealed?'disabled':''}><span>🌸</span>自己会说</button>`}</div><p class="small-note">${session.checkup?'听过提示的这一句，请选“提示后会说”或“还要练练”。':'不自动打分，也不评判口音。'}正确选图不等于会说，由家长观察开口表现。</p>`;
}
function chooseAnswer(index){
  const l=sessionCurrent(),right=index===l.answerIndex;
  if(session.firstTryCorrect===null||session.firstTryCorrect===undefined)session.firstTryCorrect=right;
  document.querySelectorAll('[data-choice]').forEach(b=>b.classList.toggle('try-again',Number(b.dataset.choice)===index&&!right));
  const f=document.querySelector('#quiz-feedback');f.innerHTML=right?`${icon('sprout')} 选对啦！接下来用自己的声音说一遍。`:`${icon('heart')} 再听一次，慢慢找，不着急。`;f.className='quiz-feedback '+(right?'correct':'gentle');
  if(right){document.querySelector(`[data-choice="${index}"]`).classList.add('correct');document.querySelector('#quiz-next').hidden=false;document.querySelectorAll('[data-choice]').forEach(b=>b.disabled=true);}else{playLesson(l);}
}
async function toggleRecording(){
  const b=document.querySelector('#record'),status=document.querySelector('#record-status');
  if(recordPending)return;
  if(recording){stopRecording();recording=false;b.classList.remove('recording');b.innerHTML=`${icon('mic')} <span>再录一次</span>`;return;}
  if(!recordingSupported()){status.textContent='这个浏览器暂不支持录音。直接开口说也可以完成练习。';return;}
  recordPending=true;b.disabled=true;stopPlayback();const active=session,generation=screenGeneration;
  try{await startRecording(url=>{
    if(session!==active||generation!==screenGeneration)return;
    recording=false;recordedURL=url;
    const record=document.querySelector('#record');if(!record)return;
    record.classList.remove('recording');record.innerHTML=`${icon('mic')} <span>再录一次</span>`;
    document.querySelector('#replay-record').disabled=!url;
    document.querySelector('#record-status').textContent=url?'录好啦，听听自己！离开这张卡后录音就会删除。':'没有录到声音，可以再试一次。';
  });if(session!==active||generation!==screenGeneration){resetRecording();return;}recording=true;b.classList.add('recording');b.innerHTML=`${icon('mic')} <span>停止录音</span>`;status.textContent='正在听你的声音…再点一次停止（最多 15 秒）';document.querySelector('#replay-record').disabled=true;
  }catch(e){if(e.name!=='AbortError'&&generation===screenGeneration)status.textContent=e.name==='NotAllowedError'?'没有开启麦克风。可以在浏览器中允许，也可以直接开口练习。':'麦克风暂时不可用，直接开口练习也很好。';}
  finally{if(generation===screenGeneration){recordPending=false;b.disabled=false;}}
}
function finishLesson(rating){
  if(session.preview){const next=session.returnView||'library';session=null;resetRecording();stopPlayback();view=next;location.hash=next;render();return;}
  if(dayKey()!==session.day){session=null;stopPlayback();resetRecording();render();toast('新的一天开始啦，已为你重新安排今天的练习。');return;}
  if(session.checkup){if(session.revealed&&rating==='good')return;session.spoken=rating;session.step='choose';renderSession();guideStage();return;}
  const l=sessionCurrent();
  try{state=recordResult(state,l.id,rating,session.day,{isNew:l.id===session.newId});}catch(e){toast(e.message);return;}
  if(storageOK)save();
  resetRecording();session.index++;
  if(session.index>=session.ids.length){renderCompletion();return;}
  session.step=session.ids[session.index]===session.newId?'listen':'remember';session.revealed=false;session.choice=null;renderSession();guideStage();
}
function finishCheckupCard(){
  if(!session?.checkup||session.firstTryCorrect===null)return;
  if(dayKey()!==session.day){session=null;stopPlayback();resetRecording();render();toast('新的一天开始啦，小游戏会重新安排。');return;}
  const results=[...session.results,{lessonId:sessionCurrent().id,meaning:session.firstTryCorrect,spoken:session.spoken}];
  if(results.length===session.ids.length){
    try{state=recordCheckup(state,curriculum.lessons,results,session.day);}catch(e){toast(e.message);return;}
    if(storageOK)save();const rewards=rewardMarkup(session);session=null;stopPlayback();resetRecording();
    shell(`<section class="completion checkup-completion"><div class="completion-flower">🌻</div><h1>记忆小游戏完成啦</h1><div class="checkup-scores"><div><strong>${results.filter(result=>result.meaning).length} / ${results.length}</strong><span>听懂并首次选对</span></div><div><strong>${results.filter(result=>result.spoken==='good').length} / ${results.length}</strong><span>独立说出 · 家长观察</span></div></div><p>还不熟悉的句子，会早点回来陪你练。<br>我们记录尝试，不自动评判发音或掌握程度。</p>${rewards}<button class="primary" data-go="garden">去花田种一种 ${icon('sprout')}</button><button class="text-button" data-go="home">回到今天 ${icon('home')}</button></section>`);return;
  }
  session.results=results;session.index++;session.step='speak';session.revealed=false;session.firstTryCorrect=null;session.spoken=null;renderSession();
}
function renderCompletion(){
  const count=session.ids.length,rewards=rewardMarkup(session);session=null;stopPlayback();resetRecording();
  shell(`<section class="completion"><span class="eyebrow">A LITTLE STEP, A LOVELY DAY</span><div class="completion-flower">🌻<span>✦</span><i>✦</i></div><h1>今天，又长大一点！</h1><p>和 ${count} 个英语短句见了面。<br>明天，小芽还在这里等你。</p>${rewards}<button class="primary" data-go="garden">去花田种一种 ${icon('sprout')}</button><button class="text-button centered" data-go="home">收好今天的小进步 ${icon('check')}</button><p class="small-note">愿意练习就有小奖励，不用每句都说对。</p></section>`);
}

function renderLibrary(){
  const filtered=curriculum.lessons.filter(l=>(libraryTheme==='all'||l.theme===libraryTheme)&&(!search||`${l.english} ${l.chinese}`.toLowerCase().includes(search.toLowerCase())));
  shell(`<section class="page-intro"><span class="eyebrow">MY LITTLE PHRASE BOOK</span><h1>短句小书</h1><p>好奇哪一句，就打开听听。自由练习不会改变每日复习计划。</p></section><div class="library-toolbar"><div class="theme-filters"><button data-filter="all" class="${libraryTheme==='all'?'selected':''}">全部短句</button>${curriculum.themes.map(t=>`<button data-filter="${esc(t.id)}" class="${libraryTheme===t.id?'selected':''}">${esc(t.icon)} ${esc(t.name)}</button>`).join('')}</div><label class="search-label"><span>找一句话</span><input id="phrase-search" type="search" placeholder="中文或英文都可以" value="${esc(search)}" maxlength="60"></label></div><p class="results-count">${filtered.length} 个短句 · ${stats().learnedCount} 个已学习</p><div class="phrase-grid">${filtered.map(l=>`<button class="phrase-tile" data-preview="${esc(l.id)}"><div class="tile-top"><span>${lessonIllustration(l.id)}</span><small>${state.cards[l.id]?'🌱 学过啦':esc(themeById(l.theme).name)}</small></div><strong lang="en">${esc(l.english)}</strong><span class="tile-translation">${esc(l.chinese)}</span><div class="tile-bottom"><span>听一听 · 说一说</span>${icon('arrow')}</div></button>`).join('')}</div>${!filtered.length?'<div class="empty-state">这次没有找到。换一个词试试吧。</div>':''}`);
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{libraryTheme=b.dataset.filter;renderLibrary();});
  document.querySelector('#phrase-search').oninput=e=>{const pos=e.target.selectionStart;search=e.target.value;renderLibrary();const input=document.querySelector('#phrase-search');input.focus();try{input.setSelectionRange(pos,pos);}catch{}};
  document.querySelectorAll('[data-preview]').forEach(b=>{
    b.onclick=()=>startPreview(b.dataset.preview);
    const warm=()=>warmLessons([b.dataset.preview]);
    b.addEventListener('pointerenter',warm);b.addEventListener('focus',warm);b.addEventListener('pointerdown',warm);
  });
  warmLessons(filtered.slice(0,2).map(l=>l.id));
}
function materialIcon(kind){const paths={seeds:'<ellipse cx="12" cy="13" rx="6" ry="9" transform="rotate(35 12 13)" fill="#c39b5b"/><path d="m8 18 8-11" stroke="#f4dfb0" stroke-width="2"/>',water:'<path d="M12 2S3 12 3 16a9 9 0 0 0 18 0c0-4-9-14-9-14Z" fill="#78b6cd"/><path d="M7 15q-1 5 4 5" stroke="#e5f5ed" fill="none" stroke-width="2"/>',fertilizer:'<path d="m7 3 3 5h4l3-5M8 8C0 22 3 23 12 23s12-1 4-15Z" fill="#b6c88c" stroke="#739260" stroke-width="1.5"/><path d="M12 19v-7m0 5q-6-1-5-5 5 0 5 5m0-2q1-5 5-5 0 4-5 5" fill="#739260"/>'};return `<svg class="material-icon" viewBox="0 0 24 26" aria-hidden="true">${paths[kind]}</svg>`;}
function materialInventory(values,reward=false){return `<div class="material-inventory ${reward?'is-reward':''}">${[['seeds','种子'],['water','水滴'],['fertilizer','肥料']].map(([kind,name])=>`<div data-material="${kind}" aria-label="${name} ${values[kind]}">${materialIcon(kind)}<strong>${reward?'+':''}${values[kind]}</strong><small>${name}</small></div>`).join('')}</div>`;}
function rewardMarkup(active){const earned=getGarden(state,active.day).earned,values=Object.fromEntries(['seeds','water','fertilizer'].map(kind=>[kind,Math.max(0,earned[kind]-(active.rewardStart?.[kind]||0))]));return Object.values(values).some(Boolean)?`<section class="earned-rewards"><h2>送给你的小花田</h2>${materialInventory(values,true)}</section>`:'';}
function plantDrawing(kind,growth){
 const plant=PLANTS.find(item=>item.id===kind)||PLANTS[0],color=plant.color;
 let flower='';
 if(growth===3){if(kind==='sunflower')flower=Array.from({length:9},(_,i)=>`<ellipse cx="75" cy="36" rx="9" ry="17" fill="${color}" transform="rotate(${i*40} 75 57)"/>`).join('')+'<circle cx="75" cy="57" r="16" fill="#94734d"/>';else if(kind==='tulip')flower=`<path d="M48 33 62 47 75 25 88 47 102 33v29q-27 27-54 0Z" fill="${color}"/>`;else if(kind==='strawberry')flower=`<path d="M49 48q25-13 51 0 5 29-25 46-31-19-26-46" fill="${color}"/><path d="m75 50-23-9 17-1 6-13 7 13 17 1Z" fill="#77a063"/>${[[-14,8],[0,15],[13,7],[-6,27],[8,29]].map(([x,y])=>`<ellipse cx="${75+x}" cy="${48+y}" rx="2" ry="3" fill="#f9e4aa"/>`).join('')}`;else flower=[[-16,0],[14,14],[-13,28]].map(([x,y])=>`<path d="M${75+x-10} ${34+y}q10-15 20 0l4 15q-14 6-28 0Z" fill="${color}"/>`).join('');}
 else if(growth===2)flower=`<ellipse cx="75" cy="57" rx="12" ry="19" fill="${color}"/><path d="m62 63 13 13 13-13" fill="#7d9f63"/>`;
 return `<svg class="garden-plant-picture" viewBox="0 0 150 165" aria-hidden="true"><ellipse cx="75" cy="145" rx="57" ry="12" fill="#d8c2a0"/>${growth<0?'<path d="M45 141h60m-41-5 6 14m18-14-6 14" stroke="#b59874" stroke-width="3"/>':growth===0?'<ellipse cx="75" cy="139" rx="9" ry="5" fill="#ab8454"/><path d="M74 137v-7q-13-13-16-4 2 7 16 4" fill="#8ca874"/>':`<path d="M75 142V${growth===1?'88':'59'}" stroke="#789561" stroke-width="6" fill="none"/><path d="M74 120q-37-3-33-29 29 1 33 29m2-13q32-6 31-29-28 3-31 29" fill="#8fb573"/>${growth===1?'<path d="M74 91q-20-20-5-27 13 6 5 27" fill="#92b779"/>':flower}`}</svg>`;
}
function nextPlant(garden){const active=new Set(garden.plots.filter(Boolean).map(plot=>plot.kind));return PLANTS.find(plant=>!active.has(plant.id)&&garden.collection.find(item=>item.kind===plant.id)?.count===0)?.id||PLANTS[(state.garden?.actions.filter(action=>action.type==='plant').length||0)%PLANTS.length].id;}
function gardenRewardTasks(garden){
 const today=dayKey(),plan=daily(),checkup=getCheckupPlan(state,curriculum.lessons,today),candidates=[];
 // Preview rewards through the same pure rules used by real completion; never award or save here.
 if(plan.newLessonId&&!plan.newDone)candidates.push({action:'practice',complete:()=>recordResult(state,plan.newLessonId,'again',today,{isNew:true})});
 if(plan.dueIds.length)candidates.push({action:'review',complete:()=>recordResult(state,plan.dueIds[0],'again',today)});
 if(checkup.due)candidates.push({action:'checkup',complete:()=>recordCheckup(state,curriculum.lessons,checkup.ids.map(lessonId=>({lessonId,meaning:false,spoken:'again'})),today)});
 return candidates.flatMap(task=>{try{const after=getGarden(task.complete(),today).inventory;return [{action:task.action,rewards:Object.fromEntries(['seeds','water','fertilizer'].map(kind=>[kind,after[kind]-garden.inventory[kind]]))}];}catch{return [];}});
}
function renderGarden(){
 const today=dayKey(),garden=getGarden(state,today),learned=stats().learnedCount,rewardTasks=gardenRewardTasks(garden);
 shell(`<section class="page-intro"><span class="eyebrow">OUR LITTLE GARDEN</span><h1>练一句，种一点快乐</h1><p>点花田上的大按钮就好。小花不会枯萎，明天再来照顾也没关系。</p></section>${materialInventory(garden.inventory)}<section class="garden-field"><div class="section-heading"><h2>我的三块小花田</h2><span>每天轻轻照顾一次</span></div><div class="garden-plots">${garden.plots.map((plot,index)=>{
  const rewardTask=rewardTasks.find(task=>!plot?task.rewards.seeds>0:(plot.lastWaterDate!==today&&task.rewards.water>0)||(plot.lastFertilizeDate!==today&&task.rewards.fertilizer>0));
  const action=!plot?(garden.inventory.seeds?'plant':rewardTask?.action||'wait'):plot.canHarvest?'harvest':plot.canFertilize?'fertilize':plot.canWater?'water':rewardTask?.action||'wait';
  const label={plant:'种下种子',water:'浇一点水',fertilize:'加点营养',harvest:'收进图鉴',practice:'去练一句',review:'去复习',checkup:'去玩小测',wait:plot?'明天再来':daily().newLessonId?'明天领种子':'小测再领种子'}[action];
  const plant=plot&&PLANTS.find(item=>item.id===plot.kind);
  return `<article class="garden-plot" data-plot="${index}"><h3>${plant?plant.name:'等一颗小种子'}</h3>${plantDrawing(plot?.kind,plot?.growth??-1)}<div class="growth-dots" aria-label="生长 ${plot?.growth??0} / 3">${[0,1,2,3].map(n=>`<i class="${plot&&n<=plot.growth?'grown':''}"></i>`).join('')}</div><button class="primary" data-garden-action="${action}" data-plot-index="${index}" ${action==='wait'?'disabled':''}>${['plant','water','fertilize'].includes(action)?materialIcon({plant:'seeds',water:'water',fertilize:'fertilizer'}[action]):icon(action==='harvest'||action==='checkup'?'book':action==='practice'?'speaker':action==='review'?'replay':'clock')}${label}</button></article>`;
 }).join('')}</div></section><section class="plant-collection"><div class="section-heading"><h2>小小植物图鉴</h2><span>${garden.collection.filter(item=>item.count>0).length} / 4 种已收集</span></div><div class="collection-grid">${garden.collection.map(item=>{const plant=PLANTS.find(p=>p.id===item.kind);return `<div class="collection-item ${item.count?'collected':''}" data-collection="${item.kind}">${plantDrawing(item.kind,3)}<strong>${plant.name}</strong><small>${item.count?'已收集 '+item.count+' 株':'等你种出来'}</small></div>`;}).join('')}</div></section><p class="small-note garden-reward-note">每天完成新句得 1 颗种子；有练习得 2 滴水，做过复习再得 1 滴水。完成记忆小游戏得种子和肥料各 1 份。累计见过 5、10、20、40、80、120 句时另送种子和肥料。只奖励尝试，不要求答全对；自由练习不会反复发材料。</p><div class="milestone-note">${garden.nextMilestone?`已经见过 ${learned} 句，再见过 ${garden.nextMilestone.remaining} 句，就有额外种子和肥料。`:'120 句小足迹已经集齐，生活里还可以继续用英语。'}</div>`);
 document.querySelectorAll('[data-garden-action]').forEach(button=>button.onclick=()=>{
  const type=button.dataset.gardenAction,plot=Number(button.dataset.plotIndex);if(type==='practice'){startDaily();return;}if(type==='review'){startReview();return;}if(type==='checkup'){startCheckup();return;}if(type==='wait')return;
  if(!storageOK){toast('请先在家长页备份原始记录，再恢复学习进度。');return;}
  try{state=recordGardenAction(state,{type,plot,...(type==='plant'?{kind:nextPlant(garden)}:{})},dayKey());save();renderGarden();document.querySelector(`[data-plot="${plot}"]`).classList.add('garden-celebrate');toast({plant:'种下啦！小种子住进花田了。',water:'喝到水啦，又长大一点！',fertilize:'营养收到了，小花长大啦！',harvest:'收好啦！图鉴里多了一株植物。'}[type]);}catch(error){toast(error.message);}
 });
}
function renderParent(){
  shell(`<section class="page-intro"><span class="eyebrow">A LITTLE HELP FROM GROWN-UPS</span><h1>陪孩子，慢慢说</h1><p>不用上课一样认真。每天留一点时间，让一句英语走进生活。</p></section><div class="parent-grid"><section class="settings-card"><h2>我们的练习习惯</h2><label class="field">孩子的小昵称<input id="nickname" value="${esc(state.settings.nickname)}" maxlength="32" autocomplete="off"><small>最多 16 个字符，仅保存在这台设备，不需要真实姓名。</small></label><label class="field">每天最多复习几句<select id="daily-reviews">${Array.from({length:10},(_,i)=>i+1).map(n=>`<option value="${n}" ${state.settings.dailyReviews===n?'selected':''}>${n} 句${n===5?'（默认）':''}</option>`).join('')}</select><small>每天 1 个新短句，旧短句少量复习。累了就休息。</small></label><div class="field"><span>点名字，换一个伙伴</span>${voiceButtons()}${audioStatusMarkup()}<small>两位伙伴各有完整 120 句。点名字马上试听，偏好自动保存在这台设备。</small></div><div class="avatar-settings"><span data-user-avatar>${avatarMarkup()}</span><button class="secondary" data-edit-avatar>换动物头像 / 自拍</button><small>照片只留在这台设备，不随学习进度备份。</small></div><button class="primary" id="save-settings">保存设置 ${icon('check')}</button></section>
  <section class="settings-card"><h2>把小芽放进口袋</h2><p>手机和电脑打开同一个网址即可使用。iPhone：Safari 分享 → 添加到主屏幕；Android：浏览器菜单 → 安装应用 / 添加到主屏幕。</p><button class="secondary" id="install-app">${icon('download')} 添加到主屏幕</button><hr><h3>下载离线声音</h3><p>Aiden 和 Ryan 两套各 120 句，共 240 段英文示范，另有 11 段可手动点播的中文帮助。进入课程直接听英文。一次保存后，两种声音都能离线练习。</p><button class="primary" id="offline-audio" ${offlineBusy?'disabled':''}>${icon('download')} ${offlineBusy?'正在保存声音…':'保存全部离线声音'}</button><p id="offline-status" class="small-note" aria-live="polite">正在检查本机离线内容…</p>${waitingSW?'<button class="secondary" id="update-app">新版本已准备好，重新打开</button>':''}</section>
  <section class="settings-card"><h2>进度备份与换设备</h2><p><strong>手机和电脑的进度分别保存在各自浏览器，不会自动同步。</strong>在旧设备导出，再把文件传到新设备导入即可。清理浏览器数据或卸载可能清除进度，请定期备份。</p><div class="button-row"><button class="secondary" id="export-progress">${icon('download')} 导出进度</button><button class="secondary" id="import-progress">导入进度</button></div><input id="import-file" type="file" accept="application/json,.json" hidden><p id="import-status" class="small-note" aria-live="polite"></p>${!storageOK?'<button class="secondary" id="export-raw">导出原始记录</button>':''}</section>
  <section class="settings-card"><h2>怎样陪伴更有效</h2><ol class="parent-tips"><li><strong>听懂场景。</strong>先听示范，做动作、指物品，不要求识字。</li><li><strong>留出回想。</strong>复习时等几秒再提示，帮孩子找回这句话。</li><li><strong>一起开口。</strong>录音可选，只用于回听；不做自动评分。</li><li><strong>生活里再用。</strong>喝水、出门、玩玩具时，自然地说一次。</li></ol><p class="small-note">“自己会说”由亲子观察填写，不等于语音识别判定。正确选择图片也不等于会说。4—7 岁建议家长陪伴。</p></section>
  <section class="settings-card wide"><h2>关于英语小芽</h2><p>内置 120 个生活短句 · 无广告 · 无付费 API · 无账户 · 无录音上传。示范音频为本地合成语音，不是真人录音。录音离开练习卡即删除。</p><p>间隔复习结合主动回想，有助于安排练习；本工具不保证特定学习效果，也不能替代真实交流。完成全部新句后，已有短句仍会继续复习。</p><div class="button-row"><a class="text-button" href="https://www.learningscientists.org/blog/2022/2/3-1" target="_blank" rel="noopener noreferrer">家长阅读：幼儿的间隔回想研究 ↗</a><button class="text-button danger" id="reset-progress">重新开始学习</button></div><p class="small-note">v1.2.1 · 静态网页应用。网站托管方会收到正常访问请求；学习进度、头像照片和录音不发送给我们。</p></section></div>`);
  const lastCheckup=Object.entries(state.checkups||{}).sort(([a],[b])=>b.localeCompare(a))[0];
  if(lastCheckup){const [date,results]=lastCheckup;document.querySelector('.parent-grid').insertAdjacentHTML('beforeend',`<section class="settings-card"><h2>最近一次记忆小游戏</h2><p>${date} · ${results.length} 句</p><p>听懂并首次选对 ${results.filter(result=>result.meaning).length} / ${results.length}<br>独立说出 ${results.filter(result=>result.spoken==='good').length} / ${results.length}</p><small>先看图主动回忆，再听音选图。开口由家长观察，不是自动发音评分。</small></section>`);}
  bindVoiceSelectors();
  const nickname=document.querySelector('#nickname');
  warmLessons([daily().newLessonId||curriculum.lessons[0].id]);
  const limitNickname=()=>{const characters=[...nickname.value];if(characters.length>16)nickname.value=characters.slice(0,16).join('');};
  nickname.addEventListener('input',event=>{if(!event.isComposing)limitNickname();});
  nickname.addEventListener('compositionend',limitNickname);
  document.querySelector('#save-settings').onclick=()=>{if(!storageOK){toast('请先备份原始记录，再导入有效备份或重新开始。');return;}state.settings.nickname=[...nickname.value.trim()].slice(0,16).join('')||'小芽';state.settings.dailyReviews=Number(document.querySelector('#daily-reviews').value);if(save())toast('保存好啦，按自己的节奏来。');};
  document.querySelector('#install-app').onclick=async()=>{if(installEvent){await installEvent.prompt();installEvent=null;}else toast('iPhone 用 Safari 的“分享”，Android 用浏览器菜单，选择“添加到主屏幕”。');};
  const install=document.querySelector('#install-app');
  install.insertAdjacentHTML('afterend',`<div class="phone-share"><img src="./icons/phone-qr.png" width="112" height="112" alt="手机扫码打开英语小芽"><div><strong>换到手机，接着练</strong><p>扫码或复制网址，在手机浏览器打开。进度可通过备份转移。</p><button class="text-button" id="copy-link">复制手机网址 ${icon('arrow')}</button></div></div>`);
  document.querySelector('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(PUBLISHED_URL);toast('网址已复制，可以发到手机打开。');}catch{toast(PUBLISHED_URL);}};
  document.querySelector('#offline-audio').onclick=downloadOffline;
  const files=englishAudioFiles(curriculum.lessons);
  const offlineStatus=document.querySelector('#offline-status'),downloadGeneration=offlineDownloadGeneration;
  if(offlineBusy)offlineStatus.textContent='正在保存离线声音，请稍候…';
  else cachedAudioCount(files).then(n=>{if(offlineStatus.isConnected&&downloadGeneration===offlineDownloadGeneration)offlineStatus.textContent=`本机已保存 ${n} / ${files.length} 段英文示范（两套各 120 句）${n===files.length?' · 可离线播放':''}。浏览器清理缓存后需重新保存。`;}).catch(()=>{});
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
  offlineBusy=true;offlineDownloadGeneration++;const button=document.querySelector('#offline-audio');button.disabled=true;
  const update=t=>{const el=document.querySelector('#offline-status');if(el)el.textContent=t;};
  try{
    await Promise.race([navigator.serviceWorker.ready,new Promise((_,rej)=>setTimeout(()=>rej(new Error('离线服务尚未准备好，请联网刷新后再试。')),12000))]);
    const ui=UI_PROMPTS.map(n=>`audio/ui/${n}.mp3`);
    await cacheAllAudio([...englishAudioFiles(curriculum.lessons),...ui],(n,total)=>update(`正在保存声音 ${n} / ${total}，请保持页面打开…`));
    if(navigator.storage?.persist)await navigator.storage.persist().catch(()=>false);
    update('两套示范与中文引导共 251 段声音已保存，可以离线练习。清理浏览器数据后需重新下载。');toast('离线小书准备好了！');
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
window.addEventListener('hashchange',()=>{const v=location.hash.slice(1);if(['home','library','garden','parent'].includes(v)&&v!==view){resetRecording();stopPlayback();session=null;view=v;render();}});
window.addEventListener('online',()=>{if(!session)render();});window.addEventListener('offline',()=>{if(!session)render();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopPlayback();if(recording)stopRecording();}else if(!session)render();});
window.addEventListener('pagehide',()=>{stopPlayback();resetRecording();});
window.addEventListener('storage',e=>{if(e.key===AVATAR_STORAGE_KEY){document.querySelectorAll('[data-user-avatar]').forEach(el=>el.innerHTML=avatarMarkup());return;}if(e.key===VOICE_STORAGE_KEY){stopPlayback();selectedVoice=readVoicePreference();syncVoiceSelectors();return;}if(e.key===KEY){stopPlayback();if(session){toast('另一个页面更新了进度，请退出本轮再继续。');session=null;resetRecording();}state=load();render();}});
async function init(){
  try{const response=await fetch('./data/curriculum.json');if(!response.ok)throw new Error('课程读取失败');curriculum=await response.json();state=load();view=['library','garden','parent'].includes(location.hash.slice(1))?location.hash.slice(1):'home';render();
    if('serviceWorker' in navigator&&window.isSecureContext){navigator.serviceWorker.register('./sw.js').then(reg=>{if(reg.waiting)waitingSW=reg.waiting;reg.addEventListener('updatefound',()=>{const w=reg.installing;w?.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller){waitingSW=w;toast('小芽有新版本啦，可在家长页更新。');}});});}).catch(()=>toast('离线功能暂未准备好，联网练习仍可使用。'));}
  }catch{app.innerHTML='<div class="boot"><span>🌱</span><h1>小芽还没准备好</h1><p>请检查网络，重新打开。如果尚未下载离线内容，需要先联网一次。</p><button class="primary" id="retry">重新打开</button></div>';document.querySelector('#retry').onclick=()=>location.reload();}
}
installInteractionFeedback();
init();
