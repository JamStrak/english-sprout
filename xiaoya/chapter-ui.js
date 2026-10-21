import {icon} from './art.js';
import {storyFor} from './stories.js';
import {pictureFor} from './story-pictures.js';
import {getChallengeFlower} from './challenge-flowers.js';
import {meadowPlantArt} from './meadow-art.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character]));
const itemsFor = chapter => chapter.items ?? chapter.eventIds.map(eventId => ({eventId, practiced:false, due:false}));

function progressDots(chapter) {
  const items = itemsFor(chapter);
  return `<span class="chapter-dots" role="img" aria-label="练过 ${items.filter(item => item.practiced).length} 句，共 ${items.length} 句">${items.map(item => `<i class="${item.practiced ? 'is-practiced' : ''}" aria-hidden="true">${item.practiced ? icon('check', 14) : ''}</i>`).join('')}</span>`;
}

/** The thumbnail shows the same scene and frame as the spoken practice. */
function thumbnail(eventId, className = '') {
  const story = storyFor(eventId);
  const picture = pictureFor(story, {frame:story.cueFrame}, document.baseURI);
  if (!picture) return `<span class="chapter-thumbnail ${className}" aria-hidden="true">${icon('book', 40)}</span>`;
  const grid = picture.layout === 'grid';
  return `<span class="chapter-thumbnail ${grid ? 'is-grid' : ''} ${className}" aria-hidden="true"><img src="${esc(picture.url)}" alt="" loading="lazy" decoding="async"${grid ? ` style="--frame-x:${picture.frame % 2 ? '-100%' : '0%'};--frame-y:${picture.frame > 1 ? '-100%' : '0%'}"` : ''}></span>`;
}

const entryImage = name => new URL(`xiaoya/paper/chapters/${name}-entry.webp`, document.baseURI).href;

export function chapterHome({progress, header, balance}) {
  const current = progress.chapters.find(chapter => chapter.id === progress.currentChapterId) ?? progress.chapters[0];
  return `${header}<main class="home-view chapter-home" data-chapter-home>
    <div class="chapter-home-heading"><span class="chapter-eyebrow">小芽在等你</span><h1>今天，一起玩什么？</h1></div>
    <div class="chapter-entries">
      <div class="primary-wrap chapter-entry-wrap"><button class="primary-orb chapter-entry chapter-entry-learning" data-action="learning" data-primary aria-label="学习，打开小芽的故事书，第 ${current.number} 章，${esc(current.title)}">
        <span class="chapter-entry-picture"><img src="${esc(entryImage('learning'))}" alt="" width="960" height="640" decoding="async" fetchpriority="high"></span>
        <span class="chapter-entry-caption"><span><strong>学习</strong><small>第 ${current.number} 章 · ${esc(current.title)}</small></span><span class="chapter-entry-arrow" aria-hidden="true">${icon('play', 28)}</span></span>
      </button></div>
      <button class="chapter-entry chapter-entry-garden" data-action="garden" aria-label="花园，去看看我的小花">
        <span class="chapter-entry-picture"><img src="${esc(entryImage('garden'))}" alt="" width="960" height="640" decoding="async"></span>
        <span class="chapter-entry-caption"><span><strong>花园</strong><small>照顾我的小花</small></span><span class="chapter-entry-arrow" aria-hidden="true">${icon('next', 28)}</span></span>
      </button>
    </div>
    <div class="chapter-home-wallet">${balance}</div>
  </main>`;
}

export function chapterBoardView({progress, header, balance}) {
  return `${header}<main class="chapter-board" data-chapter-board>
    <div class="chapter-board-heading"><div><span class="chapter-eyebrow">一章，四个小故事</span><h1>小芽的故事书</h1></div>${balance}</div>
    <div class="chapter-map">${progress.chapters.map(chapter => {
      const current = chapter.id === progress.currentChapterId;
      return `<button class="chapter-card ${chapter.unlocked ? 'is-open' : 'is-locked'} ${chapter.completed ? 'is-complete' : ''} ${current ? 'is-current' : ''}" data-chapter="${esc(chapter.id)}" ${chapter.unlocked ? '' : 'disabled'} ${current ? 'aria-current="step"' : ''} aria-label="第 ${chapter.number} 章，${esc(chapter.title)}，${chapter.unlocked ? `练过 ${chapter.completedCount} 句，共四句，点击进入` : '练完前一章就开放'}">
        ${thumbnail(chapter.eventIds[0])}
        <span class="chapter-number">${chapter.number}</span>
        ${!chapter.unlocked ? `<span class="chapter-lock" aria-hidden="true">${icon('lock', 25)}</span>` : chapter.completed ? `<span class="chapter-card-check" aria-hidden="true">${icon('check', 24)}</span>` : ''}
        <span class="chapter-card-copy"><strong>${esc(chapter.title)}</strong>${progressDots(chapter)}</span>
        ${current ? '<span class="chapter-current-tag">从这里继续</span>' : ''}
      </button>`;
    }).join('')}</div>
    <p class="chapter-map-note">练完这一章，下一章就亮起来</p>
  </main>`;
}

