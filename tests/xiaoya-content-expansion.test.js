import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {EVENTS,ITEMS} from '../xiaoya/content.js';
import {STORIES,storyFor} from '../xiaoya/stories.js';
import {storyFrame,assessmentFrame} from '../xiaoya/story-art.js';

const read = path => fs.readFileSync(new URL('../'+path,import.meta.url));
const curriculum=JSON.parse(read('public/data/curriculum.json'));
const additions=EVENTS.filter(event=>event.illustration==='comic');
const original=['hello-morning','hello-welcome','hello-goodbye','food-water','food-more','food-no-thanks','play-box','play-ball','play-bridge','care-hands','care-zip','care-socks','outside-cat','outside-bird','outside-dog','bed-book','bed-story','bed-night'];

test('55 scenes preserve all legacy event IDs and add core expressions',()=>{
  assert.equal(STORIES.length,55);
  assert.equal(additions.length,24);
  assert.deepEqual(EVENTS.slice(0,18).map(event=>event.id),original);
  assert.equal(new Set(STORIES.map(story=>story.id)).size,55);
  assert.equal(new Set(EVENTS.map(event=>event.lessonId)).size,53);
  assert.equal(new Set(ITEMS.map(item=>item.id)).size,55);
  for(const story of STORIES){
    assert.equal(storyFor(story.id),story);
    assert.equal(story.frames.length,4);
    assert.ok(story.frames.every(frame=>typeof frame==='string'&&frame.length>5),story.id);
    assert.ok(Object.isFrozen(story));
    assert.ok(story.cueFrame>0&&story.cueFrame<4,'Show the situation before its spoken phrase');
    assert.equal(story.vector.action,story.id);
  }
});

test('legacy comic files remain available while teaching uses reviewed single scenes',()=>{
  for(const [id,image] of [['food-water','water-v1.webp'],['play-box','help-v1.webp']]){
    assert.ok(read('public/xiaoya/stories/'+image).length>1000);
    assert.notEqual(storyFor(id).image,image,'Replace the old four-panel teaching sheet');
    assert.equal(storyFor(id).imageLayout,'single');
    assert.ok(read('public/xiaoya/stories/'+storyFor(id).image).length>1000);
  }
  assert.ok(read('public/xiaoya/stories/goodbye-v2.webp').length>1000,'Keep old asset for already open legacy tabs');
  assert.equal(storyFor('hello-goodbye').image,'hello-goodbye-paper-v1.webp');
  assert.equal(storyFor('hello-goodbye').cueFrame,2,'Preserve familiar cue and source frame semantics');
  assert.ok(STORIES.filter(story=>story.image).length>=3);
  for(const story of STORIES.filter(story=>!story.image))assert.ok(storyFrame(story,0).startsWith('<svg'));
});

test('every expanded phrase exactly matches a recorded curriculum line in all three voices',()=>{
  for(const event of EVENTS){
    const lesson=curriculum.lessons.find(lesson=>lesson.id===event.lessonId);
    assert.ok(lesson,event.id);
    assert.equal(event.english,lesson.english,event.id);
    assert.equal(event.chinese,lesson.chinese,event.id);
    for(const voicePath of ['', 'ryan/', 'characters/pip/']){
      assert.ok(read('public/audio/'+voicePath+lesson.id+'.mp3').length>1000,event.id+' '+voicePath);
    }
  }
});

test('all source storyboard frames render locally without text, invalid geometry or network assets',()=>{
  for(const story of STORIES){
    const frames=story.frames.map((_,frame)=>storyFrame(story,frame));
    for(const [index,svg] of frames.entries()){
      assert.match(svg,new RegExp('data-story="'+story.id+'"'));
      assert.match(svg,new RegExp('data-frame="'+index+'"'));
      assert.doesNotMatch(svg,/<text\b|<foreignObject|<image|\bNaN\b|\bundefined\b|https?:\/\/(?!www\.w3\.org)/i,story.id);
      assert.match(svg,/viewBox="0 0 400 300"/);
    }
    // Ignore frame metadata, so four identical drawings cannot satisfy this test.
    const pictures=frames.map(svg=>svg.replace(/data-frame="\d"/g,'').replace(/paper-grain-\d+/g,'paper-grain'));
    if(story.event.illustration!=='phrase')assert.equal(new Set(pictures).size,4,story.id+' legacy source frames remain available');
    assert.ok(story.teachingFrames.length>=1&&story.teachingFrames.length<=2);
    assert.equal(story.teachingFrames.at(-1),story.cueFrame);
  }
});

