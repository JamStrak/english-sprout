export const VOICE_STORAGE_KEY='english-sprout-voice-v1';
export const DEFAULT_VOICE='aiden';
export const VOICES=[{id:'aiden',name:'Aiden'},{id:'ryan',name:'Ryan'}];
export const UI_PROMPTS=['listen','choose','speak','reveal','complete','review','record','welcome','try-again','well-done','checkup'];

export function normalizeVoice(value){return VOICES.some(voice=>voice.id===value)?value:DEFAULT_VOICE;}
export function readVoicePreference(storage){
  try{return normalizeVoice((storage??globalThis.localStorage).getItem(VOICE_STORAGE_KEY));}catch{return DEFAULT_VOICE;}
}
export function saveVoicePreference(value,storage){
  try{(storage??globalThis.localStorage).setItem(VOICE_STORAGE_KEY,normalizeVoice(value));return true;}catch{return false;}
}
export function voiceAudioPath(file,voice){
  // Only course files have voice variants. UI guidance and recorded blob URLs stay unchanged.
  return normalizeVoice(voice)==='ryan'?file.replace(/^audio\/([\w-]+\.mp3)$/,'audio/ryan/$1'):file;
}
export function englishAudioFiles(lessons){return lessons.flatMap(lesson=>VOICES.map(voice=>voiceAudioPath(lesson.audio,voice.id)));}
