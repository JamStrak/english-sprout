import {animalSvg} from './avatars.js';
import {playFile,stopAudio,preloadAudio,isAudioLoading,setPlaybackRate} from './media.js';
import {voiceAudioPath,VOICE_STORAGE_KEY,AUDITION_RATE_KEY,PLAYBACK_RATES,PLAYBACK_RATE_LABELS,readStoredRate,saveStoredRate} from './voices.js';

export const CHARACTER_PICKS_KEY='english-sprout-character-picks-v1';
export {AUDITION_RATE_KEY};
export const AUDITION_RATES=PLAYBACK_RATES;
const rateLabels=PLAYBACK_RATE_LABELS;
const text=value=>typeof value==='string'?value.trim():'';
const safeId=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{0,49}$/.test(value);
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const localStore=()=>{try{return globalThis.localStorage;}catch{return null;}};

export function readAuditionRate(storage=localStore()){
  return readStoredRate(AUDITION_RATE_KEY,storage);
}
export function saveAuditionRate(rate,storage=localStore()){
  return saveStoredRate(AUDITION_RATE_KEY,rate,storage);
}

export function validateAuditionManifest(value){
  if(!value||value.version!==1||!Array.isArray(value.lessons)||!Array.isArray(value.candidates))return null;
  const lessonIds=new Set(),candidateIds=new Set();
  const lessons=value.lessons.slice(0,12).filter(lesson=>{
    if(!safeId(lesson?.id)||lessonIds.has(lesson.id)||!text(lesson.english)||!text(lesson.chinese))return false;
    lessonIds.add(lesson.id);return true;
  }).map(lesson=>({id:lesson.id,english:text(lesson.english).slice(0,200),chinese:text(lesson.chinese).slice(0,200)}));
  const candidates=value.candidates.slice(0,8).filter(candidate=>{
    if(!safeId(candidate?.id)||['aiden','ryan'].includes(candidate.id)||candidateIds.has(candidate.id)||!text(candidate.name)||!['male','female'].includes(candidate.gender))return false;
    candidateIds.add(candidate.id);return true;
  }).map(candidate=>{
    const samples={};
    for(const lesson of lessons){
      const file=candidate.samples?.[lesson.id];
      if(file===`audio/characters/${candidate.id}/${lesson.id}.mp3`)samples[lesson.id]=file;
    }
    return {id:candidate.id,name:text(candidate.name).slice(0,50),gender:candidate.gender,animal:['fox','bear','rabbit','cat'].includes(candidate.animal)?candidate.animal:'bear',tagline:text(candidate.tagline).slice(0,80),description:text(candidate.description).slice(0,200),samples};
  });
  return lessons.length&&candidates.length?{version:1,lessons,candidates}:null;
}
export function normalizeAuditionPicks(value,candidates){
  const clean={version:1,male:null,female:null};
  if(value?.version!==1)return clean;
  for(const gender of ['male','female'])if(candidates.some(candidate=>candidate.id===value[gender]&&candidate.gender===gender))clean[gender]=value[gender];
  return clean;
}
export function readAuditionPicks(candidates,storage=localStore()){
  try{return normalizeAuditionPicks(JSON.parse(storage?.getItem(CHARACTER_PICKS_KEY)),candidates);}catch{return normalizeAuditionPicks(null,candidates);}
}
export function saveAuditionPick(id,candidates,storage=localStore()){
  const candidate=candidates.find(item=>item.id===id);
  if(!candidate)return {ok:false};
  const picks=readAuditionPicks(candidates,storage);picks[candidate.gender]=candidate.id;
  try{if(!storage)throw new Error('No storage');storage.setItem(CHARACTER_PICKS_KEY,JSON.stringify(picks));return {ok:true,picks};}catch{return {ok:false};}
}

