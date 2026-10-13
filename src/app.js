import {createState,dayKey,getDailyPlan,recordResult,getStats,validateImport,getCheckupPlan,recordCheckup} from './learning.js';
import {playFile,stopAudio,preloadAudio,isAudioLoading,setPlaybackRate,startRecording,stopRecording,clearRecording,recordingSupported,cacheAllAudio,cachedAudioCount} from './media.js';
import {VOICE_STORAGE_KEY,VOICES,UI_PROMPTS,normalizeVoice,readVoicePreference,saveVoicePreference,voiceAudioPath,englishAudioFiles,COURSE_RATE_KEY,PLAYBACK_RATES,PLAYBACK_RATE_LABELS,readCourseRate,saveCourseRate} from './voices.js';
import {lessonIllustration} from './illustrations.js';
import {getGarden,recordGardenAction,recordGardenPractice,PLANTS} from './garden.js';
import {plantDrawing,gardenToolArt} from './garden-art.js';
import {bindGardenInteraction} from './garden-interaction.js';
import {gardenWorldMarkup,bindGardenWorld} from './garden-canvas.js';
import {prepareSpeech,assessRecording} from './speech-local.js';
import {avatarMarkup,openAvatarPicker,AVATAR_STORAGE_KEY} from './avatars.js';
import {installInteractionFeedback} from './feedback.js';
import {installChildFeedback,celebrate,stopChildFeedback} from './child-feedback.js';
import {openVoiceAudition} from './voice-audition.js';
import {getTodayJourney} from './journey.js';
import {getAdventure} from './adventure.js';
import {rankButton,walletMarkup,questSteps,treasureMarkup,openAdventurePassport,showWaterReward,closeWaterReward} from './adventure-ui.js';
import {startAutomaticUpdates} from './auto-update.js';
import {SKIN_STORAGE_KEY,getSkinProgress} from './skins.js';
import {applySavedSkin,skinEntryMarkup,skinRewardMarkup,openSkinPicker,closeSkinPicker} from './skin-picker.js';
import {loadCurriculum,installViewportFallback} from './startup.js';
import {showDialog} from './dialog.js';

const KEY='english-sprout-state-v1';
const APP_BUILD=document.querySelector('meta[name="app-build"]')?.content||'';
const rawVersion=document.querySelector('meta[name="app-version"]')?.content||'';
const APP_VERSION=/^\d+\.\d+\.\d+$/.test(rawVersion)?rawVersion:'开发版';
let releaseState='checking';
const PUBLISHED_URL='https://jamstrak.github.io/english-sprout/';
const app=document.querySelector('#app');
let curriculum,state,view='home',session=null,libraryTheme='all',search='',recording=false,recordPending=false,recordedURL=null,toastTimer,offlineBusy=false,offlineDownloadGeneration=0,installEvent,screenGeneration=0;
let storageOK=true;
let libraryPage=0,libraryMode='themes',searchOpen=false,parentPanel='menu',gardenPlot=0,gardenView='world';
let soundDialog=null;
let selectedVoice=readVoicePreference();
let selectedRate=readCourseRate(),activeCourseAudio=null;
let audioSequence=Promise.resolve(),audioGeneration=0;
let audioWaitTimer;
let bootPending=null,bootReady=false,bootFailure=null;
let gardenCleanup=null,speechAttempt=null,gardenPracticeCursor=0,recordAttemptGeneration=0;
let gameSnapshot=null;
function gameView(){const today=dayKey();if(gameSnapshot?.state===state&&gameSnapshot.today===today)return gameSnapshot;const garden=getGarden(state,today);gameSnapshot={state,today,garden,adventure:getAdventure(state,curriculum.lessons,today,garden)};return gameSnapshot;}
const adventureForToday=()=>gameView().adventure;
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
function save(){gameSnapshot=null;try{localStorage.setItem(KEY,JSON.stringify(state));return true;}catch{storageWarning('浏览器未能保存进度。请在家长页导出备份，再检查存储空间或浏览器设置。');return false;}}
function load(){
  const fresh=createState(dayKey());
  try{const raw=localStorage.getItem(KEY);return raw?validateImport(JSON.parse(raw),curriculum.lessons):fresh;}
  catch{storageWarning('原有记录暂时无法读取。为保护它，本次不会自动覆盖；请先到家长页导出原始记录。');return fresh;}
}
function resetRecording(){recordAttemptGeneration++;speechAttempt?.abort();speechAttempt=null;clearRecording();recordedURL=null;recording=false;recordPending=false;}
const daily=()=>getDailyPlan(state,curriculum.lessons,dayKey());
const stats=()=>getStats(state,curriculum.lessons,dayKey());
function warmLessons(ids){
  const voices=[selectedVoice,...VOICES.map(v=>v.id).filter(id=>id!==selectedVoice)];
  const lessons=[...new Set(ids.filter(Boolean))].slice(0,3).map(lessonById).filter(Boolean);
  const current=lessons[0];
  if(!current)return;
  const files=[...voices.map(voice=>voiceAudioPath(current.audio,voice)),...lessons.slice(1).map(lesson=>voiceAudioPath(lesson.audio,selectedVoice)),...lessons.slice(1).flatMap(lesson=>voices.filter(voice=>voice!==selectedVoice).map(voice=>voiceAudioPath(lesson.audio,voice)))];
  preloadAudio(files.slice(0,6));
}
function nextLessonId(id){return curriculum.lessons[curriculum.lessons.findIndex(l=>l.id===id)+1]?.id;}
function dateLabel(){return new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date());}
function completeToday(p){return (!p.newLessonId||p.newDone)&&p.dueIds.length===0;}

