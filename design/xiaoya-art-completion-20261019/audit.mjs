// Read-only runtime inventory. Run from this worktree: node design/xiaoya-art-completion-20261019/audit.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {EVENTS} from '../../xiaoya/content.js';
import {STORIES} from '../../xiaoya/stories.js';
import {CORE_PHRASE_EVENT_IDS} from '../../xiaoya/curriculum.js';
import {PAPER_ASSETS} from '../../xiaoya/paper-art.js';
import {storyFrame,assessmentFrame} from '../../xiaoya/story-art.js';
import {voicePortrait} from '../../xiaoya/art.js';
import {VOICES} from '../../xiaoya/voices.js';
import {SPECIAL_FLOWERS,FLOWERS} from '../../xiaoya/garden-meadow.js';
import {meadowPlantArt} from '../../xiaoya/meadow-art.js';
import {plantArt} from '../../xiaoya/garden-art.js';
import {flagArt} from '../../xiaoya/challenge-ui.js';

const out=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(out,'../..');
const evidence=path.join(root,'test-results/xiaoya-art-audit');
const core=new Set(CORE_PHRASE_EVENT_IDS);
const facts=e=>({eventId:e.id,title:e.title,english:e.english,chinese:e.chinese,core:core.has(e.id),setup:e.setup,request:e.request,help:e.help,resolution:e.resolution});
const primary=STORIES.filter(s=>!s.image||!s.image.includes('paper')).map(s=>({
  assetId:`story-${s.id}-primary`,category:'primary-story',priority:'P1',...facts(s.event),
  current:s.image?`public/xiaoya/stories/${s.image}`:'procedural-svg',reason:s.image?'legacy-non-paper-style':'no-generated-art',
  currentTeachingFrames:s.teachingFrames,preferredFrameCount:1,
  frameNote:'One clear request/meaning scene; use a second image only where before/after is required for understanding. Never a baked four-panel comic.'
}));
const intros=STORIES.filter(s=>s.introFrame!=null).map(s=>({assetId:`story-${s.id}-intro`,category:'story-intro',priority:'P0',...facts(s.event),current:'procedural-svg',retainedImage:`public/xiaoya/stories/${s.image}`,brief:s.frames[s.introFrame],frame:s.introFrame}));
const alternate=EVENTS.map(e=>({assetId:`story-${e.id}-alternate`,category:'alternate-context',priority:core.has(e.id)?'P2-core':'P2-extension',...facts(e),context:e.contexts[1],current:'procedural-svg',requiredStates:['request','resolved'],
  stateNote:'Current optional life check displays request then resolved. Supply explicit state-to-file mapping; share a still only when its meaning remains valid in both states. The primary resolution text is context only, not a literal alternate-scene instruction.',
  reuseCandidate:e.id==='play-box'?'story-care-zip-primary':null
}));
const objects=[
  ...SPECIAL_FLOWERS.map(f=>({assetId:`flower-${f.id}`,category:'flower',priority:'P0',name:f.name,current:'procedural-svg',brief:f.id==='bow-rainbow'?'Rainbow paper bow petals, soft multicolour bands, golden centre, visibly distinct from four ordinary bow flowers.':'Purple night-sky paper bow petals, small golden paper stars, visibly distinct from ordinary purple bow flower.',size:[384,512],alpha:true,root:[.5,.88],waterNeeded:f.waterNeeded})),
  ...VOICES.map(v=>({assetId:`voice-${v.id}`,category:'portrait',priority:'P3',name:v.nickname,current:'procedural-svg',brief:`${v.nickname}，保留既有动物身份；同一套手撕纸头像，不改变音色。`,size:[256,256],alpha:true})),
  {assetId:'pot-front',category:'prop',priority:'P3',current:'procedural-svg',brief:'A 花园和首页快捷入口共用的陶土花盆。只替换盆体；保留植物在后、盆沿在前的遮挡。',size:[320,360],alpha:true,logicalViewBox:[0,0,160,180],potLip:[80,117]},
  {assetId:'challenge-flag',category:'prop',priority:'P3',current:'procedural-svg',brief:'花园挑战共用金色小旗与星形，保持小尺寸清楚。',size:[256,256],alpha:true},
  {assetId:'app-icon',category:'identity',priority:'P3',current:'public/xiaoya/icons/icon-512.png',brief:'复用既有纸艺小芽角色做安装图标，保留中心安全区；交付 512/192 PNG 与轻量浏览器图标，不必重新创造角色。',alpha:false,derivedSizes:[[512,512],[192,192],[48,48]]}
];
const referenced=[...STORIES.filter(s=>s.image).map(s=>`public/xiaoya/stories/${s.image}`),...Object.values(PAPER_ASSETS).map(p=>`public/${p}`),'public/xiaoya/stories/garden-paper-v1.webp',...['icon.svg','icon-192.png','icon-512.png'].map(p=>`public/xiaoya/icons/${p}`)];
const missingFiles=referenced.filter(p=>!fs.existsSync(path.join(root,p)));
const assets=[...intros,...objects,...primary,...alternate];
const report={auditDate:'2026-10-19',appVersion:'0.13.0',appBuild:'4ce4c9e7e34f',auditedRuntimeCommit:'743ab83',worktree:root,branch:execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim(),
  counts:{storyEvents:EVENTS.length,uniqueExpressions:new Set(EVENTS.map(e=>e.english)).size,corePaperKeyImages:STORIES.filter(s=>core.has(s.id)&&s.image?.includes('paper')).length,primaryWithoutGeneratedArt:primary.filter(s=>s.current==='procedural-svg').length,legacyPrimaryImages:primary.filter(s=>s.current!=='procedural-svg').length,vectorIntroFrames:intros.length,alternateContextSlots:alternate.length,objectAndIdentitySlots:objects.length,requirementEntries:assets.length,missingReferencedFiles:missingFiles.length},
  countNote:'Requirement entries are usage slots, not a promise of the same number of new image generations. Alternate request/resolved states may need two files; proven semantic reuse and icon derivation may need no new generation.',
  preserved:{paperObjects:PAPER_ASSETS,coreStories:STORIES.filter(s=>core.has(s.id)).map(s=>({id:s.id,image:s.image})),background:'public/xiaoya/stories/garden-paper-v1.webp',functionalVectors:['microphone','ear/sound','play','back','check','progress','watering target outline','touch rings','particles']},
  missingFiles,assets};