export function chapterDetailView({chapter, header, challengeUnit, mixedIds = [], completed = false}) {
  const flower = getChallengeFlower(chapter.challengeId);
  const practiced = itemsFor(chapter).filter(item => item.practiced).length;
  const nextChapter = completed && chapter.number < 21;
  const challengeAvailable = !!challengeUnit?.available;
  return `${header}<main class="chapter-detail ${completed ? 'is-just-completed' : ''}" data-chapter-detail="${esc(chapter.id)}">
    <div class="chapter-detail-heading"><button class="chapter-back-button" data-action="learning" aria-label="回到所有章节">${icon('back', 26)}</button><div><span class="chapter-eyebrow">第 ${chapter.number} 章${completed ? ' · 练完啦' : ''}</span><h1>${esc(chapter.title)}</h1></div>${progressDots(chapter)}</div>
    ${completed ? `<p class="chapter-completion-note" role="status">${icon('check', 22)}${nextChapter ? '新的一章亮起来啦！' : '每一章的小故事都玩过啦！'}</p>` : ''}
    <div class="chapter-phrases">${itemsFor(chapter).map((item, index) => {
      const story = storyFor(item.eventId);
      return `<button class="chapter-phrase ${item.practiced ? 'is-practiced' : ''}" data-chapter-phrase="${esc(item.eventId)}" data-chapter="${esc(chapter.id)}" aria-label="第 ${index + 1} 句，${esc(story.event.title)}，${item.practiced ? item.due ? '和老朋友再练练' : '练过了，还可以再玩' : '新故事，点击开始'}">
        ${thumbnail(item.eventId)}<span class="chapter-phrase-number">${index + 1}</span><span class="chapter-phrase-copy"><strong>${esc(story.event.title)}</strong><span class="chapter-phrase-state">${item.practiced ? icon(item.due ? 'again' : 'check', 20) : icon('play', 20)}${item.practiced ? item.due ? '再练练' : '练过啦' : '听听看'}</span></span>
      </button>`;
    }).join('')}</div>
    <div class="chapter-detail-actions"><div class="primary-wrap"><button class="primary-orb chapter-continue" data-primary data-action="${nextChapter ? 'chapter-next' : 'chapter-continue'}" aria-label="${nextChapter ? '去下一章' : practiced === 4 ? '再玩一次' : practiced ? '接着学' : '开始这一章'}">${icon('play', 27)}<span>${nextChapter ? '去下一章' : practiced === 4 ? '再玩一次' : practiced ? '接着学' : '一起开始'}</span></button></div>
      <div class="chapter-review-actions"><button class="chapter-soft-button" data-action="chapter-review" ${practiced ? '' : 'disabled'} aria-label="复习这一章练过的句子">${icon('again', 22)}<span>再练练</span></button>${mixedIds.length ? `<button class="chapter-soft-button" data-action="chapter-mixed" aria-label="把最近三章的老朋友放在一起复习">${icon('book', 22)}<span>老朋友聚会</span></button>` : ''}</div>
    </div>
    <button class="chapter-challenge ${challengeUnit?.completed ? 'is-earned' : ''}" data-challenge-unit="${esc(chapter.challengeId)}" data-reward-flower="${esc(flower.id)}" ${challengeAvailable ? '' : 'disabled'} aria-label="${challengeAvailable ? '花园挑战' : '先练完这一章，再来挑战'}，${challengeUnit?.completed ? '已经获得' : '首次完成奖励'}${esc(flower.name)}种子">
      <span class="chapter-challenge-flower" aria-hidden="true">${meadowPlantArt(flower, flower.waterNeeded)}</span>
      <span class="chapter-challenge-copy"><span class="chapter-eyebrow">${challengeUnit?.completed ? '种子已获得 · 随时再挑战' : '花园挑战 · 赢专属种子'}</span><strong>${esc(flower.name)}</strong><small>${challengeAvailable ? challengeUnit?.completed ? '再和小芽试试吧' : '这朵小花，等你带回家' : '先练练这四句，再来试试'}</small></span>
      <span class="chapter-challenge-arrow" aria-hidden="true">${icon(challengeAvailable ? challengeUnit?.completed ? 'check' : 'next' : 'lock', 28)}</span>
    </button>
  </main>`;
}

export function chapterRail(chapter) {
  if (!chapter) return '';
  return `<nav class="chapter-rail" aria-label="章节进度"><button data-action="chapter-back" aria-label="返回第 ${chapter.number} 章">${icon('back', 22)}<span>第 ${chapter.number} 章</span></button>${progressDots(chapter)}</nav>`;
}
