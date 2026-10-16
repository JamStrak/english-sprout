import {THEMES,EVENTS,ITEMS,GOALS,ALPHABET_NODES} from './content.js';
import {STORAGE_KEY,createState,validateState,localDay,recordEvidence,correctEvidence,effectiveEvidence,completeEvent,placeItem,goalStatus,selectEvent,alphabetEligibility,enableAlphabet,collectLetter,canRevealPhrase,speakingAlert} from './learning.js';
import {icon,buddy,themeArt,sceneArt,itemArt,roomArt} from './art.js';
import * as audio from './audio.js';

const app=document.querySelector('#app');
const PREFS='xiaoya-english:preferences:v1';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID?.()||`try-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const today=()=>localDay();
const GUIDE_STEPS=['listen','wave','speak','replay','gift','place','done'];
const readPrefs=value=>({welcome:!!value?.welcome,mic:!!value?.mic,guideStep:GUIDE_STEPS.includes(value?.guideStep)?value.guideStep:null});
let state=createState(),prefs=readPrefs(null),storageProblem=null,rawState=null;
let page='home',session=null,modal=null,parentUnlocked=false,selectedItem=null,drag=null,toastTimer=null;
let challenge=null,restoreFocus=null,renderGeneration=0;
try { rawState=localStorage.getItem(STORAGE_KEY); if(rawState)state=validateState(JSON.parse(rawState)); } catch(error){storageProblem=error.message;}
try { prefs=readPrefs(JSON.parse(localStorage.getItem(PREFS)||'null')); }catch{}

function save(next){
  if(storageProblem){showError('本机记录需要处理，尚未写入新记录。请先在家长区导出原记录。');return false;}
  try {validateState(next);const encoded=JSON.stringify(next);localStorage.setItem(STORAGE_KEY,encoded);rawState=encoded;state=next;return true;}
  catch(error){showError('这次记录没有保存。浏览器存储可能已满或被禁用，请保留本页并稍后重试。');return false;}
}
function savePrefs(next){try{localStorage.setItem(PREFS,JSON.stringify(next));prefs=next;return true;}catch{showError('设置没有保存，请检查浏览器存储权限。');return false;}}
function toast(message){clearTimeout(toastTimer);let el=document.querySelector('.toast');if(!el){el=document.createElement('div');el.className='toast';el.role='status';document.body.append(el);}el.textContent=message;toastTimer=setTimeout(()=>el.remove(),4500);}
function showError(message){openModal({type:'error',message});}
function button(action,label,glyph,extra=''){return `<button type="button" class="icon-button" data-action="${action}" aria-label="${esc(label)}" ${extra}>${icon(glyph)}</button>`;}
function voice(id){return `xiaoya/audio/v3/${id}.mp3`;}
async function sound(file){try{return await audio.playSound(file);}catch{toast('声音暂时没有播放。联网打开过这段声音后，就能离线再听。');return false;}}
function help(id){if(session)session.helped=true;return sound(voice(id));}
function stopSession(){if(session)clearTimeout(session.guideTimer);audio.releaseAudioSession();session=null;challenge=null;}
function navigate(next){stopSession();modal=null;page=next;selectedItem=null;render();window.scrollTo(0,0);}
function openModal(value){if(session){session.guideGeneration++;session.guideBusy=false;session.teaching=false;audio.stopSound();cancelAttempt(session);}restoreFocus=document.activeElement;modal=value;renderModal();setTimeout(()=>document.querySelector('.modal-card button,.modal-card input')?.focus(),0);}
function closeModal(){modal=null;if(session)render();else renderModal();restoreFocus?.focus?.();}
function requireParent(callback){if(parentUnlocked){callback();return;}openModal({type:'gate',callback,a:3+Math.floor(Math.random()*5),b:2+Math.floor(Math.random()*4)});}
function header(back=false){return `<header class="topbar">${back?button('home','回到首页','back'):`<span class="brand">小芽英语</span>`}<div class="topbar-actions">${button('help','语音帮助','help')}${button('parent','家长陪伴区','parent')}</div></header>`;}
function navigation(){return `<nav class="bottom-nav" aria-label="小芽的世界"><button data-action="home" aria-label="回到首页，和小芽接着玩">${icon('house')}<span class="sr-only">接着玩</span></button>${page!=='house'?`<button data-action="house" aria-label="打开我的小屋">${itemArt('sun-lamp')}<span class="sr-only">我的小屋</span></button>`:''}${state.alphabet.enabled&&alphabetEligibility(state).eligible?button('letters','发现小符号','sparkle'):''}</nav>`;}

function teachingButton(){return `<button class="teach-button" data-action="teach" aria-label="小芽教我说" ${session?.teaching?'disabled':''}>${buddy('listening')}<span class="sr-only">小芽教我说</span>${icon('ear',24)}</button>`;}
function assessmentView(s){const a=s.assessment;if(!a)return '';const copy={preparing:'小耳朵准备中，可以先回听、再说',assessing:'小芽在认真听…',matched:'我听懂啦！',retry:a.stars===2?'我听到一部分啦，再跟我说一遍':'这次还没听清，再听小芽说一遍',silence:'还没听到声音，等话筒亮起来再说',unavailable:'小耳朵还没准备好，可以先听、先说'};const rated=['matched','retry','silence'].includes(a.status);return `<section class="speech-feedback" data-assessment data-status="${a.status}" data-stars="${a.stars||0}"><button class="feedback-voice" data-action="assessment-voice" aria-label="${s.tutorial?'听小芽的下一步提示':`听小芽说这次的反馈：${copy[a.status]}`}">${rated?`<span class="practice-stars" aria-label="本次词句匹配 ${a.stars||0} 颗星，共 3 颗">${[1,2,3].map(n=>`<span class="${n<=(a.stars||0)?'lit':''}" aria-hidden="true">${icon('star',26)}</span>`).join('')}</span>`:'<span class="listening-dot" aria-hidden="true"></span>'}${icon('ear',24)}</button><p class="sr-only" role="status">${copy[a.status]}</p>${a.status==='unavailable'&&s.pendingClip?button('retry-assessment','再帮我听听这次录音','again'):''}</section>`;}
function assessmentVoice(){const s=session,a=s?.assessment;if(!a||s.recording||s.waiting)return;if(s.tutorial){guideNarration(guideVoice[s.guideStep]);return;}const id=a.status==='matched'?'speech-pass':a.status==='silence'?'speech-silent':a.status==='retry'?(a.stars===2?'speech-partial':'speech-retry'):'speech-wait';sound(voice(id));}

// Preparing the local model never blocks recording, demonstration or navigation.
function prepareFor(s){return audio.prepareRecognition(()=>{
  if(session===s&&s.assessment?.status==='preparing'){
    const el=document.querySelector('[data-assessment] p');if(el)el.textContent='小耳朵准备中，可以先回听、再说';
  }
});}
function cancelAttempt(s){s.speechGeneration++;audio.cancelRecording();audio.cancelRecognition();s.recording=false;s.waiting=false;s.assessment=null;s.pendingClip=null;}
async function teach(){const s=session;if(!s||s.teaching)return;
  cancelAttempt(s);audio.stopSound();s.guideGeneration++;s.helped=true;s.guideBusy=true;s.teaching=true;
  if(s.tutorial){s.guideStep='speak';s.phase='request';s.guideNeedsSample=false;savePrefs({...prefs,guideStep:'speak'});}
  else if(s.phase!=='listen')s.phase='request';
  const generation=s.speechGeneration;render();
  await sound(voice('assist-model'));if(session!==s||s.speechGeneration!==generation)return;
  await sound(s.event.audio);if(session!==s||s.speechGeneration!==generation)return;
  s.guideBusy=false;s.teaching=false;render();
}
function nextEvent(){return EVENTS.find(e=>!state.completions[e.id])||selectEvent(state,'hello',today());}
function homeView(){const fresh=prefs.guideStep!=='done',e=nextEvent();return `<main class="focus-home"><div class="focus-intro sr-only"><span class="brand">小芽英语</span><h1>${fresh?'小芽在等你':'和小芽接着玩'}</h1><p>${fresh?'点一点，打个招呼':'点一下，一起出发'}</p></div><div class="focus-stage"><button class="focus-target" data-primary data-action="${fresh?'start-guide':'next-event'}" aria-label="${fresh?'点一下，和小芽打招呼':`继续玩：${e.title}`}">${fresh?buddy('wave'):sceneArt(e,'before')}</button><span class="tap-cue" aria-hidden="true">${icon('tap',42)}</span></div><p class="focus-caption sr-only">${fresh?'你好呀，小朋友':esc(e.title)}</p><footer class="focus-footer">${!fresh?button('house','我的小屋','house'):''}${!fresh&&Object.keys(state.completions).length>=3?button('world','自己选一个生活故事','world'):''}${!fresh&&state.alphabet.enabled&&alphabetEligibility(state).eligible?button('letters','发现小符号','sparkle'):''}<button class="text-button" data-action="parent">家长陪伴</button></footer></main>`;}
function worldView(){return `${header(true)}<main class="world-home"><div class="theme-grid">${THEMES.map(theme=>`<button class="theme-card" data-theme="${theme.id}" aria-label="${esc(theme.name)}"><span class="theme-art">${themeArt(theme.id)}</span><span class="theme-progress" aria-hidden="true">${EVENTS.filter(e=>e.theme===theme.id).map(e=>`<i class="${state.completions[e.id]?'filled':''}"></i>`).join('')}</span></button>`).join('')}</div></main>${navigation()}`;}
const guideCopy={listen:'点小耳朵，听小芽说',wave:'点小手，打个招呼',speak:'点话筒，轮到你说啦',replay:'听听自己的声音',gift:'点小太阳，带它回家',place:'点亮这里，放好小太阳'};
const guideVoice={listen:'guide-hello',wave:'guide-wave',speak:'guide-speak',replay:'guide-replay',gift:'guide-gift',place:'guide-place'};
function guideView(){const s=session,step=s.guideStep,busy=s.guideBusy||s.waiting;let control='';const primary=(action,label,body,classes='')=>`<button class="guide-target ${classes} ${s.guideBusy&&!s.replaying?'is-talking':''} ${s.waiting?'waiting':''}" data-primary data-action="${action}" aria-label="${label}" ${busy?'disabled':''}>${body}</button>`;
  if(step==='listen')control=primary('sample','点小耳朵，听小芽说',icon('ear',60));
  if(step==='wave')control=primary('guide-wave','点小手，向小芽挥挥手',icon('wave',60));
  if(step==='speak'&&s.guideNeedsSample)control=primary('sample','再听小芽说一遍',icon('ear',60));
  else if(step==='speak')control=primary('record',s.recording?'说完了，结束录音':'点话筒，开始说话',icon(s.recording?'stop':'mic',60),`mic-button ${s.recording?'recording':''}`);
  if(step==='replay')control=primary('guide-replay','回听刚才的声音',icon('ear',60));
  if(step==='gift')control=primary('guide-gift','把小太阳带回家',itemArt('sun-lamp'),'guide-gift');
  if(step==='place')control=`<div class="guide-room">${roomArt()}${primary('guide-place','把小太阳放在发光的位置',itemArt('sun-lamp'),'place-target')}</div>`;
  return `${header(true)}<main class="guide-view" data-step="${step}"><div class="guide-progress" aria-hidden="true"><i class="filled"></i><i class="${['speak','replay','gift','place'].includes(step)?'filled':''}"></i><i class="${['gift','place'].includes(step)?'filled':''}"></i></div>${step!=='place'?`<div class="guide-scene ${step==='wave'?'waving':''} ${s.guideBusy&&!s.replaying?'is-talking':''}">${sceneArt(sceneFor(s),['gift','replay'].includes(step)?'resolved':step==='speak'?'request':'before')}</div>`:''}<p class="guide-message sr-only" role="status">${s.recording?'话筒亮啦，现在说，我在听':s.waiting?'等话筒准备好…':s.guideBusy?(s.replaying?'听，这是你的声音':'小芽正在说话…'):s.guideError?'声音没响起来，再点一次试试':guideCopy[step]}</p><div class="guide-controls">${control}${!busy&&!s.recording&&step!=='place'?`<span class="guide-cue" aria-hidden="true">${icon('tap',38)}</span>`:''}</div>${['speak','replay'].includes(step)?assessmentView(s)+teachingButton():''}${step==='speak'&&s.allowSkip&&!s.recording&&!busy?`<button class="text-button guide-secondary" data-action="guide-skip" aria-label="先听小芽说">${icon('ear')}<span class="sr-only">先听小芽说</span></button>`:''}</main>`;
}
async function guideNarration(id,modelFirst=false){
  const s=session;if(!s?.tutorial||s.recording||s.waiting)return;
  const generation=++s.guideGeneration;s.guideBusy=true;s.guideError=false;s.replaying=false;
  if(modelFirst)s.guideNeedsSample=true;render();
  if(s.guideNeedsSample){const ok=await sound(s.event.audio);if(session!==s||s.guideGeneration!==generation)return;
    if(!ok){s.guideBusy=false;s.guideError=true;render();return;}s.guideNeedsSample=false;}
  const ok=await sound(voice(id));if(session!==s||s.guideGeneration!==generation)return;
  s.guideBusy=false;s.guideError=!ok;render();
}
function guideStep(step,modelFirst=false){const s=session;if(!s?.tutorial)return false;if(!savePrefs({...prefs,welcome:true,guideStep:step}))return false;clearTimeout(s.guideTimer);s.guideStep=step;s.phase=step==='speak'||step==='replay'?'request':step==='gift'?'reward':step==='place'?'resolved':'listen';s.guideError=false;render();guideNarration(guideVoice[step],modelFirst);if(step==='speak')s.guideTimer=setTimeout(()=>{if(session===s&&s.guideStep==='speak'){s.allowSkip=true;if(!s.recording&&!modal)render();}},15000);return true;}
function startGuide(){const step=prefs.guideStep==='done'||!prefs.guideStep?'listen':prefs.guideStep==='replay'?'speak':prefs.guideStep;startEvent('hello',EVENTS[0],null,true);session.helped=true;session.guideGeneration=0;session.allowSkip=false;guideStep(step,step==='speak');}
function guideWave(){if(session?.tutorial&&!session.guideBusy&&session.guideStep==='wave')guideStep('speak');}
async function guideReplay(){const s=session;if(!s?.tutorial||s.guideBusy||s.guideStep!=='replay')return;s.speechGeneration++;audio.cancelRecognition();const generation=++s.guideGeneration;s.guideBusy=true;s.replaying=true;render();const ok=await audio.replayClip().catch(()=>false);if(session!==s||s.guideGeneration!==generation)return;s.guideBusy=false;s.replaying=false;if(ok)guideStep('gift');else{guideStep('speak',true);toast('这段录音已经释放，再说一次吧。');}}
async function guideSkip(){const s=session;if(!s?.tutorial||s.guideBusy||s.guideStep!=='speak')return;cancelAttempt(s);const generation=++s.guideGeneration;s.guideBusy=true;render();const ok=await sound(s.event.audio);if(session!==s||s.guideGeneration!==generation)return;s.guideBusy=false;if(ok)guideStep('gift');else{s.guideError=true;render();}}
function guideGift(){const s=session;if(!s?.tutorial||s.guideBusy||s.guideStep!=='gift')return;if(!state.completions[s.event.id]&&!save(completeEvent(state,s.event.id,today())))return;guideStep('place');}
function guidePlace(){const s=session;if(!s?.tutorial||s.guideBusy||s.guideStep!=='place')return;if(!state.items['sun-lamp']){guideStep('gift');return;}if(state.items['sun-lamp'].x===null&&!save(placeItem(state,'sun-lamp',{x:.5,y:.4})))return;if(!savePrefs({...prefs,welcome:true,guideStep:'done'}))return;navigate('home');sound(voice('guide-done'));}
function startEvent(themeId,forcedEvent=null,node=null,tutorial=false){
  audio.releaseAudioSession();
  const event=forcedEvent||selectEvent(state,themeId,today());
  const context=event.context||event.contexts.find(c=>c.id===node?.contextId)||event.contexts[0];
  const practiced=!!state.completions[event.id];
  session={id:uid(),event,context,phase:practiced||node?'request':'listen',helped:!!node,choices:[...event.choices].sort(()=>Math.random()-.5),listened:false,firstChoice:true,listeningRecorded:false,recording:false,waiting:false,observed:false,attemptId:null,hasClip:false,node,discoveryReady:false,speechGeneration:0,hadItem:!!state.items[event.itemId],tutorial,guideStep:'listen',guideGeneration:0};
  session.choices=session.choices.map(choice=>choice.correct?{...choice,scene:{...event,...context}}:choice);
  page='event';modal=null;render();window.scrollTo(0,0);
  // Keep first entry light; the local model starts preparing on the first recording.
  fetch(new URL(voice(context.id),document.baseURI)).catch(()=>{});
}
function sceneFor(s){return {...s.event,...s.context,sceneId:s.context.scene,context:s.context};}
function choiceMarkup(choices,attr='choice'){return `<div class="choice-row">${choices.map(choice=>`<button class="choice-button" data-${attr}="${esc(choice.id)}" aria-label="${esc(choice.label)}">${sceneArt(choice.scene||choice.eventId||'food-water','before')}</button>`).join('')}</div>`;}
function eventView(){
  const s=session;if(!s)return homeView();
  if(s.tutorial)return guideView();
  const done=s.phase==='resolved'||s.phase==='reward';
  let controls='';
  if(s.phase==='listen')controls=`${button('sample','听伙伴说话','ear','data-primary')}${s.listened?choiceMarkup(s.choices):''}`;
  if(s.phase==='request')controls=`<div class="support-controls">${s.hasClip?button('replay','回听自己的声音','ear'):button('sample','听听可以怎么说','ear')}${button('context-help','听中文提示','help')}</div><button class="mic-button ${s.recording?'recording':''}" data-primary data-action="record" aria-label="${s.recording?'结束录音':s.waiting?'正在准备录音':s.hasClip?'重新说一次':'点一下开始说话'}" ${s.waiting||s.teaching?'disabled':''}>${icon(s.recording?'stop':'mic',54)}<span class="mic-ripple" aria-hidden="true"></span></button><div class="support-controls">${button('watch','先看伙伴做一遍','play')}${button('observe','请家长观察这次表达','parent')}</div>`;
  if(s.phase==='resolved')controls=`<button class="primary-button round-action" data-primary data-action="finish" aria-label="完成这次互动">${icon('check',46)}</button>`;
  if(s.phase==='reward')controls=`<button class="reward-item" data-primary data-action="take-reward" aria-label="把${esc(ITEMS.find(i=>i.id===s.event.itemId).name)}放进小屋">${itemArt(s.event.itemId)}${icon('house',42)}</button>`;
  const cue=s.recording?'话筒亮啦，现在说，我在听':s.waiting?'等话筒亮起来再说…':s.teaching?'听小芽说，等会儿轮到你':s.phase==='listen'?(s.listened?'点一幅图，找出声音的意思':'点小耳朵，听小芽说'):s.phase==='request'?(s.hasClip?'点话筒再说一次，或点小芽听示范':'点话筒，把想说的话告诉小芽'):s.phase==='resolved'?'点小勾勾，收好这次相遇':'点小礼物，把它带回家';
  // Listening must test sound → meaning, never matching a revealed answer image.
  const listening=s.phase==='listen';
  return `${header(true)}<main class="event-view" data-phase="${s.phase}"><div class="status-dots" aria-hidden="true"><i class="filled"></i><i class="${!listening?'filled':''}"></i><i class="${done?'filled':''}"></i></div><div class="scene-stage" ${listening?'data-listening-neutral':''}><div class="scene-art">${listening?`<div class="listening-buddy">${buddy('listening')}<span>${icon('ear',50)}</span></div>`:sceneArt(sceneFor(s),done?'resolved':'request')}</div>${s.recording?'<div class="recording-indicator" role="status" aria-label="正在录音"><i></i><i></i><i></i></div>':''}</div>${!listening&&s.phase!=='reward'?assessmentView(s):''}<p class="event-cue sr-only" role="status">${cue}</p><div class="event-controls ${listening&&s.listened?'choosing':''}">${controls}${!s.recording&&!s.waiting&&!s.teaching&&!(listening&&s.listened)?`<span class="event-tap-cue" aria-hidden="true">${icon('tap',38)}</span>`:''}</div>${s.phase==='request'?teachingButton():''}<div class="sr-only" role="status">${esc(listening?'听声音，再选择对应的图画':s.phase==='request'?s.context.request:s.event.resolution)}</div></main>`;
}
async function sample(){const s=session;if(!s)return;if(s.recording||s.waiting){return teach();}if(s.guideBusy)return;
  if(s.tutorial){if(s.guideStep==='speak'&&s.guideNeedsSample){guideNarration('guide-speak',true);return;}if(s.guideStep!=='listen')return;const generation=++s.guideGeneration;s.guideBusy=true;render();const ok=await sound(s.event.audio);if(session!==s||s.guideGeneration!==generation)return;s.guideBusy=false;if(ok)guideStep('wave');else{s.guideError=true;render();}return;}
  s.helped=s.phase==='request'||s.helped;const ok=await sound(s.event.audio);if(session!==s)return;if(ok&&s.phase==='listen'){s.listened=true;render();sound(voice('listen'));}}
function choose(id){const s=session;if(!s||s.phase!=='listen'||!s.listened)return;const choice=s.choices.find(c=>c.id===id);if(!choice)return;
  if(!s.listeningRecorded){if(!save(recordEvidence(state,{attemptId:uid(),eventId:s.event.id,contextId:s.context.id,kind:'listening',result:choice.correct?'independent':'not_yet',source:'machine',helped:s.helped,date:today()})))return;s.listeningRecorded=true;}
  if(choice.correct){s.helped=true;s.phase=s.listenOnly?'resolved':'request';render();sound(voice(s.listenOnly?'finish':'speak'));}else{s.firstChoice=false;s.helped=true;help('again');document.querySelector(`[data-choice="${id}"]`)?.classList.add('try-again');}
}
async function record(){const s=session;if(!s||s.phase!=='request'||s.waiting||s.guideBusy)return;if(s.recording){audio.finishRecording();return;}if(!prefs.mic){requireParent(()=>openModal({type:'mic'}));if(s.tutorial)sound(voice('guide-mic'));return;}
  cancelAttempt(s);const generation=s.speechGeneration;
  s.waiting=true;s.hasClip=false;s.observed=false;audio.stopSound();
  s.preparation=prepareFor(s).then(()=>true,()=>false);
  render();
  const current=()=>session===s&&s.speechGeneration===generation;
  try{const started=await audio.beginRecording({
    onReady:()=>{if(!current())return;s.waiting=false;s.recording=true;render();},
    onLevel:level=>{if(current())document.querySelector('.mic-button')?.style.setProperty('--voice',level);},
    onFinish:result=>{if(current())recorded(s,result);}
  });if(!current())return;if(!started){s.waiting=false;s.recording=false;render();}}
  catch(error){if(!current())return;s.waiting=false;s.recording=false;s.allowSkip=true;render();if(s.tutorial)guideNarration('guide-skip');toast(error.name==='NotAllowedError'?'麦克风未获允许。可以先听小芽说；家长稍后可在浏览器设置中开启。':error.message);}
}
async function recorded(s,result){if(session!==s)return;s.recording=false;s.waiting=false;s.hasClip=!!result.url;s.observed=false;
  if(result.error){s.assessment={status:'unavailable',stars:0};s.allowSkip=true;render();toast(result.error);return;}
  if(!result.url||(!result.hasVoice&&result.voiceActivityAvailable!==false)){s.assessment={status:'silence',stars:0};s.allowSkip=true;render();sound(voice('speech-silent'));return;}
  s.pendingClip=result.url;
  if(s.tutorial)guideStep('replay');
  assessClip(s,result.url,s.speechGeneration);
}
async function assessClip(s,url,generation){
  const current=()=>session===s&&s.speechGeneration===generation&&s.phase==='request';
  s.assessment={status:audio.speechReady()?'assessing':'preparing',stars:0};render();
  try{
    const prepared=audio.speechReady()||await (s.preparation||prepareFor(s).then(()=>true,()=>false));
    if(!current())return;if(!prepared)throw new Error('local model unavailable');
    s.assessment={status:'assessing',stars:0};render();
    const recognized=await audio.recognize(url,s.event.accepted);
    if(!current())return;if(!recognized)throw new Error('no assessment');
    // This feedback grades recognized words only, not phonetic accuracy. No
    // recording or recognized text is persisted, and tutorial is never evidence.
    s.assessment={status:recognized.matched?'matched':'retry',stars:recognized.stars};
    if(!s.tutorial&&recognized.heard?.trim()){
      const attemptId=uid();if(!save(recordEvidence(state,{attemptId,eventId:s.event.id,contextId:s.context.id,kind:'speech',result:recognized.matched?(s.helped?'supported':'independent'):'unclear',source:'machine',helped:s.helped,date:today()})))return;
      s.attemptId=attemptId;
    }
    if(recognized.matched&&!s.tutorial){s.discoveryReady=true;s.phase='resolved';}
    render();
    if(!s.tutorial)sound(voice(recognized.matched?'speech-pass':recognized.stars===2?'speech-partial':'speech-retry'));
  }catch{if(!current())return;s.assessment={status:'unavailable',stars:0};render();if(!s.tutorial)sound(voice('speech-wait'));}
}
function retryAssessment(){const s=session;if(!s?.pendingClip)return;s.preparation=prepareFor(s).then(()=>true,()=>false);assessClip(s,s.pendingClip,++s.speechGeneration);}
function observation(attemptId=null){
  requireParent(()=>{audio.cancelRecording();audio.cancelRecognition();if(session){session.speechGeneration++;session.recording=false;session.waiting=false;session.assessment=null;}const existing=attemptId?effectiveEvidence(state).find(e=>e.attemptId===attemptId):null;openModal({type:'observe',attemptId,existing,event:existing?EVENTS.find(e=>e.id===existing.eventId):session?.event,helped:existing?existing.helped:!!session?.helped,helpedLocked:!attemptId&&!!session?.helped});});
}
function submitObservation(result){const m=modal,s=session;if(m?.type!=='observe'||!m.event)return;const helped=m.helpedLocked||!!document.querySelector('#observed-help')?.checked;const exact=!!document.querySelector('#exact-phrase')?.checked;const phraseId=exact&&['independent','supported'].includes(result)?m.event.lessonId:null;
  const next=m.attemptId?correctEvidence(state,m.attemptId,{correctionId:uid(),result,helped,phraseId,date:today()}):recordEvidence(state,{attemptId:uid(),eventId:m.event.id,contextId:s.context.id,kind:'speech',result,source:'parent',helped,phraseId,date:today()});
  if(!save(next))return;closeModal();
  if(s&&m.event.id===s.event.id&&!m.attemptId){s.observed=true;s.discoveryReady=['independent','supported'].includes(result);s.phase='resolved';render();sound(voice('finish'));}else render();
}
async function watch(){const s=session;if(!s)return;s.speechGeneration++;audio.cancelRecognition();audio.cancelRecording();s.recording=false;s.waiting=false;s.assessment=null;s.teaching=false;s.helped=true;s.phase='resolved';render();const ok=await sound(s.event.audio);if(session===s&&s.phase==='resolved'&&ok)sound(voice('finish'));}
function finish(){const s=session;if(!s)return;
  if(s.node){if(!s.discoveryReady){navigate('letters');toast('这次先看看，准备好后再和伙伴说一说。');return;}if(!save(collectLetter(state,s.node.id,today())))return;const node=s.node;stopSession();page='letters';render();openModal({type:'letter',node});return;}
  if(!save(completeEvent(state,s.event.id,today())))return;
  if(!s.hadItem){s.phase='reward';render();sound(voice('reward'));}else{navigate('house');sound(voice('house'));}}
function houseView(){return `${header(true)}<main class="house-view"><div class="room-stage" tabindex="0" aria-label="小屋摆放区域。选好家具后点这里放置。">${roomArt()}${Object.entries(state.items).filter(([,v])=>v.x!==null).map(([id,v])=>`<button class="room-item ${selectedItem===id?'selected':''}" data-item="${id}" aria-label="移动${esc(ITEMS.find(i=>i.id===id).name)}" style="left:${10+v.x*80}%;top:${25+v.y*60}%">${itemArt(id)}</button>`).join('')}</div><div class="inventory" aria-label="小屋家具">${Object.keys(state.items).map(id=>`<button class="inventory-item ${selectedItem===id?'selected':''}" data-inventory="${id}" aria-label="选择${esc(ITEMS.find(i=>i.id===id).name)}">${itemArt(id)}</button>`).join('')||`<button class="empty-house" data-action="home" aria-label="去生活世界收集第一件家具">${buddy('happy')}${icon('plus',40)}</button>`}</div>${selectedItem?`<div class="house-actions">${button('furniture-play','和这件家具一起玩','play')}${button('place-center','将家具放在小屋中央','check')}</div>`:''}</main>${navigation()}`;}
function putItem(id,x,y){if(save(placeItem(state,id,{x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y))}))){selectedItem=null;render();sound(voice('house-placed'));}}
function lettersView(){if(!state.alphabet.enabled||!alphabetEligibility(state).eligible)return homeView();const count=Object.keys(state.alphabet.letters).length;return `${header(true)}<main class="parent-view discovery-view"><h1 class="sr-only">小符号的秘密</h1><p class="sr-only">和熟悉的伙伴交流，发现藏起来的符号。</p><div class="letter-grid">${ALPHABET_NODES.map(n=>`<button class="letter-card ${state.alphabet.letters[n.id]?'collected':''}" data-letter="${n.id}" aria-label="${state.alphabet.letters[n.id]?`欣赏字母 ${n.letter}`:`第${n.index+1}个发现活动`}">${state.alphabet.letters[n.id]?n.letter:icon('sparkle')}</button>`).join('')}</div><p>${count} / 26</p>${count===26?`<section class="parent-card"><h2 class="sr-only">原来这些声音长这样</h2>${[...new Map(EVENTS.map(e=>[e.lessonId,e])).values()].map(e=>canRevealPhrase(state,e.lessonId)?`<button class="phrase-reveal" data-phrase="${e.id}">${esc(e.english)} ${icon('ear')}</button>`:'').join('')||'<p class="sr-only">继续在不同日子、不同情境里说熟悉的话。家长确认过的原句，会慢慢在这里出现。</p>'}</section>`:''}</main>${navigation()}`;}
function startLetter(id){const n=ALPHABET_NODES.find(x=>x.id===id);if(!n)return;if(state.alphabet.letters[id]){openModal({type:'letter',node:n});return;}const e=EVENTS.find(x=>x.id===n.eventId);challenge={node:n,event:e,listened:false,choices:[...e.choices].sort(()=>Math.random()-.5)};openModal({type:'discovery'});}
async function discoveryListen(){if(!challenge)return;const current=challenge;if(await sound(current.event.audio)){if(challenge===current){current.listened=true;renderModal();}}}
function discoveryChoice(id){if(!challenge?.listened)return;const choice=challenge.choices.find(c=>c.id===id);if(!choice)return;if(choice.correct){const n=challenge.node,e=challenge.event;challenge=null;closeModal();startEvent(e.theme,{...e,context:e.contexts.find(c=>c.id===n.contextId)},n);}else{help('again');}}
const levelNames={unseen:'还没开始',participated:'已参与，待观察',listening:'有听懂的证据',supported:'能在帮助下表达',independent:'有独立表达的证据',passed:'隔天换情境仍能表达'};
const resultNames={independent:'独立表达',supported:'有帮助才表达',not_yet:'尚未观察到',unclear:'无法确定',device_error:'设备未完成'};
function parentView(){const eligibility=alphabetEligibility(state),alert=speakingAlert(state);const records=effectiveEvidence(state).slice(-20).reverse();return `${header(true)}<main class="parent-view"><div class="parent-heading"><span class="eyebrow">陪伴手记</span><h1>听懂了，也愿意说。</h1><p>看实际表达的变化，不用通关次数代替学会。</p></div>${storageProblem?`<section class="parent-card"><h2>本机记录需要处理</h2><p>${esc(storageProblem)}</p><button class="secondary-button" data-action="export">导出原记录</button><p>暂未覆盖原数据。请保留导出文件后联系开发者处理。</p></section>`:''}${alert.active?`<section class="parent-card attention"><h2>换一种邀请方式</h2><p>${esc(alert.message)}</p><p>先让孩子指给你看，再由你示范一句；下次等一等，给孩子自己表达的机会。允许继续玩，但能力状态不会因此升级。</p></section>`:''}<div class="parent-grid">${GOALS.map(g=>{const st=goalStatus(state,g.id);return `<section class="parent-card"><h2>${g.name}</h2><p class="goal-level">${levelNames[st.level]}</p><div class="evidence-steps"><span class="${st.listening?'done':''}">听懂</span><span class="${st.supported?'done':''}">有帮助说</span><span class="${st.independent?'done':''}">自己说</span><span class="${st.retained?'done':''}">换情境说</span></div><p class="fine-print">家长确认独立 ${st.independentCount} 次 · 帮助下 ${st.supportedCount} 次${st.candidateCount?` · 机器候选 ${st.candidateCount} 次待确认`:''}</p></section>`;}).join('')}</div><section class="parent-card"><h2>一起做一次生活验收</h2><p>选熟悉的情境，先不播放答案。孩子可以说更短、意思合适的话。观察后如实记录；一次表现不等于稳定掌握。</p><div class="parent-actions">${EVENTS.map(e=>`<div class="checkup-option"><button class="secondary-button" data-checkup="${e.id}">${e.title} · 说</button><button class="icon-button" data-listening="${e.id}" aria-label="${e.title} · 听懂回访">${icon('ear')}</button></div>`).join('')}</div></section><section class="parent-card"><h2>语音与本机设置</h2><p>录音只供本次回听，离开互动即释放。学习记录只保存在这个浏览器，换设备不会自动同步。</p><div class="parent-actions"><button class="secondary-button" data-action="mic-settings">${prefs.mic?'录音已允许 · 查看':'允许本机录音'}</button><button class="secondary-button" data-action="recognition">${audio.speechReady()?'本地识别已就绪':'重试准备自动语音反馈'}</button><button class="secondary-button" data-action="export">导出学习记录</button></div><p class="fine-print">第一次录音会自动准备约 47 MB 的本机识别资源，下载后可离线识别。每次练习自动给出 0–3 颗词句匹配星，无需家长代判；星级不等于发音准确率。隔天换情境的稳定掌握，仍单独记录并可由家长核对。</p><p id="model-status" role="status"></p></section><section class="parent-card"><h2>慢慢打开的文字发现</h2><p>表达需要、请求帮助、邀请陪伴，分别要有跨日且换情境的家长确认。已达到 ${eligibility.passed.length} / ${eligibility.required.length} 项。</p>${!state.alphabet.enabled?`<button class="primary-button" data-action="enable-letters" ${eligibility.eligible?'':'disabled'}>开启独立文字探索区</button>`:`<p>${eligibility.eligible?'文字探索已开启':'补充核心能力观察后，继续文字探索。'} · 已收集 ${Object.keys(state.alphabet.letters).length} / 26 个符号</p>`}<p class="fine-print">集齐后，只有也取得跨日、换情境原句证据的短句才会显示拼写。这些是首版可调整的产品规则。</p></section><section class="parent-card"><h2>最近的观察</h2><p>可修正误点。原观察和修正历史都会保留。</p>${records.map(r=>`<div class="observation-row"><div><strong>${esc(EVENTS.find(e=>e.id===r.eventId).title)}</strong><p>${r.date} · ${r.kind==='listening'?'找图':resultNames[r.result]} · ${r.source==='parent'?'家长观察':'互动候选'}${r.helped?' · 有提示':''}${r.corrected?' · 已修正':''}</p></div>${r.kind==='speech'?`<button class="secondary-button" data-correct="${r.attemptId}">核对</button>`:''}</div>`).join('')||'<p>先和孩子玩一个生活事件，留下第一份观察。</p>'}</section><p class="fine-print">小芽英语 0.3 · ${esc(document.querySelector('meta[name="xiaoya-build"]')?.content||'开发中')} · 本机离线体验版</p></main>`;}
function render(){renderGeneration++;app.innerHTML=`<div class="app-shell">${page==='event'?eventView():page==='house'?houseView():page==='parent'?parentView():page==='letters'?lettersView():page==='world'?worldView():homeView()}</div><div id="modal-root"></div>`;renderModal();}
function renderModal(){const root=document.querySelector('#modal-root');if(!root)return;if(!modal){root.innerHTML='';return;}let html='';const m=modal;
  if(m.type==='gate')html=`<h2>请交给陪伴的大人</h2><p>这里记录孩子真实的学习表现。</p><label for="parent-answer">${m.a} + ${m.b} =</label><input id="parent-answer" inputmode="numeric" autocomplete="off" aria-label="计算结果"><button class="primary-button" data-action="gate-submit">进入</button><button class="secondary-button" data-action="close">回到孩子的世界</button>`;
  if(m.type==='mic')html=`<h2>录下这一次声音</h2><p>点话筒开始，停顿后自动结束，也可再次点击结束。每次最长 12 秒。</p><p>录音只在当前页面内存临时回听，不上传。浏览器还会询问麦克风权限。</p><button class="primary-button" data-action="allow-mic">允许孩子使用本机麦克风</button><button class="secondary-button" data-action="disable-mic">暂不使用录音</button>`;
  if(m.type==='observe')html=`<h2>${m.attemptId?'核对这次观察':'这一次，孩子怎样表达？'}</h2><p>${esc(m.event?.title)} · ${esc(m.event?.chinese)}</p><p>意思适合当前情境就算表达，不必强求完整长句。没有看到、没听清时，请选无法确定。</p><label class="check-label"><input id="observed-help" type="checkbox" ${m.helped?'checked':''} ${m.helpedLocked?'disabled':''}> 这次听过示范、中文提示或成人提示</label><label class="check-label"><input id="exact-phrase" type="checkbox" ${m.existing?.phraseId?'checked':''}> 我确实听到了这句原句：<b>${esc(m.event?.english)}</b></label>${session?.hasClip?'<button class="secondary-button" data-action="replay">回听这次录音</button>':''}<div class="observation-options"><button class="primary-button" data-observation="independent">孩子自己表达出来了</button><button class="secondary-button" data-observation="supported">在帮助下表达出来了</button><button class="secondary-button" data-observation="not_yet">尚未观察到合适的表达</button><button class="secondary-button" data-observation="unclear">这次无法确定</button></div><button class="text-button" data-action="close">返回</button>`;
  if(m.type==='error')html=`<h2>先停一下</h2><p>${esc(m.message)}</p><button class="primary-button" data-action="close">知道了</button>`;
  if(m.type==='letter')html=`<div class="discovered-letter">${m.node.letter}</div><p class="sr-only">熟悉的声音里，还藏着这样的小符号。</p><button class="primary-button round-action" data-action="close" aria-label="收好这次发现">${icon('check',40)}</button>`;
  if(m.type==='discovery'&&challenge)html=`<h2 class="sr-only">声音藏在哪幅图里？</h2><p class="sr-only">听一个熟悉的声音，找出它的意思。</p>${button('discovery-listen','听声音','ear')}${challenge.listened?choiceMarkup(challenge.choices,'discovery-choice'):''}<button class="icon-button" data-action="close" aria-label="以后再来">${icon('back')}</button>`;
  root.innerHTML=`<div class="modal-backdrop"><section class="modal-card" role="dialog" aria-modal="true" aria-label="${m.type==='gate'?'家长入口':'小芽提示'}">${html}</section></div>`;
}
function exportState(){const blob=new Blob([storageProblem?rawState||storageProblem:JSON.stringify({product:'xiaoya-english',exported:today(),state,preferences:prefs},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`小芽英语-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
async function recognition(){const el=document.querySelector('#model-status');if(el)el.textContent='准备本机识别资源，可继续浏览；请保持本页打开。';try{await audio.prepareRecognition(value=>{const target=document.querySelector('#model-status');if(target)target.textContent=typeof value==='string'?value:'正在准备本机识别…';});toast('本机识别已准备好，录音后会自动反馈词句匹配星级。');if(page==='parent')render();}catch{toast('识别资源没有准备完成，可重试。听、玩和亲子验收仍可使用。');}}
const actions={
  home:()=>{navigate('home');sound(voice('next'));},house:()=>{navigate('house');sound(voice('house'));},world:()=>navigate('world'),letters:()=>navigate('letters'),
  'start-guide':startGuide,'next-event':()=>{const e=nextEvent();startEvent(e.theme,e);sound(voice(session.phase==='listen'?'guide-hello':'speak'));},
  'guide-wave':guideWave,'guide-replay':guideReplay,'guide-gift':guideGift,'guide-place':guidePlace,'guide-skip':guideSkip,
  parent:()=>requireParent(()=>navigate('parent')),
  help:()=>session&&(session.recording||session.waiting||session.phase==='request')?teach():session?.tutorial?guideNarration(guideVoice[session.guideStep]):help(session?session.context.id:page==='house'?'house':'welcome'),
  sample,teach,'assessment-voice':assessmentVoice,'context-help':()=>session&&(session.recording||session.waiting||session.pendingClip||session.assessment)?teach():session&&help(session.context.id),record,'retry-assessment':retryAssessment,
  replay:()=>audio.replayClip().catch(()=>toast('这次录音已释放，请重新录制。')),
  observe:()=>observation(),watch,finish,'take-reward':()=>{navigate('house');sound(voice('house'));},
  'place-center':()=>selectedItem&&putItem(selectedItem,.5,.65),
  'furniture-play':()=>{const e=EVENTS.find(e=>e.itemId===selectedItem);if(e)startEvent(e.theme,{...e,context:e.contexts[1]});},
  close:closeModal,
  'gate-submit':()=>{if(Number(document.querySelector('#parent-answer')?.value)===modal.a+modal.b){const cb=modal.callback;parentUnlocked=true;closeModal();cb();}else toast('请由陪伴的大人填写计算结果。');},
  'mic-settings':()=>openModal({type:'mic'}),
  'allow-mic':()=>{if(savePrefs({...prefs,mic:true})){closeModal();if(session?.tutorial)guideNarration('guide-speak');else toast('点大话筒即可开始，浏览器可能再次询问权限。');}},
  'disable-mic':()=>{if(savePrefs({...prefs,mic:false})){audio.cancelRecording();if(session){session.allowSkip=true;session.recording=false;session.waiting=false;}closeModal();if(session?.tutorial)guideNarration('guide-skip');}},
  recognition,export:exportState,'enable-letters':()=>{if(save(enableAlphabet(state,today())))render();},'discovery-listen':discoveryListen
};
app.addEventListener('click',event=>{if(drag?.moved)return;const b=event.target.closest('button');if(!b)return;try{
  if(b.dataset.action)actions[b.dataset.action]?.();
  else if(b.dataset.theme)startEvent(b.dataset.theme);
  else if(b.dataset.choice)choose(b.dataset.choice);
  else if(b.dataset.inventory){selectedItem=b.dataset.inventory;render();}
  else if(b.dataset.item){selectedItem=b.dataset.item;render();}
  else if(b.dataset.observation)submitObservation(b.dataset.observation);
  else if(b.dataset.correct)observation(b.dataset.correct);
  else if(b.dataset.checkup){const e=EVENTS.find(x=>x.id===b.dataset.checkup);const pick=selectEvent(state,e.theme,today());startEvent(e.theme,{...e,context:pick.id===e.id?pick.context:e.contexts[state.completions[e.id]?1:0]});session.phase='request';session.helped=false;render();}
  else if(b.dataset.listening){const e=EVENTS.find(x=>x.id===b.dataset.listening);const prior=effectiveEvidence(state).filter(r=>r.eventId===e.id&&r.kind==='listening').slice(-1)[0];const context=e.contexts.find(c=>c.id!==prior?.contextId)||e.contexts[0];startEvent(e.theme,{...e,context});session.phase='listen';session.listenOnly=true;session.helped=false;render();}
  else if(b.dataset.letter)startLetter(b.dataset.letter);
  else if(b.dataset.discoveryChoice)discoveryChoice(b.dataset.discoveryChoice);
  else if(b.dataset.phrase)sound(EVENTS.find(e=>e.id===b.dataset.phrase).audio);
}catch(error){showError(error.message);}});
app.addEventListener('click',event=>{if(page!=='house'||!selectedItem||event.target.closest('button')||drag?.moved)return;const room=event.target.closest('.room-stage');if(room){const r=room.getBoundingClientRect();putItem(selectedItem,((event.clientX-r.left)/r.width-.1)/.8,((event.clientY-r.top)/r.height-.25)/.6);}});
app.addEventListener('pointerdown',event=>{const item=event.target.closest('.room-item');if(!item||event.button>0)return;drag={id:item.dataset.item,target:item,x:event.clientX,y:event.clientY,moved:false};item.setPointerCapture(event.pointerId);});
app.addEventListener('pointermove',event=>{if(!drag)return;const r=document.querySelector('.room-stage').getBoundingClientRect();if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>6)drag.moved=true;if(drag.moved){drag.target.style.left=`${Math.max(10,Math.min(90,(event.clientX-r.left)/r.width*100))}%`;drag.target.style.top=`${Math.max(25,Math.min(85,(event.clientY-r.top)/r.height*100))}%`;}});
app.addEventListener('pointerup',event=>{if(!drag)return;const d=drag;if(d.moved){const r=document.querySelector('.room-stage').getBoundingClientRect();putItem(d.id,((event.clientX-r.left)/r.width-.1)/.8,((event.clientY-r.top)/r.height-.25)/.6);}setTimeout(()=>{if(drag===d)drag=null;},0);});
app.addEventListener('pointercancel',()=>{drag=null;render();});
document.addEventListener('keydown',event=>{if(modal&&event.key==='Escape'){closeModal();return;}if(modal&&event.key==='Tab'){const list=[...document.querySelectorAll('.modal-card button,.modal-card input')].filter(e=>!e.disabled);if(!list.length)return;const first=list[0],last=list.slice(-1)[0];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}if(modal?.type==='gate'&&event.key==='Enter')actions['gate-submit']();});
function suspend(){
  audio.releaseAudioSession();
  if(session){const s=session;s.speechGeneration++;s.recording=false;s.waiting=false;s.hasClip=false;s.assessment=null;s.pendingClip=null;s.teaching=false;s.guideGeneration++;s.guideBusy=false;clearTimeout(s.guideTimer);
    if(s.tutorial){s.allowSkip=true;
      if(s.guideStep==='replay'){s.guideStep='speak';s.phase='request';s.guideNeedsSample=true;savePrefs({...prefs,guideStep:'speak'});}
    }
    render();
  }
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
window.addEventListener('pagehide',suspend);
window.addEventListener('storage',event=>{if(event.key!==STORAGE_KEY&&event.key!==PREFS)return;stopSession();try{rawState=localStorage.getItem(STORAGE_KEY);state=validateState(JSON.parse(rawState||JSON.stringify(createState())));storageProblem=null;prefs=readPrefs(JSON.parse(localStorage.getItem(PREFS)||'null'));page='home';modal=null;render();toast('已同步这个浏览器另一页面的记录。');}catch(error){storageProblem=error.message;page='parent';modal=null;render();}});
render();
