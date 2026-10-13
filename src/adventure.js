/** A game-facing view of existing progress. No currency, rewards or learning rules live here. */
import { dayKey, getDailyPlan } from './learning.js';
import { getTodayJourney } from './journey.js';
import { getGarden } from './garden.js';

const RANKS = Object.freeze([
  [0, '小芽探险家', '🌱'],
  [3, '种子伙伴', '🌰'],
  [10, '花园小帮手', '🌿'],
  [25, '花朵好朋友', '🌼'],
  [60, '彩虹园丁', '🌈'],
  [150, '花海探险家', '🦋'],
  [400, '星光园丁', '✨'],
  [1000, '花园梦想家', '🌻'],
].map(rank => Object.freeze(rank)));

function progress(current, target) { return Math.max(0, Math.min(1, target ? current / target : 1)); }

function rankFor(current) {
  let index = 0;
  while (index + 1 < RANKS.length && current >= RANKS[index + 1][0]) index++;
  const [floor, title, icon] = RANKS[index], next = RANKS[index + 1];
  return {
    level: index + 1, title, icon, current,
    target: next ? next[0] : null,
    progress: next ? progress(current - floor, next[0] - floor) : 1,
    nextTitle: next ? next[1] : null,
  };
}

function goal(kind, title, hint, current, target) {
  return {kind, title, hint, current, target, remaining: Math.max(0, target - current), progress: progress(current, target)};
}

function gardenGoal(garden, stats) {
  if (!stats.learnedCount) return goal('discover', '发现第一句英语', '听一听、找图片，再开口试一试', 0, 1);
  // Choose the nearest real bloom, preserving older plants' original growth goals.
  let closest = null;
  for (const plant of garden.worldPlants) {
    if (plant.growth >= plant.growthGoal) continue;
    if (!closest || plant.growthGoal - plant.growth < closest.growthGoal - closest.growth) closest = plant;
  }
  if (closest) {
    const remaining = closest.growthGoal - closest.growth;
    return goal('bloom', stats.bloomCount ? '让下一朵花开放' : '让第一朵花开放',
      stats.water ? `再浇 ${remaining} 次，小花就开放啦` : '跟读一句，带回 2 壶水', closest.growth, closest.growthGoal);
  }
  const worldCount = garden.worldPlants.filter(plant => plant.sourcePlot === undefined).length;
  if (worldCount >= garden.worldCapacity) return goal('enjoy', '看看你的大花海', '移动花园，找找最喜欢的花', stats.plantCount, stats.plantCount);
  if (stats.seeds) return goal('plant', stats.plantCount ? '给新种子找个家' : '种下第一颗种子', '把种子拖到喜欢的地方', 0, 1);
  return goal('seed', '发现下一颗小种子', '跟读带回水壶，也有机会发现种子', 0, 1);
}

/** Serializable, bounded-size presentation model; callers must supply validated learning state. */
export function getAdventure(state, lessons, today = dayKey(), preparedGarden = null) {
  const journey = getTodayJourney(state, lessons, today);
  const daily = getDailyPlan(state, lessons, today);
  const garden = preparedGarden || getGarden(state, today);
  // World blooms and harvested classic plants are already in collection. An old
  // mature plant still standing in its plot is real too, but not collected yet.
  const bloomCount = garden.collection.reduce((sum, item) => sum + item.count, 0)
    + garden.plots.filter(plant => plant?.canHarvest).length;
  const stats = {
    learnedCount: garden.earned.newLessons,
    bloomCount,
    plantCount: garden.worldPlants.length,
    practiceDays: garden.earned.practiceDays,
    seeds: garden.inventory.seeds,
    water: garden.inventory.water,
  };
  const copy = {
    review: {title: '唤醒老朋友', hint: '先看图想一想，再开口打招呼', button: '去找老朋友', symbol: '🌿'},
    learn: {title: '收集新发现', hint: '听一听、找图片，再开口点亮星星',
      button: daily.newCount ? '再发现一句' : '出发学一句', symbol: '🌱'},
    checkup: {title: '记忆寻宝', hint: '先看图自己说，再听音找图片', button: '出发寻宝', symbol: '🧩'},
    garden: {title: '我的花园', hint: '种下小种子，浇出自己的花海', button: '去花园玩', symbol: '🌻'},
  }[journey.kind];
  return {
    rank: rankFor(stats.learnedCount + stats.bloomCount),
    quest: {kind: journey.kind, ...copy, count: journey.count, lessonId: journey.lessonId, nextKind: journey.nextKind},
    stats,
    nextGoal: gardenGoal(garden, stats),
  };
}
