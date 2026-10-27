import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {STORIES} from '../xiaoya/stories.js';
import {STORY_ASSETS} from '../xiaoya/story-assets.js';
import {PAPER_ASSETS} from '../xiaoya/paper-art.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const receipt=JSON.parse(fs.readFileSync(path.join(root,'design/xiaoya-art-completion-20261019/accepted-assets.json'),'utf8'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

test('every accepted artwork is the reviewed local runtime file, within its loading budget',()=>{
  const ids=new Set(), targets=new Map();
  for(const asset of receipt.assets){
    assert(!ids.has(asset.assetId),'Duplicate usage '+asset.assetId);ids.add(asset.assetId);
    assert.equal(asset.review,'accepted');assert(asset.reviewEvidence);
    assert.match(asset.target,/^xiaoya\/(?:stories|paper\/v2(?:\/flowers)?|icons)\/[a-z0-9-]+\.(?:webp|png)$/);
    const bytes=fs.readFileSync(path.join(root,'public',asset.target));
    assert.equal(bytes.length,asset.bytes,asset.assetId);assert.equal(digest(bytes),asset.sha256,asset.assetId);
    if(targets.has(asset.target))assert.equal(targets.get(asset.target),asset.sha256,'Shared picture must be byte-identical');
    targets.set(asset.target,asset.sha256);
    assert(bytes.length<=240_000,asset.assetId+' exceeds the per-picture runtime budget');
    if(asset.eventId){
      const story=STORIES.find(item=>item.id===asset.eventId);assert(story,asset.eventId);
      const mapped=asset.role==='primary'?story.image:asset.role==='intro'?story.introImage:story.alternateImages?.[asset.role.replace('alternate-','')];
      assert.equal(mapped,path.basename(asset.target),asset.assetId);
      assert.deepEqual(asset.dimensions,[980,700],asset.assetId);
    }
  }
});

test('story overrides are views only and reference accepted assets',()=>{
  const accepted=new Set(receipt.assets.filter(a=>a.eventId).map(a=>a.eventId+'/'+path.basename(a.target)));
  for(const [id,art] of Object.entries(STORY_ASSETS)){
    assert(STORIES.some(s=>s.id===id));
    for(const field of Object.keys(art))assert(['image','imageLayout','introImage','introFrame','alternateImages'].includes(field));
    for(const file of [art.image,art.introImage,...Object.values(art.alternateImages||{})].filter(Boolean))assert(accepted.has(id+'/'+file),id+'/'+file);
  }
});

test('a completed delivery covers every active and retained story without four-panel playback',{skip:receipt.status!=='complete'?'Artwork batches are still arriving':false},()=>{
  const audit=JSON.parse(fs.readFileSync(path.join(root,'design/xiaoya-art-completion-20261019/asset-audit.json'),'utf8'));
  const ids=new Set(receipt.assets.map(asset=>asset.assetId));
  for(const requirement of audit.assets){
    const requiredIds=requirement.assetId==='app-icon'?[48,192,512].map(size=>`app-icon-${size}`)
      :requirement.assetId.endsWith('-alternate')?['request','resolved'].map(phase=>`${requirement.assetId}-${phase}`)
      :[requirement.assetId];
    for(const id of requiredIds)assert(ids.has(id),'Missing audited usage: '+id);
  }
  const legacy=STORIES.filter(story=>story.event.audioPack!=='phrases-v015');
  assert.equal(legacy.length,55);
  for(const story of legacy){
    assert(story.image,story.id+' primary');assert.equal(story.imageLayout,'single',story.id);
    if(story.introFrame!=null)assert(story.introImage,story.id+' intro');
    for(const phase of ['request','resolved'])assert(story.alternateImages?.[phase],story.id+' '+phase);
  }
  for(const file of Object.values(PAPER_ASSETS))assert(fs.existsSync(path.join(root,'public',file)),file);
});
