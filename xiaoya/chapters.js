import {CORE_PHRASE_EVENT_IDS, phraseIdFor} from './curriculum.js';

const titles = [
  '你好，小伙伴', '温柔的回应', '见面与告别', '一起出发',
  '说说我的感受', '我能做到', '又见到你啦', '送你小祝福',
  '把心意送给你', '我可以吗', '等我一起走', '一天的小事情',
  '准备好了吗', '一起玩吧', '期待小惊喜', '照顾好自己',
  '告诉你我的感觉', '找到你啦', '听听我的话', '慢慢来没关系',
  '一起想办法',
];

/** Stable four-phrase chapters mirror the existing challenge groups. A chapter
 * records participation, never a pronunciation or mastery certificate. */
export const CHAPTERS = Object.freeze(titles.map((title, index) => Object.freeze({
  id: `chapter-${index + 1}`,
  number: index + 1,
  title,
  eventIds: Object.freeze(CORE_PHRASE_EVENT_IDS.slice(index * 4, index * 4 + 4)),
  challengeId: `challenge-${index + 1}`,
})));

function cardsByPhrase(practicePlan) {
  return new Map((practicePlan?.cards ?? [])
    .filter(card => card.firstDate)
    .map(card => [phraseIdFor(card.eventId), card]));
}

function oldestFirst(a, b) {
  return (a.lastDate || a.firstDate).localeCompare(b.lastDate || b.firstDate);
}

function nextPractice(chapter, cards) {
  const unseen = chapter.eventIds.find(id => !cards.has(phraseIdFor(id)));
  if (unseen) return {eventId: unseen, mode: 'new'};
  const familiar = chapter.eventIds.map(id => cards.get(phraseIdFor(id)));
  const due = familiar.filter(card => card.due).sort((a, b) =>
    (a.dueDate || a.firstDate).localeCompare(b.dueDate || b.firstDate) || oldestFirst(a, b));
  const selected = due[0] ?? familiar.sort(oldestFirst)[0];
  // Return the already-familiar scene, not an invented alternate review image.
  return selected ? {eventId: selected.eventId, mode: due.length ? 'review' : 'free'} : null;
}

/** Read the derived practice plan; no new save or migration is needed. Existing
 * learners keep every chapter up to their furthest practiced core phrase open.
 * Only completed participation opens the following chapter, regardless of any
 * star ratings, challenge results, rewards, or elapsed days. */
export function getChapterProgress(practicePlan) {
  const cards = cardsByPhrase(practicePlan);
  const chapters = CHAPTERS.map(chapter => {
    const items = chapter.eventIds.map(eventId => {
      const card = cards.get(phraseIdFor(eventId));
      return {eventId, practiced: !!card, due: !!card?.due};
    });
    const completedCount = items.filter(item => item.practiced).length;
    return {...chapter, completedCount, completed: completedCount === chapter.eventIds.length,
      dueCount: items.filter(item => item.due).length, items};
  });
  const furthestPracticed = chapters.reduce((furthest, chapter, index) =>
    chapter.completedCount ? index : furthest, -1);
  chapters.forEach((chapter, index) => {
    chapter.unlocked = index === 0 || index <= furthestPracticed || chapters[index - 1].completed;
    chapter.nextEventId = chapter.unlocked ? nextPractice(chapter, cards)?.eventId ?? null : null;
  });
  return {
    chapters,
    currentChapterId: (chapters.find(chapter => chapter.unlocked && !chapter.completed) ?? chapters.at(-1)).id,
    completedCount: chapters.filter(chapter => chapter.completed).length,
  };
}

/** Unpracticed content comes first within a selected chapter. A child can also
 * revisit any practiced phrase without being required to pass a challenge. */
export function nextChapterPractice(chapterId, practicePlan) {
  const chapter = getChapterProgress(practicePlan).chapters.find(item => item.id === chapterId);
  return chapter?.unlocked ? nextPractice(chapter, cardsByPhrase(practicePlan)) : null;
}

/** Every third completed chapter offers a short reunion of its three chapters.
 * The existing calendar scheduler decides due status; this selection adds no
 * mastery evidence and does not alter any challenge or reward ledger. A normal
 * four-phrase round includes all three chapters before filling its last slot. */
export function mixedChapterReview(chapterId, practicePlan, {limit = 4} = {}) {
  const progress = getChapterProgress(practicePlan);
  const chapter = progress.chapters.find(item => item.id === chapterId);
  if (!chapter || chapter.number % 3 ||
      !progress.chapters.slice(0, chapter.number).every(item => item.completed) ||
      !Number.isInteger(limit) || limit <= 0) return [];
  const cards = cardsByPhrase(practicePlan);
  const byPriority = (a, b) => Number(b.due) - Number(a.due) || oldestFirst(a, b);
  const groups = CHAPTERS.slice(chapter.number - 3, chapter.number)
    .map(item => item.eventIds.map(eventId => cards.get(phraseIdFor(eventId)))
      .filter(Boolean).sort(byPriority));
  const ranked = groups.flat().sort(byPriority);
  // Reserve each chapter's most useful review when the round has enough slots.
  // Small caller-requested rounds use the global priority without overfilling.
  const selected = new Set(limit >= groups.length ? groups.map(group => group[0]) : []);
  for (const card of ranked) {
    if (selected.size >= limit) break;
    selected.add(card);
  }
  return ranked.filter(card => selected.has(card))
    .map(card => card.eventId);
}
