/** Voice choices belong to this app; the older English Sprout preference is independent. */
export const VOICE_KEY = 'xiaoya-english:voice:v1';
const DEFAULT_VOICE = 'pip';

export const VOICES = Object.freeze([
  Object.freeze({id:'aiden', name:'小熊伙伴', nickname:'小熊伙伴', icon:'🐻'}),
  Object.freeze({id:'ryan', name:'小狐伙伴', nickname:'小狐伙伴', icon:'🦊'}),
  Object.freeze({id:'pip', name:'泡泡猫', nickname:'泡泡猫', icon:'🐱'}),
]);

export function normalizeVoice(value) {
  return VOICES.some(voice => voice.id === value) ? value : DEFAULT_VOICE;
}

export function readVoice(storage) {
  try { return normalizeVoice((storage ?? globalThis.localStorage).getItem(VOICE_KEY)); }
  catch { return DEFAULT_VOICE; }
}

export function saveVoice(value, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(VOICE_KEY, normalizeVoice(value));
    return true;
  } catch { return false; }
}

/** Resolve against the document's app-independent base, including nested hosting. */
export function lessonAudio(eventOrLessonId, voice = readVoice()) {
  const lessonId = typeof eventOrLessonId === 'string'
    ? eventOrLessonId : eventOrLessonId?.lessonId ?? eventOrLessonId?.phraseId;
  if (typeof lessonId !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(lessonId)) return '';
  const selected = normalizeVoice(voice);
  const directory = selected === 'aiden' ? '' : selected === 'ryan' ? 'ryan/' : 'characters/pip/';
  return `./audio/${directory}${lessonId}.mp3`;
}
