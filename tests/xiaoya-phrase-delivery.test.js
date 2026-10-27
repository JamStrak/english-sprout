import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {PHRASE_PACK_V015} from '../xiaoya/phrase-pack-v015.js';
import {PHRASE_ASSETS_V015} from '../xiaoya/phrase-assets-v015.js';
import {storyFor} from '../xiaoya/stories.js';
import {storyFrame,assessmentFrame} from '../xiaoya/story-art.js';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url));
const receipt=JSON.parse(read('design/xiaoya-phrases-v015/accepted-assets.json'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('all 60 expressions have individually inspected, unique, compact teaching pictures',()=>{
  assert.equal(receipt.status,'complete','Unfinished art must not pass release verification');
  assert.equal(receipt.assets.length,60);
  assert.deepEqual(Object.keys(PHRASE_ASSETS_V015).sort(),PHRASE_PACK_V015.map(p=>p.id).sort());
  const ids=new Set(), hashes=new Set();
  for(const asset of receipt.assets){
    assert(!ids.has(asset.id),asset.id);ids.add(asset.id);
    assert.equal(asset.review,'accepted');assert(asset.reviewEvidence);
    assert.equal(asset.target,`xiaoya/stories/${asset.id}-paper-v015.webp`);
    const bytes=read('public/'+asset.target);
    assert.equal(bytes.length,asset.bytes);assert.equal(hash(bytes),asset.sha256);
    assert(!hashes.has(asset.sha256),'Do not disguise the same image as a new expression');hashes.add(asset.sha256);
    assert(bytes.length>1000&&bytes.length<=240_000,asset.id);
    assert.deepEqual(asset.dimensions,[980,700]);
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
    const story=storyFor(asset.id);assert.equal(story.id,asset.id);
    assert.equal(story.image,`${asset.id}-paper-v015.webp`);assert.equal(story.imageLayout,'single');
    assert.equal(story.teachingFrames.length,1);
    assert.equal(story.alternateImages,undefined,'No unproduced alternative context');
  }
});

test('new phrases use a neutral local loading image, never another lesson as their meaning',()=>{
  for(const phrase of PHRASE_PACK_V015){
    const story=storyFor(phrase.id),svg=storyFrame(story,story.cueFrame);
    assert.match(svg,/data-picture-placeholder="true"/);
    assert.match(svg,/data-character="sprout"/);
    assert.doesNotMatch(svg,/<text\b|<image\b|water-drops|spoon|bowl|\bNaN\b|\bundefined\b/);
    assert.equal(svg,assessmentFrame(story.event,story.event.contexts[0]));
  }
});