test('new contexts change the situation and retain a problem to solve before assessment',()=>{
  for(const event of additions){
    assert.notEqual(event.contexts[0].settingId,event.contexts[1].settingId);
    assert.notEqual(event.contexts[0].help,event.contexts[1].help);
    const local=assessmentFrame(event,event.contexts[0]);
    const elsewhere=assessmentFrame(event,event.contexts[1]);
    const solved=assessmentFrame(event,event.contexts[1],'resolved');
    assert.match(elsewhere,/data-alternate="true"/);
    assert.match(local,/data-alternate="false"/);
    assert.notEqual(local,elsewhere,event.id);
    assert.notEqual(elsewhere,solved,event.id);
    assert.match(elsewhere,/data-character="sprout"/);
    assert.match(elsewhere,/data-character="bear"/);
    assert.doesNotMatch(elsewhere,/<text\b|<foreignObject/i);
  }
});

test('key phrases show their physical meaning through a distinct action and result',()=>{
  const has=(id,frame,cue)=>assert.match(storyFrame(storyFor(id),frame),new RegExp('data-cue="'+cue+'"'),id+' '+frame);
  has('food-spoon',0,'spoon-out-of-reach');has('food-spoon',2,'spoon-passed');
  has('food-milk',0,'empty-cup');has('food-milk',2,'milk-pouring');has('food-milk',3,'milk-in-cup');
  has('food-hot',0,'hot-steam');has('food-hot',3,'cooled');
  has('care-teeth',0,'toothbrush-ready');has('care-teeth',2,'brushing-teeth');has('care-teeth',3,'teeth-clean');
  has('care-face',0,'dirty-faces');has('care-face',3,'faces-clean');
  has('care-dry',0,'wet-hands');has('care-dry',3,'hands-dry');
  has('care-shoes',0,'shoes-on-floor');has('care-shoes',3,'shoes-worn');
  has('care-tissue',0,'runny-nose');has('care-tissue',2,'tissue-wiping');has('care-tissue',3,'tissue-in-bin');
  has('play-roll',2,'ball-on-ground');has('play-roll',2,'ground-motion');
  has('play-catch',2,'ball-in-air');has('play-catch',2,'throw-arc');has('play-catch',3,'ball-caught');
  has('play-again',0,'fallen-blocks');has('play-again',3,'tower-4');
  has('play-tidy',0,'toy-outside-box');has('play-tidy',2,'toy-moving-to-box');has('play-tidy',3,'toy-in-box');
  has('outside-hand',1,'hand-invitation');has('outside-hand',3,'hands-joined');
  has('bed-hug',2,'hug-invitation');has('bed-hug',3,'hug-together');
});

test('all 48 new Chinese help clips have exact prompts, verified bytes and speech coverage',()=>{
  const manifest=JSON.parse(read('public/xiaoya/audio/expansion-voice-manifest.json'));
  const contexts=additions.flatMap(event=>event.contexts);
  assert.equal(manifest.clips.length,48);
  assert.equal(new Set(manifest.clips.map(clip=>clip.id)).size,48);
  assert.deepEqual(manifest.clips.map(clip=>clip.id).sort(),contexts.map(context=>context.id).sort());
  for(const clip of manifest.clips){
    const context=contexts.find(context=>context.id===clip.id);
    const bytes=read('public/xiaoya/audio/'+clip.file);
    assert.equal(clip.text,context.help+'听我说。');
    assert.equal(clip.file,clip.id+'.mp3');
    assert.equal(clip.voice,'zh-CN-XiaoxiaoNeural');
    assert.equal(clip.bytes,bytes.length);
    assert.equal(clip.sha256,createHash('sha256').update(bytes).digest('hex'));
    assert.deepEqual(clip.flags,[]);
    assert.equal(clip.word_coverage.matches_prompt,true);
    assert.ok(clip.seconds>2&&clip.seconds<12,clip.id);
  }
  assert.ok(manifest.clips.reduce((bytes,clip)=>bytes+clip.bytes,0)<2*1024*1024,'Expanded spoken help remains below 2 MiB');
});
