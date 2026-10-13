import { dayKey, getDailyPlan, getCheckupPlan } from './learning.js';

/** Choose one focused activity without changing the calendar, progress or rewards. */
export function getTodayJourney(state, lessons, day = dayKey()) {
  const daily = getDailyPlan(state, lessons, day);
  const checkup = getCheckupPlan(state, lessons, day);
  const activities = [];
  if (daily.dueIds.length) activities.push({ kind: 'review', ids: [...daily.dueIds] });
  if (daily.canLearnMore && !daily.newDone) activities.push({ kind: 'learn', ids: [daily.nextNewLessonId] });
  if (checkup.due) activities.push({ kind: 'checkup', ids: [...checkup.ids] });
  if (daily.canLearnMore && daily.newDone) activities.push({ kind: 'learn', ids: [daily.nextNewLessonId] });
  activities.push({ kind: 'garden', ids: [] });
  const current = activities[0];
  // This describes the current plan only. Recompute after each completed activity:
  // reviews can remove today's checkup candidates, and settings can change the cap.
  return {
    ...current,
    lessonId: current.ids[0] || null,
    count: current.ids.length,
    nextKind: activities[1]?.kind || null,
  };
}
