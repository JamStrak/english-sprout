import {EVENTS} from './content.js';
import {STORAGE_KEY,createState,validateState,localDay,recordEvidence,correctEvidence,effectiveEvidence,phraseStatus,phraseCheckupContext} from './learning.js';
import {STORIES,storyFor} from './stories.js';
import {CORE_PHRASE_EVENT_IDS,canonicalEventId,phraseEvents} from './curriculum.js';
import {storyFrame,assessmentFrame} from './story-art.js';
import {pictureFor,pictureSequence,createPictureLoader} from './story-pictures.js';
import * as meadow from './garden-meadow.js';
import {meadowPlantArt} from './meadow-art.js';
import {meadowView,meadowCollection,bindMeadowInteractions,layoutMeadowWatering} from './meadow-ui.js';
import {seedShopView,offerPicture} from './seed-shop.js';
import {GARDEN_KEY,FLOWERS,createGarden,validateGarden,rewardRound,openSeedPack,plantSeed,waterPlant,gardenNextAction} from './garden.js';
import {VOICES,VOICE_KEY,readVoice,saveVoice,lessonAudio} from './voices.js';
import {icon,buddy,sceneArt,voicePortrait} from './art.js';
import {installPaperArt} from './paper-art.js';
import {shellArt,dropArt,canArt,packArt,seedArt,plantArt} from './garden-art.js';
import * as audio from './audio.js';
import {startAudioPack,retryAudioPack,audioPackMessage,onAudioPackChange} from './audio-pack.js';
import {PRACTICE_KEY,createPracticePlan,validatePracticePlan,recordPractice,getPracticePlan} from './practice-plan.js';
import {createFeedback} from './feedback.js';
import * as challenge from './challenges.js';
import {flagArt,challengeFlag,challengeSteps,challengeBoard,challengePrize} from './challenge-ui.js';