fs.writeFileSync(path.join(out,'asset-audit.json'),JSON.stringify(report,null,2)+'\n');
fs.mkdirSync(evidence,{recursive:true});
const esc=s=>String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const image=p=>`<img src="../../${p}" alt="${esc(p)}">`;
const card=(title,subtitle,body)=>`<article><h3>${esc(title)}</h3><p>${esc(subtitle)}</p><div class="art">${body}</div></article>`;
const primaryCards=primary.map(a=>{const s=STORIES.find(s=>s.id===a.eventId);return card(`${s.id} · ${s.event.english}`,`${a.reason} · ${s.event.request}`,s.image?image(a.current):storyFrame(s,s.cueFrame));}).join('');
const introCards=intros.map(a=>card(a.assetId,a.brief,storyFrame(STORIES.find(s=>s.id===a.eventId),a.frame))).join('');
const altCards=EVENTS.map(e=>card(`${e.id} · ${e.english}`,`${e.contexts[1].setup} ${e.contexts[1].request}`,`<div>${assessmentFrame(e,e.contexts[1],'request')}</div><div>${assessmentFrame(e,e.contexts[1],'resolved')}</div>`)).join('');
const objectCards=SPECIAL_FLOWERS.map(f=>card(f.id,f.name,meadowPlantArt(f,f.waterNeeded))).join('')+VOICES.map(v=>card(v.id,v.nickname,voicePortrait(v.id))).join('')+card('pot-front','盆体仍是矢量（纸艺植株已加载前为矢量回退）',plantArt(FLOWERS[0],2))+card('challenge-flag','矢量旗子',flagArt())+card('app-icon','旧平面安装图标',image('public/xiaoya/icons/icon-512.png'));
const html=`<!doctype html><meta charset="utf-8"><title>小芽英语 v0.13 美术缺口核查</title><style>body{font:15px system-ui;background:#f3efe4;color:#3b5043;padding:24px;margin:auto;max-width:1500px}section{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:18px}article{padding:16px;background:#fffdf6;border:1px solid #d8ddce;border-radius:14px}h3{font-size:16px}p{line-height:1.6}.art{display:flex;gap:4px;align-items:center}.art>*{min-width:0;flex:1}.art svg,.art img{display:block;width:100%;max-height:320px;object-fit:contain}</style><h1>v0.13 美术缺口</h1><p>来自实际源码的只读快照；矢量图用于指认现状，语义以 asset-audit.json 的文字和 context 为准，不能照搬旧图中的错位或不清楚表达。先后两帧表示当前 request / resolved，不强制每次重新生两张图。</p><h2>核心开场缺图</h2><section>${introCards}</section><h2>31 个主场景缺口</h2><section>${primaryCards}</section><h2>55 个可选生活情境位</h2><section>${altCards}</section><h2>花朵、头像及包装</h2><section>${objectCards}</section>`;
fs.writeFileSync(path.join(evidence,'current-art.html'),html);
console.log(JSON.stringify({...report.counts,manifest:path.join(out,'asset-audit.json'),contactSheet:path.join(evidence,'current-art.html')},null,2));
if(missingFiles.length)process.exitCode=1;
