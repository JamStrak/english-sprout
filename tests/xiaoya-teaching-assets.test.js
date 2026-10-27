import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';

const ROOT=new URL('../',import.meta.url);
const DESIGN='design/xiaoya-teaching-v011/';
const read=path=>readFileSync(new URL(path,ROOT));
const json=path=>JSON.parse(read(path).toString('utf8').replace(/^\uFEFF/,''));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=json(`${DESIGN}art-manifest.json`);
const source=json(`${DESIGN}source-manifest.json`);
const generation=json(`${DESIGN}generation-record.json`);
const correction=json(`${DESIGN}correction-manifest.json`);
const KEYS=[
  'hello-everyone','hello-morning','hello-youre-welcome','hello-sorry','hello-okay',
  'hello-goodbye','bed-night','hello-welcome','hello-excuse','outside-ready',
  'family-come','food-eat','food-hungry','feelings-happy','feelings-tired',
  'play-turn','play-your-turn','play-can-do','play-did-it','play-good-job','play-again',
];
const SOURCE_HASHES={
  'source-manifest.json':'6e1468b346acd582018f5f9072a1e662bcbd6627af0ab833f32c8c9bb288e6c8',
  'generation-record.json':'78dfbb7d5f7df68acd238349fb6b4f15b28ce156ba9b546e89eedf07d02e1665',
  'prepare_teaching.py':'5ec3ae47c007952f5c298adf95f5f6f7efe098d1e8a1995cc1538201c11436c0',
  'correction-manifest.json':'2c44aed60f2f60a6737d06bc8266535b037e3a2e27bc86d15cc9a453e8be2aed',
  'prepare_correction.py':'4ff9d305424f0ac16d7c4727741731aff1c073fb20688be58867246ad5330ed0',
};
// These are released v0.9 bytes, independently pinned rather than derived from
// the new manifest, so replacing both an old image and its new record still fails.
const RETAINED=[
  ['family-love','love-paper-v1.webp',79834,'ba69eb21dbf2974198ade05ce224d4c5bd7aa6c062b5ad863596c8722a999b4b'],
  ['hello-thanks','thanks-paper-v1.webp',77800,'19c6d71ee77c9116d53e29f93aa68cfe7f626b04f2a3cd8616431f4640ccbe63'],
  ['outside-go-home','home-paper-v1.webp',119270,'b4bdf70c6f02f4711702ac1a797393742b2462529d600c177b5616ff97506fae'],
];

function opaqueStillWebpSize(bytes) {
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.readUInt32LE(4)+8,bytes.length,'complete RIFF payload');
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
  let offset=12,size;
  while(offset<bytes.length) {
    assert.ok(offset+8<=bytes.length,'complete WebP chunk header');
    const name=bytes.toString('ascii',offset,offset+4),length=bytes.readUInt32LE(offset+4);
    const payload=offset+8,end=payload+length;
    assert.ok(end<=bytes.length,'complete WebP chunk');
    assert.ok(!['ANIM','ANMF','ALPH'].includes(name),'opaque single-frame teaching card');
    if(name==='VP8 ') {
      assert.equal(size,undefined,'one encoded image');
      assert.ok(length>=10);
      assert.equal(bytes[payload]&1,0,'VP8 keyframe');
      assert.equal(bytes.subarray(payload+3,payload+6).toString('hex'),'9d012a');
      size=[bytes.readUInt16LE(payload+6)&0x3fff,bytes.readUInt16LE(payload+8)&0x3fff];
    }
    if(name==='VP8X')assert.equal(bytes[payload]&0x12,0,'no transparency or animation flag');
    offset=end+(length&1);
  }
  assert.equal(offset,bytes.length);
  assert.ok(size,'delivered lossy WebP image payload');
  return size;
}

test('teaching batch selects 20 original cards plus one correction, retaining immutable sources',()=>{
  assert.equal(manifest.batch,'v03-teaching');
  assert.equal(manifest.study_id,'610f2d54d7e6');
  assert.equal(manifest.total_runtime_bytes,1516062);
  assert.equal(source.total_runtime_bytes,1508902);
  assert.deepEqual(manifest.assets.map(a=>a.key),KEYS);
  assert.deepEqual(source.assets.map(a=>a.key),KEYS);
  assert.equal(new Set(manifest.assets.map(a=>a.runtime)).size,21);
  assert.equal(manifest.assets.reduce((n,a)=>n+a.bytes,0),1516062);
  assert.deepEqual(manifest.assets.filter(a=>a.corrected).map(a=>a.key),['hello-youre-welcome']);
  assert.equal(manifest.corrections.length,1);
  assert.equal(manifest.corrections[0].batch,correction.batch);
  assert.equal(manifest.corrections[0].source_manifest,'correction-manifest.json');
  for(const [file,hash] of Object.entries(SOURCE_HASHES)) {
    assert.equal(sha(read(`${DESIGN}${file}`)),hash,file);
    assert.equal(manifest.source_records.find(record=>record.file===file)?.sha256,hash);
  }
});

