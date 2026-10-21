import {INTERNAL_BUILD,GM_SANDBOX,appStorage} from './runtime.js';
import {EVENTS} from './content.js';
import {STORAGE_KEY,createState,validateState,localDay,recordEvidence,correctEvidence,effectiveEvidence,phraseStatus,phraseCheckupContext} from './learning.js';
import {STORIES,storyFor} from './stories.js';
import {CORE_PHRASE_EVENT_IDS,canonicalEventId,phraseEvents} from './curriculum.js';
import {pictureFor,pictureSequence,createPictureLoader} from './story-pictures.js';
import * as meadow from './garden-meadow.js';
import {getEconomySettings,ECONOMY_SETTINGS_KEY} from './economy-settings.js';
import {meadowPlantArt} from './meadow-art.js';
import {meadowView,meadowCollection,bindMeadowInteractions,layoutMeadowWatering} from './meadow-ui.js';
import {seedShopView,offerPicture} from './seed-shop.js';
import {blindboxView} from './blindbox-ui.js';
import {createWelcomeGreetings} from './welcome-greetings.js';
import {LEGACY_GARDEN_KEY,readGardenHistory} from './garden-history.js';
import {VOICES,VOICE_KEY,readVoice,saveVoice,lessonAudio} from './voices.js';
import {icon,buddy,sceneArt,voicePortrait} from './art.js';
import {installPaperArt} from './paper-art.js';
import {shellArt,dropArt,canArt,packArt,plantArt} from './garden-art.js';
import * as audio from './audio.js';
import {startAudioPack,retryAudioPack,audioPackMessage,onAudioPackChange,retryArtPack,artPackMessage,onArtPackChange} from './audio-pack.js';
import {PRACTICE_KEY,createPracticePlan,validatePracticePlan,recordPractice,getPracticePlan} from './practice-plan.js';
import {createFeedback} from './feedback.js';
import {createGardenMusic,gardenMusicSettings} from './garden-music.js';
import {createMeadowMotion} from './meadow-motion.js';
import {soundPlayer} from './sound-player.js';
import {soundSettings,SOUND_SETTINGS_KEY} from './sound-settings.js';
import {createGuidanceClock,VISUAL_HINT_IDLE_MS} from './guidance-clock.js';
import {createGuidancePolicy,audioControls} from './guidance-policy.js';
import * as challenge from './challenges.js';
import {flagArt,challengeFlag,challengeSteps,challengeBoard,challengePrize} from './challenge-ui.js';

