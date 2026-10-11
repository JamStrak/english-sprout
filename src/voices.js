export const VOICE_STORAGE_KEY='english-sprout-voice-v1';
export const DEFAULT_VOICE='aiden';
export const VOICES=[{id:'aiden',name:'Aiden',nickname:'小熊伙伴',icon:'🐻'},{id:'ryan',name:'Ryan',nickname:'小狐伙伴',icon:'🦊'},{id:'pip',name:'Pip',nickname:'泡泡猫',icon:'🐱'}];
export const UI_PROMPTS=['listen','choose','speak','reveal','complete','review','record','welcome','try-again','well-done','checkup'];
export const COURSE_RATE_KEY='english-sprout-course-rate-v1';
export const AUDITION_RATE_KEY='english-sprout-audition-rate-v1';
export const PLAYBACK_RATES=Object.freeze([0.75,0.9,1,1.15]);
export const PLAYBACK_RATE_LABELS=Object.freeze({0.75:'慢慢听',0.9:'跟着说',1:'原速',1.15:'快一点'});
const localStore=()=>{try{return globalThis.localStorage;}catch{return null;}};
export function readStoredRate(key,storage=localStore()){
  try{const rate=JSON.parse(storage?.getItem(key));return PLAYBACK_RATES.includes(rate)?rate:1;}catch{return 1;}
}
export function saveStoredRate(key,rate,storage=localStore()){
  if(!PLAYBACK_RATES.includes(rate))return false;
  try{if(!storage)throw new Error('No storage');storage.setItem(key,JSON.stringify(rate));return true;}catch{return false;}
}
export function readCourseRate(storage=localStore()){
  try{
    if(storage?.getItem(COURSE_RATE_KEY)===null){
      const previous=JSON.parse(storage.getItem(AUDITION_RATE_KEY));
      if(PLAYBACK_RATES.includes(previous)){saveStoredRate(COURSE_RATE_KEY,previous,storage);return previous;}
    }
  }catch{}
  return readStoredRate(COURSE_RATE_KEY,storage);
}
export function saveCourseRate(rate,storage=localStore()){return saveStoredRate(COURSE_RATE_KEY,rate,storage);}

export function normalizeVoice(value){return VOICES.some(voice=>voice.id===value)?value:DEFAULT_VOICE;}
export function readVoicePreference(storage){
  try{return normalizeVoice((storage??globalThis.localStorage).getItem(VOICE_STORAGE_KEY));}catch{return DEFAULT_VOICE;}
}
export function saveVoicePreference(value,storage){
  try{(storage??globalThis.localStorage).setItem(VOICE_STORAGE_KEY,normalizeVoice(value));return true;}catch{return false;}
}
export function voiceAudioPath(file,voice){
  // Only course files have voice variants. UI guidance and recorded blob URLs stay unchanged.
  const id=normalizeVoice(voice),folder=id==='ryan'?'audio/ryan/':id==='pip'?'audio/characters/pip/':null;
  return folder?file.replace(/^audio\/([\w-]+\.mp3)$/,`${folder}$1`):file;
}
export function englishAudioFiles(lessons){return lessons.flatMap(lesson=>VOICES.map(voice=>voiceAudioPath(lesson.audio,voice.id)));}
