import test from 'node:test';
import assert from 'node:assert/strict';
import {EVENTS} from '../xiaoya/content.js';
import {storyFrame,assessmentFrame} from '../xiaoya/story-art.js';

const newIds=['hello-everyone','family-love','hello-youre-welcome','hello-excuse','outside-go-home','outside-ready','family-come','food-eat','feelings-happy','feelings-tired','play-your-turn','play-can-do','play-good-job'];
const eventFor=id=>{const event=EVENTS.find(item=>item.id===id);assert.ok(event,`Missing phrase event ${id}`);return event;};
const frame=(id,index=1)=>storyFrame({event:eventFor(id)},index);
function geometry(svg){return svg.replace(/\s(?:data-[\w-]+|aria-hidden|focusable)="[^"]*"/g,'').replace(/\s+/g,' ');}
function painted(svg,name){
  const start=svg.indexOf(`<g data-cue="${name}">`);
  assert.ok(start>=0,`Missing meaning cue ${name}`);
  const groups=/<g\b[^>]*>|<\/g>/g;groups.lastIndex=start;
  let depth=0;
  for(let match;(match=groups.exec(svg));){
    depth+=match[0]==='</g>'?-1:1;
    if(depth===0){const group=svg.slice(start,groups.lastIndex);assert.match(group,/<(?:path|ellipse|rect)\b/,name+' contains painted geometry');return geometry(group);}
  }
  assert.fail('Unclosed cue '+name);
}

test('all 13 new expressions have authored word-free vectors and four changing frames',()=>{
  for(const id of newIds){
    const event=eventFor(id);assert.equal(event.illustration,'phrase');
    const frames=[0,1,2,3].map(index=>frame(id,index));
    assert.equal(new Set(frames.map(geometry)).size,4,id+' must change the actual drawing');
    for(const svg of frames){
      assert.match(svg,/^<svg[^>]*viewBox="0 0 400 300"/);
      assert.match(svg,new RegExp(`data-phrase="${id}"`));
      assert.doesNotMatch(svg,/<text\b|<image\b|<foreignObject\b|<script\b|\bon\w+=|NaN|Infinity|undefined|https?:\/\/(?!www\.w3\.org\/2000\/svg)/i,id);
      assert.doesNotMatch(svg,/data-action="neutral"|data-scene="unknown"/);
    }
  }
});

test('single meaning frames carry the referent, action and relationship without preceding frames',()=>{
  const expected={
    'hello-everyone':['greeting-group'],
    'family-love':['affection-toward-family','love-heart'],
    'hello-youre-welcome':['gift-already-received','giver-open-palm'],
    'hello-excuse':['friend-busy','gentle-attention-hand'],
    'outside-go-home':['destination-home','invite-homeward'],
    'outside-ready':['shoes-on-feet','backpack-worn','ready-at-exit'],
    'family-come':['inviting-here','waiting-friend'],
    'food-eat':['meal-for-two','meal-invitation'],
    'feelings-happy':['happy-face','happy-open-arms'],
    'feelings-tired':['yawning-face','resting-place'],
    'play-your-turn':['next-piece-offered','friend-next-turn'],
    'play-can-do':['unfinished-task','own-piece-ready'],
    'play-good-job':['friends-finished-work','praise-clapping'],
  };
  for(const [id,cues] of Object.entries(expected))for(const cue of cues)painted(frame(id),cue);
  assert.equal((frame('hello-everyone').match(/data-character=/g)||[]).length,3,'Everyone addresses two actual friends');
  assert.notEqual(painted(frame('play-can-do'),'unfinished-task'),painted(frame('play-good-job'),'friends-finished-work'));
  assert.doesNotMatch(frame('play-can-do'),/data-cue="puzzle-complete"/,'Can do is willingness before the task is finished');
  assert.doesNotMatch(frame('hello-youre-welcome'),/data-cue="gift-offered"/,'The recipient already has the gift');
});

test('transfer checks paint a different concrete setting or object and keep the expression unresolved',()=>{
  for(const id of newIds){
    const event=eventFor(id),first=assessmentFrame(event,event.contexts[0]),other=assessmentFrame(event,event.contexts[1]),resolved=assessmentFrame(event,event.contexts[1],'resolved');
    assert.match(other,/data-alternate="true"/);
    assert.notEqual(geometry(first),geometry(other),id+' transfer must change geometry');
    assert.notEqual(geometry(other),geometry(resolved),id+' response must change geometry');
    assert.match(other,/data-character="sprout"/);assert.match(other,/data-character="bear"/);
    assert.doesNotMatch(other,/<text\b|<image\b|undefined|NaN/);
  }
});

test('new expression key frames have distinct geometry, not just distinct metadata',()=>{
  assert.equal(new Set(newIds.map(id=>geometry(frame(id)))).size,newIds.length);
});

test('transfer objects follow the stated situation instead of only recolouring the room',()=>{
  const other=id=>{const event=eventFor(id);return assessmentFrame(event,event.contexts[1]);};
  assert.match(frame('hello-youre-welcome'),/data-prop="apple"/);
  assert.match(other('hello-youre-welcome'),/data-prop="crayon"/);
  assert.doesNotMatch(other('hello-youre-welcome'),/data-prop="apple"/);
  painted(other('hello-excuse'),'drawing-easel');
  painted(other('outside-go-home'),'activity-packed-away');
  assert.match(other('outside-go-home'),/data-prop="basket"/);
  assert.doesNotMatch(other('outside-go-home'),/data-prop="box"/);
  painted(other('outside-ready'),'rolled-picnic-mat');
  assert.equal((other('food-eat').match(/data-prop="bowl"/g)||[]).length,2);
  assert.match(other('food-eat'),/data-prop="basket"/);
  assert.match(other('feelings-tired'),/data-prop="shoe"/);
  assert.match(other('play-your-turn'),/data-prop="ball"/);
  assert.match(other('play-can-do'),/data-prop="shoe"/);
  assert.doesNotMatch(other('play-can-do'),/data-cue="puzzle-gap"/);
  assert.match(other('play-good-job'),/data-prop="picture"/);
  assert.doesNotMatch(other('play-good-job'),/data-cue="tower-3"/);
});

test('all 42 existing stories keep their four-frame rendering and legacy scene path',()=>{
  const original=EVENTS.filter(event=>!newIds.includes(event.id));assert.equal(original.length,42);
  for(const event of original)for(const index of [0,1,2,3]){
    const svg=storyFrame({event},index);
    assert.match(svg,new RegExp(`data-story="${event.id}"`));
    assert.doesNotMatch(svg,/data-phrase=|NaN|undefined|data-scene="unknown"/);
  }
});
