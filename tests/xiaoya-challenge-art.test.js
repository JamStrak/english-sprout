import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CHALLENGE_FLOWERS,CHALLENGE_FLOWER_BY_UNIT,CHALLENGE_GROWTH_ASSETS,getChallengeFlower} from '../xiaoya/challenge-flowers.js';
import {meadowPlantArt} from '../xiaoya/meadow-art.js';
import {PAPER_ASSETS} from '../xiaoya/paper-art.js';
import {MEADOW_HIT_SHAPES} from '../xiaoya/meadow-hit-shapes.js';
import {seedAppearance} from '../xiaoya/seed-appearance.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const attr=(html,name)=>html.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1];

test('each of the 21 challenges owns a distinct delivered flower and reusable seed colour',async()=>{
  assert.equal(CHALLENGE_FLOWERS.length,21);
  assert.equal(new Set(CHALLENGE_FLOWERS.map(f=>f.id)).size,21);
  assert.equal(new Set(Object.values(CHALLENGE_FLOWER_BY_UNIT)).size,21);
  assert.equal(Object.keys(CHALLENGE_GROWTH_ASSETS).length,105);
  for(let i=1;i<=21;i++){
    const flower=getChallengeFlower(`challenge-${i}`);
    assert.ok(flower);
    assert.equal(flower.id,CHALLENGE_FLOWER_BY_UNIT[`challenge-${i}`]);
    assert.deepEqual(flower.rootPivot,[.5,451/512]);
    assert.equal(seedAppearance(flower).colorTag,flower.seedColor);
    assert.deepEqual(flower.stages.map(stage=>stage.id),['sprout','young','bud','opening','mature']);
    for(const stage of flower.stages){
      const key=`growth-${flower.id}-${stage.id}`;
      assert.equal(PAPER_ASSETS[key],CHALLENGE_GROWTH_ASSETS[key]);
      assert.ok((await fs.stat(path.join(root,'public',PAPER_ASSETS[key]))).size>0);
      const hit=MEADOW_HIT_SHAPES[key];
      assert.ok(hit.path.length>40);
      assert.deepEqual([flower.width,flower.height],[384,512]);
      assert.ok(hit.bounds[1]<451);
    }
  }
  assert.equal(getChallengeFlower('challenge-22'),null);
});

test('every pour grows visible artwork around the same root, including ten-pour giants',()=>{
  for(const flower of CHALLENGE_FLOWERS){
    for(const waterNeeded of [1,5,10,15]){
      const giant=waterNeeded===10;
      let previousHeight=0;
      for(let waterings=0;waterings<=waterNeeded;waterings++){
        const html=meadowPlantArt({...flower,waterNeeded,giant,scale:giant?2.5:1},waterings);
        const height=Number(attr(html,'data-painted-height'));
        assert.ok(height>previousHeight,`${flower.id} ${waterings}/${waterNeeded} must grow`);
        previousHeight=height;
        assert.equal(attr(html,'data-bloom'),String(waterings===waterNeeded));
        assert.equal(attr(html,'data-scale'),giant?'2.5':'1');
        assert.equal(attr(html,'data-giant'),String(giant));
        const image=html.match(/<image\b[^>]*data-paper-image[^>]*>/)?.[0];
        const imageHeight=Number(attr(image,'height'));
        assert.ok(Math.abs(Number(attr(image,'width'))/imageHeight-.75)<.0002);
        assert.ok(Math.abs(Number(attr(image,'y'))+imageHeight*451/512-164)<.0001,'full canvas root stays at y=164');
        const key=attr(html,'data-paper-art');
        assert.ok(MEADOW_HIT_SHAPES[key]);
        assert.equal(attr(html,'data-stage'),waterings===0?'seed':waterings===waterNeeded?'mature':attr(html,'data-stage'));
        if(waterings>0)assert.ok(key.startsWith(`growth-${flower.id}-`));
      }
    }
  }
});

test('seed snapshots and GM direct overrides share identical geometry without reverting to static five-pour defaults',()=>{
  const flower=CHALLENGE_FLOWERS[0],growth={waterNeeded:10,giant:true,scale:2.5};
  for(let waterings=0;waterings<=10;waterings++){
    const snapshot=meadowPlantArt({flowerId:flower.id,growth},waterings);
    const preview=meadowPlantArt({...flower,...growth},waterings);
    assert.equal(snapshot,preview);
  }
  assert.equal(attr(meadowPlantArt({...flower,...growth},5),'data-bloom'),'false');
  assert.equal(attr(meadowPlantArt({...flower,...growth},10),'data-bloom'),'true');
});