function shell(content){
  gardenCleanup?.();gardenCleanup=null;
  applySavedSkin(state,dayKey());
  document.body.dataset.screen=view;
  const adventure=view==='parent'?null:adventureForToday();
  app.innerHTML=`<header class="header"><a href="#home" class="brand" aria-label="英语小芽首页"><img src="./icons/icon.svg" alt="" width="36" height="36"><span class="brand-copy"><strong>英语小芽</strong>${versionBadge()}</span></a><div class="header-actions">${view==='parent'?'':rankButton(adventure)}<button id="avatar-open" class="profile-button" aria-label="换我的动物头像"><span data-user-avatar>${avatarMarkup()}</span></button><button class="parent-link ${view==='parent'?'active':''}" data-go="parent" aria-label="家长陪伴">${icon('gear')}<span>家长</span></button></div></header><main id="main" tabindex="-1">${content}</main><nav class="bottom-nav" aria-label="主要导航">${navItems()}</nav>`;
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
  bindAvatar();bindSoundSettings();bindSkins();
  document.querySelector('[data-adventure-passport]')?.addEventListener('click',()=>{stopPlayback();openAdventurePassport(adventure,avatarMarkup());});
}
function versionBadge(){const label={preparing:' · 新版准备中',waiting:' · 稍后自动更新',offline:' · 离线可用'}[releaseState]||'';return `<small data-app-version data-build="${esc(APP_BUILD)}">v${esc(APP_VERSION)}${label}</small>`;}
function syncReleaseState(value){releaseState=value.state;for(const node of document.querySelectorAll('[data-app-version]')){const temp=document.createElement('span');temp.innerHTML=versionBadge();node.textContent=temp.firstChild.textContent;}}
function bindSkins(){document.querySelectorAll('[data-open-skins]').forEach(button=>button.onclick=()=>{stopPlayback();openSkinPicker({getState:()=>state,today:dayKey,notify:toast,initialId:button.dataset.openSkins||undefined});});}
function bindAvatar(){document.querySelectorAll('#avatar-open,[data-edit-avatar]').forEach(button=>button.onclick=()=>{stopPlayback();openAvatarPicker({notify:toast,onSave:()=>document.querySelectorAll('[data-user-avatar]').forEach(el=>el.innerHTML=avatarMarkup())});});}
function voiceAuditionEntry(){return `<button class="voice-audition-entry" data-voice-audition><span aria-hidden="true">🎭</span><span><strong>配音对照试听</strong><small>Pip 已加入整本小书 · 保留其他伙伴的样音对照</small></span>${icon('speaker')}</button>`;}
function bindVoiceAudition(){document.querySelectorAll('[data-voice-audition]').forEach(button=>button.onclick=()=>{stopPlayback();openVoiceAudition();});}
function navItems(){return [['home','🧭','今日冒险'],['library','🎈','短句广场'],['garden','🌷','我的花园']].map(([id,symbol,label])=>`<button data-go="${id}" class="${view===id?'active':''}" ${view===id?'aria-current="page"':''}><span class="nav-world-icon" aria-hidden="true">${symbol}</span><span>${label}</span></button>`).join('');}
function navigate(next){closeWaterReward();closeSkinPicker();closeSoundSettings();stopPlayback();resetRecording();session=null;view=next;if(next==='parent')parentPanel='menu';location.hash=next;render();window.scrollTo({top:0,behavior:'instant'});}
function render(){if(view==='home')renderHome();else if(view==='library')renderLibrary();else if(view==='garden')renderGarden();else if(view==='parent')renderParent();else renderHome();}
const journey=()=>getTodayJourney(state,curriculum.lessons,dayKey());
function journeyCopy(j){return {
  review:{badge:'今天先复习',title:'老朋友，还记得吗？',sub:`${j.count} 句到了回想的时间`,button:`一起复习 ${j.count} 句`,symbol:'🌿'},
  learn:{badge:'今天的新发现',title:'今天，一起学一句',sub:'听一听、找图片，再跟读点亮星星',button:'学今天这句',symbol:'🌱'},
  checkup:{badge:'今天的记忆小游戏',title:'看看自己还记得多少',sub:'先看图自己说，再听音找图片',button:'开始记忆小游戏',symbol:'🧩'},
  garden:{badge:'今天的练习完成啦',title:'去花园看看新变化',sub:'已经很棒啦，收下今天的小快乐',button:'去照顾我的花园',symbol:'🌻'}
}[j.kind];}
function startJourney(){const j=journey();if(j.kind==='review')startReview();else if(j.kind==='learn')startNewLesson();else if(j.kind==='checkup')startCheckup();else navigate('garden');}
function renderHome(){
  const j=journey(),l=lessonById(j.lessonId),p=daily(),adventure=adventureForToday(),q=adventure.quest;
  const title=j.kind==='learn'&&p.newCount?'再发现一句新魔法':q.title;
  const button=j.kind==='learn'&&p.newCount?'再学一句':q.button;
  shell(`<section class="focus-screen focus-home adventure-home" data-next-kind="${j.kind}"><div class="focus-heading"><span class="badge">${q.symbol} ${j.kind==='review'?'今天先复习':j.kind==='garden'?'今天的任务完成啦':'小芽花园 · 今日冒险'}</span><h1>${esc(title)}</h1><p class="focus-sub">${j.kind==='garden'?dailyLimitCopy(p):esc(q.hint)}</p></div><button class="focus-scene adventure-map" id="daily-picture" aria-label="${esc(button)}"><img class="adventure-background" src="./illustrations/adventure-world.webp" alt="" draggable="false">${walletMarkup(adventure)}<span class="adventure-portal">${l?lessonIllustration(l.id):'<img src="./illustrations/garden.svg" alt="">'}<span class="portal-play" aria-hidden="true">▶</span></span><span class="adventure-companion"><span data-user-avatar>${avatarMarkup()}</span><span class="companion-bubble">${j.kind==='garden'?'去种花吧！':'一起出发！'}</span></span><span class="map-sign" aria-hidden="true">${q.symbol} ${j.kind==='review'?'回忆小径':j.kind==='learn'?'新发现小屋':j.kind==='checkup'?'记忆寻宝':'花园乐园'}</span><span class="picture-play">${icon(j.kind==='garden'?'sprout':'arrow')} 点画面，开始冒险</span></button><div class="focus-caption">${j.kind==='learn'?`<strong lang="en">${esc(l.english)}</strong><span>${esc(l.chinese)}</span>`:j.kind==='review'?`<strong>${esc(l.chinese)}</strong><span>看图想一想，再来开口说</span>`:j.kind==='checkup'?'<strong>找回藏在记忆里的朋友</strong>':`<strong>${esc(adventure.nextGoal.title)}</strong>`}</div><div class="focus-action"><button class="primary" id="hero-start"><span aria-hidden="true">${q.symbol}</span> ${esc(button)} ${icon('arrow')}</button></div><div class="journey-trail adventure-trail" aria-label="今天的顺序"><span class="${j.kind==='review'?'current':!p.dueIds.length?'finished':''}"><i>🌿</i> 先复习</span><b aria-hidden="true">···</b><span class="${j.kind==='learn'?'current':p.newDone?'finished':''}"><i>✨</i> 新句 ${p.newCount}/${p.newLimit}</span><b aria-hidden="true">···</b><span class="${j.kind==='garden'?'current':''}"><i>🌷</i> 去种花</span></div><div class="screen-tools">${soundSettingsButton()}<button class="text-button" id="repeat-today" data-home-speech>🎤 跟读得水</button></div></section>`);
  document.querySelector('#hero-start').onclick=startJourney;document.querySelector('#daily-picture').onclick=startJourney;
  document.querySelector('[data-home-speech]').onclick=()=>stats().learnedCount?startGardenPractice(state.cards[p.newLessonId]?p.newLessonId:undefined):startNewLesson();
  warmLessons([j.lessonId,p.newLessonId,...p.dueIds.slice(0,1)]);
}
function soundSettingsButton(){const voice=VOICES.find(v=>v.id===selectedVoice);return `<button class="sound-settings" data-sound-settings aria-label="选择声音伙伴和语速">${voice.icon} ${voice.name} · ${selectedRate}× <span>换伙伴 / 语速</span></button>`;}
function bindSoundSettings(){document.querySelectorAll('[data-sound-settings]').forEach(b=>b.onclick=openSoundSettings);}
function syncSoundSettings(){const voice=VOICES.find(v=>v.id===selectedVoice);document.querySelectorAll('[data-sound-settings]').forEach(b=>b.innerHTML=`${voice.icon} ${voice.name} · ${selectedRate}× <span>换伙伴 / 语速</span>`);}
function closeSoundSettings(){soundDialog?.close();}
function openSoundSettings(){
  if(soundDialog?.isConnected)return;
  const prior=document.activeElement,d=document.createElement('dialog');d.className='sound-dialog focus-dialog';d.setAttribute('aria-labelledby','sound-title');
  d.innerHTML=`<header><div><span class="eyebrow">一起说英语</span><h2 id="sound-title">让谁陪你说？</h2></div><button class="circle-btn" data-close-sound aria-label="回到练习">${icon('close')}</button></header>${voiceButtons()}${courseRateButtons()}${audioStatusMarkup()}${session?'<button class="secondary" data-listen="slow">这一次，慢慢听 0.8×</button>':''}<p class="small-note">点名字就能试听；播放中也能直接换语速。</p><button class="primary" data-sound-done>选好啦，继续</button>`;
  document.body.append(d);soundDialog=d;showDialog(d);const plan=journey();bindVoiceSelectors(plan.kind==='checkup'?curriculum.lessons.find(l=>!plan.ids.includes(l.id)):lessonById(plan.lessonId)||lessonById(daily().newLessonId));
  if(session)bindListeningButtons(sessionCurrent());
  d.querySelector('[data-close-sound]').onclick=()=>d.close();d.querySelector('[data-sound-done]').onclick=()=>d.close();
  d.addEventListener('close',()=>{d.remove();soundDialog=null;if(prior?.isConnected)prior.focus();},{once:true});
}
function audioStatusMarkup(){return '<div class="audio-status" data-audio-state="idle" role="status" aria-live="polite"><span class="sound-waves" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="audio-status-copy">点名字换声音，点画面听一听</span></div>';}
function showAudioState(next,label='',lessonId=null){
  document.querySelectorAll('[data-sound-settings]').forEach(el=>{el.classList.toggle('is-playing',next==='playing'&&!!lessonId);const copy=el.querySelector('span');if(copy)copy.textContent=next==='playing'&&lessonId?'正在说 · 换伙伴 / 语速':next==='loading'?'声音马上来啦…':'换伙伴 / 语速';});
  clearTimeout(audioWaitTimer);
  document.body.dataset.playing=next;
  document.querySelectorAll('.audio-status').forEach(el=>{el.dataset.audioState=next;el.querySelector('.audio-status-copy').textContent=next==='loading'?'声音马上来啦…':next==='playing'?label:next==='error'?'声音没打开，点一下再试试':label?'听完啦，再点一次还可以听':'点名字换声音，点画面听一听';});
  document.querySelectorAll('[data-audio-lesson],.scene-picture,.listening-cue,[data-listen],#preview-audio').forEach(el=>{const active=next==='playing'&&!!lessonId&&(!el.hasAttribute('data-audio-lesson')||el.dataset.audioLesson===lessonId);el.classList.toggle('is-playing',active);el.dataset.audioState=active?'playing':next==='loading'?'loading':'idle';});
  document.querySelectorAll('[data-voice]').forEach(el=>el.classList.toggle('voice-speaking',next==='playing'&&el.dataset.voice===selectedVoice&&!!lessonId));
  if(next==='loading')audioWaitTimer=setTimeout(()=>{document.querySelectorAll('.audio-status[data-audio-state="loading"] .audio-status-copy').forEach(el=>el.textContent='正在把声音接过来，等一下就好，不用再点哦');},2500);
}
function stopPlayback(){stopChildFeedback();audioGeneration++;activeCourseAudio=null;stopAudio();audioSequence=Promise.resolve();showAudioState('idle');}
function queueAudio(items){
  const generation=audioGeneration;
  audioSequence=audioSequence.catch(()=>{}).then(async()=>{
    for(const item of items){
      if(generation!==audioGeneration)return;
      const rate=item.lessonId?(item.temporarySlow?.8:selectedRate):1;
      const current=item.lessonId?{...item,rate}:null;
      activeCourseAudio=current;
      const audio=await playFile(item.file,rate,status=>{
        if(generation!==audioGeneration)return;
        const label=current?courseAudioLabel(current):item.label||'正在听你的声音';
        showAudioState(status,label,item.lessonId);
        if(['idle','error'].includes(status)&&activeCourseAudio===current)activeCourseAudio=null;
      });
      if(!audio||generation!==audioGeneration)return;
      if(!audio.ended)await new Promise(resolve=>{const done=()=>{audio.removeEventListener('ended',done);audio.removeEventListener('pause',done);audio.removeEventListener('error',done);resolve();};audio.addEventListener('ended',done);audio.addEventListener('pause',done);audio.addEventListener('error',done);});
    }
  }).catch(()=>{if(generation===audioGeneration){showAudioState('error');toast('声音暂时没有打开，请联网保存离线声音后再试。');}});
  return audioSequence;
}
function courseAudioLabel(item){return `${VOICES.find(voice=>voice.id===item.voice)?.name||'伙伴'} ${item.temporarySlow?'临时慢听 0.8×':`${item.rate}× 正在说`} · ${item.english}`;}
function playLesson(l,slow=false){if(!l)return;if(recordPending||recording){toast('先结束录音，再来听示范吧。');return;}const file=voiceAudioPath(l.audio,selectedVoice),rate=slow?.8:selectedRate;if(isAudioLoading(file,rate))return audioSequence;stopPlayback();return queueAudio([{file,temporarySlow:slow,lessonId:l.id,voice:selectedVoice,english:l.english}]);}
function voiceButtons(){return `<div class="voice-buttons" role="group" aria-label="选择示范声音">${VOICES.map(voice=>`<button class="voice-button ${selectedVoice===voice.id?'selected':''}" data-voice="${voice.id}" aria-pressed="${selectedVoice===voice.id}" aria-label="${voice.name} ${voice.nickname}"><span class="voice-face" aria-hidden="true">${voice.icon}</span><span>${voice.name}<small>${voice.nickname}</small></span><span class="voice-tick" aria-hidden="true">✓</span></button>`).join('')}</div>`;}
function courseRateButtons(){return `<div class="course-speed"><div class="course-rate-buttons" role="group" aria-label="示范语速">${PLAYBACK_RATES.map(rate=>`<button type="button" data-course-rate="${rate}" aria-pressed="${rate===selectedRate}" aria-label="${rate}倍速，${PLAYBACK_RATE_LABELS[rate]}"><strong>${rate}×</strong><span>${PLAYBACK_RATE_LABELS[rate]}</span></button>`).join('')}</div><p class="course-rate-note" data-course-rate-note role="status" aria-live="polite">${selectedRate}× ${PLAYBACK_RATE_LABELS[selectedRate]} · 点一下换语速</p></div>`;}
function syncCourseRates(){syncSoundSettings();document.querySelectorAll('[data-course-rate]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.courseRate)===selectedRate)));}
function applyCourseRate(rate,persist=true){
  selectedRate=rate;const saved=!persist||saveCourseRate(rate);
  let applied=false;
  if(activeCourseAudio){applied=setPlaybackRate(rate,activeCourseAudio.file);if(applied){activeCourseAudio.rate=rate;activeCourseAudio.temporarySlow=false;showAudioState(document.body.dataset.playing,courseAudioLabel(activeCourseAudio),activeCourseAudio.lessonId);}}
  syncCourseRates();
  document.querySelectorAll('[data-course-rate-note]').forEach(note=>note.textContent=`${rate}× ${PLAYBACK_RATE_LABELS[rate]} · ${applied?'已即时切换，音调不变':'已选好，下次听示范就用这个语速'}${saved?'':'；本机暂时无法记住语速'}`);
}
function bindCourseRates(){document.querySelectorAll('[data-course-rate]').forEach(button=>button.onclick=()=>applyCourseRate(Number(button.dataset.courseRate)));}
function syncVoiceSelectors(){syncSoundSettings();document.querySelectorAll('[data-voice]').forEach(button=>{const active=button.dataset.voice===selectedVoice;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});}
function bindVoiceSelectors(previewLesson=null){document.querySelectorAll('.voice-buttons').forEach(group=>{if(!group.parentElement.querySelector('.course-speed'))group.insertAdjacentHTML('afterend',courseRateButtons());});bindCourseRates();document.querySelectorAll('[data-voice]').forEach(button=>button.onclick=()=>{if(recordPending||recording){toast('先结束录音，再来换伙伴吧。');return;}const next=normalizeVoice(button.dataset.voice);selectedVoice=next;syncVoiceSelectors();if(!saveVoicePreference(next))toast('音色已切换，但本机暂时无法保存偏好。');const l=session?sessionCurrent():previewLesson||lessonById(daily().newLessonId)||curriculum.lessons[0];if(session)revealHint(l);playLesson(l);});}
function playPrompt(name){if(recordPending||recording)return;stopPlayback();return queueAudio([{file:`audio/ui/${name}.mp3`,label:'正在听玩法提示'}]);}
function guideStage(){if(session&&['listen','choose'].includes(session.step))playLesson(sessionCurrent());}
function startNewLesson(){const p=daily(),id=p.nextNewLessonId??p.newLessonId;if(!id||!(p.canLearnMore??!p.newDone)){toast('今天的新句先学到这里，去短句广场自由听听吧');navigate('library');return;}session={ids:[id],index:0,newId:id,day:dayKey(),step:'listen',preview:false,choice:null,firstTryCorrect:null,revealed:false};renderSession();guideStage();}
function startDaily(){startJourney();}
function startPreview(id){session={ids:[id],index:0,newId:null,day:dayKey(),step:'listen',preview:true,returnView:view,choice:null,revealed:false};renderSession();guideStage();window.scrollTo({top:0,behavior:'instant'});}
function startGardenPractice(id){
  const available=curriculum.lessons.filter(l=>state.cards[l.id]);
  if(!available.length){startJourney();return;}
  const lesson=available.find(l=>l.id===id)||available[(getGarden(state,dayKey()).earned.practiceRounds+gardenPracticeCursor)%available.length];
  session={ids:[lesson.id],index:0,newId:null,day:dayKey(),step:'listen',gardenPractice:true,returnView:'garden',choice:null,revealed:false,attemptId:'round-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),speechResult:null};
  renderSession();guideStage();

}
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
  const reveal=document.querySelector('#reveal');if(reveal)reveal.remove();
  const recall=document.querySelector('.recall-box');if(recall)recall.innerHTML=phraseMarkup(l);
  if(session.checkup)document.querySelector('[data-rating="good"]')?.setAttribute('disabled','');
}
function bindListeningButtons(l){document.querySelectorAll('[data-listen]').forEach(b=>b.onclick=()=>{revealHint(l);playLesson(l,b.dataset.listen==='slow');});}
function renderSession(){
  if(!session)return;closeSoundSettings();screenGeneration++;stopPlayback();resetRecording();
  gardenCleanup?.();gardenCleanup=null;
  document.body.dataset.screen='practice';session.rankStart??=adventureForToday().rank.level;session.rewardStart??=getGarden(state,session.day).earned;session.skinsStart??=getSkinProgress(state,session.day).filter(s=>s.unlocked).map(s=>s.id);
  const l=sessionCurrent(),isReview=l.id!==session.newId&&!session.preview&&!session.gardenPractice;
  session.speechResult=null;session.speechIds??={};session.speechIds[l.id]??='speech-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const label={listen:'听听朋友说什么',choose:'把声音和图片配对',remember:'老朋友，你还记得吗？',speak:'用你的声音点亮星星'}[session.step];
  const hint=session.step==='remember'||session.checkup&&!session.revealed;
  app.innerHTML=`<div class="practice-shell game-practice ${session.gardenPractice?'is-garden-practice':''} ${session.step==='speak'?'is-speech-practice':''} ${session.checkup?'is-checkup':''}"><header class="practice-header"><button class="circle-btn" id="exit-session" aria-label="退出练习">${icon('close')}</button><div class="practice-progress">${versionBadge()}<span>${session.gardenPractice?'说一句，给小花喝水':session.preview?'随便听，随便说':`${session.checkup?'记忆小游戏 · ':isReview?'复习 · ':''}${session.index+1} / ${session.ids.length}`}</span><div class="progress-track"><i style="width:${(session.index+1)/session.ids.length*100}%"></i></div></div><button class="help-button" id="guide-audio" aria-label="听中文引导">? 听玩法</button></header><main class="practice-main" data-lesson-id="${l.id}" data-step="${session.step}">${questSteps(session)}<h1 class="practice-title">${label}</h1><p class="practice-scene">${session.checkup?'看图自己想，想不起来再听提示':session.step==='choose'?'点一点，找出刚才听到的意思':esc(l.scene)}</p><div class="practice-content">${session.step==='choose'?`<button class="listening-cue" data-listen="normal" aria-label="重听短句">${icon('speaker')}<span>再听一次</span></button>`:`<button class="scene-picture" data-listen="normal" data-audio-lesson="${l.id}" aria-label="${hint?'听提示：':'播放：'}${esc(l.chinese)}">${lessonIllustration(l.id)}<span class="picture-play">${icon('speaker')} ${hint?'想不起来？点图听提示':'点画面，再听一次'}</span></button>`}<div class="practice-body">${practiceBody(l)}</div></div><div class="practice-tools">${soundSettingsButton()}${audioStatusMarkup()}</div></main></div>`;
  document.querySelector('#exit-session').onclick=()=>{closeSoundSettings();resetRecording();stopPlayback();session=null;render();};
  document.querySelector('#guide-audio').onclick=()=>playPrompt(({listen:'listen',choose:'choose',remember:'review',speak:session.checkup&&!session.revealed?'checkup':'speak'})[session.step]);
  bindListeningButtons(l);bindSoundSettings();
  document.querySelectorAll('button[data-step]').forEach(b=>b.onclick=()=>{session.step=b.dataset.step;session.choice=null;renderSession();guideStage();});
  document.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>chooseAnswer(Number(b.dataset.choice)));
  document.querySelectorAll('[data-rating]').forEach(b=>b.onclick=()=>finishLesson(b.dataset.rating));
  document.querySelector('[data-checkup-next]')?.addEventListener('click',finishCheckupCard);
  document.querySelector('[data-review-next]')?.addEventListener('click',()=>{if(session?.meaningAfterSpeech&&session.step==='choose')commitLessonResult(session.spoken,{matched:session.speechMatched});});
  document.querySelector('#reveal')?.addEventListener('click',()=>{revealHint(l);playLesson(l);});
  document.querySelector('#record')?.addEventListener('click',toggleRecording);
  document.querySelector('#replay-record')?.addEventListener('click',()=>{if(recordedURL){stopPlayback();queueAudio([{file:recordedURL,label:'正在听你自己的声音'}]);}});
  bindGardenPractice();bindMainSpeech();warmSessionSpeech();
  warmLessons([l.id,session.ids[session.index+1]||(session.preview?nextLessonId(l.id):null)]);window.scrollTo({top:0,behavior:'instant'});
}
function phraseMarkup(l){return `<p class="practice-english" lang="en">${esc(l.english)}</p><p class="practice-chinese">${esc(l.chinese)}</p>`;}
function listeningButtons(){return `<div class="listen-buttons"><button class="primary" data-listen="normal">${icon('speaker')} 听一听</button><button class="secondary" data-listen="slow">临时慢听 0.8×</button></div><p class="small-note">“听一听”使用上方语速；临时慢听只放慢这一次。</p>`;}
function practiceBody(l){
  if(session.gardenPractice)return gardenPracticeBody(l);
  if(session.step==='listen')return `<div class="phrase-box">${phraseMarkup(l)}</div><p class="action-note">${esc(l.action)}</p><button class="primary next-button" data-step="choose">听过啦，来试试 ${icon('arrow')}</button>`;
  if(session.step==='remember')return `<div class="recall-box"><p class="practice-chinese">${esc(l.chinese)}</p><p>先试着自己说，再听提示</p></div><button class="primary next-button" data-step="speak">我来说一说 ${icon('mic')}</button>`;
  if(session.step==='choose')return `<div class="choices">${choiceOrder(l).map((choiceIndex,i)=>{const c=l.choices[choiceIndex],picture=curriculum.lessons.find(lesson=>lesson.chinese===c.label);return `<button class="choice" data-choice="${choiceIndex}" aria-label="${esc(c.label)}">${picture?lessonIllustration(picture.id):''}<strong>${esc(c.label)}</strong><i aria-hidden="true">✦</i></button>`;}).join('')}</div><div id="quiz-feedback" class="quiz-feedback" aria-live="polite"></div><button id="quiz-next" class="primary next-button" ${session.checkup?'data-checkup-next':session.meaningAfterSpeech?'data-review-next':'data-step="speak"'} hidden>${session.checkup?'继续下一步':session.meaningAfterSpeech?'听懂啦，收下小奖励':'轮到你说'} ${icon('arrow')}</button>`;
  const hiddenAnswer=!session.revealed&&!session.preview&&(session.checkup||l.id!==session.newId);
  return `<div id="answer-area" class="phrase-box">${hiddenAnswer?(session.checkup?'<p class="soft-copy">看图，试着自己说</p>':`<p class="practice-chinese">${esc(l.chinese)}</p>`):phraseMarkup(l)}</div>${hiddenAnswer?'<button id="reveal" class="text-button centered">'+icon('speaker')+' 想不起来，听提示</button>':''}<div class="record-box"><button id="record" class="record-button">${icon('mic')} <span>跟读评星</span></button><button id="replay-record" class="secondary" disabled>${icon('replay')} 听听自己</button><p id="record-status">点麦克风说一句，说完再点一下</p></div><div class="speech-result is-idle" data-speech-result aria-live="polite"><span>⭐</span><strong>说完自动评星</strong><small data-speech-preparing>录音留在本机</small></div><button class="primary" data-speech-next hidden>点亮啦，继续练习 ${icon('arrow')}</button><div class="rating-label">${session.preview?'不用录音，也可以直接开口练':'小耳朵没准备好？这次先开口练'}</div><div class="rating-buttons">${session.preview?'<button class="primary" data-rating="good">练习好了 ✓</button>':`<button data-rating="again"><span>🌱</span>还要练练</button><button data-rating="help"><span>🌿</span>听提示练过</button><button data-rating="good" ${session.checkup&&session.revealed?'disabled':''}><span>🌸</span>练过啦，继续</button>`}</div>`;
}
function gardenPracticeBody(l){
  const phrase=`<div class="phrase-box">${phraseMarkup(l)}</div>`;
  if(session.step==='listen')return `${phrase}<p class="action-note">${esc(l.action)}</p><button class="primary next-button" data-step="speak">${icon('mic')} 我来跟着说</button><p class="small-note" data-speech-preparing>自动听一听你说的句子 · 录音只在本机</p><button class="text-button" data-garden-another>换一句熟悉的</button>`;
  return `${phrase}<div class="record-box"><button id="record" class="record-button">${icon('mic')} <span>跟读评星</span></button><button id="replay-record" class="secondary" disabled>${icon('replay')} 听听自己</button><p id="record-status">点麦克风说一句，说完再点一下</p></div><div class="speech-result" data-speech-result aria-live="polite"><span>🎤</span><strong>让小花听见你的声音</strong></div><button class="primary" data-garden-claim hidden>拿水壶，去浇水 +2 💧</button><button class="text-button" data-garden-effort>这次直接开口练，不评分</button><p class="small-note">自动评星看句子是否匹配，不是发音准确率</p>`;
}
function bindGardenPractice(){
  if(!session?.gardenPractice)return;
  document.querySelector('[data-garden-another]')?.addEventListener('click',()=>{gardenPracticeCursor++;startGardenPractice();});
  const claim=document.querySelector('[data-garden-claim]');if(claim)claim.onclick=()=>claimGardenPractice('local-speech');
  document.querySelector('[data-garden-effort]')?.addEventListener('click',()=>{
    speechAttempt?.abort();resetRecording();stopPlayback();
    const active=session;if(!active?.gardenPractice)return;active.effortReady=true;
    document.querySelector('[data-speech-result]').innerHTML='<span>🌱</span><strong>照着图片，自己说一遍吧</strong><small>这次不评分，练过也有鼓励水</small>';
    const b=document.querySelector('#record');b.classList.remove('recording');b.innerHTML=icon('mic')+' <span>重新录音试试</span>';b.disabled=false;
    document.querySelector('#replay-record').disabled=true;
    document.querySelector('#record-status').textContent='不用等家长，直接开口练';
    const claim=document.querySelector('[data-garden-claim]');claim.hidden=false;claim.textContent='我说过啦，领鼓励水 +2 💧';claim.onclick=()=>claimGardenPractice('practice-effort');
    document.querySelector('[data-garden-effort]').hidden=true;
  });
}
function warmSessionSpeech(){
  const active=session;if(!active||active.speechWarmStarted)return;active.speechWarmStarted=true;
  prepareSpeech({background:true,onStatus:message=>{if(session===active){const el=document.querySelector('[data-speech-preparing]');if(el&&!recording)el.textContent=message;}}}).catch(()=>{});
}
function resetSpeechResult(){
  speechAttempt?.abort();session.speechResult=null;
  document.querySelector('.practice-shell')?.classList.remove('has-speech-success');
  const result=document.querySelector('[data-speech-result]');if(result){result.classList.remove('is-idle','is-matched');result.innerHTML='';}
  document.querySelector('[data-speech-next]')?.setAttribute('hidden','');
  for(const el of document.querySelectorAll('.rating-label,.rating-buttons'))el.hidden=false;
}
function bindMainSpeech(){
  document.querySelector('[data-speech-next]')?.addEventListener('click',()=>{
    if(!session||session.step!=='speak'||!session.speechResult?.matched||recording||recordPending)return;
    finishLesson(session.revealed?'help':'good',{matched:true});
  });
}
function showGardenEffort(){
  if(!session)return;
  const el=document.querySelector('[data-speech-result]');if(el)el.innerHTML='<span>🌱</span><strong>可以再试一次，也可以直接练</strong><small>麦克风暂时没听清，不会扣掉奖励</small>';
  const fallback=document.querySelector('[data-garden-effort]');if(fallback)fallback.hidden=false;
}
async function evaluateGardenSpeech(url){
  const active=session;if(!active||active.step!=='speak')return;
  speechAttempt?.abort();const controller=new AbortController();speechAttempt=controller;
  const current=()=>session===active&&!controller.signal.aborted;
  const result=document.querySelector('[data-speech-result]');
  if(!result)return;result.classList.remove('is-idle');
  result.innerHTML='<span class="speech-listening">👂</span><strong>小耳朵正在听…</strong><small>录音留在本机</small>';
  try{
    const value=await assessRecording(url,sessionCurrent().english,{signal:controller.signal,onStatus:message=>{if(current())result.querySelector('strong').textContent=message;}});
    if(!current())return;active.speechResult=value;
    const words=value.matched?'太棒啦！你说出来了！':value.coverage>0?'星星亮了一点，再试试吧':'小耳朵想再听一遍';
    result.classList.toggle('is-matched',value.matched);
    document.querySelector('.practice-shell')?.classList.toggle('has-speech-success',value.matched);
    result.innerHTML=`<span class="speech-stars" aria-label="${value.stars} 颗跟读星星">${Array.from({length:3},(_,i)=>`<i class="${value.matched?'child-star':''}" style="--star-index:${i}" aria-hidden="true">${i<value.stars?'★':'☆'}</i>`).join('')}</span><strong>${words}</strong><small>${value.matched?active.checkup||active.meaningAfterSpeech||!active.preview&&!active.gardenPractice&&active.ids[active.index]!==active.newId?'来找图片，把小奖励带回家':'水壶准备好啦，送给你的小花':active.gardenPractice?'可以再说一遍，也可以领这次的鼓励水':'可以再说一次，或先开口练再继续'}</small>`;
    if(active.gardenPractice){document.querySelector('[data-garden-claim]').hidden=!value.matched;document.querySelector('[data-garden-effort]').hidden=value.matched;}
    else{
      const next=document.querySelector('[data-speech-next]');next.hidden=!value.matched;
      next.innerHTML=active.checkup||!active.preview&&active.ids[active.index]!==active.newId?`来找图片 🧩 ${icon('arrow')}`:active.preview&&!state.cards[active.ids[active.index]]?`继续玩 ${icon('check')}`:`收下水壶 +2 💧 ${icon('arrow')}`;
      for(const el of document.querySelectorAll('.rating-label,.rating-buttons'))el.hidden=value.matched;
      if(active.preview&&!state.cards[active.ids[active.index]])result.querySelector('small').textContent='这句跟读匹配通过啦';
    }
    if(value.matched){
      celebrate('stars',{target:result});
      if(active.gardenPractice)claimGardenPractice('local-speech');
      else if(!active.checkup&&(active.preview?Boolean(state.cards[active.ids[active.index]]):active.ids[active.index]===active.newId))finishLesson(active.revealed?'help':'good',{matched:true});
    }
  }catch(error){if(current()){result.innerHTML='<span>🌱</span><strong>先开口练，小耳朵在准备</strong><small data-speech-preparing>正在后台准备，也可以先开口练</small>';const fallback=document.querySelector('[data-garden-effort]');if(fallback)fallback.hidden=false;}}
}
function claimGardenPractice(assessment){
  const active=session;if(!active?.gardenPractice||active.claimed||recording||recordPending)return;
  if(assessment==='local-speech'&&!active.speechResult?.matched||assessment==='practice-effort'&&!active.effortReady)return;
  if(!storageOK){toast('记录暂时无法保存，请在家长页检查存储空间。');return;}
  if(dayKey()!==active.day){navigate('garden');toast('新的一天开始啦，重新练一句就能领水。');return;}
  const previous=state;
  try{
    state=recordGardenPractice(state,{lessonId:active.ids[0],attemptId:active.attemptId,assessment},active.day);
    if(!save()){state=previous;toast('还没保存成功，请先到家长页处理存储空间。');return;}active.claimed=true;
  }catch(error){state=previous;toast(error.message);return;}
  collectSavedReward(active,previous,()=>{
    gardenView='world';navigate('garden');document.querySelector('[data-world-tool="water"]')?.classList.add('garden-reward-pop');
    toast('把水壶拖给小花吧！');
  });
}

function collectSavedReward(active,previous,continueSession){
  const before=getGarden(previous,active.day).earned,after=getGarden(state,active.day).earned;
  const reward={water:after.water-before.water,seeds:after.seeds-before.seeds,fertilizer:after.fertilizer-before.fertilizer};
  if(reward.water<=0){continueSession();return;}
  active.rewardPending=true;
  closeSoundSettings();stopPlayback();resetRecording();
  let continued=false;
  const resume=()=>{
    if(continued||session!==active)return;
    continued=true;
    active.rewardPending=false;continueSession();
  };
  try{
    const target=showWaterReward({...reward,onCollect:resume});
    celebrate('reward',{target});
  }catch(error){
    // A presentation failure must never undo the completed storage transaction.
    closeWaterReward();resume();toast('小奖励已经放进背包啦');
  }
}
function chooseAnswer(index){
  const l=sessionCurrent(),right=index===l.answerIndex;
  if(session.firstTryCorrect===null||session.firstTryCorrect===undefined)session.firstTryCorrect=right;
  document.querySelectorAll('[data-choice]').forEach(b=>b.classList.toggle('try-again',Number(b.dataset.choice)===index&&!right));
  const f=document.querySelector('#quiz-feedback');f.innerHTML=right?`${icon('sprout')} 选对啦！一起说一说`:`${icon('heart')} 再听一次，慢慢找`;f.className='quiz-feedback '+(right?'correct':'gentle');
  if(right){stopPlayback();const selected=document.querySelector(`[data-choice="${index}"]`);selected.classList.add('correct');document.querySelector('#quiz-next').hidden=false;document.querySelectorAll('[data-choice]').forEach(b=>b.disabled=true);celebrate('correct',{target:selected});}else{playLesson(l);celebrate('retry',{target:f,silent:true});}
}
async function toggleRecording(){
  const b=document.querySelector('#record'),status=document.querySelector('#record-status');
  if(recordPending)return;
  if(session&&!recording){resetSpeechResult();if(session.gardenPractice){session.effortReady=false;document.querySelector('[data-garden-claim]').onclick=()=>claimGardenPractice('local-speech');document.querySelector('[data-garden-effort]').hidden=false;document.querySelector('[data-garden-claim]').hidden=true;}}
  if(recording){stopRecording();recording=false;b.classList.remove('recording');b.innerHTML=`${icon('mic')} <span>再录一次</span>`;return;}
  if(!recordingSupported()){status.textContent='这个浏览器暂不支持录音。直接开口说也可以完成练习。';showGardenEffort();return;}
  recordPending=true;b.disabled=true;recordedURL=null;document.querySelector('#replay-record').disabled=true;stopPlayback();const active=session,generation=screenGeneration,attempt=++recordAttemptGeneration;
  try{await startRecording(url=>{
    if(session!==active||generation!==screenGeneration||attempt!==recordAttemptGeneration)return;
    recording=false;recordedURL=url;
    const record=document.querySelector('#record');if(!record)return;
    record.classList.remove('recording');record.innerHTML=`${icon('mic')} <span>再录一次</span>`;
    document.querySelector('#replay-record').disabled=!url;
    document.querySelector('#record-status').textContent=url?'录好啦！小耳朵来听听':'没有录到声音，可以再试一次。';
    if(session){if(url)evaluateGardenSpeech(url);else showGardenEffort();}
  });if(session!==active||generation!==screenGeneration||attempt!==recordAttemptGeneration)return;recording=true;b.classList.add('recording');b.innerHTML=`${icon('mic')} <span>停止录音</span>`;status.textContent='正在录音…再点停止 · 最长 15 秒';document.querySelector('#replay-record').disabled=true;
  }catch(e){if(e.name!=='AbortError'&&generation===screenGeneration&&attempt===recordAttemptGeneration)status.textContent=e.name==='NotAllowedError'?'没有开启麦克风，直接开口也可以':'麦克风暂时不可用，直接开口练习也很好。';}
  finally{if(generation===screenGeneration&&attempt===recordAttemptGeneration){recordPending=false;b.disabled=false;if(session&&!recording&&!recordedURL)showGardenEffort();}}
}
function finishLesson(rating,{matched=false}={}){
  if(!session||session.rewardPending||session.step!=='speak')return;
  if(!matched&&rating==='good')rating='help';
  if(dayKey()!==session.day){session=null;stopPlayback();resetRecording();render();toast('新的一天开始啦，已为你重新安排今天的练习。');return;}
  if(session.checkup){if(session.revealed&&rating==='good')return;if(matched){session.speechRewards??=[];session.speechRewards.push({lessonId:sessionCurrent().id,attemptId:session.speechIds[sessionCurrent().id],assessment:'local-speech'});}session.spoken=rating;session.step='choose';renderSession();guideStage();return;}
  if(!session.preview&&sessionCurrent().id!==session.newId){session.spoken=rating;session.speechMatched=matched;session.meaningAfterSpeech=true;session.firstTryCorrect=null;session.step='choose';renderSession();guideStage();return;}
  commitLessonResult(rating,{matched});
}
function commitLessonResult(rating,{matched=false}={}){
  if(!session||session.rewardPending||session.checkup||recording||recordPending||!['speak','choose'].includes(session.step))return;
  if(session.step==='choose'&&(!session.meaningAfterSpeech||session.firstTryCorrect===null))return;
  if(dayKey()!==session.day){navigate('home');toast('新的一天开始啦，重新安排今天的练习');return;}
  const active=session,l=sessionCurrent();
  const previous=state;
  try{
    if(!session.preview)state=recordResult(state,l.id,rating,session.day,{isNew:l.id===session.newId,meaning:session.firstTryCorrect===true});
    if(matched&&state.cards[l.id])state=recordGardenPractice(state,{lessonId:l.id,attemptId:session.speechIds[l.id],assessment:'local-speech'},session.day);
    if(state!==previous&&(!storageOK||!save())){state=previous;toast('还没保存成功，请先检查存储空间。');return;}
  }catch(e){state=previous;toast(e.message);return;}
  collectSavedReward(active,previous,()=>{
    if(session.preview){const next=session.returnView||'library';session=null;resetRecording();stopPlayback();view=next;location.hash=next;render();return;}
    resetRecording();session.index++;
    if(session.index>=session.ids.length){renderCompletion();return;}
    session.step=session.ids[session.index]===session.newId?'listen':'remember';session.revealed=false;session.choice=null;session.firstTryCorrect=null;session.meaningAfterSpeech=false;session.speechMatched=false;renderSession();guideStage();
  });
}
function finishCheckupCard(){
  if(!session?.checkup||session.rewardPending||session.firstTryCorrect===null)return;
  if(dayKey()!==session.day){session=null;stopPlayback();resetRecording();render();toast('新的一天开始啦，小游戏会重新安排。');return;}
  const results=[...session.results,{lessonId:sessionCurrent().id,meaning:session.firstTryCorrect,spoken:session.spoken}];
  if(results.length===session.ids.length){
    const previous=state;
    try{state=recordCheckup(state,curriculum.lessons,results,session.day);for(const reward of session.speechRewards||[])state=recordGardenPractice(state,reward,session.day);if(!storageOK||!save()){state=previous;toast('还没保存成功，请先检查存储空间。');return;}}catch(e){state=previous;toast(e.message);return;}
    collectSavedReward(session,previous,()=>{
      const rewards=rewardMarkup(session),rankStart=session.rankStart;session=null;stopPlayback();resetRecording();
      renderFinish('记忆小游戏完成啦',results.length,rewards,`首次听懂 ${results.filter(r=>r.meaning).length} 句`,rankStart);
    });return;
  }
  session.results=results;session.index++;session.step='speak';session.revealed=false;session.firstTryCorrect=null;session.spoken=null;renderSession();
}
function renderCompletion(){
  const count=session.ids.length,rewards=rewardMarkup(session),review=!session.newId,rankStart=session.rankStart;
  session=null;closeSoundSettings();stopPlayback();resetRecording();
  renderFinish(review?'老朋友，又见面啦！':'今天又练了一句！',count,rewards,'',rankStart);
}
function renderFinish(title,count,rewards,score='',rankStart=Infinity){
  const next=journey(),copy=journeyCopy(next),adventure=adventureForToday(),rankUp=adventure.rank.level>rankStart;
  shell(`<section class="focus-screen completion game-completion" data-next-kind="${next.kind}"><span class="badge">✦ 冒险完成 · 奖励已放进背包</span><div class="completion-flower">${treasureMarkup()}</div><h1>${title}</h1><p>${count} 句练习已记好${score?` · ${score}`:''}</p>${rewards}<div class="completion-goal ${rankUp?'rank-unlocked':''}" ${rankUp?'data-rank-unlocked role="status"':''}><span>${rankUp?adventure.rank.icon:'🌷'}</span><strong>${rankUp?`新称号 · ${esc(adventure.rank.title)}`:esc(adventure.nextGoal.title)}</strong></div><div class="focus-action"><p class="next-task">${next.kind==='learn'?'还想探索？再发现一句，也可以带着补给去种花':next.kind==='checkup'?'熟悉的朋友藏起来啦，接着玩记忆寻宝':next.kind==='review'?'还有老朋友在等你，先走完回忆小径':'今天的任务完成啦，去种一点快乐'}</p><button class="primary" id="completion-next">${next.kind==='learn'?'再学一句':copy.button} ${icon('arrow')}</button><div class="completion-exits">${next.kind==='garden'?'<button class="secondary" data-go="library">🎈 自由听听</button>':'<button class="secondary" data-go="garden">🌷 带回花园</button>'}<button class="text-button" data-go="home">先休息</button></div></div></section>`);
  document.querySelector('#completion-next').onclick=startJourney;
  if(next.kind==='garden')document.querySelector('.next-task').textContent=dailyLimitCopy(daily());
  celebrate('reward',{target:document.querySelector('.completion-flower')});
}
function dailyLimitCopy(p){return p.limitReason==='catalog-complete'?'小书都认识啦，继续自由听和练':p.limitReason==='review-backlog'||p.limitReason==='review-first'?'先把老朋友记牢，今天的新句学到这里。还想听？去短句广场':`今天已学 ${p.newCount} 句，新句先学到这里。还想听？去短句广场`;}

function pageControls(page,total){return `<div class="page-controls"><button class="secondary" data-page-delta="-1" ${page===0?'disabled':''} aria-label="上一页">← 上一页</button><span>${page+1} / ${total}</span><button class="secondary" data-page-delta="1" ${page>=total-1?'disabled':''} aria-label="下一页">下一页 →</button></div>`;}
function renderLibrary(){
  const themes=libraryMode==='themes'&&!searchOpen;
  const filtered=curriculum.lessons.filter(l=>(libraryTheme==='all'||l.theme===libraryTheme)&&(!search||`${l.english} ${l.chinese}`.toLowerCase().includes(search.toLowerCase())));
  const items=themes?curriculum.themes:filtered,size=themes?6:searchOpen?2:4,pages=Math.max(1,Math.ceil(items.length/size));libraryPage=Math.min(libraryPage,pages-1);
  const visible=items.slice(libraryPage*size,(libraryPage+1)*size),title=themes?'想去哪里玩？':libraryTheme==='all'?'找一句话':themeById(libraryTheme).name;
  shell(`<section class="focus-screen focus-library adventure-library"><div class="screen-heading"><button class="back-button" data-library-back ${themes?'hidden':''} aria-label="回到主题">←</button><h1>${esc(title)}</h1><button class="circle-btn" id="search-open" aria-label="${searchOpen?'关闭搜索':'搜索短句'}" aria-expanded="${searchOpen}">${searchOpen?'×':'⌕'}</button></div><div class="library-search" ${searchOpen?'':'hidden'}><label for="phrase-search">中文或英文都能找</label><input id="phrase-search" type="search" placeholder="例如：喝水 / water" value="${esc(search)}" maxlength="60"></div><p class="results-count">${themes?'短句广场 · 自由听听，不增加复习任务':`${filtered.length} 个短句 · 随便听，不改变复习计划`}</p>${themes?`<div class="theme-grid">${visible.map(t=>`<button class="theme-card" data-theme-open="${t.id}" style="--theme-color:${esc(t.color)}"><span class="theme-island" aria-hidden="true">${esc(t.icon)}</span><strong>${esc(t.name)}</strong><small>${curriculum.lessons.filter(l=>l.theme===t.id&&state.cards[l.id]).length} / ${curriculum.lessons.filter(l=>l.theme===t.id).length} 个新发现</small></button>`).join('')}</div>`:`<div class="phrase-grid">${visible.map(l=>`<button class="phrase-tile" data-preview="${l.id}" aria-label="${esc(l.chinese)}"><div class="tile-top">${lessonIllustration(l.id)}</div><strong lang="en">${esc(l.english)}</strong><span class="tile-translation">${esc(l.chinese)}</span></button>`).join('')}</div>${!filtered.length?'<div class="empty-state">没有找到，换个词试试吧</div>':''}`}${pageControls(libraryPage,pages)}</section>`);
  document.querySelector('[data-library-back]').onclick=()=>{search='';searchOpen=false;libraryMode='themes';libraryPage=0;renderLibrary();};
  document.querySelector('#search-open').onclick=()=>{searchOpen=!searchOpen;search='';libraryPage=0;libraryTheme='all';libraryMode=searchOpen?'phrases':'themes';renderLibrary();if(searchOpen)document.querySelector('#phrase-search').focus();};
  document.querySelector('#phrase-search').oninput=e=>{const pos=e.target.selectionStart;search=e.target.value;libraryPage=0;renderLibrary();const input=document.querySelector('#phrase-search');input.focus({preventScroll:true});try{input.setSelectionRange(pos,pos);}catch{}};
  document.querySelectorAll('[data-theme-open]').forEach(b=>b.onclick=()=>{libraryTheme=b.dataset.themeOpen;libraryMode='phrases';libraryPage=0;search='';searchOpen=false;renderLibrary();});
  document.querySelectorAll('[data-page-delta]').forEach(b=>b.onclick=()=>{libraryPage+=Number(b.dataset.pageDelta);stopPlayback();renderLibrary();});
  document.querySelectorAll('[data-preview]').forEach(b=>{b.onclick=()=>startPreview(b.dataset.preview);const warm=()=>warmLessons([b.dataset.preview]);b.addEventListener('pointerenter',warm);b.addEventListener('focus',warm);b.addEventListener('pointerdown',warm);});
  if(!themes)warmLessons(visible.slice(0,2).map(l=>l.id));
}
function materialIcon(kind){const paths={seeds:'<ellipse cx="12" cy="13" rx="6" ry="9" transform="rotate(35 12 13)" fill="#c39b5b"/><path d="m8 18 8-11" stroke="#f4dfb0" stroke-width="2"/>',water:'<path d="M12 2S3 12 3 16a9 9 0 0 0 18 0c0-4-9-14-9-14Z" fill="#78b6cd"/><path d="M7 15q-1 5 4 5" stroke="#e5f5ed" fill="none" stroke-width="2"/>',fertilizer:'<path d="m7 3 3 5h4l3-5M8 8C0 22 3 23 12 23s12-1 4-15Z" fill="#b6c88c" stroke="#739260" stroke-width="1.5"/><path d="M12 19v-7m0 5q-6-1-5-5 5 0 5 5m0-2q1-5 5-5 0 4-5 5" fill="#739260"/>'};return `<svg class="material-icon" viewBox="0 0 24 26" aria-hidden="true">${paths[kind]}</svg>`;}
function materialInventory(values,reward=false){return `<div class="material-inventory ${reward?'is-reward':''}">${[['seeds','种子'],['water','水滴'],['fertilizer','肥料']].map(([kind,name])=>`<div data-material="${kind}" aria-label="${name} ${values[kind]}">${materialIcon(kind)}<strong>${reward?'+':''}${values[kind]}</strong><small>${name}</small></div>`).join('')}</div>`;}
function rewardMarkup(active){const earned=getGarden(state,active.day).earned,values=Object.fromEntries(['seeds','water','fertilizer'].map(kind=>[kind,Math.max(0,earned[kind]-(active.rewardStart?.[kind]||0))])),skinReward=skinRewardMarkup(state,active.day,active.skinsStart||[]);return Object.values(values).some(Boolean)?`<section class="earned-rewards">${skinReward||'<h2>送给你的小花田</h2>'}${materialInventory(values,true)}</section>`:skinReward;}
function nextPlant(garden){const active=new Set(garden.plots.filter(Boolean).map(plot=>plot.kind));return PLANTS.find(plant=>!active.has(plant.id)&&garden.collection.find(item=>item.kind===plant.id)?.count===0)?.id||PLANTS[(state.garden?.actions.filter(action=>action.type==='plant').length||0)%PLANTS.length].id;}
function renderGarden(){
 const today=dayKey(),garden=gameView().garden,plot=garden.plots[gardenPlot],plant=plot&&PLANTS.find(p=>p.id===plot.kind),goal=plot?.growthGoal||12,growth=plot?.growth||0;
 if(gardenView==='world'){
   shell(`<section class="focus-screen focus-garden garden-world-screen">${gardenWorldMarkup(garden)}<div class="garden-world-footer">${garden.plots.some(Boolean)?'<button class="text-button" data-old-plots>🪴 老花盆</button>':'<span>每次练习 2 壶水 · 有机会发现种子</span>'}<button class="text-button" data-open-skins>🎨 换装</button></div></section>`);
   document.querySelector('[data-old-plots]')?.addEventListener('click',()=>{gardenView='field';renderGarden();});
   gardenCleanup=bindGardenWorld(document.querySelector('.garden-world'),{garden,onAction:performWorldAction,onPractice:()=>startGardenPractice(),onCollection:()=>{gardenView='collection';renderGarden();},notify:toast});return;
 }
 const mature=plot?.canHarvest,stage=!plot?-1:goal===3?growth:growth===0?0:growth<8?1:growth<12?2:3;
 const scale=!plot||goal===3||mature?1:growth===0?1:growth<8?.4+growth*.08:.82+(growth-8)*.05;
 const instruction=mature?'开花啦！点小花，收进图鉴':!plot?(garden.inventory.seeds?'把种子拖到中间的小土堆':'练一句，给花田领一颗种子'):plot.canWater?'把水壶拖给小花，看看它长大':plot.canFertilize?'把营养袋拖给小花':'一起说一句，给小花领水壶';
 const tools=[['plant','seeds','种子',!plot&&garden.inventory.seeds>0],['water','water','水壶',!!plot?.canWater],['fertilize','fertilizer','营养',!!plot?.canFertilize]];
 shell(`<section class="focus-screen focus-garden garden-play"><div class="screen-heading"><h1>${gardenView==='collection'?'我的植物图鉴':'我的小花园'}</h1><button class="secondary" data-garden-view="${gardenView==='collection'?'world':'collection'}">${gardenView==='collection'?'回大花园':'🌼 看图鉴'}</button></div>${gardenView==='collection'?`<p class="results-count">已经收集 ${garden.collection.filter(i=>i.count).length} / 4 种小植物</p><div class="collection-grid">${garden.collection.map(item=>{const kind=PLANTS.find(p=>p.id===item.kind);return `<div class="collection-item ${item.count?'collected':''}" data-collection="${item.kind}">${plantDrawing(item.kind,3)}<strong>${kind.name}</strong><small>${item.count?'已收集 '+item.count+' 株':'等你种出来'}</small></div>`;}).join('')}</div><p class="small-note">每一次收获，都会留在这里</p>${skinEntryMarkup(state,today)}`:`<div class="plot-tabs" role="group" aria-label="选择一块花田">${garden.plots.map((p,i)=>`<button data-plot-tab="${i}" aria-pressed="${i===gardenPlot}">${p?.canHarvest?'🌼':p?'🌱':'🟤'} 第 ${i+1} 块地</button>`).join('')}</div><article class="garden-plot garden-stage" data-plot="${gardenPlot}" data-growth="${growth}" data-growth-goal="${goal}"><h2>${plant?plant.name:'小种子的新家'}</h2><button class="garden-drop" data-garden-drop ${mature?'data-garden-action="harvest"':''} aria-label="${mature?'收获'+plant.name:'花田，放入种子或水壶'}">${plantDrawing(plot?.kind,stage,scale)}<span class="garden-drop-label">${mature?'🌼 收进图鉴':!plot?'🌱 种在这里':growth<4?'小芽在长大':growth<8?'长出新叶子':'快要开花啦'}</span><span class="garden-splash" aria-hidden="true">💧 💧 💧</span></button><div class="garden-growth" role="progressbar" aria-label="小花生长进度" aria-valuenow="${growth}" aria-valuemin="0" aria-valuemax="${goal}"><span style="width:${growth/goal*100}%"></span></div><p class="garden-instruction" data-garden-instruction aria-live="polite">${instruction}</p></article><div class="garden-tool-tray" role="group" aria-label="拖动小工具照顾花田">${tools.map(([type,resource,name,enabled])=>`<button class="garden-tool" data-garden-tool="${type}" data-garden-label="${name}" ${enabled?'':'disabled'} aria-label="${name}，剩余 ${garden.inventory[resource]}，${enabled?'拖到花田或点选后点花田':'暂时用不上'}"><span class="garden-tool-art">${gardenToolArt(type)}</span><strong data-material="${resource}">${garden.inventory[resource]}</strong><span>${name}</span></button>`).join('')}</div><button class="primary garden-practice-entry" data-garden-practice>${icon('mic')} ${stats().learnedCount?'跟读评星 · 领 2 次浇水':'学第一句，跟读评星'} ${icon('arrow')}</button><p class="garden-footer"><span>每次 2 壶水 · 有机会发现种子</span><button class="text-button" data-open-skins aria-label="花园换装">🎨 换装</button></p>`}</section>`);
 document.querySelector('[data-garden-view]').onclick=e=>{gardenView=e.currentTarget.dataset.gardenView;renderGarden();};
 document.querySelectorAll('[data-plot-tab]').forEach(b=>b.onclick=()=>{gardenPlot=Number(b.dataset.plotTab);renderGarden();});
 document.querySelector('[data-garden-practice]')?.addEventListener('click',()=>startGardenPractice());
 if(gardenView==='field'){
   gardenCleanup=bindGardenInteraction(document.querySelector('.garden-play'),{onAction:performGardenAction});
   if(mature)document.querySelector('[data-garden-drop]').addEventListener('click',()=>performGardenAction('harvest'));
 }
}
function performGardenAction(type){
 if(!storageOK){toast('请先在家长页备份原始记录，再恢复学习进度。');return;}
 const garden=getGarden(state,dayKey()),index=gardenPlot;
 try{
   const previous=state;
   state=recordGardenAction(state,{type,plot:index,...(type==='plant'?{kind:nextPlant(garden)}:{})},dayKey());
   if(!save()){state=previous;toast('还没保存成功，请先到家长页处理存储空间。');return;}renderGarden();
   const stage=document.querySelector(`[data-plot="${index}"]`);stage?.classList.add('garden-celebrate');if(stage)stage.dataset.gardenEffect=type;
   const messages={plant:'种下啦！小种子住进花田了',water:'喝到水啦，又长大一点！',fertilize:'营养收到啦，小花长大了',harvest:'收好啦！图鉴里多了一株植物'};
   const instruction=document.querySelector('[data-garden-instruction]');if(instruction)instruction.textContent=messages[type];
   toast(messages[type]);
   celebrate(type==='harvest'?'bloom':type==='fertilize'?'water':type,{target:document.querySelector('[data-garden-drop]')});
 }catch(error){toast(error.message);}
}
function performWorldAction(action){
 if(!storageOK){toast('记录暂时无法保存，请在家长页检查存储空间');return false;}
 const previous=state,rankBefore=adventureForToday().rank.level;
 try{
   state=recordGardenAction(state,action,dayKey());
   if(!save()){state=previous;toast('这次还没保存成功，请检查存储空间');return false;}
   const bloomed=action.type==='world-water'&&gameView().garden.worldPlants.some(plant=>plant.id===action.id&&plant.growth===plant.growthGoal);
   const rank=adventureForToday().rank;
   renderGarden();if(rank.level>rankBefore){const note=document.querySelector('[data-world-instruction]');if(note){note.textContent=`开花啦！获得新称号：${rank.title}`;note.classList.add('rank-unlocked');note.setAttribute('data-rank-unlocked','');}}
   toast(rank.level>rankBefore?`开花啦！你现在是${rank.title}！`:action.type==='world-plant'?'种下啦！给小苗浇水，看它长大':bloomed?'开花啦！你把小苗养大了':'咕嘟咕嘟！小苗又长大了一点');celebrate(action.type==='world-plant'?'plant':bloomed?'bloom':'water',{target:document.querySelector('[data-garden-world]')});return true;
 }catch(error){state=previous;toast(error.message);return false;}
}
function renderParent(){
  const titles={menu:'家长小站',habits:'宝贝昵称与练习',voice:'声音伙伴和语速',offline:'准备离线小书',install:'放进口袋，随时练',backup:'保存与恢复进度',progress:'看看小芽的足迹',help:'怎样陪孩子练',about:'关于英语小芽'};
  const menus=[['habits','🌱','宝贝昵称与练习'],['voice','🔊','声音与语速'],['offline','📥','离线与安装'],['backup','🧳','进度备份'],['progress','👣','学习足迹'],['help','💛','陪伴方法']];
  let content='';
  if(parentPanel==='menu')content=`<p class="focus-sub">一次处理一件小事</p><div class="parent-menu">${menus.map(([id,symbol,label])=>`<button data-parent-panel="${id}"><span>${symbol}</span><strong>${label}</strong></button>`).join('')}</div>`;
  if(parentPanel==='habits')content=`<section class="settings-card"><label class="field">宝贝的小昵称<input id="nickname" value="${esc(state.settings.nickname)}" maxlength="32" autocomplete="off"><small>不需要真实姓名 · 最多 16 个字符</small></label><label class="field">每天最多复习几句<select id="daily-reviews">${Array.from({length:10},(_,i)=>i+1).map(n=>`<option value="${n}" ${state.settings.dailyReviews===n?'selected':''}>${n} 句${n===5?'（默认）':''}</option>`).join('')}</select></label><p>先复习，再学新句。通常每天最多 3 句；复习有积压时最多 1 句。自由听不增加任务，累了随时停。</p><button class="primary" id="save-settings">保存设置 ${icon('check')}</button></section>`;
  if(parentPanel==='voice')content=`<section class="settings-card">${voiceButtons()}${courseRateButtons()}${audioStatusMarkup()}${voiceAuditionEntry()}<p class="small-note">三位伙伴各有完整 120 句。录音与中文帮助保持原速。</p></section>`;
  if(parentPanel==='offline')content=`<section class="settings-card"><div class="panel-symbol">📚</div><p>一次保存三位伙伴的整本小书，下次没网络也能听。</p><button class="primary" id="offline-audio" ${offlineBusy?'disabled':''}>${icon('download')} ${offlineBusy?'正在保存声音…':'保存全部离线声音'}</button><p id="offline-status" class="small-note" aria-live="polite">正在检查本机离线内容…</p><button class="secondary" data-parent-panel="install">安装到桌面 / 换到手机</button></section>`;
  if(parentPanel==='install')content=`<section class="settings-card"><p>iPhone：Safari 分享 → 添加到主屏幕。Android：浏览器菜单 → 安装应用。</p><button class="primary" id="install-app">${icon('download')} 添加到主屏幕</button><div class="phone-share"><img src="./icons/phone-qr.png" width="112" height="112" alt="手机扫码打开英语小芽"><div><strong>手机扫码打开</strong><button class="text-button" id="copy-link">复制手机网址</button></div></div><p class="small-note">换设备后的进度，可用备份转移。</p></section>`;
  if(parentPanel==='backup')content=`<section class="settings-card"><div class="panel-symbol">🧳</div><p>记录保存在这台设备。换手机或清理浏览器前，先导出一份。</p><div class="button-row"><button class="primary" id="export-progress">${icon('download')} 导出进度</button><button class="secondary" id="import-progress">导入进度</button></div><input id="import-file" type="file" accept="application/json,.json" hidden><p id="import-status" class="small-note" aria-live="polite">导入会替换当前记录，不会合并。声音与头像分别保存。</p>${!storageOK?'<button class="secondary" id="export-raw">导出原始记录</button>':''}<button class="text-button danger" id="reset-progress">重新开始学习</button></section>`;
  if(parentPanel==='progress'){
    const st=stats(),check=getCheckupPlan(state,curriculum.lessons,dayKey()),last=Object.entries(state.checkups||{}).sort(([a],[b])=>b.localeCompare(a))[0];
    content=`<section class="settings-card"><div class="progress-total"><strong>${st.learnedCount}</strong><span>句已经练过 · 共 120 句</span></div><div class="week-days">${(st.last7Days||[]).map(d=>`<div class="week-day ${d.practiced?'practiced':''}"><span>${['日','一','二','三','四','五','六'][new Date(d.date+'T12:00:00').getDay()]}</span><i>${d.practiced?'✓':'·'}</i></div>`).join('')}</div><p>${last?`最近小游戏：首次听懂 ${last[1].filter(r=>r.meaning).length} / ${last[1].length}，自己说出 ${last[1].filter(r=>r.spoken==='good').length} / ${last[1].length}`:'练过的句子会隔一段时间回来，帮助孩子主动想起。'}</p>${check.due?'<button class="primary" id="start-checkup">玩今天的记忆小游戏</button>':`<p class="small-note">${check.nextDate>dayKey()?check.nextDate+' 再来玩记忆小游戏':'先积累熟悉的短句，再来玩小游戏'}</p>`}<p class="small-note">自动记录词句匹配与听音找图；不代表发音准确率或完全掌握。</p></section>`;
  }
  if(parentPanel==='help')content=`<section class="settings-card"><ol class="parent-tips"><li><strong>复习先想。</strong>先看图自己说，再按需听提示。</li><li><strong>新句先听。</strong>做动作、选图片，再开口模仿。</li><li><strong>自动评星找图片。</strong>说完自动匹配词句，再听音找图；需要提示的句子明天再练。</li></ol><p class="small-note">答对图片不等于会说。学习、复习与花园都能在本机匹配句子、领水；匹配星星不是发音准确率。录音不上传。</p><button class="secondary" data-parent-panel="about">关于与隐私</button></section>`;
  if(parentPanel==='about')content=`<section class="settings-card"><div class="panel-symbol">🌱</div><h2>英语小芽 v${esc(APP_VERSION)}</h2><p>120 个生活短句 · 三位声音伙伴<br>无广告 · 无账户 · 无付费 API</p><p class="small-note">头像与学习记录留在本机，录音离开练习卡即删除。首次跟读会后台准备约 47 MB 的本机识别包，不上传录音。示范为预先合成配音。</p><p class="small-note">间隔复习是练习安排，不保证特定学习效果；建议 4—7 岁亲子共学。</p><a class="text-button" href="https://www.learningscientists.org/blog/2022/2/3-1" target="_blank" rel="noopener noreferrer">了解间隔回想 ↗</a></section>`;
  shell(`<section class="focus-screen focus-parent" data-parent-screen="${parentPanel}"><div class="screen-heading"><button class="back-button" data-parent-back ${parentPanel==='menu'?'hidden':''} aria-label="返回家长小站">←</button><h1>${titles[parentPanel]||titles.menu}</h1></div>${content}</section>`);
  document.querySelector('[data-parent-back]').onclick=()=>{stopPlayback();parentPanel='menu';renderParent();};
  document.querySelectorAll('[data-parent-panel]').forEach(b=>b.onclick=()=>{stopPlayback();parentPanel=b.dataset.parentPanel;renderParent();});
  bindVoiceSelectors();bindVoiceAudition();
  const nickname=document.querySelector('#nickname');
  if(nickname){const limitNickname=()=>{const chars=[...nickname.value];if(chars.length>16)nickname.value=chars.slice(0,16).join('');};nickname.addEventListener('input',e=>{if(!e.isComposing)limitNickname();});nickname.addEventListener('compositionend',limitNickname);}
  document.querySelector('#save-settings')?.addEventListener('click',()=>{if(!storageOK){toast('请先备份原始记录，再恢复有效进度。');return;}state.settings.nickname=[...nickname.value.trim()].slice(0,16).join('')||'小芽';state.settings.dailyReviews=Number(document.querySelector('#daily-reviews').value);if(save())toast('保存好啦，按自己的节奏来');});
  document.querySelector('#install-app')?.addEventListener('click',async()=>{if(installEvent){await installEvent.prompt();installEvent=null;}else toast('用浏览器分享或菜单，选择“添加到主屏幕”');});
  document.querySelector('#copy-link')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(PUBLISHED_URL);toast('网址已复制');}catch{toast(PUBLISHED_URL);}});
  document.querySelector('#offline-audio')?.addEventListener('click',downloadOffline);
  const offlineStatus=document.querySelector('#offline-status'),downloadGeneration=offlineDownloadGeneration;
  if(offlineStatus){const files=englishAudioFiles(curriculum.lessons);if(offlineBusy)offlineStatus.textContent='正在保存离线声音，请稍候…';else cachedAudioCount(files).then(n=>{if(offlineStatus.isConnected&&downloadGeneration===offlineDownloadGeneration)offlineStatus.textContent=`本机已保存 ${n} / ${files.length} 段英文示范${n===files.length?' · 可离线播放':''}。清理缓存后需重新保存。`;}).catch(()=>{});}
  document.querySelector('#export-progress')?.addEventListener('click',()=>downloadJSON({app:'english-sprout',version:1,exportedAt:new Date().toISOString(),state},`英语小芽-进度-${dayKey()}.json`));
  document.querySelector('#export-raw')?.addEventListener('click',()=>{try{downloadJSON({raw:localStorage.getItem(KEY)},`英语小芽-原始记录-${dayKey()}.json`);}catch{toast('当前浏览器无法读取存储，请先保留此页面。');}});
  document.querySelector('#import-progress')?.addEventListener('click',()=>document.querySelector('#import-file').click());
  document.querySelector('#import-file')?.addEventListener('change',importProgress);
  document.querySelector('#reset-progress')?.addEventListener('click',()=>confirmDialog('重新开始学习？','会清除这台设备的学习记录。建议先导出备份，声音缓存会保留。','清除并重新开始',()=>{state=createState(dayKey());storageOK=true;document.querySelector('#storage-warning').hidden=true;const saved=save();navigate('home');if(saved)toast('新的小花园准备好了');}));
  document.querySelector('#start-checkup')?.addEventListener('click',startCheckup);
  if(parentPanel==='voice')warmLessons([daily().newLessonId||curriculum.lessons[0].id]);
}
async function downloadOffline(){
  if(offlineBusy)return;
  if(!('serviceWorker' in navigator)||!window.isSecureContext){toast('请使用 HTTPS 网址或本机启动入口保存离线内容。');return;}
  offlineBusy=true;offlineDownloadGeneration++;const button=document.querySelector('#offline-audio');button.disabled=true;
  const update=t=>{const el=document.querySelector('#offline-status');if(el)el.textContent=t;};
  try{
    await Promise.race([navigator.serviceWorker.ready,new Promise((_,rej)=>setTimeout(()=>rej(new Error('离线服务尚未准备好，请联网刷新后再试。')),12000))]);
    const ui=UI_PROMPTS.map(n=>`audio/ui/${n}.mp3`);
    const response=await fetch('./data/character-voices.json');
    if(!response.ok)throw new Error('新伙伴试听还没下载好，请联网后再试。');
    const catalog=await response.json(),samples=[...new Set(catalog.candidates.flatMap(candidate=>Object.values(candidate.samples)))];
    if(samples.some(file=>!/^audio\/characters\/[a-z-]+\/[a-z]+-\d{2}\.mp3$/.test(file)))throw new Error('试听清单暂时无法读取，请更新后再试。');
    const courseFiles=englishAudioFiles(curriculum.lessons),baseFiles=[...courseFiles,...ui],baseSet=new Set(baseFiles),extraSamples=samples.filter(file=>!baseSet.has(file)),allFiles=[...new Set([...baseFiles,...samples])];
    await cacheAllAudio(allFiles,(n,total)=>update(`正在保存声音 ${n} / ${total}，请保持页面打开…`));
    if(navigator.storage?.persist)await navigator.storage.persist().catch(()=>false);
    update(`共 ${allFiles.length} 段声音已保存：${courseFiles.length} 段英文示范、${ui.length} 段中文帮助、${extraSamples.length} 段额外对照样音。可以离线练习，清理浏览器数据后需重新下载。`);toast('离线小书准备好了！');
  }catch(e){update(e.message||'没有全部保存成功，已保存的会保留，可以稍后继续。');}
  finally{offlineBusy=false;const b=document.querySelector('#offline-audio');if(b)b.disabled=false;}
}
function downloadJSON(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function importProgress(event){
  const input=event.target,file=input.files[0];if(!file)return;input.value='';const current=()=>input.isConnected&&view==='parent'&&parentPanel==='backup'&&!session;
  try{if(file.size>2*1024*1024)throw new Error('备份文件过大，请选择英语小芽导出的进度文件。');const raw=await file.text();if(!current())return;const data=JSON.parse(raw);if(data.app!=='english-sprout'||data.version!==1)throw new Error('这不是英语小芽的进度备份。');const imported=validateImport(data.state,curriculum.lessons);
    confirmDialog('用备份恢复进度？',`将替换这台设备的当前记录。备份中有 ${Object.keys(imported.cards).length} 个已学短句；不会合并两台设备的记录。`,'确认恢复',()=>{if(!current())return;closeSoundSettings();stopPlayback();resetRecording();session=null;state=imported;storageOK=true;document.querySelector('#storage-warning').hidden=true;const saved=save();renderParent();if(saved)toast('进度已经恢复。');});
  }catch(e){if(!current())return;const message='没有导入：'+(e.message||'文件内容无法识别，原有进度没有改变。');const status=document.querySelector('#import-status');if(status)status.textContent=message;else toast(message);}
}
function confirmDialog(title,body,label,onConfirm){
  const d=document.createElement('dialog');d.className='confirm-dialog';d.innerHTML=`<h2>${esc(title)}</h2><p>${esc(body)}</p><div class="button-row"><button class="secondary" data-cancel>先不改</button><button class="primary" data-confirm>${esc(label)}</button></div>`;document.body.append(d);showDialog(d);d.querySelector('[data-cancel]').onclick=()=>d.close();d.querySelector('[data-confirm]').onclick=()=>{d.close();onConfirm();};d.onclose=()=>d.remove();
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;});
window.addEventListener('hashchange',()=>{if(!bootReady)return;const v=location.hash.slice(1);if(['home','library','garden','parent'].includes(v)&&v!==view){closeWaterReward();closeSkinPicker();closeSoundSettings();resetRecording();stopPlayback();session=null;view=v;if(v==='parent')parentPanel='menu';render();}});
window.addEventListener('online',()=>{if(!bootReady){init();return;}if(!session)render();});window.addEventListener('offline',()=>{if(bootReady&&!session)render();});
document.addEventListener('visibilitychange',()=>{if(!bootReady){if(!document.hidden&&bootFailure==='course'&&navigator.onLine!==false)init();return;}if(document.hidden){stopPlayback();if(recordPending)resetRecording();else if(recording)stopRecording();}else if(!session)render();});
window.addEventListener('pagehide',()=>{stopPlayback();resetRecording();});
window.addEventListener('storage',e=>{if(!bootReady)return;if(e.key===SKIN_STORAGE_KEY){closeSkinPicker();applySavedSkin(state,dayKey());return;}if(e.key===COURSE_RATE_KEY){applyCourseRate(readCourseRate(),false);return;}if(e.key===AVATAR_STORAGE_KEY){document.querySelectorAll('[data-user-avatar]').forEach(el=>el.innerHTML=avatarMarkup());return;}if(e.key===VOICE_STORAGE_KEY){stopPlayback();selectedVoice=readVoicePreference();syncVoiceSelectors();return;}if(e.key===KEY){closeWaterReward();closeSkinPicker();closeSoundSettings();stopPlayback();if(session){toast('另一个页面更新了进度，请退出本轮再继续。');session=null;resetRecording();}state=load();render();}});
function showBootFailure(kind,error){
  bootFailure=kind;app.dataset.startup='error';console.error('English Sprout startup: '+kind,error);
  const message=kind==='course'?'连接有点慢，点一下再试。网络恢复后也会自动继续。':'页面暂时没打开完整，点一下再试。已有学习记录会保留。';
  app.innerHTML=`<div class="boot"><span>🌱</span><h1>再给小芽一点时间</h1><p>${message}</p><button class="primary" id="retry">再试一次</button></div>`;
  document.querySelector('#retry').onclick=()=>init();
}
function init(){
  if(bootReady)return Promise.resolve();if(bootPending)return bootPending;
  bootFailure=null;app.dataset.startup='loading';
  app.innerHTML='<div class="boot"><span>🌱</span><h1>英语小芽</h1><p>正在打开今天的小世界…</p></div>';
  bootPending=(async()=>{
    try{curriculum=await loadCurriculum();}catch(error){showBootFailure('course',error);return;}
    try{
      state=load();view=['library','garden','parent'].includes(location.hash.slice(1))?location.hash.slice(1):'home';render();
      bootReady=true;app.dataset.startup='ready';window.dispatchEvent(new Event('sprout-ready'));
    }catch(error){showBootFailure('interface',error);return;}
    // Optional offline preparation and audition must never replace a usable home.
    try{startAutomaticUpdates({build:APP_BUILD,onState:syncReleaseState,isSafe:()=>storageOK&&!document.hidden&&!session&&!recording&&!recordPending&&!offlineBusy&&!document.querySelector('dialog[open],.completion')&&!(view==='parent'&&parentPanel!=='menu')&&!['loading','playing'].includes(document.body.dataset.playing)&&!document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'),onUnavailable:()=>toast('离线保存暂时不可用，可以直接联网练习。')});}catch(error){console.warn('Offline preparation unavailable',error);}
    if(new URLSearchParams(location.search).get('audition')==='1'){try{openVoiceAudition();}catch(error){console.warn('Audition unavailable',error);toast('试听暂时没打开，可以先学今天这句。');}}
  })().finally(()=>{bootPending=null;});
  return bootPending;
}
installViewportFallback();
installInteractionFeedback();
installChildFeedback({canPlay:()=>!recording&&!recordPending&&!document.hidden&&!['loading','playing'].includes(document.body.dataset.playing)});
init();
