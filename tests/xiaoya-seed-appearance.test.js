import test from 'node:test';
import assert from 'node:assert/strict';
import {ALL_FLOWERS} from '../xiaoya/garden-meadow.js';
import {SEED_COLORS,FLOWER_SEED_COLORS,seedAppearance} from '../xiaoya/seed-appearance.js';
import {seedArt,seedArtForFlower,packArt} from '../xiaoya/garden-art.js';

test('every current flower keeps its identity and shares a small seed colour palette',()=>{
  assert.deepEqual(Object.keys(FLOWER_SEED_COLORS).sort(),ALL_FLOWERS.filter(f=>!f.seedColor).map(f=>f.id).sort(),
    'legacy IDs retain their colour mapping; new catalogue flowers carry explicit seedColor metadata');
  assert.equal(Object.keys(SEED_COLORS).length,7);
  const seen=new Set();
  for(const flower of ALL_FLOWERS) {
    const appearance=seedAppearance(flower);
    assert.equal(appearance.seedName,`${flower.name}种子`);
    assert.equal(appearance.color,SEED_COLORS[appearance.colorTag].color);
    assert.notEqual(appearance.colorTag,'natural');
    seen.add(appearance.colorTag);
  }
  assert.equal(seen.size,6);
  assert.equal(seedAppearance(ALL_FLOWERS.find(f=>f.id==='daisy')).colorTag,'white');
  assert.equal(seedAppearance(ALL_FLOWERS.find(f=>f.id==='giant-daisy')).colorTag,'white');
  assert.equal(seedAppearance(ALL_FLOWERS.find(f=>f.id==='bow-pink')).colorTag,'pink');
  assert.equal(seedAppearance(ALL_FLOWERS.find(f=>f.id==='bow-rainbow')).colorTag,'pink');
});

test('a new flower only needs a name and seedColor tag, and renaming changes its seed label',()=>{
  const flower={id:'future-flower',name:'小星星花',seedColor:'blue',color:'#ffffff'};
  assert.deepEqual(seedAppearance(flower),{colorTag:'blue',colorName:'蓝色',color:'#79afce',seedName:'小星星花种子'});
  assert.equal(seedAppearance({...flower,name:'蓝星花'}).seedName,'蓝星花种子');
  assert.equal(seedAppearance({...flower,id:'daisy'}).colorTag,'blue','explicit metadata overrides the compatibility mapping');
  assert.deepEqual(flower,{id:'future-flower',name:'小星星花',seedColor:'blue',color:'#ffffff'});
});

test('missing and invalid metadata have a safe, predictable natural seed fallback',()=>{
  assert.equal(seedAppearance({id:'unknown',name:'新花',seedColor:'unknown'}).colorTag,'natural');
  assert.equal(seedAppearance({id:'daisy',seedColor:'unknown'}).colorTag,'white');
  for(const flower of [null,{}, {id:'__proto__',seedColor:'constructor'}, {name:'  '}]) {
    assert.equal(seedAppearance(flower).colorTag,'natural');
    assert.equal(seedAppearance(flower).seedName,'小花种子');
  }
  assert.ok(Object.isFrozen(SEED_COLORS));
  assert.ok(Object.isFrozen(SEED_COLORS.pink));
  assert.ok(Object.isFrozen(FLOWER_SEED_COLORS));
});

test('coloured seeds tint the real shared paper image, preserve alpha, and never show old vector art',()=>{
  const matrices=new Set();
  for(const flower of ALL_FLOWERS) {
    const art=seedArtForFlower(flower);
    assert.match(art,new RegExp(`data-seed-color="${seedAppearance(flower).colorTag}"`));
    assert.match(art,/<g filter="url\(#seed-paper-tint-\d+\)"><g data-paper-art="seed"/);
    assert.match(art,/<image data-paper-image href="xiaoya\/paper\/v1\/seed.webp"/);
    assert.doesNotMatch(art,/<path|<script|href="https?:|onload=/);
    const values=art.match(/<feColorMatrix type="matrix" values="([^"]+)"/)[1].split(' ').map(Number);
    assert.equal(values.length,20);
    assert.deepEqual(values.slice(-5),[0,0,0,1,0]);
    assert.ok(values.every(Number.isFinite));
    matrices.add(values.join(' '));
  }
  assert.equal(matrices.size,6,'six actual colour transforms, not six labels on one brown picture');
});

test('each rendered tint has a unique local SVG ID and legacy seedArt stays compatible',()=>{
  const arts=Array.from({length:12},()=>seedArt('#d98'));
  const ids=arts.map(art=>art.match(/<filter id="([^"]+)"/)[1]);
  assert.equal(new Set(ids).size,ids.length);
  for(let i=0;i<arts.length;i++)assert.ok(arts[i].includes(`filter="url(#${ids[i]})"`));
  assert.equal(seedArt(),seedArt('#dfaa71'));
  for(const unsafe of ['red" onload="bad','url(https://example.test/x)','__proto__',null])assert.equal(seedArt(unsafe),seedArt());
  assert.match(seedArt(),/^<svg viewBox="0 0 160 180"/);
  assert.doesNotMatch(seedArt(),/<path/);
  assert.equal(packArt(),packArt(),'seed appearance never changes the unopened bag');
});
