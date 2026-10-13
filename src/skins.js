/** Cosmetic rewards are derived from saved practice; they never spend garden resources. */
import { dayKey } from './learning.js';

export const SKIN_STORAGE_KEY = 'english-sprout-skin-v1';
export const DEFAULT_SKIN_ID = 'sunny';
export const SKINS = Object.freeze([
  Object.freeze({ id: 'sunny', title: '晴空蓝', emoji: '☀️', metric: null, target: 0, rule: '打开就能用' }),
  Object.freeze({ id: 'classic', title: '经典小芽', emoji: '🌱', metric: null, target: 0, rule: '打开就能用' }),
  Object.freeze({ id: 'meadow', title: '薄荷森林', emoji: '🌿', metric: 'newLessons', target: 3, rule: '累计认识 3 个新句' }),
  Object.freeze({ id: 'peach', title: '桃桃湖畔', emoji: '🍑', metric: 'reviews', target: 5, rule: '累计完成 5 次到期复习' }),
  Object.freeze({ id: 'grape', title: '葡萄乐园', emoji: '🍇', metric: 'practiceDays', target: 7, rule: '累计练习 7 天，不用连续' }),
]);

/** Accept only the stored cosmetic ID; learning backups keep their existing v1 shape. */
export function normalizeSkinId(value) {
  return SKINS.some(skin => skin.id === value) ? value : DEFAULT_SKIN_ID;
}

function practiceCounts(state, today) {
  const introductions = new Set(), reviews = new Set(), practicedDates = new Set();
  // Use dated results rather than cards: a saved card can contain progress after today.
  for (const [date, entry] of Object.entries(state?.days || {})) {
    dayKey(date);
    if (date > today) continue;
    for (const result of entry.results || []) {
      if (result.isNew === true && entry.newDone && entry.results.some(first => first.isNew === true && first.lessonId === entry.newId)) {
        introductions.add(result.lessonId);
        practicedDates.add(date);
      } else if (result.isNew === false && entry.reviewed?.includes(result.lessonId)) {
        // Each scheduled sentence/day counts once, regardless of retries or rating.
        reviews.add(`${date}\0${result.lessonId}`);
        practicedDates.add(date);
      }
    }
  }
  for (const [date, results] of Object.entries(state?.checkups || {})) {
    dayKey(date);
    if (date <= today && results.length > 0) practicedDates.add(date);
  }
  return { newLessons: introductions.size, reviews: reviews.size, practiceDays: practicedDates.size };
}

/** Read-only view over a validated v1 learning state, including older states without checkups. */
export function getSkinProgress(state, today = dayKey()) {
  today = dayKey(today);
  const counts = practiceCounts(state, today);
  return SKINS.map(skin => {
    const current = skin.metric ? counts[skin.metric] : 0;
    return { ...skin, current, unlocked: current >= skin.target, remaining: Math.max(0, skin.target - current) };
  });
}

/** A locked preference falls back after a backup replacement or device-date correction. */
export function resolveSelectedSkin(state, today = dayKey(), id = DEFAULT_SKIN_ID) {
  const normalized = normalizeSkinId(id);
  return getSkinProgress(state, today).find(skin => skin.id === normalized && skin.unlocked)?.id || DEFAULT_SKIN_ID;
}