let currentDialog=null;
export function openVoiceAudition(){
  if(currentDialog?.isConnected){currentDialog.querySelector('[data-audition-close]')?.focus();return currentDialog;}
  const originalFocus=document.activeElement,controller=new AbortController();
  let rate=readAuditionRate();
  const dialog=document.createElement('dialog');
  dialog.className='voice-audition';dialog.setAttribute('aria-labelledby','voice-audition-title');
  dialog.innerHTML=`<header class="audition-header"><div class="audition-title"><small>小芽配音室 · 声音对照</small><h2 id="voice-audition-title">配音对照试听</h2></div><button type="button" class="audition-close" data-audition-close aria-label="关闭新伙伴试听">×</button><div class="audition-speed"><div class="audition-rate-buttons" role="group" aria-label="试听语速">${AUDITION_RATES.map(value=>`<button type="button" data-audition-rate="${value}" aria-pressed="${value===rate}" aria-label="${value}倍速，${rateLabels[value]}"><strong>${value}×</strong><span>${rateLabels[value]}</span></button>`).join('')}</div><p data-audition-rate-note role="status" aria-live="polite">${rate}× ${rateLabels[rate]} · 点一下换语速，音调不变</p></div></header><div class="audition-body"><div class="audition-load" role="status">正在打开小芽配音室…</div></div><footer class="audition-player" data-audition-state="idle"><span class="audition-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span><p data-audition-status role="status" aria-live="polite">点动物或名字，听听它怎么说</p><button type="button" data-audition-stop disabled aria-label="停止试听">■ 停止</button></footer>`;
  const $=selector=>dialog.querySelector(selector);
  let manifest=null,lessonId='',voiceId='',generation=0,closed=false,activeFile='',loading=false;
  const references=[{id:'aiden',name:'Aiden',animal:'bear',tagline:'原来的伙伴',reference:true},{id:'ryan',name:'Ryan',animal:'fox',tagline:'原来的伙伴',reference:true}];
  const voices=()=>[...manifest.candidates,...references];
  const fileFor=voice=>voice.reference?voiceAudioPath(`audio/${lessonId}.mp3`,voice.id):voice.samples[lessonId];
  const say=(message,error=false)=>{const note=$('[data-audition-note]');if(note){note.textContent=message;note.classList.toggle('is-error',error);}};
  const setState=(state,message)=>{
    if(closed)return;
    loading=state==='loading';
    $('.audition-player').dataset.auditionState=state;
    $('[data-audition-status]').textContent=message;
    $('[data-audition-stop]').disabled=!['loading','playing'].includes(state);
    dialog.querySelectorAll('[data-audition-play]').forEach(button=>{
      const active=button.dataset.auditionPlay===voiceId;
      button.classList.toggle('is-speaking',active&&state==='playing');
      button.classList.toggle('is-loading',active&&state==='loading');
      button.classList.toggle('is-current',active);
      const status=button.querySelector('.audition-card-state');
      if(status)status.textContent=button.disabled?'这句还没准备好':active&&state==='playing'?'正在说话 ♪':active&&state==='loading'?'声音马上来啦…':active&&state==='error'?'点这里重试':'点我听一听 ▶';
    });
  };
  const halt=(message='停好啦，点动物可以再听')=>{generation++;activeFile='';stopAudio();setState('idle',message);};
  const warm=()=>{if(manifest)preloadAudio(voices().map(fileFor).filter(Boolean).slice(0,6));};
  const listen=async id=>{
    if(!manifest||closed)return;
    const voice=voices().find(item=>item.id===id),file=voice&&fileFor(voice);
    if(!file){say('这位伙伴的这句话还没准备好，请先听其他伙伴。',true);return;}
    if(activeFile===file&&loading&&isAudioLoading(file,rate))return;
    voiceId=id;activeFile=file;
    const ticket=++generation,lesson=manifest.lessons.find(item=>item.id===lessonId);
    const status=state=>{
      if(closed||ticket!==generation)return;
      const message=state==='loading'?`${voice.name} 的声音马上来啦…`:state==='playing'?`${voice.name} 正在说：${lesson.english}`:state==='error'?'这次没听到声音，点同一个伙伴再试一次。':`${voice.name} 说完啦，点一下可以重听`;
      setState(state,message);
    };
    try{await playFile(file,rate,status);}catch{if(ticket===generation&&!closed)status('error');}
  };
  const card=voice=>{
    const available=!!fileFor(voice);
    return `<article class="audition-card ${voice.reference?'audition-reference':voice.id==='pip'?'audition-adopted':''}"><button type="button" class="audition-animal" data-audition-play="${voice.id}" ${available?'':'disabled'} aria-label="试听 ${escape(voice.name)}：${escape(manifest.lessons.find(item=>item.id===lessonId).english)}"><span class="audition-avatar">${animalSvg(voice.animal)}</span><span class="audition-card-name">${escape(voice.name)}${voice.reference?'':`<small>${voice.gender==='male'?'男声':'女声'}</small>`}</span><span class="audition-tagline">${escape(voice.tagline)}</span><span class="audition-card-state">${available?'点我听一听 ▶':'这句还没准备好'}</span></button>${voice.reference?'':`<p class="audition-description">${escape(voice.description)}</p><p class="audition-availability">${voice.id==='pip'?'✓ 已加入完整课程':'仅供样音对照'}</p>`}</article>`;
  };
  const render=()=>{
    const lesson=manifest.lessons.find(item=>item.id===lessonId);
    $('.audition-body').innerHTML=`<p class="audition-intro">Pip 泡泡猫已加入完整课程，与 Aiden、Ryan 一起陪你练习。</p><section class="audition-phrases" aria-labelledby="audition-phrase-heading"><h3 id="audition-phrase-heading">① 选一句，听听不同的演法</h3><div class="audition-phrase-chips">${manifest.lessons.map((item,index)=>`<button type="button" data-audition-lesson="${item.id}" aria-pressed="${item.id===lessonId}"><b aria-hidden="true">${index+1}</b><span>${escape(item.english)}</span></button>`).join('')}</div><p class="audition-translation">${escape(lesson.chinese)}</p></section><section aria-labelledby="audition-partners-heading"><div class="audition-section-title"><h3 id="audition-partners-heading">② 点伙伴，听听不同的声音</h3><span>都能重听</span></div><div class="audition-grid">${manifest.candidates.map(card).join('')}</div></section><section class="audition-originals" aria-labelledby="audition-originals-heading"><h3 id="audition-originals-heading">老朋友也在，听听对照</h3><div class="audition-reference-grid">${references.map(card).join('')}</div></section><section class="audition-choices" aria-label="配音说明"><strong>正式伙伴：Aiden · Ryan · Pip 泡泡猫</strong><p data-audition-note role="status" aria-live="polite">三位都有完整 120 句。其他三位保留这四句样音，后续版本待定；这里的试听不更换课程伙伴。</p></section>`;
    dialog.querySelectorAll('[data-audition-play]').forEach(button=>button.addEventListener('click',()=>listen(button.dataset.auditionPlay)));
    dialog.querySelectorAll('[data-audition-lesson]').forEach(button=>button.addEventListener('click',()=>{
      const next=button.dataset.auditionLesson;
      if(next!==lessonId){halt();lessonId=next;render();$(`[data-audition-lesson="${next}"]`).focus({preventScroll:true});warm();}
      listen(voiceId);
    }));
    setState('idle','点动物或名字，听听它怎么说');
  };
  const load=async()=>{
    $('.audition-body').innerHTML='<div class="audition-load" role="status">正在打开小芽配音室…</div>';
    try{
      const response=await fetch(new URL('./data/character-voices.json',document.baseURI),{signal:controller.signal});
      if(!response.ok)throw new Error('Manifest unavailable');
      const data=validateAuditionManifest(await response.json());
      if(!data)throw new Error('Invalid manifest');
      if(closed)return;
      manifest=data;lessonId=manifest.lessons[0].id;voiceId=manifest.candidates.find(voice=>voice.id==='pip')?.id||manifest.candidates[0].id;render();warm();
    }catch(error){
      if(closed||error.name==='AbortError')return;
      $('.audition-body').innerHTML='<div class="audition-load is-error" role="alert"><span aria-hidden="true">🌱</span><p>小伙伴还没到齐，请联网后再试一次。</p><button type="button" class="audition-retry" data-audition-retry>重新打开试听</button></div>';
      $('[data-audition-retry]').addEventListener('click',load);
    }
  };
  const onHide=()=>{if(document.hidden)halt('回来啦，点伙伴继续试听');};
  const onPageHide=()=>halt('点伙伴继续试听');
  const onNavigate=()=>dialog.close();
  const onStorage=event=>{if([VOICE_STORAGE_KEY,'english-sprout-state-v1'].includes(event.key))halt('课程已更新，点伙伴继续试听');};
  const cleanup=()=>{
    if(closed)return;closed=true;generation++;controller.abort();stopAudio();
    document.removeEventListener('visibilitychange',onHide);window.removeEventListener('pagehide',onPageHide);
    window.removeEventListener('hashchange',onNavigate);window.removeEventListener('storage',onStorage);
    dialog.remove();if(currentDialog===dialog)currentDialog=null;
    if(originalFocus?.isConnected)originalFocus.focus();
  };
  $('[data-audition-close]').addEventListener('click',()=>dialog.close());
  $('[data-audition-stop]').addEventListener('click',()=>halt());
  dialog.querySelectorAll('[data-audition-rate]').forEach(button=>button.addEventListener('click',()=>{
    rate=Number(button.dataset.auditionRate);
    const saved=saveAuditionRate(rate),applied=activeFile&&setPlaybackRate(rate,activeFile);
    dialog.querySelectorAll('[data-audition-rate]').forEach(item=>item.setAttribute('aria-pressed',String(Number(item.dataset.auditionRate)===rate)));
    $('[data-audition-rate-note]').textContent=`${rate}× ${rateLabels[rate]} · ${applied?'已即时切换，音调不变':'已选好，点伙伴听一听'}${saved?'':'；本机暂时无法记住语速'}`;
  }));
  dialog.addEventListener('close',cleanup,{once:true});
  document.addEventListener('visibilitychange',onHide);window.addEventListener('pagehide',onPageHide);
  window.addEventListener('hashchange',onNavigate);window.addEventListener('storage',onStorage);
  document.body.append(dialog);currentDialog=dialog;dialog.showModal();$('[data-audition-close]').focus();load();
  return dialog;
}