const app=document.querySelector('#app'),PREFS='xiaoya-english:preferences:v1';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>globalThis.crypto?.randomUUID?.()||`local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,today=()=>localDay();
let state=createState(),gardenHistory=readGardenHistory(null),prefs={mic:false},selectedVoice=readVoice(appStorage);
let storageProblem=null,rawState=null,rawGarden=null,session=null,modal=null,parentUnlocked=false;
let page='home',toastTimer,feedback=null,feedbackTimer,restoreFocus,gmWorkbenchOpen=false;
let guideActions=[],guideGeneration=0;
let pointerHeld=false,feedbackVoiceTimer;
let idleReminderActive=false,automaticVoice=false;
let practice=createPracticePlan(),speaking=false,soundGeneration=0;
let challenges=challenge.createChallenges(),challengeReceipt=null,challengeBusy=false;
try{const raw=appStorage.getItem(challenge.CHALLENGE_KEY);if(raw)challenges=challenge.validateChallenges(JSON.parse(raw));}catch(error){storageProblem=error.message;}
let recoveringRewards=false,recoveryRequested=false;
let rewardReceipt=null,rewardBusy=false,shopBusy=false,uiGeneration=0;
let mysterySelection=null,mysteryVoiceRun=0;
let welcomeReceipt=null,welcomeBusy=false;
let welcomePhase=null,welcomePreview=false,welcomeRun=0;
const welcomeTimers=new Set();
// A native modal keeps the whole background (including the GM launcher) inert.
// Keep it outside #app so unrelated wallet/art renders cannot restart the reveal.
const welcomeOverlay=document.createElement('dialog');
welcomeOverlay.className='welcome-gift-overlay';
welcomeOverlay.setAttribute('role','dialog');welcomeOverlay.setAttribute('aria-modal','true');
welcomeOverlay.setAttribute('aria-label','小芽送你一份小礼物');welcomeOverlay.tabIndex=-1;
document.body.append(welcomeOverlay);
welcomeOverlay.addEventListener('cancel',event=>event.preventDefault());
welcomeOverlay.addEventListener('click',event=>{if(event.target.closest('[data-action="open-welcome-gift"]'))claimWelcomeGift();});
const chooseWelcomeGreeting=createWelcomeGreetings(appStorage);
let welcomeGreetingTimer=null,welcomeAttemptDay=null;
const effects=createFeedback({soundBackend:soundPlayer,canSound:()=>audioControls(prefs.audioControls).music&&!document.hidden&&!speaking&&!session?.waiting&&!session?.recording&&!['preparing','assessing'].includes(session?.assessment?.status)});
const gardenMusic=createGardenMusic();
const meadowMotion=createMeadowMotion();
let gmMusicPreview=false;
let audioActivity={playing:false,recording:false},pageSuspended=false;
function syncGardenMusic(){
  const recording=audioActivity.recording||!!session?.waiting||!!session?.recording||['preparing','assessing'].includes(session?.assessment?.status);
  soundPlayer.setState({muted:!audioControls(prefs.audioControls).music,speech:speaking||audioActivity.playing,recording,hidden:document.hidden||pageSuspended,suspended:gmWorkbenchOpen});
  // Keep one garden player/source across navigation, including while it fades out.
  // Legacy scene bindings must never start this track outside the garden.
  const binding=soundPlayer.resolve('bgm-garden'),settings=gardenMusicSettings(prefs.gardenMusic);
  gardenMusic.setState({...settings,file:binding?.asset?.url,volume:settings.volume*(binding?.volume||0),
    enabled:audioControls(prefs.audioControls).music&&settings.enabled&&!!binding?.enabled,active:!pageSuspended&&!document.hidden&&!recording&&(gmWorkbenchOpen?gmMusicPreview:page==='garden'&&!modal&&!welcomePhase),
    ducked:speaking||audioActivity.playing,immediate:pageSuspended||document.hidden||recording});
}
// Cue narration is cancellable with the same navigation generation as the view.
function afterCue(callback,delay=320){const generation=uiGeneration;feedbackVoice(()=>{if(generation===uiGeneration&&!modal&&!document.hidden&&!gmWorkbenchOpen)callback();},delay);}
soundSettings.subscribe(()=>syncGardenMusic());
const directStory=new URLSearchParams(location.search).get('story');
// Old garden URL parameters and preferences cannot select a retired screen.
let meadowState=meadow.createMeadow(),meadowTool=null,meadowBusy=false;
try{const saved=appStorage.getItem(meadow.MEADOW_KEY);if(saved)meadowState=meadow.validateMeadow(JSON.parse(saved));}catch(error){storageProblem=error.message;}
const activeGarden=()=>meadowState;
const waterReward=()=>{const e=getEconomySettings();return meadowState.rounds.length?e.waterReward:e.starterWaterReward;};
const shellReward=()=>{const e=getEconomySettings();return meadowState.rounds.length?e.shellReward:e.starterShellReward;};
const hasRewardChoice=()=>meadowState.rounds.length>0;
function rewardPreview(){return `${shellArt()}<span>${shellReward()}</span>${hasRewardChoice()?'<span class="resource-or">/</span>':''}${dropArt()}<span>${waterReward()}</span>`;}
const activeNext=()=>meadow.nextAction(meadowState);
const allRounds=()=>[...gardenHistory.rounds,...meadowState.rounds];

try{rawState=appStorage.getItem(STORAGE_KEY);if(rawState)state=validateState(JSON.parse(rawState));rawGarden=appStorage.getItem(LEGACY_GARDEN_KEY);gardenHistory=readGardenHistory(rawGarden);}catch(error){storageProblem=error.message;}
try{prefs={...JSON.parse(appStorage.getItem(PREFS)||'{}'),mic:JSON.parse(appStorage.getItem(PREFS)||'{}').mic===true};}catch{}
try{const raw=appStorage.getItem(PRACTICE_KEY);if(raw)practice=validatePracticePlan(JSON.parse(raw));}catch(error){storageProblem=error.message;}
const guidancePolicy=createGuidancePolicy({storage:appStorage,returning:allRounds().length>0||practice.entries.length>0||state.evidence.length>0||prefs.shopSeen===true});
const guidanceClock=createGuidanceClock({onDue:remindAfterIdle});
const visualHintClock=createGuidanceClock({delay:VISUAL_HINT_IDLE_MS,onDue:()=>idleHintTarget()?.classList.toggle('is-idle-hint',true)});
let planCache;
function practiceToday(){const date=today();if(!planCache||planCache.practice!==practice||planCache.state!==state||planCache.gardenHistory!==gardenHistory||planCache.meadow!==meadowState||planCache.date!==date)planCache={practice,state,gardenHistory,meadow:meadowState,date,value:getPracticePlan(practice,{rounds:allRounds(),learningState:state,date})};return planCache.value;}
async function savePractice(s){
  const commit=()=>{if(storageProblem)return showError('原记录需要处理，请先到家长区导出。'),false;try{const raw=appStorage.getItem(PRACTICE_KEY),latest=raw?validatePracticePlan(JSON.parse(raw)):createPracticePlan();const next=(s.practiceRecords||[s.practiceRecord]).reduce((value,entry)=>recordPractice(value,entry),latest);appStorage.setItem(PRACTICE_KEY,JSON.stringify(next));practice=next;return true;}catch{return showError('这次练习还没有保存，请检查浏览器存储后重试。'),false;}};
  return !GM_SANDBOX&&navigator.locks?.request?navigator.locks.request(PRACTICE_KEY,commit):commit();
}
async function restorePracticeRewards(){
  if(storageProblem)return;
  if(recoveringRewards){recoveryRequested=true;return;}
  recoveringRewards=true;
  try{
    const pending=practice.entries.filter(r=>r.rewardVariant==='b'&&!meadowState.rounds.some(done=>done.roundId===r.roundId));
    if(pending.length){
      const saved=await gardenChange(latest=>pending.reduce((value,r)=>meadow.rewardRound(value,{roundId:r.roundId,eventId:r.eventId,date:r.date}),latest));
      if(!saved&&!pending.every(r=>meadowState.rounds.some(done=>done.roundId===r.roundId)))return;
    }
    if(!modal&&['home','garden','parent'].includes(page))render();
  }finally{recoveringRewards=false;if(recoveryRequested){recoveryRequested=false;restorePracticeRewards();}}
}
function save(next){if(storageProblem)return showError('原记录需要处理，请先到家长区导出。'),false;try{validateState(next);appStorage.setItem(STORAGE_KEY,JSON.stringify(next));state=next;return true;}catch{return showError('记录未保存，请检查浏览器存储空间后重试。'),false;}}
async function gardenChange(change){
  const key=meadow.MEADOW_KEY,validate=meadow.validateMeadow,create=meadow.createMeadow;
  const commit=()=>{if(storageProblem)return showError('原记录需要处理，请先到家长区导出。'),false;try{
  // Re-read inside the cross-tab lock; no stale balance is used by an open tab.
  const raw=appStorage.getItem(key),latest=raw?validate(JSON.parse(raw)):create();
  const next=change(latest);validate(next);if(next!==latest)appStorage.setItem(key,JSON.stringify(next));meadowState=next;return next!==latest;
}catch{return showError('花园没有保存，贝壳和水没有扣除。请检查存储后重试。'),false;}};
  return !GM_SANDBOX&&navigator.locks?.request?navigator.locks.request(key,commit):commit();
}
function savePrefs(next){try{appStorage.setItem(PREFS,JSON.stringify(next));prefs=next;syncGardenMusic();soundPlayer.play('settings-save');return true;}catch{return showError('设置没有保存，请检查浏览器存储权限。'),false;}}
function challengeSummary(){return challenge.getChallenges(challenges,{practicePlan:practiceToday(),date:today()});}
function challengeProgress(s){
  const attempts=challenges.attempts.filter(a=>a.unitId===s.challengeUnitId&&canonicalEventId(a.eventId)===canonicalEventId(s.event.id));
  return challenge.challengeStepProgress(attempts,{afterAttemptId:s.challengeReplay?s.challengeAttemptStartId:null});
}
function hasPendingChallengeRecovery(){return challenges.attempts.some(a=>!practice.entries.some(r=>r.roundId===`challenge:${a.attemptId}`))||challengeSummary().receipts.some(r=>!meadowState.challengeRewards.some(p=>p.unitId===r.unitId));}
async function challengeChange(change){
  const commit=()=>{if(storageProblem)return false;try{const raw=appStorage.getItem(challenge.CHALLENGE_KEY),latest=raw?challenge.validateChallenges(JSON.parse(raw)):challenge.createChallenges(),next=change(latest);challenge.validateChallenges(next);appStorage.setItem(challenge.CHALLENGE_KEY,JSON.stringify(next));challenges=next;return true;}catch{return showError('挑战进度还没有保存，请重试。这次已完成的小步不会清空。'),false;}};
  return !GM_SANDBOX&&navigator.locks?.request?navigator.locks.request(challenge.CHALLENGE_KEY,commit):commit();
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
  const changed=await gardenChange(latest=>receipts.reduce((s,r)=>meadow.rewardChallenge(s,{unitId:r.unitId,date:r.date}),latest));
  if(changed&&!modal&&['home','garden','parent','challenges'].includes(page))render();
  return receipts.every(r=>meadowState.challengeRewards.some(p=>p.unitId===r.unitId));
}
async function saveChallengeResult(s,{result,source,helped,stars}){
  if(!s.attemptId)return false;
  // Navigation may release the live recording while the cross-tab lock waits.
  // Save the completed result from a snapshot, not the mutable session object.
  const attemptId=s.attemptId,eventId=s.event.id,unitId=s.challengeUnitId,retryAfterAttemptId=s.retryAfterAttemptId||null;
  const evidence=effectiveEvidence(state).find(e=>e.attemptId===attemptId),date=evidence?.date||today();
  const saved=await challengeChange(latest=>challenge.recordChallengeAttempt(latest,{id:`attempt:${attemptId}`,unitId,eventId,date,attemptId,result,source,helped:!!helped,retryAfterAttemptId,...(stars===undefined?{}:{stars})}));
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
function openChallenges(){challengeReceipt=null;navigate('challenges');afterCue(()=>sound(voice('challenge-intro'),['challenge-guide']));}
function startChallenge(unitId){
  const unit=challengeSummary().units.find(u=>u.id===unitId);if(!unit)return;
  if(!unit.available){const item=unit.items.find(i=>!i.studied);startEvent(storyFor(item.eventId).event);return;}
  const eventId=unit.completed?unit.items[0].eventId:unit.nextEventId;
  const previous=challenges.attempts.filter(a=>a.unitId===unitId&&canonicalEventId(a.eventId)===canonicalEventId(eventId)).at(-1);
  // Resume the missing step with its help trace even after closing the page.
  startEvent(storyFor(eventId).event,false,{challengeUnitId:unitId,challengeReplay:unit.completed,challengeReplayIndex:0,retryAfterAttemptId:!unit.completed&&previous?previous.attemptId:null});
}
function retryChallengeStep(){
  const s=session;if(!s?.challengeUnitId)return;
  startEvent(s.event,false,{challengeUnitId:s.challengeUnitId,challengeReplay:s.challengeReplay,challengeReplayIndex:s.challengeReplayIndex,challengeAttemptStartId:s.challengeAttemptStartId,retryAfterAttemptId:s.attemptId||s.retryAfterAttemptId||null});
}
async function finishChallengeStep(){
  const s=session;if(!s||s.phase!=='resolved'||s.finishing)return;
  if(!s.attemptId||!challengeProgress(s).passed)return retryChallengeStep();
  s.finishing=true;const generation=uiGeneration;render();
  const saved=await restoreChallengeRewards();s.finishing=false;
  if(!saved||session!==s||generation!==uiGeneration||modal||document.hidden)return;
  const unit=challengeSummary().units.find(u=>u.id===s.challengeUnitId);
  if(s.challengeReplay){
    const index=s.challengeReplayIndex+1;
    if(index<unit.items.length)return startEvent(storyFor(unit.items[index].eventId).event,false,{challengeUnitId:unit.id,challengeReplay:true,challengeReplayIndex:index});
    navigate('challenges');return sound(voice('challenge-replay'));
  }
  if(unit.completed){challengeReceipt=unit.id;navigate('challenge-prize');effects.play('challenge-clear',{target:document.querySelector('.challenge-fanfare')});feedbackVoice(()=>{if(page==='challenge-prize'&&challengeReceipt===unit.id&&!modal&&!document.hidden)challengeClearVoice();},960);return;}
  startEvent(storyFor(unit.nextEventId).event,false,{challengeUnitId:unit.id,challengeReplay:false,challengeReplayIndex:0});
}
async function takeChallengeSeed(){
  if(challengeBusy)return;
  if(meadowState.pendingSeed)return enterGarden();
  challengeBusy=true;const generation=uiGeneration;
  try{const changed=await gardenChange(meadow.redeemChallengeSeed);if(!changed||generation!==uiGeneration||modal||document.hidden)return;enterGarden();meadowTool='seed';render();stopSpeech();effects.play('seed',{target:document.querySelector('[data-action="meadow-seed"]')});feedbackVoice(()=>{if(gardenIsActive()&&!modal)sound(voice('challenge-seed'),['meadow-seed']);});}finally{challengeBusy=false;}
}
async function inviteChallenge(){
  const unit=challenge.invitationFor(challenges,{practicePlan:practiceToday(),date:today()});if(!unit)return false;
  // A small flag and a spoken invitation; the child stays in the garden.
  sound(voice('challenge-invite'),['challenges']);
  await challengeChange(latest=>latest.invitations.some(i=>i.unitId===unit.id)?latest:challenge.recordInvitation(latest,{id:uid(),unitId:unit.id,date:today()}));
  return true;
}
function challengeParentPanel(){

  const summary=challengeSummary();return `<section class="parent-card"><h2>花园挑战 · ${summary.completedCount} / ${summary.units.length} 组</h2><p>每组四句，三颗星一次通过；同一句两颗星累计两次通过，一颗星继续练习。完成的小步和已攒的一次两颗星都会保留。孩子可以主动挑战；系统只会在至少隔天、且四句中三句已有独立表达候选时轻声邀请，每组一次，两次邀请至少间隔三天。</p>${summary.units.map(u=>`<div class="challenge-parent-row"><span>${esc(u.title)} · ${u.completedCount} / 4${u.items.some(i=>i.passEvidence==='after-practice')?' · 含练习后完成':''}</span><button data-challenge-unit="${u.id}">${u.available?'去挑战':'先学习'}</button></div>`).join('')}<p>挑战过关是游戏进度。当天听过示范再答出来记作练习后完成，不等于稳定掌握；复习仍会隔天检验。机器匹配不是发音评分，设备问题和没听清均不扣进度。</p></section>`;
}
function toast(message){clearTimeout(toastTimer);document.querySelector('.toast')?.remove();const el=document.createElement('div');el.className='toast';el.role='status';el.textContent=message;document.body.append(el);toastTimer=setTimeout(()=>el.remove(),5000);}
function showError(message){openModal({type:'error',message});}
const voice=id=>`xiaoya/audio/v3/${id}.mp3`;
const english=s=>lessonAudio(s.event,selectedVoice);
// Highlight only a single clear next action after an uninterrupted idle interval.
function idleHintTarget(){
  if(guidancePaused()||speaking||audioActivity.playing||audioActivity.recording||pointerHeld||rewardBusy||shopBusy||meadowBusy||welcomePhase||['parent','shop','blindbox'].includes(page))return null;
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
  for(const wrap of document.querySelectorAll('.primary-wrap'))wrap.classList.toggle('is-idle-hint',false);
}
function guidancePaused(){return document.hidden||pageSuspended||!!modal||gmWorkbenchOpen;}
function scheduleIdleHint(){
  if(guidancePaused()){cancelIdleHint();guidanceClock.pause();visualHintClock.pause();return;}
  for(const clock of [guidanceClock,visualHintClock]){
    if(clock.status().paused)clock.resume();else clock.schedule();
  }
}
function idleHintActivity(event){
  if(event.type==='pointerdown')pointerHeld=true;
  else if(['pointerup','pointercancel'].includes(event.type))pointerHeld=false;
  if(idleReminderActive){stopSpeech();clearGuide();idleReminderActive=false;}
  cancelIdleHint();guidanceClock.activity();visualHintClock.activity();scheduleIdleHint();
}
async function remindAfterIdle(){
  if(guidancePaused()||pointerHeld||speaking||audioActivity.playing||audioActivity.recording||rewardBusy||shopBusy||meadowBusy||welcomePhase)return;
  if(session&&(session.waiting||session.recording||session.teaching||session.storyRunning||session.finishing||['preparing','assessing'].includes(session.assessment?.status)))return;
  idleReminderActive=true;
  try{await contextualReminder({idle:true});}
  finally{idleReminderActive=false;}
}
function contextualReminder(options={}){
  if(page==='parent')return;
  if(page==='challenges')return sound(voice('challenge-intro'),[],options);
  if(page==='challenge-prize')return challengeClearVoice(options);
  if(page==='blindbox')return blindboxVoice(options);
  if(page==='shop')return sound(voice('economy-shop'),[],options);
  if(page==='reward'||session?.phase==='reward')return rewardVoice(options);
  if(page==='garden')return gardenGuide(options);
  if(session?.assessment)return assessmentVoice(options);
  if(session?.phase==='request')return narrate('speak',options);
  if(session?.phase==='resolved')return speechFeedback('pass',options);
  if(session)return narrate('speak',options);
  return narrate('welcome',options);
}
// Guidance and celebration voices are distinct from language teaching and explicit help.
function voiceKind(file){
  const id=String(file).match(/xiaoya\/audio\/v3\/([^/?]+)\.mp3(?:[?#]|$)/)?.[1];
  if(!id)return null;
  if(/^(garden-speech-|welcome-|blindbox-seed-)/.test(id)||['flow-pass','challenge-step','challenge-clear','meadow-bloom'].includes(id))return 'feedback';
  return /^(garden-(welcome|speak|watch|next)$|flow-|economy-|meadow-|challenge-|blindbox-)/.test(id)?id:null;
}
function applyGuide(){for(const button of document.querySelectorAll('[data-action]'))button.classList.toggle('is-guided',!modal&&!button.disabled&&(guideActions.includes(button.dataset.action)||guideActions.includes('primary')&&button.hasAttribute('data-primary')));}
function cancelFeedbackVoice(){clearTimeout(feedbackVoiceTimer);feedbackVoiceTimer=null;}
function stopSpeech({fade=false}={}){cancelFeedbackVoice();soundGeneration++;if(fade)void audio.fadeOutSound();else audio.stopSound();speaking=false;automaticVoice=false;effects.setSilent(false);syncGardenMusic();}
function cueDelay(id,minimum=0){const entry=soundPlayer.resolve(id);return entry?.enabled&&entry.volume>0?Math.max(minimum,Math.min(2,entry.asset.duration||2)*1000+80):minimum;}
function feedbackVoice(callback,delay=340){const wait=cueDelay(soundPlayer.status().id,delay);cancelFeedbackVoice();feedbackVoiceTimer=setTimeout(()=>{feedbackVoiceTimer=null;callback();},wait);}
function clearGuide(){guideGeneration++;guideActions=[];applyGuide();}
async function sound(file,targets=[],{automatic=false,fadePrevious=false,manual=false,idle=false}={}){
  const kind=voiceKind(file),enabled=audioControls(prefs.audioControls).reminders;
  if(kind&&!manual&&(!enabled||(kind!=='feedback'&&!guidancePolicy.allow(kind,{idle,enabled}))))return false;
  automaticVoice=!!kind&&!manual;
  const generation=++guideGeneration,playback=++soundGeneration,ui=uiGeneration;
  guideActions=targets;speaking=true;cancelIdleHint();effects.setSilent(true);syncGardenMusic();applyGuide();
  try{
    if(fadePrevious){
      await audio.fadeOutSound();
      if(playback!==soundGeneration||ui!==uiGeneration||document.hidden)return false;
    }
    return await audio.playSound(file);
  }catch(error){if(!(automatic&&error.name==='NotAllowedError'))toast(error.message||'内置声音暂时无法读取，请家长在家长区检查声音准备状态。');return false;}
  finally{if(playback===soundGeneration){speaking=false;automaticVoice=false;effects.setSilent(false);syncGardenMusic();if(!idle)guidanceClock.activity();visualHintClock.activity();}if(generation===guideGeneration){clearGuide();scheduleIdleHint();}}
}
const guideTargets={welcome:['primary'],speak:['record','sample'],'speech-pass':['finish'],'speech-saved':['finish'],'speech-retry':['sample'],'speech-partial':['sample'],'speech-silent':['record','sample'],'speech-wait':['watch'],next:['next-event']};
const narrate=(id,options={})=>sound(voice(`garden-${id}`),guideTargets[id]||[],options);
function button(action,label,glyph,extra=''){return `<button class="icon-button" data-action="${action}" aria-label="${esc(label)}" ${extra}>${icon(glyph)}</button>`;}
function primary(action,label,body,extra=''){return `<div class="primary-wrap"><button class="primary-orb" data-primary data-action="${action}" aria-label="${esc(label)}" ${extra}>${body}</button></div>`;}
function header(){
  const localHelp=page==='event'&&['story','request'].includes(session?.phase);
  const controls=button('audio-settings','声音设置','sound')+(page==='parent'?'':`${localHelp?'':button('help','听下一步怎么玩','help')}${button('parent','家长陪伴区','parent')}`);
  return `<header class="topbar">${button('home','回到首页','house')}<span class="brand">小芽英语<small class="edition-label">启蒙正式版 v${esc(document.querySelector('meta[name="xiaoya-version"]')?.content||'0.25.0')}</small></span><div>${controls}</div></header>`;
}
function balance(){const garden=activeGarden(),unlimited=meadow.hasUnlimitedResources(garden);return `<div class="wallet" aria-label="${unlimited?'测试用无限贝壳和水滴':`${garden.shells} 枚贝壳，${garden.water} 滴水`}"><span>${shellArt()}<b data-shells>${unlimited?'∞':garden.shells}</b></span><span>${dropArt()}<b data-water>${unlimited?'∞':garden.water}</b></span></div>`;}
function nextPractice(){const plan=practiceToday();if(!plan.cards.some(c=>c.firstDate)&&STORIES.some(s=>s.id===directStory))return {eventId:directStory,mode:'new'};return plan.next||{eventId:STORIES[0].id,mode:'free'};}
function nextStory(){return storyFor(nextPractice().eventId);}
function stopSession(){cancelWelcomeGift();cancelWelcomeGreeting();cancelIdleHint();uiGeneration++;cancelFeedbackVoice();cancelMeadowDrag?.();effects.cancel();effects.setSilent(false);speaking=false;meadowTool=null;cancelGardenReminder();clearGuide();if(session)cancelStory(session);audio.releaseAudioSession();session=null;}
function navigate(next){stopSession();modal=null;feedback=null;clearTimeout(feedbackTimer);page=next;render();window.scrollTo(0,0);soundPlayer.play(next==='shop'?'shop-open':next==='challenges'?'challenge-start':'navigate');}
function openModal(value){cancelWelcomeGift();cancelWelcomeGreeting();cancelIdleHint();uiGeneration++;cancelFeedbackVoice();cancelMeadowDrag?.();effects.cancel();cancelGardenReminder();clearGuide();if(session){cancelStory(session);cancelAttempt(session);session.teaching=false;}audio.stopSound();speaking=false;restoreFocus=document.activeElement;modal=value;guidanceClock.pause();visualHintClock.pause();renderModal();soundPlayer.play(value.type==='collection'?'collection':value.type==='error'?'blocked':'panel-open');setTimeout(()=>document.querySelector('.modal-card button,.modal-card input')?.focus(),0);}
function closeModal({keepMicIntent=false}={}){uiGeneration++;if(['mic','gate'].includes(modal?.type)&&session&&!keepMicIntent)session.pendingMicIntent=false;modal=null;render();prepareMicrophone();scheduleGardenReminder();restoreFocus?.focus?.();soundPlayer.play('panel-close');}
function requireParent(callback){if(GM_SANDBOX||parentUnlocked)return callback();openModal({type:'gate',callback,a:3+Math.floor(Math.random()*5),b:2+Math.floor(Math.random()*4)});}
function homeView(){
  const progress=allRounds().length>0,task=activeNext(),resume=progress&&task!=='learn',choice=nextPractice(),story=storyFor(choice.eventId);
  const shortcuts=`${challengeFlag(challengeSummary())}${progress&&!resume?`<button class="garden-shortcut" data-action="garden" aria-label="打开我的小花园">${plantArt(meadow.FLOWERS[0],2)}${icon('house',24)}</button>`:''}`;
  return `${header()}<main class="home-view home-welcome" data-next-event="${choice.eventId}" data-next-mode="${choice.mode}"><div class="home-glade"><i class="home-leaf" aria-hidden="true"></i><div class="home-companion" aria-hidden="true">${buddy('happy')}</div><i class="home-leaf" aria-hidden="true"></i></div>${primary(resume?'garden':'next-event',resume?'去花园照顾小种子':`${choice.mode==='review'?'再见老朋友':'出发'}：${story.event.title}`,resume?canArt():icon('play',48))}<div class="reward-preview" aria-label="${hasRewardChoice()?`玩英语，选择${shellReward()}枚贝壳或${waterReward()}滴水`:`第一份学习礼物，${shellReward()}枚贝壳和${waterReward()}滴水`}">${rewardPreview()}</div>${shortcuts?`<div class="home-shortcuts">${shortcuts}</div>`:''}</main>`;
}

function dailyWelcomeId(){return chooseWelcomeGreeting({date:today(),returning:!!(allRounds().length||meadowState.welcomeGifts.length||practice.entries.length||effectiveEvidence(state).length)});}
function cancelWelcomeGreeting(){clearTimeout(welcomeGreetingTimer);welcomeGreetingTimer=null;}
function scheduleWelcomeGreeting(){
  cancelWelcomeGreeting();
  if(GM_SANDBOX||welcomePhase!=='wrapped'||page!=='home'||modal||gmWorkbenchOpen||document.hidden||speaking||welcomeAttemptDay===today()||!meadow.welcomeGift(meadowState,today()))return;
  const generation=uiGeneration;
  welcomeGreetingTimer=setTimeout(()=>{
    welcomeGreetingTimer=null;
    if(generation!==uiGeneration||welcomePhase!=='wrapped'||page!=='home'||modal||gmWorkbenchOpen||document.hidden||speaking||!meadow.welcomeGift(meadowState,today()))return;
    welcomeAttemptDay=today();
    // A blocked automatic hello is silent; the one gift tap still opens it and
    // unlocks the real reward's purpose voice, without another confirmation.
    sound(voice(dailyWelcomeId()),[],{automatic:true});
  },400);
}
function welcomeVoice(){
  cancelWelcomeGreeting();welcomeAttemptDay=today();
  const id=welcomeReceipt?`welcome-gift-${welcomeReceipt.kind==='shells'?'shell':'water'}`:dailyWelcomeId();
  return sound(voice(id));
}
function openWelcomeGift(){
  navigate('home');
  welcomePreview=true;syncWelcomeGift();effects.prepare();
  if(welcomePhase==='wrapped')return welcomeVoice();
}
function welcomeLater(callback,delay){const timer=setTimeout(()=>{welcomeTimers.delete(timer);callback();},delay);welcomeTimers.add(timer);}
function cancelWelcomeGift(){
  welcomeRun++;for(const timer of welcomeTimers)clearTimeout(timer);welcomeTimers.clear();
  welcomePhase=null;welcomeReceipt=null;welcomePreview=false;
  if(welcomeOverlay.open)welcomeOverlay.close();welcomeOverlay.innerHTML='';
  delete welcomeOverlay.dataset.giftPhase;delete welcomeOverlay.dataset.giftKind;
  document.body.classList.remove('welcome-gift-active');
  for(const element of document.querySelectorAll('.app-shell,#xiaoya-gm'))element.inert=false;
}
function syncWelcomeGift(){
  if(page!=='home'||modal||gmWorkbenchOpen||document.hidden)return;
  if(!welcomePhase&&(!GM_SANDBOX||welcomePreview)&&meadow.welcomeGift(meadowState,today()))welcomePhase='wrapped';
  if(!welcomePhase)return;
  const kind=welcomeReceipt?.kind||'',opened=['opened','closing'].includes(welcomePhase);
  // Only replace the illustration at the reveal, never on unrelated rerenders.
  if(!welcomeOverlay.firstElementChild||welcomeOverlay.dataset.giftKind!==kind){
    welcomeOverlay.innerHTML=`<div class="welcome-gift-stage"><div class="welcome-gift-halo" aria-hidden="true"></div><i class="welcome-gift-spark s1" aria-hidden="true"></i><i class="welcome-gift-spark s2" aria-hidden="true"></i><i class="welcome-gift-spark s3" aria-hidden="true"></i><i class="welcome-gift-spark s4" aria-hidden="true"></i>${opened?`<div class="welcome-gift-treasure" role="status" aria-live="polite"><span class="welcome-gift-resource" aria-hidden="true">${kind==='shells'?shellArt():dropArt()}</span><b aria-hidden="true">+1</b><span class="welcome-gift-receipt">${icon('check',24)} 收好啦</span><span class="sr-only">收到${kind==='shells'?'一枚贝壳，可以买种子':'一滴水，可以浇花'}，已经放进小花园。</span></div>`:`<button class="welcome-gift-box" data-action="open-welcome-gift" aria-label="打开小芽送的小礼物"><span class="welcome-gift-art" aria-hidden="true">${icon('gift',238)}</span></button>`}</div>`;
  }
  welcomeOverlay.dataset.giftPhase=welcomePhase;welcomeOverlay.dataset.giftKind=kind;
  const button=welcomeOverlay.querySelector('button');if(button){button.disabled=welcomePhase!=='wrapped';button.setAttribute('aria-busy',String(welcomePhase==='opening'));}
  for(const element of document.querySelectorAll('.app-shell,#xiaoya-gm'))element.inert=true;
  document.body.classList.add('welcome-gift-active');
  if(!welcomeOverlay.open){welcomeOverlay.showModal();button?.focus({preventScroll:true});}
  if(opened||welcomePhase==='opening')welcomeOverlay.focus({preventScroll:true});
}
function closeWelcomeGift(run){
  if(run!==welcomeRun||welcomePhase!=='opened')return;
  welcomePhase='closing';stopSpeech({fade:true});syncWelcomeGift();
  welcomeLater(()=>{if(run!==welcomeRun)return;cancelWelcomeGift();render();document.querySelector('.home-view .primary-orb')?.focus({preventScroll:true});},matchMedia('(prefers-reduced-motion: reduce)').matches?0:420);
}
async function claimWelcomeGift(){
  if(welcomeBusy||page!=='home'||welcomePhase!=='wrapped')return;
  cancelWelcomeGreeting();cancelFeedbackVoice();stopSpeech();effects.prepare();
  soundPlayer.play('gift-open');welcomeBusy=true;welcomePhase='opening';const run=welcomeRun,date=today(),started=performance.now();syncWelcomeGift();
  let claimed=null,changed=false;
  try{
    changed=await gardenChange(latest=>{
      claimed=meadow.welcomeGift(latest,date);
      return claimed?meadow.claimWelcomeGift(latest,date):latest;
    });
  }finally{welcomeBusy=false;}
  // Saving is authoritative. Animation, navigation and visibility never grant.
  if(run!==welcomeRun||page!=='home'||modal||document.hidden)return;
  if(!changed){cancelWelcomeGift();render();return;}
  const delay=Math.max(0,cueDelay('gift-open',matchMedia('(prefers-reduced-motion: reduce)').matches?0:500)-(performance.now()-started));
  welcomeLater(()=>{
    if(run!==welcomeRun)return;
    welcomeReceipt=claimed;welcomePhase='opened';render();
    effects.play('reward',{target:welcomeOverlay.querySelector('.welcome-gift-treasure')});
    const revealed=performance.now();
    // Let the child see the reward and hear its use. A missing audio file must
    // not strand the modal; all delayed callbacks are cancelled on departure.
    welcomeLater(()=>closeWelcomeGift(run),7000);
    welcomeLater(()=>{if(run!==welcomeRun)return;welcomeVoice().finally(()=>{
      if(run===welcomeRun)welcomeLater(()=>closeWelcomeGift(run),Math.max(0,2400-(performance.now()-revealed)));
    });},cueDelay('reward',360));
  },delay);
}

const meadowPicture={id:"garden-background",image:"garden-paper-v1.webp"};
function picturePlaceholder(status){return `<div data-picture-placeholder role="status"><span class="picture-loading-dot" aria-hidden="true"></span><p>${['failed','slow','missing'].includes(status)?'这幅插画还没准备好':'正在打开插画'}</p>${['failed','slow','missing'].includes(status)?'<button data-action="picture-retry">重试图片</button>':''}</div>`;}
function showArtRecovery(){
  if(document.querySelector('[data-art-recovery]'))return;
  const notice=document.createElement('aside');notice.dataset.artRecovery='';notice.setAttribute('role','status');
  notice.innerHTML='<span>部分图片还没准备好，请先启动本地服务。</span><button type="button">重新检查图片</button>';
  notice.querySelector('button').addEventListener('click',retryPictures);document.body.append(notice);
}
function dismissArtRecovery(){if(!document.querySelector('[data-paper-state="error"],[data-picture-status="failed"],[data-picture-status="slow"]'))document.querySelector('[data-art-recovery]')?.remove();}
const pictures=createPictureLoader({
  onChange:(url,status)=>{
    // A picture becoming ready updates only its own canvas. Do not re-render
    // microphone controls, dismiss a parent dialog, or reset an idle hint.
    for(const element of document.querySelectorAll('[data-picture-url]'))if(element.dataset.pictureUrl===url){
      element.dataset.pictureStatus=status;
      if(status==='ready'){element.classList.toggle('single-picture',element.dataset.pictureLayout==='single');element.style.setProperty('--picture',`url("${url}")`);element.replaceChildren();}
      else element.innerHTML=picturePlaceholder(status);
    }
    if(url===pictureFor(meadowPicture,{},document.baseURI)?.url){const field=document.querySelector('[data-meadow-field]');if(field){field.classList.toggle('has-paper',status==='ready');if(status==='ready')field.style.setProperty('--meadow-picture',`url("${url}")`);else field.style.removeProperty('--meadow-picture');}}
    if(['failed','slow'].includes(status))showArtRecovery();else dismissArtRecovery();
  }
});
function recoverVisiblePictures(){
  for(const element of document.querySelectorAll('[data-picture-url]'))if(['failed','slow'].includes(pictures.status(element.dataset.pictureUrl))){
    pictures.load(element.dataset.pictureUrl,{retry:true});element.dataset.pictureStatus='pending';element.innerHTML=picturePlaceholder('pending');
  }
  if(page==='garden'){const url=pictureFor(meadowPicture,{},document.baseURI)?.url;if(['failed','slow'].includes(pictures.status(url)))pictures.load(url,{retry:true});}
  document.body.dispatchEvent(new Event('xiaoya-retry-art'));
}
function retryPictures(){recoverVisiblePictures();return retryArtPack();}
function picture(story,frame,moving=false,{alternate=false,phase='request',context=story.event.contexts[0]}={}){
  const options={frame,alternate,phase},asset=pictureFor(story,options,document.baseURI);
  for(const next of pictureSequence(story,options,document.baseURI))pictures.load(next.url);
  const ready=asset&&pictures.status(asset.url)==='ready';
  const label=alternate?(phase==='resolved'?context.resolution:context.request)||context.prompt||story.frames[frame]:story.frames[frame];
  return `<div class="story-picture ${ready&&asset.layout==='single'?'single-picture':''} ${moving?'moving':''}" role="group" aria-label="${esc(label)}" data-story-frame="${frame}"${alternate?` data-alternate="true" data-picture-phase="${phase}"`:''} data-picture-status="${asset?pictures.status(asset.url):'missing'}"${asset?` data-picture-id="${story.id}" data-picture-url="${esc(asset.url)}" data-picture-layout="${asset.layout}"`:''} style="${ready?`--picture:url('${esc(asset.url)}');`:''}--x:${frame%2?100:0}%;--y:${frame>1?100:0}%">${ready?'':picturePlaceholder(asset?pictures.status(asset.url):'missing')}</div>`;
}
function cancelStory(s){s.storyGeneration++;clearTimeout(s.storyTimer);s.storyDelayFinish?.(false);s.storyDelayFinish=null;s.storyRunning=false;}
function currentStory(s,g){return session===s&&s.storyGeneration===g&&s.phase==='story'&&!modal&&!document.hidden;}
function delay(s,g,ms){return new Promise(resolve=>{if(!currentStory(s,g))return resolve(false);s.storyDelayFinish=resolve;s.storyTimer=setTimeout(()=>{s.storyDelayFinish=null;resolve(currentStory(s,g));},ms);});}
function startEvent(event=null,assessment=false,challengeOptions=null,practiceOverride=null){const choice=practiceOverride||(event?{eventId:event.id,mode:assessment?'review':practiceToday().unseenIds.includes(event.id)?'new':'free'}:nextPractice());event??=storyFor(choice.eventId).event;if(challengeOptions?.challengeReplay&&!Object.hasOwn(challengeOptions,'challengeAttemptStartId')){const last=challenges.attempts.filter(a=>a.unitId===challengeOptions.challengeUnitId&&canonicalEventId(a.eventId)===canonicalEventId(event.id)).at(-1);challengeOptions={...challengeOptions,challengeAttemptStartId:last?.attemptId||null};}stopSession();const story=storyFor(event.id),recall=!!challengeOptions||assessment||choice.mode==='review';const priorChallengeHelp=challengeSummary().units.some(u=>u.items.some(i=>i.canonicalEventId===canonicalEventId(event.id)&&i.helpedToday));session={...challengeOptions,id:uid(),event,story,practiceMode:challengeOptions?'review':choice.mode,recallMode:recall,recallReady:recall,context:assessment?phraseCheckupContext(state,event.id):event.contexts[0],phase:recall?'request':'story',assessmentMode:assessment,helped:!recall,priorChallengeHelp,storyGeneration:0,speechGeneration:0,frame:story.teachingFrames[0],storyReady:false,storyRunning:false,hasClip:false,waiting:false,recording:false,teaching:false,assessment:null};page='event';modal=null;render();if(!recall){playStory();effects.prepare();soundPlayer.play('lesson-enter');}else{soundPlayer.play(challengeOptions?'challenge-step':'lesson-enter');afterCue(()=>sound(voice(challengeOptions?'challenge-question':'flow-review-v13'),['sample','record']));prepareMicrophone();}}
// A short scene establishes meaning once. Completed teaching replays only the phrase.
async function playStory(){const s=session;if(!s)return;cancelStory(s);cancelAttempt(s);stopSpeech();s.teaching=false;s.helped=true;s.context=s.event.contexts[0];s.phase='story';s.frame=s.story.teachingFrames[0];s.storyReady=false;s.storyError=false;s.storyRunning=true;const g=s.storyGeneration;render();
  if(!currentStory(s,g))return;
  const frames=s.story.teachingFrames;
  for(let i=0;i<frames.length;i++){
    s.frame=frames[i];render();if(i>0)soundPlayer.play('story-page');
    if(!await delay(s,g,cueDelay(soundPlayer.status().id,i<frames.length-1?650:180)))return;
  }
  const asset=pictureFor(s.story,{frame:s.frame},document.baseURI);
  if(s.storyHintPending||s.event.hintAudio&&(!asset||pictures.status(asset.url)!=='ready')){
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
function assessmentView(s){const a=s.assessment;if(!a)return '';const progress=s.challengeUnitId?challengeProgress(s):null;const partial=progress?.twoStarCount>0&&progress.passRule!=='three-stars'?`<div class="challenge-two-star-progress" data-challenge-two-stars="${progress.twoStarCount}" role="img" aria-label="这句两颗星已收好 ${progress.twoStarCount} 次，共需两次${progress.passed?'，已经通过':''}">${[1,2].map(i=>`<i class="${i<=progress.twoStarCount?'done':''}">${i<=progress.twoStarCount?icon('check',18):''}</i>`).join('')}</div>`:'';const copy={preparing:'小耳朵准备中',assessing:'小芽在认真听',matched:'我听懂啦',retry:'再听一遍，一起试试',silence:'等话筒亮起来再说',unavailable:'小耳朵没有准备好，可以先听先说'};return `<section class="speech-feedback" data-assessment data-status="${a.status}" data-stars="${a.stars||0}"><button data-action="assessment-voice" aria-label="听小芽的提示：${copy[a.status]}">${['matched','retry','silence'].includes(a.status)?[1,2,3].map(i=>`<span class="${i<=a.stars?'lit':''}">${icon('star',25)}</span>`).join(''):'<i class="listening-dot"></i>'}${icon('sound',24)}</button>${a.status==='unavailable'&&s.pendingClip?button('retry-assessment','重试自动语音反馈','again'):''}${partial}<p class="sr-only" role="status">${copy[a.status]}</p></section>`;}
function speechFeedback(kind,options={}){if(session?.challengeUnitId&&kind==='pass')return challengeProgress(session).passed?sound(voice('challenge-step'),['finish'],options):narrate('speech-partial',options);return kind==='pass'?sound(voice('flow-pass'),['finish'],options):narrate(`speech-${kind}`,options);}
function assessmentVoice(options={}){const a=session?.assessment;if(!a||session.recording||session.waiting)return;return speechFeedback(a.status==='matched'?(session.assessmentMode?'saved':'pass'):a.status==='silence'?'silent':a.status==='retry'?(a.stars===2?'partial':'retry'):'wait',options);}
function requestControls(s){
  if(s.recallReady)return `<div class="recall-options" data-recall-ready><button class="recall-option" data-action="sample" aria-label="听英语示范">${icon('ear',44)}<span>听一遍</span></button><button class="recall-option" data-action="record" aria-label="我会说，开始录音">${icon('mic',44)}<span>我会说</span></button></div>${button('context-help','小芽教我说','help')}`;
  return `${button('sample','听英语示范','ear')}${primary('record',s.recording?'说完了，结束录音':s.waiting?'麦克风准备中':'点亮话筒，开始说话',`${icon(s.recording?'stop':'mic',48)}${s.waiting?'<span class="mic-start-ring" aria-hidden="true"></span>':''}`,`${s.waiting?'disabled':''} aria-busy="${!!s.waiting}"`)}${button('context-help','小芽教我说','help')}`;
}
function eventView(){
  const s=session;if(!s)return homeView();if(s.phase==='reward')return rewardView();
  const story=s.phase==='story',unit=s.challengeUnitId?challengeSummary().units.find(u=>u.id===s.challengeUnitId):null;
  const passed=unit&&challengeProgress(s).passed;
  const goal=unit?(unit.completed?'':`${shellArt()}<span>${getEconomySettings().challengeShells}</span><span>＋</span>${dropArt()}<span>${getEconomySettings().challengeWater}</span>`):rewardPreview();
  const resolved=unit?(passed?primary('finish','这一小步完成，继续挑战',icon('check',48),s.finishing?'disabled aria-busy="true"':''):`<button class="challenge-practice-button" data-action="challenge-retry" aria-label="练过啦，再自己试一次">${icon('again',30)}<span>再试一次</span></button>`):primary('finish',s.assessmentMode?'保存这次练习':'打开这次小礼物',s.assessmentMode?icon('check',48):icon('gift',48),s.finishing?'disabled aria-busy="true"':'');
  return `${header()}<main class="event-view" ${unit?'data-challenge="'+unit.id+'"':''} data-phase="${s.phase}" data-event="${s.event.id}" data-context="${s.context.id}" data-practice-mode="${s.practiceMode||'free'}">
  ${unit?`<div class="challenge-rail"><button data-action="challenges" aria-label="回到挑战，已完成的小步会保留">${flagArt()}</button>${challengeSteps(unit)}</div>`:`<button class="learning-mode" data-action="learning-mode" aria-label="${s.recallMode?'老朋友，先试着自己说；需要时可以听示范':'新朋友，先听小芽说'}">${icon(s.recallMode?'again':'leaf',22)}<span>${s.recallMode?'老朋友':'新朋友'}</span>${icon('sound',20)}</button>`}
  ${story&&s.story.teachingFrames.length>1?`<div class="story-progress" aria-hidden="true">${s.story.teachingFrames.map(i=>`<i class="${i<=s.frame?'filled':''}"></i>`).join('')}</div>`:''}<div class="story-stage">${s.recallMode&&s.context.id===s.event.contexts[1]?.id?picture(s.story,s.phase==='resolved'?3:1,false,{alternate:true,context:s.context,phase:s.phase==='resolved'?'resolved':'request'}):picture(s.story,story?s.frame:s.story.cueFrame,story&&s.storyRunning,{phase:story?'story':s.phase})}${s.recording?'<div class="recording-indicator" role="status" aria-label="正在录音"><i></i><i></i><i></i></div>':''}</div>
  ${assessmentView(s)}<div class="event-controls">${story?`${button('story-replay','再听这一句','ear')}${primary(s.storyReady?'story-continue':'story-replay',s.storyReady?'轮到我说啦':s.storyRunning?'听小芽说':'听这一句',icon(s.storyReady?'mic':'play',44),s.storyRunning?'disabled':'')}${button('story-help','听中文，看看是什么意思','help')}`:s.phase==='request'?requestControls(s):resolved}</div>
  ${!story&&s.phase==='request'?`<div class="quiet-controls">${s.hasClip?button('replay','回听自己的录音','voice-replay'):''}${s.recallReady||unit?'':button('watch','先听伙伴说，这次先看看','play')}${button('observe','请家长观察这次表达','parent')}</div>`:''}<div class="round-goal" ${unit&&!unit.completed?`role="img" aria-label="整组首次完成可获得${getEconomySettings().challengeShells}枚贝壳和${getEconomySettings().challengeWater}滴水，还有这关的花种"`:'aria-hidden="true"'}>${goal}</div></main>`;
}
function prepareFor(){return audio.prepareRecognition(()=>{});}
function prepareMicrophone(){if(!GM_SANDBOX&&!gmWorkbenchOpen&&prefs.mic&&!modal&&!document.hidden&&(session?.phase==='request'||session?.phase==='story'&&session.storyReady)&&!session.waiting&&!session.recording&&!session.teaching)audio.prepareRecording().catch(()=>{});}
function cancelAttempt(s,{keepPrepared=false}={}){clearGuide();s.speechGeneration++;audio.cancelRecording({keepPrepared});audio.cancelRecognition();s.recording=false;s.waiting=false;s.assessment=null;s.pendingClip=null;if(s.phase!=='resolved')s.attemptId=null;}
async function teach(){const s=session;if(!s||s.teaching)return;cancelStory(s);cancelAttempt(s);stopSpeech();s.recallReady=false;s.helped=true;s.teaching=true;s.phase='request';const g=s.speechGeneration;render();if(s.challengeUnitId&&(!await saveChallengeHelp(s)||session!==s||s.speechGeneration!==g||modal||document.hidden))return;const explained=await sound(s.event.hintAudio||voice(s.context.id),['sample']);if(session!==s||s.speechGeneration!==g)return;if(explained)await sound(english(s),['sample']);if(session!==s||s.speechGeneration!==g)return;s.teaching=false;render();prepareMicrophone();}
async function sample(){const s=session;if(!s)return;cancelStory(s);cancelAttempt(s,{keepPrepared:true});stopSpeech();s.recallReady=false;s.phase='request';s.frame=s.story.cueFrame;s.teaching=false;s.helped=true;const g=s.speechGeneration;render();if(s.challengeUnitId&&(!await saveChallengeHelp(s)||session!==s||s.speechGeneration!==g||modal||document.hidden))return;prepareMicrophone();await sound(english(s),['sample']);}
async function record(){const s=session;if(!s||s.phase!=='request'||s.waiting)return;if(GM_SANDBOX)return simulateRecording();if(s.recording)return audio.finishRecording();s.recallReady=false;stopSpeech();if(!prefs.mic){s.pendingMicIntent=true;render();return requireParent(()=>{if(session===s&&s.pendingMicIntent)openModal({type:'mic'});});}
  s.teaching=false;effects.setSilent(true);cancelStory(s);cancelAttempt(s,{keepPrepared:true});const g=s.speechGeneration;s.waiting=true;s.hasClip=false;s.attemptId=null;audio.stopSound();s.preparation=prepareFor(s).then(()=>true,()=>false);render();const current=()=>session===s&&s.speechGeneration===g;
  try{const started=await audio.beginRecording({onReady:()=>{if(current()){s.waiting=false;s.recording=true;render();effects.play('ready',{target:document.querySelector('[data-action="record"]')});}},onLevel:level=>{if(current())document.querySelector('[data-action="record"]')?.style.setProperty('--voice',level);},onFinish:result=>{if(current())recorded(s,result);}});if(current()&&!started){s.waiting=false;s.recording=false;render();}}
  catch(error){if(!current())return;s.waiting=false;s.recording=false;s.assessment={status:'unavailable',stars:0};render();toast(error.name==='NotAllowedError'?'麦克风未获允许，可以先听伙伴说，或在浏览器设置中开启。':error.message);}
}
async function recorded(s,result){if(session!==s)return;s.recording=false;s.waiting=false;s.hasClip=!!result.url;if(result.error){s.assessment={status:'unavailable',stars:0};render();return toast(result.error);}if(!result.url||(!result.hasVoice&&result.voiceActivityAvailable!==false)){s.assessment={status:'silence',stars:0};render();prepareMicrophone();speechFeedback('silent');return;}s.pendingClip=result.url;const generation=s.speechGeneration;if(soundPlayer.resolve('record-stop')?.enabled){render();await soundPlayer.play('record-stop');if(session!==s||s.speechGeneration!==generation||modal||document.hidden)return;}assessClip(s,result.url,generation);}
async function assessClip(s,url,g){const current=()=>session===s&&s.speechGeneration===g&&s.phase==='request';s.assessment={status:audio.speechReady()?'assessing':'preparing',stars:0};render();try{
  const prepared=audio.speechReady()||await(s.preparation||prepareFor(s).then(()=>true,()=>false));if(!current())return;if(!prepared)throw new Error('model unavailable');s.assessment={status:'assessing',stars:0};render();const recognized=await audio.recognize(url,s.event.accepted);if(!current())return;if(!recognized)throw new Error('no assessment');
  await applySpeechResult(s,recognized,g);
}catch{if(!current())return;s.assessment={status:'unavailable',stars:0};render();speechFeedback('wait');}}
// Real recognition and internal simulation share the same feedback/reward path.
// The simulation can reach this only after booting with an isolated memory store.
async function applySpeechResult(s,recognized,g){
  const current=()=>session===s&&s.speechGeneration===g&&s.phase==='request';
  s.assessment={status:recognized.matched?'matched':'retry',stars:recognized.stars};
  if(recognized.heard?.trim()){const attemptId=uid();if(!save(recordEvidence(state,{attemptId,eventId:s.event.id,contextId:s.context.id,kind:'speech',result:recognized.matched?(s.helped||s.retryAfterAttemptId||s.priorChallengeHelp?'supported':'independent'):'unclear',source:'machine',helped:!!(s.helped||s.retryAfterAttemptId||s.priorChallengeHelp),date:today()})))return;s.attemptId=attemptId;if(s.challengeUnitId&&!await saveChallengeResult(s,{result:recognized.matched?(s.helped?'supported':'independent'):'unclear',source:'machine',helped:!!(s.helped||s.retryAfterAttemptId||s.priorChallengeHelp),stars:recognized.stars}))return;}
  if(!current())return;
  const passed=s.challengeUnitId?!!s.attemptId&&challengeProgress(s).passed:recognized.matched;
  s.assessment.status=passed?'matched':'retry';
  if(passed)s.phase='resolved';render();if(!passed)prepareMicrophone();
  const cue=passed?(s.assessmentMode?'saved':'pass'):recognized.stars===2?'partial':'retry';
  if(passed&&recognized.stars===3){
    const generation=uiGeneration;
    effects.play('three-stars',{target:document.querySelector('[data-action="assessment-voice"]')});
    // Leave room for the short chime, including the output device's startup budget.
    // This never locks input; any next action cancels the pending spoken praise.
    feedbackVoice(()=>{if(generation===uiGeneration&&session===s&&s.speechGeneration===g&&s.phase==='resolved'&&!modal&&!document.hidden)speechFeedback(cue);},760);
  }else{soundPlayer.play(passed&&s.challengeUnitId?'challenge-step':'retry');afterCue(()=>{if(session===s&&s.speechGeneration===g)speechFeedback(cue);},260);}
}
let gmResult='three';
async function simulateRecording(){
  const s=session;if(!GM_SANDBOX||!s||s.gmBusy||s.phase!=='request')return;
  cancelStory(s);cancelAttempt(s);stopSpeech();s.teaching=false;s.recallReady=false;s.hasClip=false;s.gmBusy=true;
  const g=s.speechGeneration;
  try{
    if(gmResult==='silence'||gmResult==='unavailable'){
      s.assessment={status:gmResult,stars:0};render();speechFeedback(gmResult==='silence'?'silent':'wait');
    }else{
      const stars={three:3,two:2,one:1}[gmResult];
      await applySpeechResult(s,{matched:stars===3,stars,heard:s.event.english},g);
    }
  }finally{s.gmBusy=false;}
}
function retryAssessment(){const s=session;if(!s?.pendingClip)return;s.preparation=prepareFor(s).then(()=>true,()=>false);assessClip(s,s.pendingClip,++s.speechGeneration);}
async function watch(){const s=session;if(!s||s.teaching)return;cancelAttempt(s);s.recallReady=false;s.helped=true;s.teaching=true;const g=s.speechGeneration;render();const explained=await narrate('watch',{manual:true});if(session!==s||s.speechGeneration!==g)return;const ok=explained&&await sound(english(s));if(session!==s||s.speechGeneration!==g)return;s.teaching=false;if(ok)s.phase='resolved';render();}
async function finish(){
  if(session?.challengeUnitId)return finishChallengeStep();
  const s=session;if(!s||s.phase!=='resolved'||s.finishing)return;const generation=uiGeneration;s.finishing=true;render();
  // A failed reward save may open a modal and clear temporary recording state.
  // Keep the completed practice identity stable for retries, including midnight.
  s.rewardVariant??='b';
  s.practiceRecord??={roundId:s.id,eventId:s.event.id,date:effectiveEvidence(state).find(e=>e.attemptId===s.attemptId)?.date||today(),attemptId:s.attemptId||null,mode:s.practiceMode||'free',rewardVariant:s.assessmentMode?null:s.rewardVariant};
  if(!await savePractice(s)){s.finishing=false;return;}
  if(s.assessmentMode){s.finishing=false;if(session===s&&generation===uiGeneration&&!document.hidden&&!modal)navigate('parent');return;}
  // A requested completion must finish crediting the free garden even if
  // navigation or a cross-tab event happens while its storage lock is queued.
  const saved=await gardenChange(latest=>meadow.rewardRound(latest,{roundId:s.id,eventId:s.event.id,date:s.practiceRecord.date}));s.finishing=false;
  if(!saved||session!==s){if(!modal&&!document.hidden&&(session===s||['home','garden'].includes(page)))render();return;}
  rewardReceipt=null;s.phase='reward';
  // Keep the receipt ready to resume, but never let a queued completion speak
  // over a modal, a different page, or a tab that has since gone to sleep.
  if(generation!==uiGeneration||document.hidden||modal){if(!document.hidden&&!modal)render();return;}
  stopSpeech();render();effects.play('reward',{target:document.querySelector('.reward-treasure')});feedbackVoice(()=>{if(generation===uiGeneration&&session===s&&s.phase==='reward'&&!modal&&!document.hidden)rewardVoice();});
}
function rewardView(){
  const pending=meadow.pendingRewards(meadowState)[0];
  if(pending){
    const amounts=meadow.roundReward(meadowState,pending.roundId);
    const card=(choice,label,amount,resource,purpose)=>`<button class="reward-choice ${choice==='water'?'water-choice':''}" data-action="choose-${choice}" data-reward-choice="${choice}" ${rewardBusy?'disabled aria-busy="true"':''} aria-label="领取${label}"><span class="reward-choice-resource">${resource}<b>+${amount}</b></span><span class="reward-purpose" aria-hidden="true"><span>→</span>${purpose}</span></button>`;
    return `${header()}<main class="reward-view" data-phase="reward" data-choice="true">${balance()}<div class="reward-buddy">${buddy('happy')}</div><div class="reward-choices">${card('shells',`${amounts.shells}枚贝壳可以买种子`,amounts.shells,shellArt(),packArt())}${card('water',`${amounts.water}滴水可以浇花`,amounts.water,dropArt(),canArt())}</div></main>`;
  }
  const round=(meadowState.rounds.find(r=>r.roundId===rewardReceipt)|| (session?meadowState.rounds.find(r=>r.roundId===session.id):meadowState.rounds.at(-1))),receipt=round?.reward,amounts=round?meadow.roundReward(meadowState,round.roundId):{shells:2,water:3},shells=receipt==='water'?0:amounts.shells,water=receipt==='shells'?0:amounts.water;
  return `${header()}<main class="reward-view" data-phase="reward" data-choice="false"><div class="celebration" aria-hidden="true">${Array.from({length:10},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div><div class="reward-buddy">${buddy('happy')}</div><div class="reward-treasure">${shells?`<button class="reward-resource" data-action="shell-purpose" aria-label="${shells}枚贝壳，点一下听用途">${shellArt()}<b>+${shells}</b></button>`:''}${water?`<button class="reward-resource" data-action="water-purpose" aria-label="${water}滴水，点一下听用途">${dropArt()}<b>+${water}</b></button>`:''}</div>${primary('garden','去我的小花园',plantArt(meadow.FLOWERS[0],2))}</main>`;
}
function chooseReward(choice){
  if(rewardBusy||modal||!(page==='reward'||session?.phase==='reward')||!['shells','water'].includes(choice))return;
  const round=meadow.pendingRewards(meadowState)[0];
  if(round)return collectReward(choice,round.roundId);
}
async function collectReward(choice,roundId){
  if(rewardBusy||!['shells','water'].includes(choice))return;
  const round=meadow.pendingRewards(meadowState)[0];if(!round||round.roundId!==roundId)return;
  rewardBusy=true;cancelFeedbackVoice();stopSpeech({fade:true});render();const generation=uiGeneration;
  try{const saved=await gardenChange(latest=>meadow.claimReward(latest,round.roundId,choice));if(!saved||modal||generation!==uiGeneration)return;rewardReceipt=round.roundId;rewardBusy=false;render();effects.play('reward',{target:document.querySelector('.reward-treasure'),soundId:choice==='water'?'reward-water':'reward-shell'});feedbackVoice(()=>{if(generation===uiGeneration&&!modal&&!document.hidden&&(page==='reward'||session?.phase==='reward'))rewardVoice();});}
  finally{if(rewardBusy){rewardBusy=false;if(!modal&&(page==='reward'||session?.phase==='reward'))render();}}
}
function showPendingReward(){rewardReceipt=null;navigate('reward');afterCue(rewardVoice);}
function gardenView(){const background=pictureFor(meadowPicture,{},document.baseURI);pictures.load(background.url);return meadowView({state:meadowState,header:header(),balance:balance(),challengeEntry:challengeFlag(challengeSummary(),{invite:!!challenge.invitationFor(challenges,{practicePlan:practiceToday(),date:today()})}),specialPending:meadow.pendingChallengeSeeds(meadowState).length>0,feedback,tool:meadowTool,backgroundUrl:pictures.status(background.url)==='ready'?background.url:null});}
function gardenIsActive(){return page==='garden'&&!modal&&!document.hidden;}
function cancelGardenReminder(){cancelIdleHint();}
function scheduleGardenReminder(){scheduleIdleHint();}
async function gardenGuide({automatic=false,idle=false,manual=false,cue}={}){
  if(!gardenIsActive())return;
  if(!automatic||activeGarden().plants.length<3)await meadowGuide(cue,{idle,manual});
  scheduleGardenReminder();
}
function enterGarden(){if(meadow.pendingRewards(meadowState).length)return showPendingReward();navigate('garden');effects.prepare();if(!meadowState.pendingSeed&&meadow.nextAction(meadowState)!=='challenge-seed'&&challenge.invitationFor(challenges,{practicePlan:practiceToday(),date:today()})){afterCue(()=>inviteChallenge().catch(()=>{}));scheduleGardenReminder();}else afterCue(()=>gardenGuide({automatic:true}));}
function gardenFeedback(kind,plantId,soundId,{motion=false}={}){stopSpeech();clearTimeout(feedbackTimer);feedback={kind,plantId,motion};render();const target=plantId?document.querySelector(`[data-meadow-plant="${plantId}"]`):document.querySelector('.seed-tool');effects.play(kind==='planted'?'plant':kind,{target,soundId,visual:!motion});if(!motion)feedbackTimer=setTimeout(()=>{feedback=null;if(page==='garden')render();},3200);}
function feedbackGuide(cue){if(activeGarden().plants.length>=3)return gardenGuide({automatic:true,cue});const expected=feedback;feedbackVoice(()=>{if(feedback===expected&&gardenIsActive())gardenGuide({automatic:true,cue});});}

function rewardVoice(options={}){
  const pending=meadow.pendingRewards(meadowState)[0];
  if(pending)return sound(voice('flow-choice'),['choose-shells','choose-water'],options);
  const round=meadowState.rounds.find(r=>r.roundId===rewardReceipt)||(session?meadowState.rounds.find(r=>r.roundId===session.id):meadowState.rounds.at(-1)),receipt=round?.reward,amounts=round?meadow.roundReward(meadowState,round.roundId):{};
  // Numeric recordings are only valid for the amount actually saved on this receipt.
  const cue=receipt==='shells'?(amounts.shells===2?'economy-shells':'flow-shell-use'):receipt==='water'?(amounts.water===2?'economy-water-v13':amounts.water===5?'economy-water':'flow-water-use'):amounts.shells===2&&amounts.water===3?'economy-starter-v13':amounts.shells===2&&amounts.water===5?'economy-starter':'flow-shell-use';
  return sound(voice(cue),['garden'],options);
}
function challengeClearVoice(options={}){const r=meadowState.challengeRewards.find(r=>r.unitId===challengeReceipt);return sound(voice(r?.shells===4&&r?.water===6?'challenge-clear':'challenge-seed'),[],options);}

function selectMeadowTool(tool){if(!gardenIsActive()||meadowBusy)return;if(tool==='seed'&&!meadowState.pendingSeed)return;stopSpeech();meadowTool=tool;render();effects.tap(document.querySelector(`[data-action="meadow-${tool==='seed'?'seed':'can'}"]`),{soundId:tool==='seed'?'tool-seed':'tool-water'});if(tool==='can'&&!meadow.hasUnlimitedResources(meadowState)&&!meadowState.water)afterCue(()=>sound(voice('economy-water-short'),['next-event']));}
function meadowGuide(cue,options={}){const action=meadow.nextAction(meadowState);if(cue==='bloom')return sound(voice('meadow-bloom'),[],options);if(cue==='giant')return sound(voice('meadow-giant'),['meadow-seed'],options);if(action==='challenge-seed')return sound(voice('challenge-seed'),['challenge-seed'],options);if(action==='reward')return sound(voice('economy-earned'),['collect-reward'],options);if(action==='pack')return sound(voice('economy-shop-ready'),['shop'],options);if(action==='learn')return meadowState.plants.some(p=>p.waterings<meadow.flowerForSeed(p).waterNeeded)?sound(voice('economy-water-short'),['next-event'],options):narrate('next',options);return sound(voice(action==='plant'?'meadow-seed':'meadow-water-beside'),[action==='plant'?'meadow-seed':'meadow-can'],options);}
async function openShop(){
  if(shopBusy)return;
  if(meadowState.pendingSeed||meadow.pendingRewards(meadowState).length)return enterGarden();
  shopBusy=true;const generation=uiGeneration;
  try{await gardenChange(latest=>meadow.ensureShop(latest,today()));if(generation!==uiGeneration||modal)return;navigate('shop');effects.prepare();if(!prefs.shopSeen){savePrefs({...prefs,shopSeen:true});afterCue(()=>sound(voice('economy-shop')));}}
  finally{shopBusy=false;}
}
function shortOnShells(canReserve=false){const wallet=document.querySelector('.wallet');wallet?.classList.remove('short-on-shells');if(wallet)void wallet.offsetWidth;wallet?.classList.add('short-on-shells');soundPlayer.play('blocked');afterCue(()=>sound(voice(canReserve?'economy-short':'economy-shells-short'),[canReserve?'reserve-offer':'next-event']));}
function revealPurchasedSeed(generation){if(generation!==uiGeneration||modal||page!=='shop')return;navigate('garden');meadowTool='seed';gardenFeedback('seed');feedbackGuide(meadow.flowerForSeed(meadowState.pendingSeed).giant?'giant':'seed');}
function openBlindbox(){
  if(shopBusy||page!=='shop')return;
  if(meadowState.pendingSeed)return enterGarden();
  mysterySelection=null;navigate('blindbox');effects.prepare();afterCue(blindboxVoice);
}
async function blindboxVoice(options={}){
  if(page!=='blindbox'||modal||document.hidden||gmWorkbenchOpen)return;
  const generation=uiGeneration,run=++mysteryVoiceRun,seed=meadowState.pendingSeed;
  if(!seed)return sound(voice(getEconomySettings().packPrice===2?'blindbox-choose':'economy-shop'),[],options);
  const named=await sound(voice(`blindbox-seed-${seed.flowerId}`),[],options);
  if(named&&run===mysteryVoiceRun&&generation===uiGeneration&&page==='blindbox'&&!modal&&!document.hidden&&!gmWorkbenchOpen&&meadowState.pendingSeed?.id===seed.id)return sound(voice('blindbox-reveal'),[],options);
}
function plantBlindboxSeed(){
  if(page!=='blindbox'||!meadowState.pendingSeed)return;
  navigate('garden');meadowTool='seed';gardenFeedback('seed');
  feedbackGuide(meadow.flowerForSeed(meadowState.pendingSeed).giant?'giant':'seed');
}
async function buyMystery(index){
  if(shopBusy||page!=='blindbox'||modal||meadowState.pendingSeed||!Number.isInteger(index)||index<0||index>5)return;
  if(!meadow.hasUnlimitedResources(meadowState)&&meadowState.shells<getEconomySettings().packPrice)return shortOnShells();
  shopBusy=true;mysterySelection={index,animate:false};const generation=uiGeneration;
  cancelFeedbackVoice();mysteryVoiceRun++;stopSpeech();render();
  try{
    const bought=await gardenChange(latest=>meadow.openSeedPack(latest));
    if(generation!==uiGeneration||document.hidden||modal||page!=='blindbox')return;
    if(bought){
      mysterySelection={index,animate:true};render();effects.play('seed',{target:app.querySelector('.seed-reveal-art'),soundId:'bag-open'});
      // The purchase is already saved. Animation/audio never decide its result.
      feedbackVoice(()=>{
        if(generation!==uiGeneration||page!=='blindbox'||modal||document.hidden||gmWorkbenchOpen)return;
        effects.play('reward',{target:app.querySelector('.seed-reveal-art'),soundId:'seed'});
        feedbackVoice(()=>{if(generation===uiGeneration)blindboxVoice();},360);
      },650);
    }else{
      mysterySelection=null;render();
      if(!meadowState.pendingSeed&&!meadow.hasUnlimitedResources(meadowState)&&meadowState.shells<getEconomySettings().packPrice)shortOnShells();
    }
  }finally{
    shopBusy=false;
    // A visibility interruption invalidates narration, not the saved purchase.
    // If the child returned before the lock settled, remove the busy bags too.
    if(!document.hidden&&!modal&&page==='blindbox'&&(!meadowState.pendingSeed||generation!==uiGeneration))render();
  }
}
async function buySeed(id,source){
  if(shopBusy||page!=='shop')return;
  const offer=source==='reserved'?meadowState.shop.reserved:meadowState.shop.offer;
  if(!offer||offer.id!==id)return;if(!meadow.hasUnlimitedResources(meadowState)&&meadowState.shells<offer.price)return shortOnShells(source==='shop'&&meadowState.shop.reserved?.id!==id);
  shopBusy=true;const generation=uiGeneration;try{if(await gardenChange(latest=>meadow.buyOffer(latest,id,source)))revealPurchasedSeed(generation);else if(generation===uiGeneration&&!modal)render();}finally{shopBusy=false;}
}
async function reserveSeed(id,replace=false){
  if(shopBusy||page!=='shop')return;
  const offer=meadowState.shop.offer;if(!offer||offer.id!==id){if(modal?.type==='replace-seed')closeModal();return;}
  if(meadowState.shop.reserved&&meadowState.shop.reserved.id!==id&&!replace){openModal({type:'replace-seed',offerId:id});sound(voice('economy-replace'));return;}
  shopBusy=true;const generation=uiGeneration;try{const saved=await gardenChange(latest=>meadow.reserveOffer(latest,id,{replace}));if(generation!==uiGeneration||modal?.type==='error')return;modal=null;render();if(saved){effects.play('seed',{target:document.querySelector('.reserve-seed'),soundId:'reserve'});afterCue(()=>sound(voice('economy-reserve')));}}finally{shopBusy=false;}
}
async function meadowPlant(point){if(meadowBusy||!meadowState.pendingSeed||!gardenIsActive())return;meadowBusy=true;try{if(await gardenChange(latest=>meadow.plantSeed(latest,point))){if(!gardenIsActive())return;meadowTool=null;gardenFeedback('planted',meadowState.plants[meadowState.plants.length-1].id);feedbackGuide('water');}}finally{meadowBusy=false;}}
async function meadowWater(id){
  if(meadowBusy||!gardenIsActive())return;
  const plant=meadowState.plants.find(p=>p.id===id);if(!plant)return;
  const flower=meadow.flowerForSeed(plant);
  if(plant.waterings===flower.waterNeeded){gardenFeedback('bloom',id,'flower-touch');return;}
  if(meadowTool!=='can'){sound(voice('meadow-water-beside'),['meadow-can']);return;}
  if(!meadow.hasUnlimitedResources(meadowState)&&!meadowState.water){soundPlayer.play('blocked');afterCue(()=>sound(voice('economy-water-short'),['next-event']));return;}
  meadowBusy=true;const generation=uiGeneration;
  const before=meadowMotion.capture(app.querySelector(`[data-meadow-plant="${id}"]`));
  try{
    if(!await gardenChange(latest=>meadow.waterPlant(latest,id)))return;
    if(generation!==uiGeneration||document.hidden||modal||!gardenIsActive())return;
    const p=meadowState.plants.find(p=>p.id===id),bloom=p.waterings===flower.waterNeeded;
    gardenFeedback(bloom?'bloom':'water',id,undefined,{motion:true});
    const completed=await meadowMotion.play(app.querySelector(`[data-meadow-plant="${id}"]`),before);
    if(generation!==uiGeneration||document.hidden||modal||!gardenIsActive())return;
    feedback=null;
    if(completed&&bloom)feedbackGuide('bloom');else scheduleGardenReminder();
  }finally{meadowBusy=false;}
}


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
function parentView(){const e=getEconomySettings(),garden=activeGarden(),rounds=allRounds();const records=effectiveEvidence(state),recent=records.slice(-20).reverse(),spoken=records.filter(r=>r.kind==='speech'),matched=spoken.filter(r=>['independent','supported'].includes(r.result));return `${header()}<main class="parent-view"><div class="parent-intro"><div><span class="eyebrow">陪伴手记</span><h1>花在长，表达也慢慢长。</h1><p>奖励记录参与，能力看真实表达。故事里听过示范，就如实记为“有帮助”。</p></div><div class="parent-companion" aria-hidden="true">${buddy()}</div></div>${storageProblem?`<section class="parent-card attention"><h2>本机记录需要处理</h2><p>${esc(storageProblem)}</p><button data-action="export">导出原记录</button><p>尚未覆盖原记录。</p></section>`:''}<div class="parent-stats"><span><b>${garden.rounds.length}</b> 次故事参与</span><span><b>${spoken.length}</b> 次表达记录</span><span><b>${garden.plants.filter(p=>p.waterings===meadow.flowerForSeed(p).waterNeeded).length}</b> 朵小花</span></div>${garden.rounds.length>=3&&matched.length===0?'<section class="parent-card attention"><h2>已经在玩，还没观察到会说</h2><p>目前没有合适表达的证据。先陪孩子在真实生活里试一句，不用继续解锁代替开口练习。未开启识别或未做观察，也会出现这种情况。</p></section>':''}${practicePanel()}${phraseLibrary(rounds)}${challengeParentPanel()}<section class="parent-card"><h2>内置声音</h2><p data-audio-pack-status role="status">${esc(audioPackMessage())}</p><button data-action="audio-pack-retry">重新检查声音</button><p>中文引导和三种英语音色均为已配好的本地文件，不需要连接配音服务。</p></section><section class="parent-card"><h2>离线插画</h2><p data-art-pack-status role="status">${esc(artPackMessage())}</p><button data-action="picture-retry">重新检查图片</button><p>全部插画校验完成后，重启电脑也能打开未看过的故事。资源未就绪会明确提示，不会替换成旧画风。</p></section><section class="parent-card"><h2>选择说英语的伙伴</h2><p>三位伙伴的英语都已提前配好。点小耳朵试听，选好后故事和示范一起切换。</p><div class="voice-grid">${VOICES.map(v=>`<div class="voice-option ${v.id===selectedVoice?'selected':''}"><button data-select-voice="${v.id}" aria-pressed="${v.id===selectedVoice}"><span class="voice-portrait">${voicePortrait(v.id)}</span>${esc(v.nickname||v.name)}${v.id===selectedVoice?' ✓':''}</button><button data-preview-voice="${v.id}" aria-label="试听${esc(v.nickname||v.name)}">${icon('ear',26)}</button></div>`).join('')}</div></section><section class="parent-card"><h2>录音与自动反馈</h2><p>本机识别给出 0–3 颗词句匹配星，帮助孩子重试；它不是发音准确率，也不会自动判定稳定掌握。录音和识别文本都不上传、不保存，离开练习即释放。</p><p>首次录音按需准备约 81 MB 的本地识别资源，准备好后支持离线。小声录音会先调整音量，再独立听写并核对词句。未准备好或麦克风不可用时，仍能听示范、回听自己的声音和继续参与。</p><div class="parent-actions"><button data-action="mic-settings">${prefs.mic?'查看麦克风设置':'允许本机录音'}</button><button data-action="recognition">${audio.speechReady()?'本地识别已就绪':'准备本机识别'}</button><button data-action="export">导出记录</button></div><p id="model-status" role="status"></p></section><section class="parent-card"><h2>自由小花园</h2><p>把种子放在喜欢的位置，点水壶，再点小苗旁的水滴浇水；每滴水都会让它长大一点。新获得的普通花需要 ${e.normalWaterNeeded} 滴水，巨型花需要 ${e.giantWaterNeeded} 滴水，盛开大小是普通花的 ${e.giantScale} 倍。每种新种子都有 ${Math.round(e.giantChance*100)}% 的机会长成巨型花。已有种子的成长要求保留。</p><p>新用户第一轮赠 ${e.starterShellReward} 贝壳和 ${e.starterWaterReward} 水，之后每轮选 ${e.shellReward} 贝壳或 ${e.waterReward} 水。每关挑战首次完成获得 ${e.challengeShells} 贝壳、${e.challengeWater} 水和关卡卡片上的一颗专属花种；21 关对应 21 种花。重玩不重复发奖，旧版已通关的专属花种会补发一次。惊喜种子 ${e.packPrice} 贝壳，指定种子以卡片标价为准。商店每日换一款，买后即补不同品种；可免费保留一包，直到买下或主动换掉。惊喜包首包为雏菊，之后从十种普通品种等概率选择，可能重复；巨型属性在获得种子时另行抽取并保存，刷新不会重抽。没有真钱购买，参与奖励不表示学会。</p><p>旧花盆花园和学习观察仍在本机保留并可导出；历史参与继续用于复习安排。本版统一使用自由种植花园。</p></section><section class="parent-card"><h2>最近的观察</h2>${recent.map(r=>`<div class="observation-row"><div><strong>${esc(EVENTS.find(e=>e.id===r.eventId)?.title)}</strong><p>${r.date} · ${r.kind==='listening'?'旧版听懂观察':resultNames[r.result]} · ${r.source==='machine'?'机器候选':'家长观察'}${r.helped?' · 有提示':''}${r.corrected?' · 已修正':''}</p></div>${r.kind==='speech'?`<button data-correct="${esc(r.attemptId)}">核对</button>`:''}</div>`).join('')||'<p>还没有表达观察。完成故事不会自动计为“学会”。</p>'}</section><p class="fine-print">小芽英语启蒙正式版 ${esc(document.querySelector('meta[name="xiaoya-version"]')?.content)} · ${esc(document.querySelector('meta[name="xiaoya-build"]')?.content)} · 本机体验版</p></main>`;}
function observation(attemptId=null){requireParent(()=>{const existing=attemptId?effectiveEvidence(state).find(r=>r.attemptId===attemptId):null;openModal({type:'observe',attemptId,existing,event:existing?EVENTS.find(e=>e.id===existing.eventId):session?.event,helped:existing?existing.helped:!!session?.helped,helpedLocked:!attemptId&&!!session?.helped});});}
async function submitObservation(result){const m=modal,s=session;if(m?.type!=='observe'||!m.event||m.saving)return;m.saving=true;const helped=m.helpedLocked||!!document.querySelector('#observed-help')?.checked,exact=!!document.querySelector('#exact-phrase')?.checked,phraseId=exact&&['independent','supported'].includes(result)?m.event.lessonId:null;
  const evidenceHelped=!!(helped||s?.retryAfterAttemptId||s?.priorChallengeHelp),evidenceResult=evidenceHelped&&result==='independent'?'supported':result;
  const next=m.attemptId?correctEvidence(state,m.attemptId,{correctionId:uid(),result,helped,phraseId,date:today()}):recordEvidence(state,{attemptId:uid(),eventId:m.event.id,contextId:s.context.id,kind:'speech',result:evidenceResult,source:'parent',helped:evidenceHelped,phraseId,date:today()});if(!save(next)){m.saving=false;return;}if(s&&!m.attemptId){s.attemptId=next.evidence[next.evidence.length-1].attemptId;if(s.challengeUnitId&&!await saveChallengeResult(s,{result,source:'parent',helped})){m.saving=false;return;}s.helped=helped;s.phase='resolved';}if(modal===m)modal=null;render();soundPlayer.play('settings-save');}
function render(){meadowMotion.cancel();syncGardenMusic();cancelIdleHint();effects.setSilent(!!session?.waiting||!!session?.recording||['preparing','assessing'].includes(session?.assessment?.status)||speaking);const waterFocus=document.activeElement?.dataset.waterPlant;app.innerHTML=`<div class="app-shell ${session?.recording?'is-recording':session?.waiting?'is-mic-starting':''}">${page==='event'?eventView():page==='reward'?rewardView():page==='challenges'?challengeBoard({summary:challengeSummary(),header:header(),balance:balance(),seedPending:meadow.pendingChallengeSeeds(meadowState).length>0}):page==='challenge-prize'?challengePrize({header:header(),unit:challengeSummary().units.find(u=>u.id===challengeReceipt),receipt:meadowState.challengeRewards.find(r=>r.unitId===challengeReceipt),seed:meadowState.challengeSeeds.find(s=>s.unitId===challengeReceipt),primary}):page==='shop'?seedShopView({state:meadowState,header:header(),balance:balance()}):page==='blindbox'?blindboxView({state:meadowState,header:header(),balance:balance(),selection:mysterySelection,busy:shopBusy}):page==='garden'?gardenView():page==='parent'?parentView():homeView()}</div><div id="modal-root"></div>`;if(page==='blindbox'&&mysterySelection)mysterySelection.animate=false;renderModal();applyGuide();syncWelcomeGift();layoutMeadowWatering(app);if(waterFocus&&!modal){const target=app.querySelector(`[data-water-plant="${waterFocus}"]`)||app.querySelector('[data-action="meadow-can"]');target?.focus({preventScroll:true});}scheduleIdleHint();scheduleWelcomeGreeting();}
function renderModal(){syncGardenMusic();const root=document.querySelector('#modal-root');if(!root)return;if(!modal){root.innerHTML='';return;}const m=modal;let html='';
  if(m.type==='audio'){const controls=audioControls(prefs.audioControls);html=`<h2>声音设置</h2><div class="audio-controls">${[['music','音乐和音效','背景音乐、点击和奖励的声音'],['reminders','自动人声提醒','小芽主动说出的操作提示和鼓励']].map(([key,label,detail])=>`<button class="audio-switch" data-action="toggle-${key}" role="switch" aria-checked="${controls[key]}" aria-label="${label}"><span><strong>${label}</strong><small>${detail}</small></span><span class="switch-track" aria-hidden="true"><i></i></span></button>`).join('')}</div><p class="audio-note">主动点“听一遍”或帮助，仍能听到声音。</p><button class="primary-button" data-action="close">完成</button>`;}
  if(m.type==='gate')html=`<h2>请交给陪伴的大人</h2><label for="parent-answer">${m.a} + ${m.b} =</label><input id="parent-answer" inputmode="numeric" autocomplete="off" aria-label="计算结果"><button class="primary-button" data-action="gate-submit">进入</button><button data-action="close">回到孩子的世界</button>`;
  if(m.type==='mic')html='<h2>录下这一次声音</h2><p>点话筒后，等它亮起来再说。停顿后自动结束，也可再次点击结束，最长 12 秒。</p><p>录音只在当前页面内存中临时回听，不上传。首次使用时浏览器还会询问麦克风权限。授权后，进入说话环节会提前打开话筒，点击后才开始录音；闲置 20 秒或离开环节会关闭话筒。</p><button class="primary-button" data-action="allow-mic">允许孩子使用本机麦克风</button><button data-action="disable-mic">暂不使用录音</button><button data-action="close">返回</button>';
  if(m.type==='observe')html=`<h2>${m.attemptId?'核对这次观察':'这一次，孩子怎样表达？'}</h2><p>${esc(m.event?.title)} · ${esc(m.event?.chinese)}</p><p>意思合适就算表达，不必强求完整长句。没听清时选“无法确定”。</p><label class="check-label"><input id="observed-help" type="checkbox" ${m.helped?'checked':''} ${m.helpedLocked?'disabled':''}> 这次听过示范、中文解释或成人提示</label><label class="check-label"><input id="exact-phrase" type="checkbox" ${m.existing?.phraseId?'checked':''}> 确实听到了原句：${esc(m.event?.english)}</label>${session?.hasClip?'<button data-action="replay">回听这次声音</button>':''}<div class="observation-options">${Object.entries(resultNames).filter(([key])=>key!=='device_error').map(([key,label])=>`<button data-observation="${key}">${label}</button>`).join('')}</div><button data-action="close">返回</button>`;
  if(m.type==='replace-seed'){const offer=meadowState.shop.offer;html=`<h2 class="sr-only">换成这包种子吗？</h2><div class="reservation-picture">${offer&&offer.id===m.offerId?offerPicture(offer):''}</div><div class="reservation-choices"><button data-action="close" aria-label="继续保留原来的种子">${icon('house',28)}</button><button data-action="replace-reservation" aria-label="换成这包种子">${icon('check',28)}</button></div>`;}
  if(m.type==='collection')html=`<h2 class="sr-only">我的花朵收藏</h2>${meadowCollection(meadowState)}<button data-action="close" aria-label="回到小花园">${icon('check',32)}</button>`;
  if(m.type==='error')html=`<h2>这一步还没保存</h2><p>${esc(m.message)}</p>${(hasPendingChallengeRecovery()||practice.entries.some(r=>r.rewardVariant==='b'&&!meadowState.rounds.some(done=>done.roundId===r.roundId)))?'<button data-action="retry-rewards">重试领取奖励</button>':''}<button data-action="close">知道了</button>`;
  root.innerHTML=`<div class="modal-backdrop"><section class="modal-card" role="dialog" aria-modal="true" aria-label="${m.type==='gate'?'家长入口':m.type==='audio'?'声音设置':'小芽提示'}"><div class="modal-emblem" aria-hidden="true">${icon(m.type==='gate'?'parent':m.type==='collection'?'star':m.type==='mic'?'mic':'leaf')}</div>${html}</section></div>`;
}
function toggleAudioControl(key){
  const controls=audioControls(prefs.audioControls),next={...controls,[key]:!controls[key]};
  if(!savePrefs({...prefs,audioControls:next}))return;
  if(!next.reminders&&automaticVoice){stopSpeech({fade:true});clearGuide();}
  renderModal();document.querySelector(`[data-action="toggle-${key}"]`)?.focus();
}
function exportState(){const content=storageProblem?{problem:storageProblem,rawState:appStorage.getItem(STORAGE_KEY),rawGarden:appStorage.getItem(LEGACY_GARDEN_KEY),rawMeadow:appStorage.getItem(meadow.MEADOW_KEY),rawPractice:appStorage.getItem(PRACTICE_KEY),rawChallenges:appStorage.getItem(challenge.CHALLENGE_KEY)}:{product:'xiaoya-english',exported:today(),state,garden:gardenHistory.archive,rawGarden,meadow:meadowState,practice,challenges,gardenVariant:'b',preferences:prefs,voice:selectedVoice};if(GM_SANDBOX)content.testing={mode:'gm-simulation',realLearningEvidence:false};const url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`${GM_SANDBOX?'GM模拟记录-':'小芽英语-'}${today()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
async function recognition(){if(GM_SANDBOX)return toast('免录音测试不会下载识别模型；退出 GM 后可测试真实识别。');const target=document.querySelector('#model-status');if(target)target.textContent='准备本机识别资源，可以继续浏览，请保持本页打开。';try{await audio.prepareRecognition(value=>{const el=document.querySelector('#model-status');if(el)el.textContent=typeof value==='string'?value:'正在准备…';});toast('本机识别已准备好。');if(page==='parent')render();}catch{toast('识别资源没有准备完成，可以重试。');}}
const actions={'audio-settings':()=>openModal({type:'audio'}),'toggle-music':()=>toggleAudioControl('music'),'toggle-reminders':()=>toggleAudioControl('reminders'),'welcome-gift':openWelcomeGift,'open-welcome-gift':claimWelcomeGift,challenges:openChallenges,'challenge-guide':()=>sound(voice('challenge-intro'),[],{manual:true}),'challenge-seed':takeChallengeSeed,'challenge-practice':teach,'challenge-retry':retryChallengeStep,'learning-mode':()=>sound(voice(session?.recallMode?'flow-review-v13':'garden-welcome'),[],{manual:true}),'audio-pack-retry':retryAudioPack,'picture-retry':retryPictures,shop:openShop,'shop-pack':openBlindbox,'blindbox-back':openShop,'blindbox-voice':()=>blindboxVoice({manual:true}),'blindbox-plant':plantBlindboxSeed,'shop-back':enterGarden,'collect-reward':showPendingReward,'choose-shells':()=>chooseReward('shells'),'choose-water':()=>chooseReward('water'),'shell-purpose':()=>sound(voice('flow-shell-use'),['shell-purpose'],{manual:true}),'water-purpose':()=>sound(voice('flow-water-use'),['water-purpose'],{manual:true}),'replace-reservation':()=>reserveSeed(modal?.offerId,true),home:()=>navigate('home'),garden:enterGarden,'next-event':()=>startEvent(),'new-event':()=>{const id=practiceToday().unseenIds[0];if(id)startEvent(storyFor(id).event);},'story-replay':replayStory,'story-help':teach,'story-continue':storyContinue,sample,'context-help':teach,record,watch,finish,'garden-guide':()=>gardenGuide({manual:true}),'reward-voice':()=>rewardVoice({manual:true}),'meadow-seed':()=>selectMeadowTool('seed'),'meadow-can':()=>selectMeadowTool('can'),'meadow-collection':()=>{openModal({type:'collection'});const generation=uiGeneration;feedbackVoice(()=>{if(generation===uiGeneration&&modal?.type==='collection'&&!document.hidden)sound(voice('meadow-collection'),[],{manual:true});});},'assessment-voice':()=>assessmentVoice({manual:true}),'retry-assessment':retryAssessment,replay:async()=>{clearGuide();cancelIdleHint();const playback=++soundGeneration;speaking=true;try{return await audio.replayClip();}catch{toast('这段录音已释放，可以重新说一次。');}finally{if(playback===soundGeneration){speaking=false;visualHintClock.activity();syncGardenMusic();scheduleIdleHint();}}},observe:()=>observation(),parent:()=>requireParent(()=>navigate('parent')),help:()=>session&&['story','request'].includes(session.phase)?teach():contextualReminder({manual:true}),close:closeModal,'retry-rewards':async()=>{closeModal();await restorePracticeRewards();return restoreChallengeRewards();},
  'gate-submit':()=>{if(modal?.type!=='gate')return;if(Number(document.querySelector('#parent-answer')?.value)===modal.a+modal.b){const callback=modal.callback;parentUnlocked=true;closeModal({keepMicIntent:true});callback();}else toast('请由陪伴的大人填写计算结果。');},'mic-settings':()=>openModal({type:'mic'}),'allow-mic':()=>{if(savePrefs({...prefs,mic:true})){const s=session,resume=s?.pendingMicIntent;closeModal();if(resume&&session===s&&s.phase==='request')return record();}},'disable-mic':()=>{if(savePrefs({...prefs,mic:false})){if(session){session.pendingMicIntent=false;cancelAttempt(session);}closeModal();}},recognition,export:exportState};
app.addEventListener('click',event=>{const summary=event.target.closest('summary');if(summary){soundPlayer.play(summary.parentElement?.open?'panel-close':'panel-open');return;}const b=event.target.closest('button');if(!b||b.disabled)return;try{
  cancelFeedbackVoice();if(gardenIsActive()){clearGuide();stopSpeech();scheduleGardenReminder();}
  if(!['meadow-seed','meadow-can'].includes(b.dataset.action))effects.tap(b,{silent:true});
  // Dedicated actions emit after their successful state change. Voice buttons
  // use the requested voice as feedback; mic preparation is intentionally silent.
  const dedicated=new Set(['home','garden','parent','close','challenges','shop','shop-back','shop-pack','blindbox-back','blindbox-plant','meadow-seed','meadow-can','meadow-collection','next-event','new-event','record','story-continue','finish','audio-settings','toggle-music','toggle-reminders','choose-shells','choose-water','challenge-seed','collect-reward','replace-reservation','open-welcome-gift','mic-settings','allow-mic','disable-mic']);
  const voiceAction=new Set(['sample','help','story-replay','story-help','context-help','replay','watch','garden-guide','reward-voice','assessment-voice','challenge-guide','challenge-practice','learning-mode','blindbox-voice','shell-purpose','water-purpose']);
  if(b.dataset.action&&!dedicated.has(b.dataset.action)&&!voiceAction.has(b.dataset.action))queueMicrotask(()=>soundPlayer.play('tap'));
  if(b.dataset.challengeUnit)startChallenge(b.dataset.challengeUnit);
  else if(b.dataset.mysteryBag!==undefined)buyMystery(Number(b.dataset.mysteryBag)).catch(error=>showError(error.message));
  else if(b.dataset.buyOffer)buySeed(b.dataset.buyOffer,b.dataset.source).catch(error=>showError(error.message));
  else if(b.dataset.reserveOffer)reserveSeed(b.dataset.reserveOffer).catch(error=>showError(error.message));
  else if(b.dataset.action){Promise.resolve(actions[b.dataset.action]?.()).catch(error=>showError(error.message));}
  else if(b.dataset.story)startEvent(storyFor(b.dataset.story).event);
  else if(b.dataset.checkup)startEvent(storyFor(b.dataset.checkup).event,true);
  else if(b.dataset.selectVoice){if(saveVoice(b.dataset.selectVoice,appStorage)){selectedVoice=readVoice(appStorage);render();sound(lessonAudio('needs-01',selectedVoice));}else showError('声音选择没有保存，请重试。');}
  else if(b.dataset.previewVoice)sound(lessonAudio('needs-01',b.dataset.previewVoice));
  else if(b.dataset.correct)observation(b.dataset.correct);
  else if(b.dataset.observation)submitObservation(b.dataset.observation).catch(error=>showError(error.message));
}catch(error){showError(error.message);}});
document.addEventListener('keydown',event=>{if(gmWorkbenchOpen||!modal)return;if(event.key==='Escape')return closeModal();if(modal.type==='gate'&&event.key==='Enter')return actions['gate-submit']();if(event.key==='Tab'){const list=[...document.querySelectorAll('.modal-card button,.modal-card input')].filter(el=>!el.disabled),first=list[0],last=list[list.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
for(const type of ['pointerdown','keydown'])document.addEventListener(type,()=>gardenMusic.retry(),{capture:true,passive:true});
for(const type of ['pointerdown','pointerup','pointercancel','keydown','scroll','click'])document.addEventListener(type,idleHintActivity,{capture:true,passive:true});
for(const type of ['pointerdown','keydown','scroll'])app.addEventListener(type,()=>{if(gardenIsActive()){cancelFeedbackVoice();scheduleGardenReminder();}},{capture:true,passive:true});
function suspend(){guidanceClock.pause();visualHintClock.pause();meadowMotion.cancel();pageSuspended=true;soundPlayer.setState({hidden:true});cancelWelcomeGift();gardenMusic.setState({active:false,immediate:true});cancelWelcomeGreeting();cancelIdleHint();pointerHeld=false;uiGeneration++;cancelFeedbackVoice();effects.cancel();speaking=false;soundGeneration++;cancelMeadowDrag?.();cancelGardenReminder();clearGuide();audio.releaseAudioSession();if(session){cancelStory(session);cancelAttempt(session);session.teaching=false;session.hasClip=false;render();}}
function resume(){
  pageSuspended=false;syncGardenMusic();scheduleIdleHint();
  if(gmWorkbenchOpen)return;
  if(!modal){
    if(page==='shop'&&meadowState.pendingSeed){navigate('garden');meadowTool='seed';render();}
    else if(page==='shop'&&meadow.pendingRewards(meadowState).length)navigate('reward');
    else render();
  }
  scheduleGardenReminder();
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else resume();});window.addEventListener('pagehide',suspend);window.addEventListener('pageshow',event=>{if(event.persisted)resume();});
function refreshTuning(){
  try{prefs={...JSON.parse(appStorage.getItem(PREFS)||'{}'),mic:JSON.parse(appStorage.getItem(PREFS)||'{}').mic===true};}catch{}
  soundSettings.reload();syncGardenMusic();
  if(!session?.recording&&!session?.waiting&&!['preparing','assessing'].includes(session?.assessment?.status))render();
}
window.addEventListener('xiaoya:economy-settings-changed',refreshTuning);
window.addEventListener('xiaoya:tuning-restored',refreshTuning);
window.addEventListener('storage',event=>{if(GM_SANDBOX)return;if(event.key===PREFS){try{prefs=JSON.parse(appStorage.getItem(PREFS)||'{}');if(!audioControls(prefs.audioControls).reminders&&automaticVoice)stopSpeech({fade:true});syncGardenMusic();if(modal?.type==='audio')renderModal();}catch{}return;}if(event.key===ECONOMY_SETTINGS_KEY){refreshTuning();return;}if(event.key===SOUND_SETTINGS_KEY||event.key===null){soundSettings.reload();if(event.key===SOUND_SETTINGS_KEY)return;}if(![LEGACY_GARDEN_KEY,meadow.MEADOW_KEY,STORAGE_KEY,PREFS,VOICE_KEY,PRACTICE_KEY,challenge.CHALLENGE_KEY].includes(event.key))return;stopSession();try{state=validateState(JSON.parse(appStorage.getItem(STORAGE_KEY)||JSON.stringify(createState())));rawGarden=appStorage.getItem(LEGACY_GARDEN_KEY);gardenHistory=readGardenHistory(rawGarden);meadowState=meadow.validateMeadow(JSON.parse(appStorage.getItem(meadow.MEADOW_KEY)||JSON.stringify(meadow.createMeadow())));practice=validatePracticePlan(JSON.parse(appStorage.getItem(PRACTICE_KEY)||JSON.stringify(createPracticePlan())));challenges=challenge.validateChallenges(JSON.parse(appStorage.getItem(challenge.CHALLENGE_KEY)||JSON.stringify(challenge.createChallenges())));prefs=JSON.parse(appStorage.getItem(PREFS)||'{}');selectedVoice=readVoice(appStorage);storageProblem=null;}catch(error){storageProblem=error.message;}page='home';modal=null;render();restorePracticeRewards();restoreChallengeRewards();});
const cancelMeadowDrag=bindMeadowInteractions(app,{read:()=>({active:gardenIsActive(),state:meadowState,tool:meadowTool}),onSelect:selectMeadowTool,onPlant:meadowPlant,onWater:meadowWater,onTouch:(event,target)=>{if(meadowBusy)return;cancelFeedbackVoice();clearGuide();stopSpeech();scheduleGardenReminder();if(event&&!(meadowTool==='can'&&target?.closest?.('[data-meadow-plant],[data-water-plant]'))){const pointer=event.detail>0||event.type.startsWith('pointer');effects.tap(target,pointer?{x:event.clientX,y:event.clientY}:{});}}});

audio.onAudioActivity(value=>{const wasRecording=audioActivity.recording;audioActivity=value;syncGardenMusic();if(wasRecording&&!value.recording){guidanceClock.activity();visualHintClock.activity();}});
app.addEventListener('change',event=>{if(event.target.matches('input[type=checkbox]'))soundPlayer.play('select');});

// Internal controls use the real screens and transaction models. Learning and
// economy mutations require the sandbox; music preferences use appStorage so
// real mode remembers the setting while sandbox edits remain in memory.
function requireGmSandbox(){if(!GM_SANDBOX)throw new Error('请先进入免录音测试，再修改测试状态。');}
export const gmBridge=INTERNAL_BUILD?Object.freeze({
  pause(){
    cancelWelcomeGift();cancelWelcomeGreeting();gmMusicPreview=false;gmWorkbenchOpen=true;guidanceClock.pause();visualHintClock.pause();uiGeneration++;cancelIdleHint();cancelGardenReminder();cancelFeedbackVoice();
    stopSpeech();meadowMotion.cancel();effects.cancel();cancelMeadowDrag?.();audio.releaseAudioSession();
    if(session){
      cancelStory(session);
      if(session.waiting||session.recording||['preparing','assessing'].includes(session.assessment?.status))cancelAttempt(session);
      else session.speechGeneration++;
      session.teaching=false;session.hasClip=false;
    }
  },
  resume(){gmMusicPreview=false;gmWorkbenchOpen=false;render();scheduleGardenReminder();},
  musicSettings(){return {...gardenMusicSettings(prefs.gardenMusic),preview:gmMusicPreview,...gardenMusic.status()};},
  setMusicSettings(change){
    const next=gardenMusicSettings({...gardenMusicSettings(prefs.gardenMusic),...change});
    if(!savePrefs({...prefs,gardenMusic:next}))return false;
    if(!next.enabled||!next.volume)gmMusicPreview=false;
    syncGardenMusic();return true;
  },
  previewMusic(active){const settings=gardenMusicSettings(prefs.gardenMusic);gmMusicPreview=Boolean(active&&gmWorkbenchOpen&&settings.enabled&&settings.volume);syncGardenMusic();if(gmMusicPreview)gardenMusic.retry();},
  inspect(){const wallet=activeGarden();return {
    page,eventId:session?.event.id??null,phase:session?.phase??null,voice:selectedVoice,gardenVariant:'b',
    simulationResult:gmResult,wallet:{shells:wallet.shells,water:wallet.water,unlimited:meadow.hasUnlimitedResources(wallet)},plants:wallet.plants.length,
    practiceCount:practice.entries.length,evidenceCount:state.evidence.length,
    challengeAttempts:challenges.attempts.length,challengeRewards:meadowState.challengeRewards.length,welcomeGifts:meadowState.welcomeGifts.length,
  };},
  openLesson(eventId,mode='new'){
    requireGmSandbox();const event=EVENTS.find(e=>e.id===eventId);
    if(!event||!['new','review','checkup'].includes(mode))throw new Error('未知课程或测试流程。');
    startEvent(event,mode==='checkup',null,{eventId,mode:mode==='new'?'new':'review'});
  },
  navigate(target){
    requireGmSandbox();if(!['home','garden','shop','challenges','parent','welcome-gift'].includes(target))throw new Error('未知测试页面。');
    if(target==='welcome-gift')return openWelcomeGift();
    if(target==='garden')return enterGarden();
    if(target==='shop')return openShop();
    if(target==='challenges')return openChallenges();
    if(target==='parent')parentUnlocked=true;
    navigate(target);
  },
  setVoice(voiceId){
    requireGmSandbox();if(!VOICES.some(v=>v.id===voiceId))throw new Error('未知音色。');
    if(!saveVoice(voiceId,appStorage))throw new Error('测试音色没有保存。');
    selectedVoice=readVoice(appStorage);render();
  },
  setResult(result){requireGmSandbox();if(!['three','two','one','silence','unavailable'].includes(result))throw new Error('未知模拟结果。');gmResult=result;},
  advance(){
    requireGmSandbox();const s=session;if(!s||!['story','request'].includes(s.phase))return;
    cancelFeedbackVoice();cancelStory(s);cancelAttempt(s);stopSpeech();
    s.phase='request';s.frame=s.story.cueFrame;s.storyReady=true;s.teaching=false;s.recallReady=false;render();
  },
  async prepareChallenge(unitId){
    requireGmSandbox();const unit=challenge.CHALLENGE_UNITS.find(u=>u.id===unitId);if(!unit)throw new Error('未知挑战。');
    const records=unit.eventIds.map(eventId=>({roundId:`gm-study:${uid()}`,eventId,date:today(),attemptId:null,mode:'new',rewardVariant:null}));
    if(await savePractice({practiceRecords:records}))startChallenge(unitId);
  },
  async previewWelcome(kind='shells'){
    requireGmSandbox();if(!['shells','water'].includes(kind))throw new Error('未知欢迎礼物。');
    // Start a clean temporary wallet so each preview exercises the real claim.
    // The sandbox storage adapter never reads or writes the child's saved wallet.
    const previousDay=new Date();previousDay.setDate(previousDay.getDate()-1);
    const saved=await gardenChange(()=>kind==='water'?meadow.claimWelcomeGift(meadow.createMeadow(),localDay(previousDay)):meadow.createMeadow());
    if(saved)return openWelcomeGift();
  },
  async supplyGarden(){
    requireGmSandbox();
    // Unlimited spending belongs to the sandbox, not fabricated learning receipts.
    return openShop();
  },
}):null;

async function startGmRoute(){
  if(!GM_SANDBOX)return;
  const params=new URLSearchParams(location.search),voiceId=params.get('gmVoice');
  try{
    if(voiceId)gmBridge.setVoice(voiceId);
    if(params.has('gmResult'))gmBridge.setResult(params.get('gmResult'));
    if(params.has('gmWelcome'))await gmBridge.previewWelcome(params.get('gmWelcome'));
    else if(params.has('gmChallenge'))await gmBridge.prepareChallenge(params.get('gmChallenge'));
    else if(params.get('gmSupply')==='1')await gmBridge.supplyGarden();
    else if(params.has('gmEvent'))gmBridge.openLesson(params.get('gmEvent'),params.get('gmMode')||'new');
    else if(params.has('gmPage'))await gmBridge.navigate(params.get('gmPage'));
  }catch(error){toast(error.message);}
}
installPaperArt(document.body);
document.body.addEventListener('xiaoya-art-error',showArtRecovery);
document.body.addEventListener('xiaoya-art-ready',dismissArtRecovery);
window.addEventListener('online',recoverVisiblePictures);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)recoverVisiblePictures();});
render();
onAudioPackChange(()=>{const target=document.querySelector('[data-audio-pack-status]');if(target)target.textContent=audioPackMessage();});
onArtPackChange(status=>{const target=document.querySelector('[data-art-pack-status]');if(target)target.textContent=artPackMessage();if(status.state==='ready'){recoverVisiblePictures();dismissArtRecovery();}});
startAudioPack();
restorePracticeRewards();

restoreChallengeRewards();
startGmRoute();