const app=document.querySelector('#app'),PREFS='xiaoya-english:preferences:v1';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>globalThis.crypto?.randomUUID?.()||`local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,today=()=>localDay();
let state=createState(),garden=createGarden(),prefs={mic:false},selectedVoice=readVoice();
let storageProblem=null,rawState=null,rawGarden=null,session=null,modal=null,parentUnlocked=false;
let page='home',toastTimer,feedback=null,feedbackTimer,restoreFocus;
let guideActions=[],guideGeneration=0;
let idleHintTimer=null,idleHintGeneration=0,pointerHeld=false;
const IDLE_HINT_DELAY=15000;
let gardenIdleTimer=null,gardenIdleGeneration=0,feedbackVoiceTimer;
let practice=createPracticePlan(),speaking=false,soundGeneration=0;
let challenges=challenge.createChallenges(),challengeReceipt=null,challengeBusy=false;
try{const raw=localStorage.getItem(challenge.CHALLENGE_KEY);if(raw)challenges=challenge.validateChallenges(JSON.parse(raw));}catch(error){storageProblem=error.message;}
let recoveringRewards=false,recoveryRequested=false;
let rewardReceipt=null,rewardSelection=null,rewardBusy=false,shopBusy=false,uiGeneration=0;
const effects=createFeedback({canSound:()=>!document.hidden&&!speaking&&!session?.waiting&&!session?.recording&&!['preparing','assessing'].includes(session?.assessment?.status)});
const directStory=new URLSearchParams(location.search).get('story');
const VARIANT_KEY='xiaoya-english:garden-variant:v1';
let meadowState=meadow.createMeadow(),gardenVariant='a',meadowTool=null,meadowBusy=false;
try{const saved=localStorage.getItem(meadow.MEADOW_KEY);if(saved)meadowState=meadow.validateMeadow(JSON.parse(saved));const preview=new URLSearchParams(location.search).get('garden');gardenVariant=['a','b'].includes(preview)?preview:localStorage.getItem(VARIANT_KEY)==='b'?'b':'a';}catch(error){storageProblem=error.message;}
const activeGarden=()=>gardenVariant==='b'?meadowState:garden;
const waterReward=()=>gardenVariant==='b'?(meadowState.rounds.length?2:3):2;
const hasRewardChoice=()=>gardenVariant==='b'&&meadowState.rounds.length>0;
function rewardPreview(){return `${shellArt()}<span>${gardenVariant==='b'?2:3}</span>${hasRewardChoice()?'<span class="resource-or">/</span>':''}${dropArt()}<span>${waterReward()}</span>`;}
const activeNext=()=>gardenVariant==='b'?meadow.nextAction(meadowState):gardenNextAction(garden);
const allRounds=()=>[...garden.rounds,...meadowState.rounds];

try{rawState=localStorage.getItem(STORAGE_KEY);if(rawState)state=validateState(JSON.parse(rawState));rawGarden=localStorage.getItem(GARDEN_KEY);if(rawGarden)garden=validateGarden(JSON.parse(rawGarden));}catch(error){storageProblem=error.message;}
try{prefs={...JSON.parse(localStorage.getItem(PREFS)||'{}'),mic:JSON.parse(localStorage.getItem(PREFS)||'{}').mic===true};}catch{}
try{const raw=localStorage.getItem(PRACTICE_KEY);if(raw)practice=validatePracticePlan(JSON.parse(raw));}catch(error){storageProblem=error.message;}
let planCache;
function practiceToday(){const date=today();if(!planCache||planCache.practice!==practice||planCache.state!==state||planCache.garden!==garden||planCache.meadow!==meadowState||planCache.date!==date)planCache={practice,state,garden,meadow:meadowState,date,value:getPracticePlan(practice,{rounds:allRounds(),learningState:state,date})};return planCache.value;}
async function savePractice(s){
  const commit=()=>{if(storageProblem)return showError('原记录需要处理，请先到家长区导出。'),false;try{const raw=localStorage.getItem(PRACTICE_KEY),latest=raw?validatePracticePlan(JSON.parse(raw)):createPracticePlan();const next=(s.practiceRecords||[s.practiceRecord]).reduce((value,entry)=>recordPractice(value,entry),latest);localStorage.setItem(PRACTICE_KEY,JSON.stringify(next));practice=next;return true;}catch{return showError('这次练习还没有保存，请检查浏览器存储后重试。'),false;}};
  return navigator.locks?.request?navigator.locks.request(PRACTICE_KEY,commit):commit();
}
async function restorePracticeRewards(){
  if(storageProblem)return;
  if(recoveringRewards){recoveryRequested=true;return;}
  recoveringRewards=true;
  try{
    for(const variant of ['a','b']){
      const current=variant==='b'?meadowState:garden;
      const pending=practice.entries.filter(r=>r.rewardVariant===variant&&!current.rounds.some(done=>done.roundId===r.roundId));
      if(!pending.length)continue;
      const reward=variant==='b'?meadow.rewardRound:rewardRound;
      const saved=await gardenChange(latest=>pending.reduce((value,r)=>reward(value,{roundId:r.roundId,eventId:r.eventId,date:r.date}),latest),variant);
      const updated=variant==='b'?meadowState:garden;
      if(!saved&&!pending.every(r=>updated.rounds.some(done=>done.roundId===r.roundId)))return;
    }
    if(!modal&&['home','garden','parent'].includes(page))render();
  }finally{recoveringRewards=false;if(recoveryRequested){recoveryRequested=false;restorePracticeRewards();}}
}
function save(next){if(storageProblem)return showError('原记录需要处理，请先到家长区导出。'),false;try{validateState(next);localStorage.setItem(STORAGE_KEY,JSON.stringify(next));state=next;return true;}catch{return showError('记录未保存，请检查浏览器存储空间后重试。'),false;}}
async function gardenChange(change,variant=gardenVariant){
  const isMeadow=variant==='b',key=isMeadow?meadow.MEADOW_KEY:GARDEN_KEY,validate=isMeadow?meadow.validateMeadow:validateGarden,create=isMeadow?meadow.createMeadow:createGarden;
  const commit=()=>{if(storageProblem)return showError('原记录需要处理，请先到家长区导出。'),false;try{
  // Re-read inside the cross-tab lock; no stale balance is used by an open tab.
  const raw=localStorage.getItem(key),latest=raw?validate(JSON.parse(raw)):create();
  const next=change(latest);validate(next);if(next!==latest)localStorage.setItem(key,JSON.stringify(next));if(isMeadow)meadowState=next;else garden=next;return next!==latest;
}catch{return showError('花园没有保存，贝壳和水没有扣除。请检查存储后重试。'),false;}};
  return navigator.locks?.request?navigator.locks.request(key,commit):commit();
}
function savePrefs(next){try{localStorage.setItem(PREFS,JSON.stringify(next));prefs=next;return true;}catch{return showError('设置没有保存，请检查浏览器存储权限。'),false;}}
function challengeSummary(){return challenge.getChallenges(challenges,{practicePlan:practiceToday(),date:today()});}
function hasPendingChallengeRecovery(){return challenges.attempts.some(a=>!practice.entries.some(r=>r.roundId===`challenge:${a.attemptId}`))||challengeSummary().receipts.some(r=>!meadowState.challengeRewards.some(p=>p.unitId===r.unitId));}
async function challengeChange(change){
  const commit=()=>{if(storageProblem)return false;try{const raw=localStorage.getItem(challenge.CHALLENGE_KEY),latest=raw?challenge.validateChallenges(JSON.parse(raw)):challenge.createChallenges(),next=change(latest);challenge.validateChallenges(next);localStorage.setItem(challenge.CHALLENGE_KEY,JSON.stringify(next));challenges=next;return true;}catch{return showError('挑战进度还没有保存，请重试。这次已完成的小步不会清空。'),false;}};
  return navigator.locks?.request?navigator.locks.request(challenge.CHALLENGE_KEY,commit):commit();
}
async function restoreChallengeRewards(){
  if(storageProblem)return false;
  // The challenge log also restores interrupted review writes, without a
  // second participation reward or inventing an independent learning result.
  const known=new Set(practice.entries.map(r=>r.roundId));
  const pending=challenges.attempts.filter(a=>!known.has(`challenge:${a.attemptId}`)).map(a=>({roundId:`challenge:${a.attemptId}`,eventId:a.eventId,date:a.date,attemptId:a.attemptId,mode:'review',rewardVariant:null}));
  if(pending.length&&!await savePractice({practiceRecords:pending}))return false;
  const receipts=challengeSummary().receipts;
  if(!receipts.length)return true;
  // The challenge log is the durable intent. Reconcile after interruption and
  // under the same wallet lock as shop purchases, never overwrite a seed.
  const changed=await gardenChange(latest=>receipts.reduce((s,r)=>meadow.rewardChallenge(s,{unitId:r.unitId,date:r.date}),latest),'b');
  if(changed&&!modal&&['home','garden','parent','challenges'].includes(page))render();
  return receipts.every(r=>meadowState.challengeRewards.some(p=>p.unitId===r.unitId));
}
async function saveChallengeResult(s,{result,source,helped}){
  if(!s.attemptId)return false;
  // Navigation may release the live recording while the cross-tab lock waits.
  // Save the completed result from a snapshot, not the mutable session object.
  const attemptId=s.attemptId,eventId=s.event.id,unitId=s.challengeUnitId,retryAfterAttemptId=s.retryAfterAttemptId||null;
  const evidence=effectiveEvidence(state).find(e=>e.attemptId===attemptId),date=evidence?.date||today();
  const saved=await challengeChange(latest=>challenge.recordChallengeAttempt(latest,{id:`attempt:${attemptId}`,unitId,eventId,date,attemptId,result,source,helped:!!helped,retryAfterAttemptId}));
  if(!saved)return false;
  const practiceSaved=await savePractice({practiceRecord:{roundId:`challenge:${attemptId}`,eventId,date,attemptId,mode:'review',rewardVariant:null}});
  if(!practiceSaved)return false;
  return restoreChallengeRewards();
}
async function saveChallengeHelp(s){
  const input={id:uid(),unitId:s.challengeUnitId,eventId:s.event.id,date:today()};
  const saved=await challengeChange(latest=>challenge.recordChallengeHelp(latest,input));
  if(saved)s.priorChallengeHelp=true;
  return saved;
}
function openChallenges(){if(gardenVariant!=='b')return;challengeReceipt=null;navigate('challenges');sound(voice('challenge-intro'),['challenge-guide']);}
function startChallenge(unitId){
  const unit=challengeSummary().units.find(u=>u.id===unitId);if(!unit||gardenVariant!=='b')return;
  if(!unit.available){const item=unit.items.find(i=>!i.studied);startEvent(storyFor(item.eventId).event);return;}
  const eventId=unit.completed?unit.items[0].eventId:unit.nextEventId;
  const previous=challenges.attempts.filter(a=>a.unitId===unitId&&canonicalEventId(a.eventId)===canonicalEventId(eventId)).at(-1);
  // Resume the missing step with its help trace even after closing the page.
  startEvent(storyFor(eventId).event,false,{challengeUnitId:unitId,challengeReplay:unit.completed,challengeReplayIndex:0,retryAfterAttemptId:!unit.completed&&previous?previous.attemptId:null});
}
function retryChallengeStep(){
  const s=session;if(!s?.challengeUnitId)return;
  startEvent(s.event,false,{challengeUnitId:s.challengeUnitId,challengeReplay:s.challengeReplay,challengeReplayIndex:s.challengeReplayIndex,retryAfterAttemptId:s.attemptId||s.retryAfterAttemptId||null});
}
async function finishChallengeStep(){
  const s=session;if(!s||s.phase!=='resolved'||s.finishing)return;
  if(!s.attemptId||s.helped)return retryChallengeStep();
  const entry=challenges.attempts.find(a=>a.attemptId===s.attemptId);
  if(!entry||entry.result!=='independent'||entry.helped){s.phase='request';s.recallReady=true;render();return sound(voice('challenge-practice'),['sample','record']);}
  s.finishing=true;const generation=uiGeneration;render();
  const saved=await restoreChallengeRewards();s.finishing=false;
  if(!saved||session!==s||generation!==uiGeneration||modal||document.hidden)return;
  const unit=challengeSummary().units.find(u=>u.id===s.challengeUnitId);
  if(s.challengeReplay){
    const index=s.challengeReplayIndex+1;
    if(index<unit.items.length)return startEvent(storyFor(unit.items[index].eventId).event,false,{challengeUnitId:unit.id,challengeReplay:true,challengeReplayIndex:index});
    navigate('challenges');return sound(voice('challenge-replay'));
  }
  if(unit.completed){challengeReceipt=unit.id;navigate('challenge-prize');effects.play('challenge-clear',{target:document.querySelector('.challenge-fanfare')});feedbackVoice(()=>{if(page==='challenge-prize'&&challengeReceipt===unit.id&&!modal&&!document.hidden)sound(voice('challenge-clear'));},960);return;}
  startEvent(storyFor(unit.nextEventId).event,false,{challengeUnitId:unit.id,challengeReplay:false,challengeReplayIndex:0});
}
async function takeChallengeSeed(){
  if(gardenVariant!=='b'||challengeBusy)return;
  if(meadowState.pendingSeed)return enterGarden();
  challengeBusy=true;const generation=uiGeneration;
  try{const changed=await gardenChange(meadow.redeemChallengeSeed,'b');if(!changed||generation!==uiGeneration||modal||document.hidden)return;enterGarden();meadowTool='seed';render();stopSpeech();effects.play('seed',{target:document.querySelector('[data-action="meadow-seed"]')});feedbackVoice(()=>{if(gardenIsActive()&&!modal)sound(voice('challenge-seed'),['meadow-seed']);});}finally{challengeBusy=false;}
}
async function inviteChallenge(){
  const unit=challenge.invitationFor(challenges,{practicePlan:practiceToday(),date:today()});if(!unit)return false;
  // A small flag and a spoken invitation; the child stays in the garden.
  sound(voice('challenge-invite'),['challenges']);
  await challengeChange(latest=>latest.invitations.some(i=>i.unitId===unit.id)?latest:challenge.recordInvitation(latest,{id:uid(),unitId:unit.id,date:today()}));
  return true;
}
function challengeParentPanel(){
  if(gardenVariant!=='b')return '';
  const summary=challengeSummary();return `<section class="parent-card"><h2>花园挑战 · ${summary.completedCount} / ${summary.units.length} 组</h2><p>每组四句，完成的小步永久保留。孩子可以主动挑战；系统只会在至少隔天、且四句中三句已有独立表达候选时轻声邀请，每组一次，两次邀请至少间隔三天。</p>${summary.units.map(u=>`<div class="challenge-parent-row"><span>${esc(u.title)} · ${u.completedCount} / 4${u.items.some(i=>i.passEvidence==='after-practice')?' · 含练习后完成':''}</span><button data-challenge-unit="${u.id}">${u.available?'去挑战':'先学习'}</button></div>`).join('')}<p>挑战过关是游戏进度。当天听过示范再答出来记作练习后完成，不等于稳定掌握；复习仍会隔天检验。机器匹配不是发音评分，设备问题和没听清均不扣进度。</p></section>`;
}
function toast(message){clearTimeout(toastTimer);document.querySelector('.toast')?.remove();const el=document.createElement('div');el.className='toast';el.role='status';el.textContent=message;document.body.append(el);toastTimer=setTimeout(()=>el.remove(),5000);}
function showError(message){openModal({type:'error',message});}
const voice=id=>`xiaoya/audio/v3/${id}.mp3`;
const english=s=>lessonAudio(s.event,selectedVoice);
// A hand is a recovery hint, never a permanent instruction or a forced choice.
function idleHintTarget(){
  if(document.hidden||modal||speaking||pointerHeld||rewardBusy||shopBusy||meadowBusy||['parent','shop'].includes(page))return null;
  if(session&&(session.waiting||session.recording||session.teaching||session.storyRunning||session.finishing||['preparing','assessing'].includes(session.assessment?.status)))return null;
  // A failed attempt can reasonably lead to listening, help or another try.
  if(page==='event'&&session?.phase==='request'&&(session.recallReady||session.assessment))return null;
  const candidates=[...document.querySelectorAll('.primary-wrap')].filter(wrap=>{
    const button=wrap.querySelector('[data-primary]');
    return button&&!button.disabled&&button.getAttribute('aria-busy')!=='true'&&button.getClientRects().length>0;
  });
  return candidates.length===1?candidates[0]:null;
}
function cancelIdleHint(){
  clearTimeout(idleHintTimer);idleHintTimer=null;idleHintGeneration++;
  for(const wrap of document.querySelectorAll('.primary-wrap'))wrap.classList.toggle('is-idle-hint',false);
}
function scheduleIdleHint(){
  cancelIdleHint();const target=idleHintTarget();if(!target)return;
  const generation=idleHintGeneration;
  idleHintTimer=setTimeout(()=>{
    idleHintTimer=null;
    if(generation===idleHintGeneration&&idleHintTarget()===target)target.classList.toggle('is-idle-hint',true);
  },IDLE_HINT_DELAY);
}
function idleHintActivity(event){
  if(event.type==='pointerdown')pointerHeld=true;
  else if(['pointerup','pointercancel'].includes(event.type))pointerHeld=false;
  scheduleIdleHint();
}
function applyGuide(){for(const button of document.querySelectorAll('[data-action]'))button.classList.toggle('is-guided',!modal&&!button.disabled&&(guideActions.includes(button.dataset.action)||guideActions.includes('primary')&&button.hasAttribute('data-primary')));}
function cancelFeedbackVoice(){clearTimeout(feedbackVoiceTimer);feedbackVoiceTimer=null;}
function stopSpeech(){soundGeneration++;audio.stopSound();speaking=false;effects.setSilent(false);}
function feedbackVoice(callback,delay=340){cancelFeedbackVoice();feedbackVoiceTimer=setTimeout(()=>{feedbackVoiceTimer=null;callback();},delay);}
function clearGuide(){guideGeneration++;guideActions=[];applyGuide();}
async function sound(file,targets=[]){const generation=++guideGeneration,playback=++soundGeneration;guideActions=targets;speaking=true;cancelIdleHint();effects.setSilent(true);applyGuide();try{return await audio.playSound(file);}catch(error){toast(error.message||'内置声音暂时无法读取，请家长在家长区检查声音准备状态。');return false;}finally{if(playback===soundGeneration){speaking=false;effects.setSilent(false);}if(generation===guideGeneration){clearGuide();scheduleIdleHint();}}}
const guideTargets={welcome:['primary'],speak:['record','sample'],'speech-pass':['finish'],'speech-saved':['finish'],'speech-retry':['sample'],'speech-partial':['sample'],'speech-silent':['record','sample'],'speech-wait':['watch'],'open-pack':['pack'],seed:['plant'],water:['water'],next:['next-event']};
const narrate=id=>sound(voice(`garden-${id}`),guideTargets[id]||[]);
function button(action,label,glyph,extra=''){return `<button class="icon-button" data-action="${action}" aria-label="${esc(label)}" ${extra}>${icon(glyph)}</button>`;}
function primary(action,label,body,extra=''){return `<div class="primary-wrap"><button class="primary-orb" data-primary data-action="${action}" aria-label="${esc(label)}" ${extra}>${body}</button><span class="tap-cue" aria-hidden="true">${icon('tap',36)}</span></div>`;}
function header(){
  const localHelp=page==='event'&&['story','request'].includes(session?.phase);
  const controls=page==='parent'?'':`${localHelp?'':button('help','听下一步怎么玩','help')}${button('parent','家长陪伴区','parent')}`;
  return `<header class="topbar">${button('home','回到首页','house')}<span class="brand">小芽英语</span><div>${controls}</div></header>`;
}
function balance(){const garden=activeGarden();return `<div class="wallet" aria-label="${garden.shells} 枚贝壳，${garden.water} 滴水"><span>${shellArt()}<b data-shells>${garden.shells}</b></span><span>${dropArt()}<b data-water>${garden.water}</b></span></div>`;}
function flowerFor(id){return FLOWERS.find(f=>f.id===id);}
function nextPractice(){const plan=practiceToday();if(!plan.cards.some(c=>c.firstDate)&&STORIES.some(s=>s.id===directStory))return {eventId:directStory,mode:'new'};return plan.next||{eventId:STORIES[0].id,mode:'free'};}
function nextStory(){return storyFor(nextPractice().eventId);}
function stopSession(){cancelIdleHint();uiGeneration++;rewardSelection=null;cancelFeedbackVoice();cancelMeadowDrag?.();effects.cancel();effects.setSilent(false);speaking=false;meadowTool=null;cancelGardenReminder();clearGuide();if(session)cancelStory(session);audio.releaseAudioSession();session=null;}
function navigate(next){stopSession();modal=null;feedback=null;clearTimeout(feedbackTimer);page=next;render();window.scrollTo(0,0);}
function openModal(value){cancelIdleHint();uiGeneration++;rewardSelection=null;cancelFeedbackVoice();cancelMeadowDrag?.();effects.cancel();cancelGardenReminder();clearGuide();if(session){cancelStory(session);cancelAttempt(session);session.teaching=false;}audio.stopSound();speaking=false;restoreFocus=document.activeElement;modal=value;renderModal();setTimeout(()=>document.querySelector('.modal-card button,.modal-card input')?.focus(),0);}
function closeModal({keepMicIntent=false}={}){uiGeneration++;if(['mic','gate'].includes(modal?.type)&&session&&!keepMicIntent)session.pendingMicIntent=false;modal=null;render();prepareMicrophone();scheduleGardenReminder();restoreFocus?.focus?.();}
function requireParent(callback){if(parentUnlocked)return callback();openModal({type:'gate',callback,a:3+Math.floor(Math.random()*5),b:2+Math.floor(Math.random()*4)});}
function homeView(){
  const progress=allRounds().length>0,task=activeNext(),resume=progress&&task!=='learn',choice=nextPractice(),story=storyFor(choice.eventId);
  return `${header()}<main class="home-view home-welcome" data-next-event="${choice.eventId}" data-next-mode="${choice.mode}"><div class="home-glade" aria-hidden="true"><i class="home-leaf"></i><div class="home-companion">${buddy('happy')}</div><i class="home-leaf"></i></div>${primary(resume?'garden':'next-event',resume?'去花园照顾小种子':`${choice.mode==='review'?'再见老朋友':'出发'}：${story.event.title}`,resume?canArt():icon('play',48))}<div class="reward-preview" aria-label="${gardenVariant==='b'?hasRewardChoice()?'玩英语，选择两枚贝壳或两滴水':'第一份礼物，两枚贝壳和三滴水':'玩一个故事，获得三枚贝壳和两滴水'}">${rewardPreview()}</div>${gardenVariant==='b'?challengeFlag(challengeSummary()):''}${progress&&!resume?`<button class="garden-shortcut" data-action="garden" aria-label="打开我的小花园">${plantArt(FLOWERS[0],2)}${icon('house',24)}</button>`:''}</main>`;
}

const meadowPicture={id:"garden-background",image:"garden-paper-v1.webp"};
const pictures=createPictureLoader({
  persist:async url=>{const build=document.querySelector('meta[name="xiaoya-build"]')?.content;if('caches'in window&&/^\w{12}$/.test(build||'')){const cache=await caches.open(`xiaoya-core-${build}`);if(!await cache.match(url)){const response=await fetch(url,{cache:'force-cache'});if(response.ok)await cache.put(url,response);}}},
  onChange:(url,status)=>{
    // A picture becoming ready updates only its own canvas. Do not re-render
    // microphone controls, dismiss a parent dialog, or reset an idle hint.
    for(const element of document.querySelectorAll('[data-picture-url]'))if(element.dataset.pictureUrl===url){
      element.dataset.pictureStatus=status;
      if(status==='ready'){element.classList.remove('vector-picture');element.classList.toggle('single-picture',element.dataset.pictureLayout==='single');element.style.setProperty('--picture',`url("${url}")`);element.replaceChildren();}
    }
    if(url===pictureFor(meadowPicture,{},document.baseURI)?.url){const field=document.querySelector('[data-meadow-field]');if(field){field.classList.toggle('has-paper',status==='ready');if(status==='ready')field.style.setProperty('--meadow-picture',`url("${url}")`);else field.style.removeProperty('--meadow-picture');}}
  }
});
function picture(story,frame,moving=false,{alternate=false,phase='request',context=story.event.contexts[0]}={}){
  const options={frame,alternate,phase},asset=pictureFor(story,options,document.baseURI);
  for(const next of pictureSequence(story,options,document.baseURI))pictures.load(next.url);
  const ready=asset&&pictures.status(asset.url)==='ready';
  const fallback=alternate?assessmentFrame(story.event,context,phase):storyFrame(story,frame);
  const label=alternate?(phase==='resolved'?context.resolution:context.request)||context.prompt||story.frames[frame]:story.frames[frame];
  return `<div class="story-picture ${ready?asset.layout==='single'?'single-picture':'':'vector-picture'} ${moving?'moving':''}" role="img" aria-label="${esc(label)}" data-story-frame="${frame}"${alternate?` data-alternate="true" data-picture-phase="${phase}"`:''}${asset?` data-picture-id="${story.id}" data-picture-url="${esc(asset.url)}" data-picture-layout="${asset.layout}" data-picture-status="${pictures.status(asset.url)}"`:''} style="${ready?`--picture:url('${esc(asset.url)}');`:''}--x:${frame%2?100:0}%;--y:${frame>1?100:0}%">${ready?'':fallback}</div>`;
}
function cancelStory(s){s.storyGeneration++;clearTimeout(s.storyTimer);s.storyDelayFinish?.(false);s.storyDelayFinish=null;s.storyRunning=false;}
function currentStory(s,g){return session===s&&s.storyGeneration===g&&s.phase==='story'&&!modal&&!document.hidden;}
function delay(s,g,ms){return new Promise(resolve=>{if(!currentStory(s,g))return resolve(false);s.storyDelayFinish=resolve;s.storyTimer=setTimeout(()=>{s.storyDelayFinish=null;resolve(currentStory(s,g));},ms);});}
function startEvent(event=null,assessment=false,challengeOptions=null){const choice=event?{eventId:event.id,mode:assessment?'review':practiceToday().unseenIds.includes(event.id)?'new':'free'}:nextPractice();event??=storyFor(choice.eventId).event;stopSession();const story=storyFor(event.id),recall=!!challengeOptions||assessment||choice.mode==='review';const priorChallengeHelp=challengeSummary().units.some(u=>u.items.some(i=>i.canonicalEventId===canonicalEventId(event.id)&&i.helpedToday));session={...challengeOptions,id:uid(),event,story,practiceMode:challengeOptions?'review':choice.mode,recallMode:recall,recallReady:recall,context:assessment?phraseCheckupContext(state,event.id):event.contexts[0],phase:recall?'request':'story',assessmentMode:assessment,helped:!recall,priorChallengeHelp,storyGeneration:0,speechGeneration:0,frame:story.teachingFrames[0],storyReady:false,storyRunning:false,hasClip:false,waiting:false,recording:false,teaching:false,assessment:null};page='event';modal=null;render();if(!recall){playStory();effects.prepare();}else{sound(voice(challengeOptions?'challenge-question':'flow-review-v13'),['sample','record']);prepareMicrophone();}}
// A short scene establishes meaning once. Completed teaching replays only the phrase.
async function playStory(){const s=session;if(!s)return;cancelStory(s);cancelAttempt(s);stopSpeech();s.teaching=false;s.helped=true;s.context=s.event.contexts[0];s.phase='story';s.frame=s.story.teachingFrames[0];s.storyReady=false;s.storyError=false;s.storyRunning=true;const g=s.storyGeneration;render();
  if(!currentStory(s,g))return;
  const frames=s.story.teachingFrames;
  for(let i=0;i<frames.length;i++){
    s.frame=frames[i];render();
    if(!await delay(s,g,i<frames.length-1?650:180))return;
  }
  const asset=pictureFor(s.story,{frame:s.frame},document.baseURI);
  if(s.storyHintPending||s.event.audioPack==='phrases-v015'&&(!asset||pictures.status(asset.url)!=='ready')){
    // Explain a slow/missing scene using its prerecorded hint; never invent a visual meaning.
    // Keep a failed explanation pending even if its picture arrives before the retry.
    s.storyHintPending=true;
    const explained=await sound(s.event.hintAudio,['story-replay']);if(!currentStory(s,g))return;
    if(!explained){s.storyRunning=false;s.storyReady=false;s.storyError=true;render();return;}
    s.storyHintPending=false;
  }
  const ok=await sound(english(s),['story-replay']);if(!currentStory(s,g))return;
  s.storyRunning=false;s.storyReady=!!ok;s.storyError=!ok;render();if(ok)prepareMicrophone();
}
function replayStory(){return session?.phase==='story'&&!session.storyReady?playStory():sample();}
function storyContinue(){if(!session?.storyReady)return;session.phase='request';return record();}
function assessmentView(s){const a=s.assessment;if(!a)return '';const copy={preparing:'小耳朵准备中',assessing:'小芽在认真听',matched:'我听懂啦',retry:'再听一遍，一起试试',silence:'等话筒亮起来再说',unavailable:'小耳朵没有准备好，可以先听先说'};return `<section class="speech-feedback" data-assessment data-status="${a.status}" data-stars="${a.stars||0}"><button data-action="assessment-voice" aria-label="听小芽的提示：${copy[a.status]}">${['matched','retry','silence'].includes(a.status)?[1,2,3].map(i=>`<span class="${i<=a.stars?'lit':''}">${icon('star',25)}</span>`).join(''):'<i class="listening-dot"></i>'}${icon('sound',24)}</button>${a.status==='unavailable'&&s.pendingClip?button('retry-assessment','重试自动语音反馈','again'):''}<p class="sr-only" role="status">${copy[a.status]}</p></section>`;}
function speechFeedback(kind){if(session?.challengeUnitId&&kind==='pass')return session.helped?sound(voice('challenge-practice'),['challenge-retry']):sound(voice('challenge-step'),['finish']);return kind==='pass'?sound(voice('flow-pass'),['finish']):narrate(`speech-${kind}`);}
function assessmentVoice(){const a=session?.assessment;if(!a||session.recording||session.waiting)return;speechFeedback(a.status==='matched'?(session.assessmentMode?'saved':'pass'):a.status==='silence'?'silent':a.status==='retry'?'retry':'wait');}
function requestControls(s){
  if(s.recallReady)return `<div class="recall-options" data-recall-ready><button class="recall-option" data-action="sample" aria-label="听英语示范">${icon('ear',44)}<span>听一遍</span></button><button class="recall-option" data-action="record" aria-label="我会说，开始录音">${icon('mic',44)}<span>我会说</span></button></div>${button('context-help','小芽教我说','help')}`;
  return `${button('sample','听英语示范','ear')}${primary('record',s.recording?'说完了，结束录音':s.waiting?'麦克风准备中':'点亮话筒，开始说话',`${icon(s.recording?'stop':'mic',48)}${s.waiting?'<span class="mic-start-ring" aria-hidden="true"></span>':''}`,`${s.waiting?'disabled':''} aria-busy="${!!s.waiting}"`)}${button('context-help','小芽教我说','help')}`;
}
function eventView(){
  const s=session;if(!s)return homeView();if(s.phase==='reward')return rewardView();
  const story=s.phase==='story',unit=s.challengeUnitId?challengeSummary().units.find(u=>u.id===s.challengeUnitId):null;
  const passed=unit&&challenges.attempts.some(a=>a.attemptId===s.attemptId&&a.result==='independent'&&!a.helped);
  const goal=unit?(unit.completed?'':`${shellArt()}<span>4</span><span>＋</span>${dropArt()}<span>6</span>`):rewardPreview();
  const resolved=unit?(passed?primary('finish','这一小步完成，继续挑战',icon('check',48),s.finishing?'disabled aria-busy="true"':''):`<button class="challenge-practice-button" data-action="challenge-retry" aria-label="练过啦，再自己试一次">${icon('again',30)}<span>再试一次</span></button>`):primary('finish',s.assessmentMode?'保存这次练习':'打开这次小礼物',s.assessmentMode?icon('check',48):icon('gift',48),s.finishing?'disabled aria-busy="true"':'');
  return `${header()}<main class="event-view" ${unit?'data-challenge="'+unit.id+'"':''} data-phase="${s.phase}" data-event="${s.event.id}" data-context="${s.context.id}" data-practice-mode="${s.practiceMode||'free'}">
  ${unit?`<div class="challenge-rail"><button data-action="challenges" aria-label="回到挑战，已完成的小步会保留">${flagArt()}</button>${challengeSteps(unit)}</div>`:`<button class="learning-mode" data-action="learning-mode" aria-label="${s.recallMode?'老朋友，先试着自己说；需要时可以听示范':'新朋友，先听小芽说'}">${icon(s.recallMode?'again':'leaf',22)}<span>${s.recallMode?'老朋友':'新朋友'}</span>${icon('sound',20)}</button>`}
  ${story&&s.story.teachingFrames.length>1?`<div class="story-progress" aria-hidden="true">${s.story.teachingFrames.map(i=>`<i class="${i<=s.frame?'filled':''}"></i>`).join('')}</div>`:''}<div class="story-stage">${s.recallMode&&s.context.id===s.event.contexts[1]?.id?picture(s.story,s.phase==='resolved'?3:1,false,{alternate:true,context:s.context,phase:s.phase==='resolved'?'resolved':'request'}):picture(s.story,story?s.frame:s.story.cueFrame,story&&s.storyRunning,{phase:story?'story':s.phase})}${s.recording?'<div class="recording-indicator" role="status" aria-label="正在录音"><i></i><i></i><i></i></div>':''}</div>
  ${assessmentView(s)}<div class="event-controls">${story?`${button('story-replay','再听这一句','ear')}${primary(s.storyReady?'story-continue':'story-replay',s.storyReady?'轮到我说啦':s.storyRunning?'听小芽说':'听这一句',icon(s.storyReady?'mic':'play',44),s.storyRunning?'disabled':'')}${button('story-help','听中文，看看是什么意思','help')}`:s.phase==='request'?requestControls(s):resolved}</div>
  ${!story&&s.phase==='request'?`<div class="quiet-controls">${s.hasClip?button('replay','回听自己的录音','voice-replay'):''}${s.recallReady||unit?'':button('watch','先听伙伴说，这次先看看','play')}${button('observe','请家长观察这次表达','parent')}</div>`:''}<div class="round-goal" ${unit&&!unit.completed?'role="img" aria-label="整组首次完成可获得四枚贝壳和六滴水"':'aria-hidden="true"'}>${goal}</div></main>`;
}
function prepareFor(){return audio.prepareRecognition(()=>{});}
function prepareMicrophone(){if(prefs.mic&&!modal&&!document.hidden&&(session?.phase==='request'||session?.phase==='story'&&session.storyReady)&&!session.waiting&&!session.recording&&!session.teaching)audio.prepareRecording().catch(()=>{});}
function cancelAttempt(s,{keepPrepared=false}={}){clearGuide();s.speechGeneration++;audio.cancelRecording({keepPrepared});audio.cancelRecognition();s.recording=false;s.waiting=false;s.assessment=null;s.pendingClip=null;if(s.phase!=='resolved')s.attemptId=null;}
async function teach(){const s=session;if(!s||s.teaching)return;cancelStory(s);cancelAttempt(s);stopSpeech();s.recallReady=false;s.helped=true;s.teaching=true;s.phase='request';const g=s.speechGeneration;render();if(s.challengeUnitId&&(!await saveChallengeHelp(s)||session!==s||s.speechGeneration!==g||modal||document.hidden))return;const explained=await sound(s.event.hintAudio||voice(s.context.id),['sample']);if(session!==s||s.speechGeneration!==g)return;if(explained)await sound(english(s),['sample']);if(session!==s||s.speechGeneration!==g)return;s.teaching=false;render();prepareMicrophone();}
async function sample(){const s=session;if(!s)return;cancelStory(s);cancelAttempt(s,{keepPrepared:true});stopSpeech();s.recallReady=false;s.phase='request';s.frame=s.story.cueFrame;s.teaching=false;s.helped=true;const g=s.speechGeneration;render();if(s.challengeUnitId&&(!await saveChallengeHelp(s)||session!==s||s.speechGeneration!==g||modal||document.hidden))return;prepareMicrophone();await sound(english(s),['sample']);}
async function record(){const s=session;if(!s||s.phase!=='request'||s.waiting)return;if(s.recording)return audio.finishRecording();s.recallReady=false;stopSpeech();if(!prefs.mic){s.pendingMicIntent=true;render();return requireParent(()=>{if(session===s&&s.pendingMicIntent)openModal({type:'mic'});});}
  s.teaching=false;effects.setSilent(true);cancelStory(s);cancelAttempt(s,{keepPrepared:true});const g=s.speechGeneration;s.waiting=true;s.hasClip=false;s.attemptId=null;audio.stopSound();s.preparation=prepareFor(s).then(()=>true,()=>false);render();const current=()=>session===s&&s.speechGeneration===g;
  try{const started=await audio.beginRecording({onReady:()=>{if(current()){s.waiting=false;s.recording=true;render();effects.play('ready',{target:document.querySelector('[data-action="record"]')});}},onLevel:level=>{if(current())document.querySelector('[data-action="record"]')?.style.setProperty('--voice',level);},onFinish:result=>{if(current())recorded(s,result);}});if(current()&&!started){s.waiting=false;s.recording=false;render();}}
  catch(error){if(!current())return;s.waiting=false;s.recording=false;s.assessment={status:'unavailable',stars:0};render();toast(error.name==='NotAllowedError'?'麦克风未获允许，可以先听伙伴说，或在浏览器设置中开启。':error.message);}
}
function recorded(s,result){if(session!==s)return;s.recording=false;s.waiting=false;s.hasClip=!!result.url;if(result.error){s.assessment={status:'unavailable',stars:0};render();return toast(result.error);}if(!result.url||(!result.hasVoice&&result.voiceActivityAvailable!==false)){s.assessment={status:'silence',stars:0};render();prepareMicrophone();speechFeedback('silent');return;}s.pendingClip=result.url;assessClip(s,result.url,s.speechGeneration);}
async function assessClip(s,url,g){const current=()=>session===s&&s.speechGeneration===g&&s.phase==='request';s.assessment={status:audio.speechReady()?'assessing':'preparing',stars:0};render();try{
  const prepared=audio.speechReady()||await(s.preparation||prepareFor(s).then(()=>true,()=>false));if(!current())return;if(!prepared)throw new Error('model unavailable');s.assessment={status:'assessing',stars:0};render();const recognized=await audio.recognize(url,s.event.accepted);if(!current())return;if(!recognized)throw new Error('no assessment');
  s.assessment={status:recognized.matched?'matched':'retry',stars:recognized.stars};
  if(recognized.heard?.trim()){const attemptId=uid();if(!save(recordEvidence(state,{attemptId,eventId:s.event.id,contextId:s.context.id,kind:'speech',result:recognized.matched?(s.helped||s.retryAfterAttemptId||s.priorChallengeHelp?'supported':'independent'):'unclear',source:'machine',helped:!!(s.helped||s.retryAfterAttemptId||s.priorChallengeHelp),date:today()})))return;s.attemptId=attemptId;if(s.challengeUnitId&&!await saveChallengeResult(s,{result:recognized.matched?(s.helped?'supported':'independent'):'unclear',source:'machine',helped:s.helped}))return;}
  if(!current())return;
  if(recognized.matched)s.phase='resolved';render();if(!recognized.matched)prepareMicrophone();
  const cue=recognized.matched?(s.assessmentMode?'saved':'pass'):recognized.stars===2?'partial':'retry';
  if(recognized.matched&&recognized.stars===3){
    const generation=uiGeneration;
    effects.play('three-stars',{target:document.querySelector('[data-action="assessment-voice"]')});
    // Leave room for the short chime, including the output device's startup budget.
    // This never locks input; any next action cancels the pending spoken praise.
    feedbackVoice(()=>{if(generation===uiGeneration&&session===s&&s.speechGeneration===g&&s.phase==='resolved'&&!modal&&!document.hidden)speechFeedback(cue);},760);
  }else speechFeedback(cue);
}catch{if(!current())return;s.assessment={status:'unavailable',stars:0};render();speechFeedback('wait');}}
function retryAssessment(){const s=session;if(!s?.pendingClip)return;s.preparation=prepareFor(s).then(()=>true,()=>false);assessClip(s,s.pendingClip,++s.speechGeneration);}
async function watch(){const s=session;if(!s||s.teaching)return;cancelAttempt(s);s.recallReady=false;s.helped=true;s.teaching=true;const g=s.speechGeneration;render();const explained=await narrate('watch');if(session!==s||s.speechGeneration!==g)return;const ok=explained&&await sound(english(s));if(session!==s||s.speechGeneration!==g)return;s.teaching=false;if(ok)s.phase='resolved';render();}
async function finish(){
  if(session?.challengeUnitId)return finishChallengeStep();
  const s=session;if(!s||s.phase!=='resolved'||s.finishing)return;const generation=uiGeneration;s.finishing=true;render();
  // A failed reward save may open a modal and clear temporary recording state.
  // Keep the completed practice identity stable for retries, including midnight.
  s.rewardVariant??=gardenVariant;
  s.practiceRecord??={roundId:s.id,eventId:s.event.id,date:effectiveEvidence(state).find(e=>e.attemptId===s.attemptId)?.date||today(),attemptId:s.attemptId||null,mode:s.practiceMode||'free',rewardVariant:s.assessmentMode?null:s.rewardVariant};
  const giveReward=s.rewardVariant==='b'?meadow.rewardRound:rewardRound;
  if(!await savePractice(s)){s.finishing=false;return;}
  if(s.assessmentMode){s.finishing=false;if(session===s&&generation===uiGeneration&&!document.hidden&&!modal)navigate('parent');return;}
  // A requested completion must finish crediting its original garden even if
  // navigation or a cross-tab event happens while its storage lock is queued.
  const saved=await gardenChange(latest=>giveReward(latest,{roundId:s.id,eventId:s.event.id,date:s.practiceRecord.date}),s.rewardVariant);s.finishing=false;
  if(!saved||session!==s){if(!modal&&!document.hidden&&(session===s||['home','garden'].includes(page)))render();return;}
  rewardReceipt=null;rewardSelection=null;s.phase='reward';
  // Keep the receipt ready to resume, but never let a queued completion speak
  // over a modal, a different page, or a tab that has since gone to sleep.
  if(generation!==uiGeneration||document.hidden||modal){if(!document.hidden&&!modal)render();return;}
  stopSpeech();render();effects.play('reward',{target:document.querySelector('.reward-treasure')});feedbackVoice(()=>{if(generation===uiGeneration&&session===s&&s.phase==='reward'&&!modal&&!document.hidden)rewardVoice();});
}
function rewardView(){
  const pending=gardenVariant==='b'?meadow.pendingRewards(meadowState)[0]:null;
  if(pending){
    const selected=rewardSelection?.roundId===pending.roundId?rewardSelection.choice:null,amounts=meadow.roundReward(meadowState,pending.roundId);
    const card=(choice,label,amount,resource,purpose)=>`<button class="reward-choice ${choice==='water'?'water-choice':''}" data-action="choose-${choice}" data-reward-choice="${choice}" aria-pressed="${selected===choice}" ${rewardBusy?'disabled':''} aria-label="${label}，点一下听用途"><span class="reward-choice-resource">${resource}<b>+${amount}</b></span><span class="reward-purpose" aria-hidden="true"><span>→</span>${purpose}</span>${selected===choice?`<span class="reward-selected" aria-hidden="true">${icon('check',24)}</span>`:''}</button>`;
    return `${header()}<main class="reward-view" data-phase="reward" data-choice="true">${balance()}<div class="reward-buddy">${buddy('happy')}</div><div class="reward-choices">${card('shells',`${amounts.shells}枚贝壳可以买种子`,amounts.shells,shellArt(),packArt())}${card('water',`${amounts.water}滴水可以浇花`,amounts.water,dropArt(),canArt())}</div><div class="reward-confirm-slot">${selected?primary('confirm-reward',`收下${selected==='shells'?`${amounts.shells}枚贝壳`:`${amounts.water}滴水`}小礼物`,`${icon('gift',48)}<span class="confirm-resource" aria-hidden="true">${selected==='shells'?shellArt():dropArt()}</span>`,rewardBusy?'disabled aria-busy="true"':''):''}</div></main>`;
  }
  const isB=gardenVariant==='b',round=isB?(meadowState.rounds.find(r=>r.roundId===rewardReceipt)|| (session?meadowState.rounds.find(r=>r.roundId===session.id):meadowState.rounds.at(-1))):null,receipt=round?.reward,amounts=round?meadow.roundReward(meadowState,round.roundId):{shells:2,water:3},shells=!isB?3:receipt==='water'?0:amounts.shells,water=!isB?2:receipt==='shells'?0:amounts.water;
  return `${header()}<main class="reward-view" data-phase="reward" data-choice="false"><div class="celebration" aria-hidden="true">${Array.from({length:10},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div><div class="reward-buddy">${buddy('happy')}</div><div class="reward-treasure">${shells?`<button class="reward-resource" data-action="shell-purpose" aria-label="${shells}枚贝壳，点一下听用途">${shellArt()}<b>+${shells}</b></button>`:''}${water?`<button class="reward-resource" data-action="water-purpose" aria-label="${water}滴水，点一下听用途">${dropArt()}<b>+${water}</b></button>`:''}</div>${primary('garden','把奖励带进我的小花园',plantArt(FLOWERS[0],2))}</main>`;
}
function previewReward(choice){
  if(gardenVariant!=='b'||rewardBusy||modal||!(page==='reward'||session?.phase==='reward'))return;
  const round=meadow.pendingRewards(meadowState)[0];if(!round||!['shells','water'].includes(choice))return;
  cancelFeedbackVoice();stopSpeech();rewardSelection={roundId:round.roundId,choice};render();rewardVoice();
}
function confirmReward(){
  const selected=rewardSelection,round=meadow.pendingRewards(meadowState)[0];
  if(!selected||!round||selected.roundId!==round.roundId||modal||!(page==='reward'||session?.phase==='reward'))return;
  return collectReward(selected.choice,selected.roundId);
}
async function collectReward(choice,roundId){
  if(gardenVariant!=='b'||rewardBusy)return;
  const round=meadow.pendingRewards(meadowState)[0];if(!round||round.roundId!==roundId)return;
  rewardBusy=true;cancelFeedbackVoice();stopSpeech();render();const generation=uiGeneration;
  try{const saved=await gardenChange(latest=>meadow.claimReward(latest,round.roundId,choice),'b');if(!saved||modal||generation!==uiGeneration)return;rewardSelection=null;rewardReceipt=round.roundId;render();effects.play('reward',{target:document.querySelector('.reward-treasure')});feedbackVoice(()=>{if(generation===uiGeneration&&!modal&&!document.hidden&&(page==='reward'||session?.phase==='reward'))rewardVoice();});}
  finally{rewardBusy=false;if(!modal&&(page==='reward'||session?.phase==='reward'))render();}
}
function showPendingReward(){rewardReceipt=null;navigate('reward');rewardVoice();}
function gardenView(){if(gardenVariant==='b'){const background=pictureFor(meadowPicture,{},document.baseURI);pictures.load(background.url);return meadowView({state:meadowState,header:header(),balance:balance(),challengeEntry:challengeFlag(challengeSummary(),{invite:!!challenge.invitationFor(challenges,{practicePlan:practiceToday(),date:today()})}),specialPending:meadow.pendingChallengeSeeds(meadowState).length>0,feedback,tool:meadowTool,backgroundUrl:pictures.status(background.url)==='ready'?background.url:null});}const next=gardenNextAction(garden),seed=garden.pendingSeed,thirsty=garden.plants.find(p=>p.waterings<2);const main=next==='plant'?primary('plant','把种子种进花盆',plantArt(null,-1)):next==='water'?primary('water','给小种子浇一滴水',canArt()):next==='pack'?primary('pack','用三枚贝壳打开种子惊喜包',packArt()):primary('next-event','再玩一个故事，收集贝壳和水',icon('play',46));return `${header()}<main class="garden-view" data-garden-next="${next}" data-guidance="${garden.plants.length>=3?'quiet':'new'}">${balance()}<div class="garden-landscape ${feedback?.kind==='bloom'?'blooming':''}"><div class="garden-cloud" aria-hidden="true"></div><div class="garden-plants">${garden.plants.map(p=>`<button class="garden-plant ${next==='water'&&p.id===thirsty?.id?'thirsty':''} ${feedback?.plantId===p.id?'just-watered':''}" data-plant="${p.id}" ${seed||p.waterings<2&&garden.water===0?'disabled':''} aria-label="${p.waterings===2?`${esc(flowerFor(p.flowerId).name)}，点一下和小花打招呼`:`小种子已经浇了${p.waterings}次水${garden.water>0?'，点一下浇水':''}`}">${plantArt(flowerFor(p.flowerId),p.waterings)}${p.waterings<2?`<span class="growth-drops" aria-hidden="true">${[1,2].map(i=>`<i class="${i<=p.waterings?'filled':''}"></i>`).join('')}</span>`:''}</button>`).join('')}</div>${feedback?.kind==='bloom'?'<span class="bloom-sparkles" aria-hidden="true">✦ ✧ ✦</span>':''}${seed?`<div class="seed-reveal" aria-hidden="true">${seedArt()}</div>`:''}</div><div class="garden-action">${main}${next==='pack'?`<span class="cost" aria-label="需要三枚贝壳">${shellArt()}<b>3</b></span>`:''}</div><div class="garden-footer">${next!=='learn'?button('next-event','再玩一个故事','play'):''}</div></main>`;}
function gardenIsActive(){return page==='garden'&&!modal&&!document.hidden;}
function cancelGardenReminder(){clearTimeout(gardenIdleTimer);gardenIdleTimer=null;gardenIdleGeneration++;}
function scheduleGardenReminder(){cancelGardenReminder();if(!gardenIsActive())return;const generation=gardenIdleGeneration;gardenIdleTimer=setTimeout(()=>{gardenIdleTimer=null;if(generation===gardenIdleGeneration&&gardenIsActive())gardenGuide({reminder:true});},15000);}
async function gardenGuide({automatic=false,reminder=false,cue}={}){cancelGardenReminder();if(!gardenIsActive())return;const generation=gardenIdleGeneration;
  if(!automatic||activeGarden().plants.length<3){if(gardenVariant==='b')await meadowGuide(cue);else await narrate(cue||{plant:'seed',water:'water',pack:'open-pack',learn:'next'}[gardenNextAction(garden)]);}
  // A reminder is one-shot. Only a new interaction starts another idle period.
  if(!reminder&&generation===gardenIdleGeneration&&gardenIsActive())scheduleGardenReminder();
}
function enterGarden(){if(gardenVariant==='b'&&meadow.pendingRewards(meadowState).length)return showPendingReward();navigate('garden');effects.prepare();if(gardenVariant==='b'&&!meadowState.pendingSeed&&meadow.nextAction(meadowState)!=='challenge-seed'&&challenge.invitationFor(challenges,{practicePlan:practiceToday(),date:today()})){inviteChallenge().catch(()=>{});scheduleGardenReminder();}else gardenGuide({automatic:true});}
function gardenFeedback(kind,plantId){stopSpeech();clearTimeout(feedbackTimer);feedback={kind,plantId};render();const target=plantId?document.querySelector(`[data-plant="${plantId}"],[data-meadow-plant="${plantId}"]`):document.querySelector('.seed-reveal,.seed-tool');effects.play(kind==='planted'?'plant':kind,{target});feedbackTimer=setTimeout(()=>{feedback=null;if(page==='garden')render();},3200);}
function feedbackGuide(cue){if(activeGarden().plants.length>=3)return gardenGuide({automatic:true,cue});const expected=feedback;feedbackVoice(()=>{if(feedback===expected&&gardenIsActive())gardenGuide({automatic:true,cue});});}
async function pack(){if(gardenVariant==='b')return meadowPack();if(await gardenChange(openSeedPack)){if(page!=='garden')return;gardenFeedback('seed');feedbackGuide('seed');}else if(!modal)render();}
async function plant(){if(await gardenChange(plantSeed)){if(page!=='garden')return;gardenFeedback('planted',garden.plants[garden.plants.length-1].id);feedbackGuide('water');}else if(!modal)render();}
async function water(id){const target=id||garden.plants.find(p=>p.waterings<2)?.id;if(!target)return;if(await gardenChange(latest=>waterPlant(latest,target))){if(page!=='garden')return;const p=garden.plants.find(p=>p.id===target);gardenFeedback(p.waterings===2?'bloom':'water',target);feedbackGuide(p.waterings===2?'bloom':'water');}else if(!modal){render();gardenGuide({automatic:true});}}
function greetPlant(id){gardenFeedback('bloom',id);feedbackGuide('bloom');}

function rewardVoice(){if(gardenVariant!=='b')return narrate('reward');const pending=meadow.pendingRewards(meadowState)[0];if(pending){const choice=rewardSelection?.roundId===pending.roundId?rewardSelection.choice:null,amounts=meadow.roundReward(meadowState,pending.roundId);return sound(voice(choice==='water'&&amounts.water===2?'flow-water-choice-v13':choice?`flow-${choice}`:'flow-choice'),choice?['confirm-reward']:['choose-shells','choose-water']);}const round=meadowState.rounds.find(r=>r.roundId===rewardReceipt)||(session?meadowState.rounds.find(r=>r.roundId===session.id):meadowState.rounds.at(-1)),receipt=round?.reward,newReward=round?.rewardVersion===3;return sound(voice(`economy-${receipt==='shells'?'shells':receipt==='water'?newReward?'water-v13':'water':newReward?'starter-v13':'starter'}`),['garden']);}
function selectVariant(value){if(!['a','b'].includes(value))return;try{localStorage.setItem(VARIANT_KEY,value);gardenVariant=value;const url=new URL(location.href);url.searchParams.delete('garden');history.replaceState(null,'',url);navigate('home');}catch{showError('花园选择没有保存，请重试。');}}
function selectMeadowTool(tool){if(gardenVariant!=='b'||!gardenIsActive())return;if(tool==='seed'&&!meadowState.pendingSeed)return;stopSpeech();meadowTool=tool;render();if(tool==='can'&&!meadowState.water)sound(voice('economy-water-short'),['next-event']);effects.tap(document.querySelector(`[data-action="meadow-${tool==='seed'?'seed':'can'}"]`));}
function meadowGuide(cue){const action=meadow.nextAction(meadowState);if(cue==='bloom')return sound(voice('meadow-bloom'));if(cue==='giant')return sound(voice('meadow-giant'),['meadow-seed']);if(action==='challenge-seed')return sound(voice('challenge-seed'),['challenge-seed']);if(action==='reward')return sound(voice('economy-earned'),['collect-reward']);if(action==='pack')return sound(voice('economy-shop-ready'),['shop']);if(action==='learn')return meadowState.plants.some(p=>p.waterings<meadow.ALL_FLOWERS.find(f=>f.id===p.flowerId).waterNeeded)?sound(voice('economy-water-short'),['next-event']):narrate('next');return sound(voice(action==='plant'?'meadow-seed':'meadow-water-beside'),[action==='plant'?'meadow-seed':'meadow-can']);}
async function meadowPack(){if(meadowBusy)return;meadowBusy=true;try{if(await gardenChange(meadow.openSeedPack)){if(!gardenIsActive()||gardenVariant!=='b')return;meadowTool=null;gardenFeedback('seed');feedbackGuide(meadow.ALL_FLOWERS.find(f=>f.id===meadowState.pendingSeed.flowerId).giant?'giant':'seed');}}finally{meadowBusy=false;}}
async function openShop(){
  if(gardenVariant!=='b'||shopBusy)return;
  if(meadowState.pendingSeed||meadow.pendingRewards(meadowState).length)return enterGarden();
  shopBusy=true;const generation=uiGeneration;
  try{await gardenChange(latest=>meadow.ensureShop(latest,today()),'b');if(generation!==uiGeneration||modal)return;navigate('shop');effects.prepare();if(!prefs.shopSeen){sound(voice('economy-shop'));savePrefs({...prefs,shopSeen:true});}}
  finally{shopBusy=false;}
}
function shortOnShells(canReserve=false){const wallet=document.querySelector('.wallet');wallet?.classList.remove('short-on-shells');if(wallet)void wallet.offsetWidth;wallet?.classList.add('short-on-shells');sound(voice(canReserve?'economy-short':'economy-shells-short'),[canReserve?'reserve-offer':'next-event']);}
function revealPurchasedSeed(generation){if(generation!==uiGeneration||modal||page!=='shop'||gardenVariant!=='b')return;navigate('garden');meadowTool='seed';gardenFeedback('seed');feedbackGuide(meadow.ALL_FLOWERS.find(f=>f.id===meadowState.pendingSeed.flowerId).giant?'giant':'seed');}
async function buyMystery(){
  if(shopBusy||page!=='shop'||gardenVariant!=='b')return;if(meadowState.shells<meadow.ECONOMY.packPrice)return shortOnShells();
  shopBusy=true;const generation=uiGeneration;try{if(await gardenChange(latest=>meadow.openSeedPack(latest),'b'))revealPurchasedSeed(generation);else if(generation===uiGeneration&&!modal)render();}finally{shopBusy=false;}
}
async function buySeed(id,source){
  if(shopBusy||page!=='shop'||gardenVariant!=='b')return;
  const offer=source==='reserved'?meadowState.shop.reserved:meadowState.shop.offer;
  if(!offer||offer.id!==id)return;if(meadowState.shells<offer.price)return shortOnShells(source==='shop'&&meadowState.shop.reserved?.id!==id);
  shopBusy=true;const generation=uiGeneration;try{if(await gardenChange(latest=>meadow.buyOffer(latest,id,source),'b'))revealPurchasedSeed(generation);else if(generation===uiGeneration&&!modal)render();}finally{shopBusy=false;}
}
async function reserveSeed(id,replace=false){
  if(shopBusy||page!=='shop'||gardenVariant!=='b')return;
  const offer=meadowState.shop.offer;if(!offer||offer.id!==id){if(modal?.type==='replace-seed')closeModal();return;}
  if(meadowState.shop.reserved&&meadowState.shop.reserved.id!==id&&!replace){openModal({type:'replace-seed',offerId:id});sound(voice('economy-replace'));return;}
  shopBusy=true;const generation=uiGeneration;try{const saved=await gardenChange(latest=>meadow.reserveOffer(latest,id,{replace}),'b');if(generation!==uiGeneration||modal?.type==='error')return;modal=null;render();if(saved)effects.play('seed',{target:document.querySelector('.reserve-seed')});sound(voice('economy-reserve'));}finally{shopBusy=false;}
}
async function meadowPlant(point){if(meadowBusy||!meadowState.pendingSeed||gardenVariant!=='b'||!gardenIsActive())return;meadowBusy=true;try{if(await gardenChange(latest=>meadow.plantSeed(latest,point))){if(!gardenIsActive()||gardenVariant!=='b')return;meadowTool=null;gardenFeedback('planted',meadowState.plants[meadowState.plants.length-1].id);feedbackGuide('water');}}finally{meadowBusy=false;}}
async function meadowWater(id){if(meadowBusy||gardenVariant!=='b'||!gardenIsActive())return;const plant=meadowState.plants.find(p=>p.id===id);if(!plant)return;const flower=meadow.ALL_FLOWERS.find(f=>f.id===plant.flowerId);if(plant.waterings===flower.waterNeeded){gardenFeedback('bloom',id);return;}if(meadowTool!=='can'){sound(voice('meadow-water-beside'),['meadow-can']);return;}if(!meadowState.water){sound(voice('economy-water-short'),['next-event']);return;}meadowBusy=true;const generation=uiGeneration;try{if(await gardenChange(latest=>meadow.waterPlant(latest,id))){if(generation!==uiGeneration||document.hidden||modal||!gardenIsActive()||gardenVariant!=='b')return;const p=meadowState.plants.find(p=>p.id===id),bloom=p.waterings===flower.waterNeeded;gardenFeedback(bloom?'bloom':'water',id);if(bloom)feedbackGuide('bloom');else scheduleGardenReminder();}}finally{meadowBusy=false;}}


const resultNames={independent:'独立表达',supported:'有帮助才表达',not_yet:'尚未观察到',unclear:'无法确定',device_error:'设备未完成'};
function practicePanel(){
  const plan=practiceToday(),next=plan.next&&storyFor(plan.next.eventId),newStory=plan.unseenIds[0]&&storyFor(plan.unseenIds[0]),learned=plan.cards.filter(c=>c.firstDate),due=plan.cards.filter(c=>c.due),mode={new:'新表达',review:'到期复习',free:'自由再玩'};
  return `<section class="parent-card practice-plan"><h2>今天接着学什么</h2><p>已接触 ${learned.length} 句表达 · 今天待复习 ${plan.dueIds.length} 个 · 还有 ${plan.unseenIds.length} 句核心新表达</p>${next?`<div class="next-practice"><span>${mode[plan.next.mode]}</span><strong>${esc(next.event.title)}</strong><p>${esc(next.event.chinese)} · ${esc(next.event.english)}</p><button data-action="next-event">开始这一轮</button></div>`:''}${newStory?`<button class="new-story-entry" data-action="new-event">看看新表达：${esc(newStory.event.title)}</button>`:''}<p>孩子端仍只有一个主任务。到期先复习，连续两轮后穿插新表达；不先播放英文答案，点耳朵或求助后如实记为有帮助。</p><details><summary>查看复习安排</summary><p>间隔从 1 天逐步到 3、7、14、30 天。到期后独立说出才延长；有帮助、没说出或设备未完成，次日再试。同一天重复不会跳级。这是可调整的练习规则，不是对每个孩子遗忘速度的测量。</p>${learned.map(c=>`<div class="practice-due-row"><span>${esc(storyFor(c.eventId).event.title)}<br>上次 ${c.lastDate}</span><span>${c.practicedToday?'今天已练':c.due?'今天复习':`${c.dueDate} 再见`} · 间隔 ${c.intervalDays} 天</span></div>`).join('')||'<p>练完第一句后，开始安排隔天复习。</p>'}<p>机器匹配用于安排练习，不等同于发音准确率或稳定掌握；能力仍以家长观察和跨日换情境的证据为准。</p></details></section>`;
}
function phraseLibrary(rounds){
  const core=CORE_PHRASE_EVENT_IDS.map(storyFor),coreIds=new Set(core.map(s=>s.event.lessonId));
  const extras=STORIES.filter(s=>canonicalEventId(s.id)===s.id&&!coreIds.has(s.event.lessonId));
  const added=core.filter(s=>s.event.audioPack==='phrases-v015'),original=core.filter(s=>s.event.audioPack!=='phrases-v015');
  const rows=stories=>stories.map(story=>{const status=phraseStatus(state,story.id),related=new Set(phraseEvents(story.id).map(e=>e.id)),count=rounds.filter(r=>related.has(r.eventId)).length;
    return `<div class="checkup-row" data-phrase="${story.event.lessonId}"><div><strong>${esc(story.event.chinese)}</strong><p class="phrase-preview">${esc(story.event.english)}</p><p>参与 ${count} 次 · 机器候选 ${status.candidateCount} 次 · 家长确认独立 ${status.independentCount} 次${status.retained?' · 已有跨日换情境证据':''}</p></div><button data-story="${story.id}">听和说</button><button data-checkup="${story.id}">${story.event.contexts.length>1?'生活验收':'熟悉情境验收'}</button></div>`;}).join('');
  return `<section class="parent-card story-library"><details><summary>表达库 · 新增 ${added.length} 句日常口语</summary><h2>熟悉、顺口、生活里用得到</h2><p>每句只有一个学习目标。普通复习使用最初见过的画面，点耳朵只重听这一句。验收由家长主动开启。已有第二情境的句子，在有独立表达证据后才换图；本次新句先用熟悉画面验证独立表达。</p><details class="new-phrase-pack" open><summary>新增 ${added.length} 句 · 日常口语</summary><p>接在原核心课程之后，也可以在这里直接试听和练习。</p>${rows(added)}</details><details class="original-phrases"><summary>原有 ${original.length} 句核心表达</summary>${rows(original)}</details><details class="extension-phrases"><summary>${extras.length} 句扩展表达与旧记录</summary><p>旧记录继续保留。新学先走核心表达；已经练过的扩展表达仍按时复习。同一句的多个旧场景合并统计。</p>${rows(extras)}</details></details></section>`;
}
function parentView(){const garden=activeGarden(),rounds=allRounds();const records=effectiveEvidence(state),recent=records.slice(-20).reverse(),spoken=records.filter(r=>r.kind==='speech'),matched=spoken.filter(r=>['independent','supported'].includes(r.result));return `${header()}<main class="parent-view"><div class="parent-intro"><div><span class="eyebrow">陪伴手记</span><h1>花在长，表达也慢慢长。</h1><p>奖励记录参与，能力看真实表达。故事里听过示范，就如实记为“有帮助”。</p></div><div class="parent-companion" aria-hidden="true">${buddy()}</div></div>${storageProblem?`<section class="parent-card attention"><h2>本机记录需要处理</h2><p>${esc(storageProblem)}</p><button data-action="export">导出原记录</button><p>尚未覆盖原记录。</p></section>`:''}<div class="parent-stats"><span><b>${garden.rounds.length}</b> 次故事参与</span><span><b>${spoken.length}</b> 次表达记录</span><span><b>${garden.plants.filter(p=>p.waterings===(gardenVariant==='b'?meadow.ALL_FLOWERS.find(f=>f.id===p.flowerId).waterNeeded:2)).length}</b> 朵小花</span></div>${garden.rounds.length>=3&&matched.length===0?'<section class="parent-card attention"><h2>已经在玩，还没观察到会说</h2><p>目前没有合适表达的证据。先陪孩子在真实生活里试一句，不用继续解锁代替开口练习。未开启识别或未做观察，也会出现这种情况。</p></section>':''}${practicePanel()}${phraseLibrary(rounds)}${challengeParentPanel()}<section class="parent-card"><h2>内置声音</h2><p data-audio-pack-status role="status">${esc(audioPackMessage())}</p><button data-action="audio-pack-retry">重新检查声音</button><p>中文引导和三种英语音色均为已配好的本地文件，不需要连接配音服务。</p></section><section class="parent-card"><h2>选择说英语的伙伴</h2><p>三位伙伴的英语都已提前配好。点小耳朵试听，选好后故事和示范一起切换。</p><div class="voice-grid">${VOICES.map(v=>`<div class="voice-option ${v.id===selectedVoice?'selected':''}"><button data-select-voice="${v.id}" aria-pressed="${v.id===selectedVoice}"><span class="voice-portrait">${voicePortrait(v.id)}</span>${esc(v.nickname||v.name)}${v.id===selectedVoice?' ✓':''}</button><button data-preview-voice="${v.id}" aria-label="试听${esc(v.nickname||v.name)}">${icon('ear',26)}</button></div>`).join('')}</div></section><section class="parent-card"><h2>录音与自动反馈</h2><p>本机识别给出 0–3 颗词句匹配星，帮助孩子重试；它不是发音准确率，也不会自动判定稳定掌握。录音和识别文本都不上传、不保存，离开练习即释放。</p><p>首次录音按需准备约 81 MB 的本地识别资源，准备好后支持离线。小声录音会先调整音量，再独立听写并核对词句。未准备好或麦克风不可用时，仍能听示范、回听自己的声音和继续参与。</p><div class="parent-actions"><button data-action="mic-settings">${prefs.mic?'查看麦克风设置':'允许本机录音'}</button><button data-action="recognition">${audio.speechReady()?'本地识别已就绪':'准备本机识别'}</button><button data-action="export">导出记录</button></div><p id="model-status" role="status"></p></section><section class="parent-card"><h2>花园 A / B 体验</h2><p>切换后从首页进入。两座花园分别保存种子、贝壳和花朵，学习记录共用；切换不会清空任何花园。</p><div class="garden-variant-options"><button data-variant="a" aria-pressed="${gardenVariant==='a'}"><strong>A · 花盆花园</strong><span>两次浇水开花，熟悉的玩法</span></button><button data-variant="b" aria-pressed="${gardenVariant==='b'}"><strong>B · 自由小花园</strong><span>自由播种、点水滴浇水、巨型花和彩色蝴蝶结</span></button></div><p>A：每次完整参与获得 3 枚贝壳和 2 滴水。B：新用户第一轮赠 2 贝壳和 3 水，之后每轮选 2 贝壳或 2 水。每组挑战首次完成额外获得 4 贝壳和 6 水；完成 3、6 组不同挑战，各获得一颗限定种子。已有余额和旧奖励保留。惊喜种子 2 贝壳，指定普通花 3、蝴蝶结花 6、巨型花 8；普通花 5 水、巨型花 10 水。商店每日换一款，买后即补不同品种；可免费保留一包，直到买下或主动换掉。新用户惊喜包首包为雏菊，之后十二种等概率，可能重复；买定后刷新不会重抽。A 沿用固定序列、每袋 3 贝壳。没有真钱购买，参与奖励不表示学会。</p><p>旧版学习观察和家具收藏仍在本机保留并可导出；这一版不再展示选图、家具和文字探索流程。</p></section><section class="parent-card"><h2>最近的观察</h2>${recent.map(r=>`<div class="observation-row"><div><strong>${esc(EVENTS.find(e=>e.id===r.eventId)?.title)}</strong><p>${r.date} · ${r.kind==='listening'?'旧版听懂观察':resultNames[r.result]} · ${r.source==='machine'?'机器候选':'家长观察'}${r.helped?' · 有提示':''}${r.corrected?' · 已修正':''}</p></div>${r.kind==='speech'?`<button data-correct="${esc(r.attemptId)}">核对</button>`:''}</div>`).join('')||'<p>还没有表达观察。完成故事不会自动计为“学会”。</p>'}</section><p class="fine-print">小芽英语 ${esc(document.querySelector('meta[name="xiaoya-version"]')?.content)} · ${esc(document.querySelector('meta[name="xiaoya-build"]')?.content)} · 本机体验版</p></main>`;}
function observation(attemptId=null){requireParent(()=>{const existing=attemptId?effectiveEvidence(state).find(r=>r.attemptId===attemptId):null;openModal({type:'observe',attemptId,existing,event:existing?EVENTS.find(e=>e.id===existing.eventId):session?.event,helped:existing?existing.helped:!!session?.helped,helpedLocked:!attemptId&&!!session?.helped});});}
async function submitObservation(result){const m=modal,s=session;if(m?.type!=='observe'||!m.event||m.saving)return;m.saving=true;const helped=m.helpedLocked||!!document.querySelector('#observed-help')?.checked,exact=!!document.querySelector('#exact-phrase')?.checked,phraseId=exact&&['independent','supported'].includes(result)?m.event.lessonId:null;
  const evidenceHelped=!!(helped||s?.retryAfterAttemptId||s?.priorChallengeHelp),evidenceResult=evidenceHelped&&result==='independent'?'supported':result;
  const next=m.attemptId?correctEvidence(state,m.attemptId,{correctionId:uid(),result,helped,phraseId,date:today()}):recordEvidence(state,{attemptId:uid(),eventId:m.event.id,contextId:s.context.id,kind:'speech',result:evidenceResult,source:'parent',helped:evidenceHelped,phraseId,date:today()});if(!save(next)){m.saving=false;return;}if(s&&!m.attemptId){s.attemptId=next.evidence[next.evidence.length-1].attemptId;if(s.challengeUnitId&&!await saveChallengeResult(s,{result,source:'parent',helped})){m.saving=false;return;}s.helped=helped;s.phase='resolved';}if(modal===m)modal=null;render();}
function render(){cancelIdleHint();effects.setSilent(!!session?.waiting||!!session?.recording||['preparing','assessing'].includes(session?.assessment?.status)||speaking);const waterFocus=document.activeElement?.dataset.waterPlant;const gardenScroll=document.querySelector('.garden-plants')?.scrollTop;app.innerHTML=`<div class="app-shell ${session?.recording?'is-recording':session?.waiting?'is-mic-starting':''}">${page==='event'?eventView():page==='reward'?rewardView():page==='challenges'?challengeBoard({summary:challengeSummary(),header:header(),balance:balance(),seedPending:meadow.pendingChallengeSeeds(meadowState).length>0}):page==='challenge-prize'?challengePrize({header:header(),unit:challengeSummary().units.find(u=>u.id===challengeReceipt),hasSeed:meadow.pendingChallengeSeeds(meadowState).length>0,primary}):page==='shop'?seedShopView({state:meadowState,header:header(),balance:balance()}):page==='garden'?gardenView():page==='parent'?parentView():homeView()}</div><div id="modal-root"></div>`;renderModal();applyGuide();layoutMeadowWatering(app);if(waterFocus&&!modal){const target=app.querySelector(`[data-water-plant="${waterFocus}"]`)||app.querySelector('[data-action="meadow-can"]');target?.focus({preventScroll:true});}const plants=document.querySelector('.garden-plants');if(plants&&gardenScroll!==undefined)plants.scrollTop=gardenScroll;scheduleIdleHint();}
function renderModal(){const root=document.querySelector('#modal-root');if(!root)return;if(!modal){root.innerHTML='';return;}const m=modal;let html='';
  if(m.type==='gate')html=`<h2>请交给陪伴的大人</h2><label for="parent-answer">${m.a} + ${m.b} =</label><input id="parent-answer" inputmode="numeric" autocomplete="off" aria-label="计算结果"><button class="primary-button" data-action="gate-submit">进入</button><button data-action="close">回到孩子的世界</button>`;
  if(m.type==='mic')html='<h2>录下这一次声音</h2><p>点话筒后，等它亮起来再说。停顿后自动结束，也可再次点击结束，最长 12 秒。</p><p>录音只在当前页面内存中临时回听，不上传。首次使用时浏览器还会询问麦克风权限。授权后，进入说话环节会提前打开话筒，点击后才开始录音；闲置 20 秒或离开环节会关闭话筒。</p><button class="primary-button" data-action="allow-mic">允许孩子使用本机麦克风</button><button data-action="disable-mic">暂不使用录音</button><button data-action="close">返回</button>';
  if(m.type==='observe')html=`<h2>${m.attemptId?'核对这次观察':'这一次，孩子怎样表达？'}</h2><p>${esc(m.event?.title)} · ${esc(m.event?.chinese)}</p><p>意思合适就算表达，不必强求完整长句。没听清时选“无法确定”。</p><label class="check-label"><input id="observed-help" type="checkbox" ${m.helped?'checked':''} ${m.helpedLocked?'disabled':''}> 这次听过示范、中文解释或成人提示</label><label class="check-label"><input id="exact-phrase" type="checkbox" ${m.existing?.phraseId?'checked':''}> 确实听到了原句：${esc(m.event?.english)}</label>${session?.hasClip?'<button data-action="replay">回听这次声音</button>':''}<div class="observation-options">${Object.entries(resultNames).filter(([key])=>key!=='device_error').map(([key,label])=>`<button data-observation="${key}">${label}</button>`).join('')}</div><button data-action="close">返回</button>`;
  if(m.type==='replace-seed'){const offer=meadowState.shop.offer;html=`<h2 class="sr-only">换成这包种子吗？</h2><div class="reservation-picture">${offer&&offer.id===m.offerId?offerPicture(offer):''}</div><div class="reservation-choices"><button data-action="close" aria-label="继续保留原来的种子">${icon('house',28)}</button><button data-action="replace-reservation" aria-label="换成这包种子">${icon('check',28)}</button></div>`;}
  if(m.type==='collection')html=`<h2 class="sr-only">我的花朵收藏</h2>${meadowCollection(meadowState)}<button data-action="close" aria-label="回到小花园">${icon('check',32)}</button>`;
  if(m.type==='error')html=`<h2>这一步还没保存</h2><p>${esc(m.message)}</p>${(hasPendingChallengeRecovery()||practice.entries.some(r=>r.rewardVariant&&!((r.rewardVariant==='b'?meadowState:garden).rounds.some(done=>done.roundId===r.roundId))))?'<button data-action="retry-rewards">重试领取奖励</button>':''}<button data-action="close">知道了</button>`;
  root.innerHTML=`<div class="modal-backdrop"><section class="modal-card" role="dialog" aria-modal="true" aria-label="${m.type==='gate'?'家长入口':'小芽提示'}"><div class="modal-emblem" aria-hidden="true">${icon(m.type==='gate'?'parent':m.type==='collection'?'star':m.type==='mic'?'mic':'leaf')}</div>${html}</section></div>`;
}
function exportState(){const content=storageProblem?{problem:storageProblem,rawState:localStorage.getItem(STORAGE_KEY),rawGarden:localStorage.getItem(GARDEN_KEY),rawMeadow:localStorage.getItem(meadow.MEADOW_KEY),rawPractice:localStorage.getItem(PRACTICE_KEY),rawChallenges:localStorage.getItem(challenge.CHALLENGE_KEY)}:{product:'xiaoya-english',exported:today(),state,garden,meadow:meadowState,practice,challenges,gardenVariant,preferences:prefs,voice:selectedVoice};const url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`小芽英语-${today()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
async function recognition(){const target=document.querySelector('#model-status');if(target)target.textContent='准备本机识别资源，可以继续浏览，请保持本页打开。';try{await audio.prepareRecognition(value=>{const el=document.querySelector('#model-status');if(el)el.textContent=typeof value==='string'?value:'正在准备…';});toast('本机识别已准备好。');if(page==='parent')render();}catch{toast('识别资源没有准备完成，可以重试。');}}
const actions={challenges:openChallenges,'challenge-guide':()=>sound(voice('challenge-intro')),'challenge-seed':takeChallengeSeed,'challenge-practice':teach,'challenge-retry':retryChallengeStep,'learning-mode':()=>sound(voice(session?.recallMode?'flow-review-v13':'garden-welcome')),'audio-pack-retry':retryAudioPack,shop:openShop,'shop-pack':buyMystery,'shop-back':enterGarden,'collect-reward':showPendingReward,'choose-shells':()=>previewReward('shells'),'choose-water':()=>previewReward('water'),'confirm-reward':confirmReward,'shell-purpose':()=>sound(voice('flow-shell-use'),['shell-purpose']),'water-purpose':()=>sound(voice('flow-water-use'),['water-purpose']),'replace-reservation':()=>reserveSeed(modal?.offerId,true),home:()=>navigate('home'),garden:enterGarden,'next-event':()=>startEvent(),'new-event':()=>{const id=practiceToday().unseenIds[0];if(id)startEvent(storyFor(id).event);},'story-replay':replayStory,'story-help':teach,'story-continue':storyContinue,sample,'context-help':teach,record,watch,finish,pack,plant,water:()=>water(),'garden-guide':gardenGuide,'reward-voice':rewardVoice,'meadow-seed':()=>selectMeadowTool('seed'),'meadow-can':()=>selectMeadowTool('can'),'meadow-collection':()=>{openModal({type:'collection'});sound(voice('meadow-collection'));},'assessment-voice':assessmentVoice,'retry-assessment':retryAssessment,replay:async()=>{clearGuide();cancelIdleHint();const playback=++soundGeneration;speaking=true;try{return await audio.replayClip();}catch{toast('这段录音已释放，可以重新说一次。');}finally{if(playback===soundGeneration){speaking=false;scheduleIdleHint();}}},observe:()=>observation(),parent:()=>requireParent(()=>navigate('parent')),help:()=>page==='challenges'?sound(voice('challenge-intro')):page==='challenge-prize'?sound(voice('challenge-clear')):page==='shop'?sound(voice('economy-shop')):page==='reward'?rewardVoice():page==='garden'?gardenGuide():session?session.phase==='story'?teach():session.phase==='reward'?rewardVoice():teach():narrate('welcome'),close:closeModal,'retry-rewards':async()=>{closeModal();await restorePracticeRewards();return restoreChallengeRewards();},
  'gate-submit':()=>{if(modal?.type!=='gate')return;if(Number(document.querySelector('#parent-answer')?.value)===modal.a+modal.b){const callback=modal.callback;parentUnlocked=true;closeModal({keepMicIntent:true});callback();}else toast('请由陪伴的大人填写计算结果。');},'mic-settings':()=>openModal({type:'mic'}),'allow-mic':()=>{if(savePrefs({...prefs,mic:true})){const s=session,resume=s?.pendingMicIntent;closeModal();if(resume&&session===s&&s.phase==='request')return record();}},'disable-mic':()=>{if(savePrefs({...prefs,mic:false})){if(session){session.pendingMicIntent=false;cancelAttempt(session);}closeModal();}},recognition,export:exportState};
app.addEventListener('click',event=>{const b=event.target.closest('button');if(!b||b.disabled)return;try{
  cancelFeedbackVoice();if(gardenIsActive()){clearGuide();stopSpeech();scheduleGardenReminder();}
  if(!['meadow-seed','meadow-can'].includes(b.dataset.action))effects.tap(b,{silent:page==='event'||['help','parent','allow-mic','replay','mic-settings'].includes(b.dataset.action)||!!b.dataset.previewVoice});
  if(b.dataset.challengeUnit)startChallenge(b.dataset.challengeUnit);
  else if(b.dataset.buyOffer)buySeed(b.dataset.buyOffer,b.dataset.source).catch(error=>showError(error.message));
  else if(b.dataset.reserveOffer)reserveSeed(b.dataset.reserveOffer).catch(error=>showError(error.message));
  else if(b.dataset.action){Promise.resolve(actions[b.dataset.action]?.()).catch(error=>showError(error.message));}
  else if(b.dataset.plant){const p=garden.plants.find(p=>p.id===b.dataset.plant);if(p?.waterings===2)greetPlant(p.id);else water(b.dataset.plant).catch(error=>showError(error.message));}
  else if(b.dataset.variant)selectVariant(b.dataset.variant);
  else if(b.dataset.story)startEvent(storyFor(b.dataset.story).event);
  else if(b.dataset.checkup)startEvent(storyFor(b.dataset.checkup).event,true);
  else if(b.dataset.selectVoice){if(saveVoice(b.dataset.selectVoice)){selectedVoice=readVoice();render();sound(lessonAudio('needs-01',selectedVoice));}else showError('声音选择没有保存，请重试。');}
  else if(b.dataset.previewVoice)sound(lessonAudio('needs-01',b.dataset.previewVoice));
  else if(b.dataset.correct)observation(b.dataset.correct);
  else if(b.dataset.observation)submitObservation(b.dataset.observation).catch(error=>showError(error.message));
}catch(error){showError(error.message);}});
document.addEventListener('keydown',event=>{if(!modal)return;if(event.key==='Escape')return closeModal();if(modal.type==='gate'&&event.key==='Enter')return actions['gate-submit']();if(event.key==='Tab'){const list=[...document.querySelectorAll('.modal-card button,.modal-card input')].filter(el=>!el.disabled),first=list[0],last=list[list.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
for(const type of ['pointerdown','pointerup','pointercancel','keydown','scroll','click'])document.addEventListener(type,idleHintActivity,{capture:true,passive:true});
for(const type of ['pointerdown','keydown','scroll'])app.addEventListener(type,()=>{if(gardenIsActive()){cancelFeedbackVoice();scheduleGardenReminder();}},{capture:true,passive:true});
function suspend(){cancelIdleHint();pointerHeld=false;uiGeneration++;rewardSelection=null;cancelFeedbackVoice();effects.cancel();speaking=false;soundGeneration++;cancelMeadowDrag?.();cancelGardenReminder();clearGuide();audio.releaseAudioSession();if(session){cancelStory(session);cancelAttempt(session);session.teaching=false;session.hasClip=false;render();}}
function resume(){
  if(!modal){
    if(page==='shop'&&gardenVariant==='b'&&meadowState.pendingSeed){navigate('garden');meadowTool='seed';render();}
    else if(page==='shop'&&gardenVariant==='b'&&meadow.pendingRewards(meadowState).length)navigate('reward');
    else render();
  }
  scheduleGardenReminder();
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else resume();});window.addEventListener('pagehide',suspend);
window.addEventListener('storage',event=>{if(![GARDEN_KEY,meadow.MEADOW_KEY,VARIANT_KEY,STORAGE_KEY,PREFS,VOICE_KEY,PRACTICE_KEY,challenge.CHALLENGE_KEY].includes(event.key))return;stopSession();try{state=validateState(JSON.parse(localStorage.getItem(STORAGE_KEY)||JSON.stringify(createState())));garden=validateGarden(JSON.parse(localStorage.getItem(GARDEN_KEY)||JSON.stringify(createGarden())));meadowState=meadow.validateMeadow(JSON.parse(localStorage.getItem(meadow.MEADOW_KEY)||JSON.stringify(meadow.createMeadow())));practice=validatePracticePlan(JSON.parse(localStorage.getItem(PRACTICE_KEY)||JSON.stringify(createPracticePlan())));challenges=challenge.validateChallenges(JSON.parse(localStorage.getItem(challenge.CHALLENGE_KEY)||JSON.stringify(challenge.createChallenges())));if(event.key===VARIANT_KEY)gardenVariant=localStorage.getItem(VARIANT_KEY)==='b'?'b':'a';prefs=JSON.parse(localStorage.getItem(PREFS)||'{}');selectedVoice=readVoice();storageProblem=null;}catch(error){storageProblem=error.message;}page='home';modal=null;render();restorePracticeRewards();restoreChallengeRewards();});
const cancelMeadowDrag=bindMeadowInteractions(app,{read:()=>({active:gardenVariant==='b'&&gardenIsActive(),state:meadowState,tool:meadowTool}),onSelect:selectMeadowTool,onPlant:meadowPlant,onWater:meadowWater,onTouch:(event,target)=>{cancelFeedbackVoice();clearGuide();stopSpeech();scheduleGardenReminder();if(event){const pointer=event.detail>0||event.type.startsWith('pointer');effects.tap(target,pointer?{x:event.clientX,y:event.clientY}:{});}}});
installPaperArt(document.body);
render();
onAudioPackChange(()=>{const target=document.querySelector('[data-audio-pack-status]');if(target)target.textContent=audioPackMessage();});
startAudioPack();
restorePracticeRewards();

restoreChallengeRewards();