for(const key of KEYS)test(`teaching card ${key}: released hash, dimensions and source semantics`,()=>{
  const asset=manifest.assets.find(a=>a.key===key),original=source.assets.find(a=>a.key===key);
  const corrected=key==='hello-youre-welcome',delivered=corrected?correction:original;
  const expectedPath=`public/xiaoya/stories/${key}-paper-v${corrected?2:1}.webp`;
  assert.equal(asset.runtime,expectedPath);
  assert.equal(asset.source_runtime,delivered.runtime);
  if(corrected) {
    for(const field of ['key','meaning','width','height','bytes','sha256','opaque_background','processing','original','original_sha256'])assert.deepEqual(asset[field],correction[field],field);
    assert.equal(asset.source_manifest,'correction-manifest.json');
    assert.equal(asset.source_batch,'v03a-teaching-correction');
    assert.equal(asset.corrected,true);
    assert.deepEqual(asset.supersedes,{runtime:'public/xiaoya/stories/hello-youre-welcome-paper-v1.webp',sha256:original.sha256,source_manifest:'source-manifest.json',published:false});
    assert.equal(correction.sha256,'ed816cbe1c7e4e3b9e446d847b29b609b9ced68c422eb7d9a78b006c9ce70e7f');
    assert.equal(correction.bytes,73476);
    assert.equal(correction.reference,'../v03-teaching/cards/hello-youre-welcome-paper-v1.png');
  } else {
    const {runtime,source_runtime,...metadata}=asset;
    assert.deepEqual(metadata,(({runtime,...rest})=>rest)(original),'all original meaning/crop/hash metadata retained');
    assert.ok(generation.sheets.find(sheet=>sheet.index===asset.source_sheet)?.keys.includes(key));
    assert.ok(source.sources.some(sheet=>sheet.index===asset.source_sheet));
  }
  const bytes=read(expectedPath);
  assert.equal(bytes.length,delivered.bytes);
  assert.equal(sha(bytes),delivered.sha256);
  assert.deepEqual(opaqueStillWebpSize(bytes),[980,700]);
  assert.equal(asset.opaque_background,true);
});

test('existing love, thanks and go-home teaching cards keep their released bytes',()=>{
  assert.deepEqual(manifest.retained,RETAINED.map(([event,file,bytes,sha256])=>({event,runtime:`public/xiaoya/stories/${file}`,bytes,sha256})));
  for(const [,file,length,hash] of RETAINED) {
    const bytes=read(`public/xiaoya/stories/${file}`);
    assert.equal(bytes.length,length,file);
    assert.equal(sha(bytes),hash,file);
    assert.deepEqual(opaqueStillWebpSize(bytes),[1400,1000]);
  }
});

test('v0.10 garden paper assets remain byte-identical to their existing delivery manifest',()=>{
  const paper=json('design/xiaoya-paper-v010/art-manifest.json');
  assert.equal(paper.assets.length,21);
  assert.equal(paper.total_bytes,758286);
  let total=0;
  for(const asset of paper.assets) {
    assert.match(asset.repository_path,/^public\/xiaoya\/paper\/v1\/(?:flowers\/)?[a-z-]+\.webp$/);
    const bytes=read(asset.repository_path);
    assert.equal(bytes.length,asset.bytes,asset.id);
    assert.equal(sha(bytes),asset.sha256,asset.id);
    total+=bytes.length;
  }
  assert.equal(total,758286);
  const oldGarden=read('public/xiaoya/stories/garden-paper-v1.webp');
  assert.equal(sha(oldGarden),'3482b8a0fa438f41ccd7f8918dfd5447132970aead2c436440d3352d7ea774cf');
});

test('repository provenance is text-only and no teaching masters were published',()=>{
  assert.deepEqual(readdirSync(new URL(DESIGN,ROOT)).sort(),[
    'ART_DIRECTION.md','art-manifest.json','correction-manifest.json','generation-record.json','prepare_correction.py','prepare_teaching.py','source-manifest.json',
  ].sort());
  const publicFiles=readdirSync(new URL('public/xiaoya/stories/',ROOT));
  for(const key of KEYS)assert.deepEqual(publicFiles.filter(file=>file.startsWith(`${key}-paper-`)),[`${key}-paper-v${key==='hello-youre-welcome'?2:1}.webp`]);
  assert.ok(!publicFiles.some(file=>/\.(?:png|psd|py|json)$/i.test(file)),'no master sheets or provenance in public teaching resources');
  assert.deepEqual(source.assets.filter(a=>a.multi_frame_in_app).map(a=>a.key),['hello-sorry','hello-okay','play-again']);
});
