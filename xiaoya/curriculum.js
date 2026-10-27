import {EVENTS} from './content.js';
import {PHRASE_PACK_V015_EVENT_IDS} from './phrase-pack-v015.js';

/** One familiar spoken expression per lesson. Alternate stories stay available
 * as optional contexts; they never become additional automatic new lessons. */
export const CORE_PHRASE_EVENT_IDS = Object.freeze([
  'hello-everyone', 'hello-morning', 'family-love',
  'hello-thanks', 'hello-youre-welcome', 'hello-sorry', 'hello-okay',
  'hello-goodbye', 'bed-night', 'hello-welcome', 'hello-excuse',
  'outside-go-home', 'outside-ready', 'family-come', 'food-eat',
  'food-hungry', 'feelings-happy', 'feelings-tired',
  'play-turn', 'play-your-turn', 'play-can-do', 'play-did-it',
  'play-good-job', 'play-again',
  // Keep the original 24 lessons in place. The new pack introduces 49 easy
  // expressions, then 11 later expressions, preserving approved order in each.
  ...PHRASE_PACK_V015_EVENT_IDS,
]);

const byEventId = new Map(EVENTS.map(event => [event.id, event]));
const byPhraseId = new Map();
for (const event of EVENTS) {
  if (!byPhraseId.has(event.lessonId)) byPhraseId.set(event.lessonId, []);
  byPhraseId.get(event.lessonId).push(event);
}
for (const events of byPhraseId.values()) Object.freeze(events);
const canonicalByPhrase = new Map(
  [...byPhraseId].map(([id, events]) => [id, events[0].id]),
);
for (const id of [...CORE_PHRASE_EVENT_IDS].reverse()) {
  const event = byEventId.get(id);
  if (!event) throw new RangeError(`Unknown core phrase event: ${id}`);
  canonicalByPhrase.set(event.lessonId, id);
}

function eventFor(eventId) {
  const event = byEventId.get(eventId);
  if (!event) throw new RangeError(`Unknown phrase event: ${eventId}`);
  return event;
}

export function phraseIdFor(eventId) {
  return eventFor(eventId).lessonId;
}

export function canonicalEventId(eventId) {
  return canonicalByPhrase.get(phraseIdFor(eventId));
}

export function phraseEvents(eventId) {
  return byPhraseId.get(phraseIdFor(eventId));
}
