import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {GROWTH_FLOWERS,GROWTH_FLOWER_BY_ID,GROWTH_STAGE_NAMES} from '../xiaoya/growth-catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const assetRoot = path.join(root,'public/xiaoya/growth/v09');
const receipt = JSON.parse(fs.readFileSync(path.join(root,'design/xiaoya-growth-v09-source.json'),'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const expectedPivot = [0.5,0.880859375];
const sha = /^[a-f0-9]{64}$/;
const byTarget = new Map(receipt.assets.map(asset=>[asset.target,asset]));
const walk = directory => fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()
  ? walk(path.join(directory,entry.name)) : [path.join(directory,entry.name)]);

function losslessWebpInfo(bytes) {
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
  assert.equal(bytes.readUInt32LE(4)+8,bytes.length,'Complete RIFF file');
  for(let offset=12;offset+8<=bytes.length;){
    const tag = bytes.toString('ascii',offset,offset+4), length = bytes.readUInt32LE(offset+4);
    assert(offset+8+length<=bytes.length,'Complete WebP chunk');
    if(tag === 'VP8L'){
      assert.equal(bytes[offset+8],0x2f,'Lossless WebP signature');
      const bits = bytes.readUInt32LE(offset+9);
      return {width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1,alpha:Boolean((bits>>>28)&1)};
    }
    offset += 8+length+(length%2);
  }
  assert.fail('Expected lossless VP8L data');
}

test('v09 imports the pinned source manifest and PNG identities, while retaining visual-review status',()=>{
  assert.equal(receipt.source.manifestSHA256,'ecc5a7f0b616109fbd63996578b131b4b1768f9e96ed407441bc9ffaafe1bb0b');
  const sourceIndex = receipt.assets.map(asset=>[asset.source,asset.sourceSHA256]).sort(([a],[b])=>a.localeCompare(b,'en'));
  assert.equal(digest(JSON.stringify(sourceIndex)),'36b4ea1f35d62cc11a7b192909299113919e38091c7cd2957248f0e4f2070020');
  assert.equal(receipt.status,'technical-candidate-pending-visual-review');
  assert.equal(receipt.userApproved,false);
  assert(receipt.reviewLimitations.length>=4);
  assert.equal(receipt.conversion.lossless,true);
  assert.equal(receipt.conversion.exact,true);
  assert.equal(receipt.conversion.cropped,false);
  assert.equal(receipt.conversion.resized,false);
  assert.equal(receipt.conversion.fullCanvasPreserved,true);
  assert.equal(receipt.conversion.allDecodedRGBAPixelsIdentical,true);
  assert.doesNotMatch(JSON.stringify(receipt),/[A-Z]:[\\/]/,'No workstation-specific paths in source receipt');
});

test('50 flower identities have five ordered stages, shared seeds and a fixed full-canvas root anchor',()=>{
  assert.equal(GROWTH_FLOWERS.length,50);
  assert.equal(GROWTH_FLOWER_BY_ID.size,50);
  assert.deepEqual(GROWTH_STAGE_NAMES,['萌芽','幼株','花苞','初绽','盛放']);
  const urls=new Set(), seedIds=new Set();
  for(const flower of GROWTH_FLOWERS){
    assert.equal(GROWTH_FLOWER_BY_ID.get(flower.id),flower);
    assert.match(flower.id,/^[a-z0-9-]+$/);
    assert(flower.name && flower.familyId && flower.familyName && flower.colorTag);
    assert.deepEqual([flower.width,flower.height],[384,512]);
    assert.deepEqual(flower.rootPivot,expectedPivot);
    assert.deepEqual(flower.rootPivot.map((value,index)=>value*[flower.width,flower.height][index]),[192,451]);
    assert.equal(flower.stages.length,5);
    assert.deepEqual(flower.stages.map(stage=>stage.id),['sprout','young','bud','opening','mature']);
    assert.deepEqual(flower.stages.map(stage=>stage.name),GROWTH_STAGE_NAMES);
    seedIds.add(flower.seed.id);
    for(const item of [flower.seed,...flower.stages]){
      assert.match(item.src,/^\.\/growth\/v09\/(flowers\/[a-z0-9-]+\/[a-z0-9-]+|seeds\/[a-z0-9-]+)\.webp$/);
      const asset=byTarget.get(item.src.replace('./growth/v09/',''));
      assert(asset,item.src); urls.add(item.src);
      assert.equal(asset.kind,item===flower.seed?'seed':'flower');
      if(item===flower.seed) assert.equal(asset.id,flower.seed.id);
    }
  }
  // Some shared colors/shapes may not be assigned yet; all 18 stay in the reusable pack.
  assert(seedIds.size<=18 && seedIds.size>0);
  assert.equal([...urls].filter(src=>src.includes('/flowers/')).length,250);
  assert.equal(receipt.assets.filter(asset=>asset.kind==='seed').length,18);
});

test('268 lossless WebP resources preserve dimensions, alpha, pixels and delivery hashes',()=>{
  assert.equal(receipt.assets.length,268);
  assert.equal(byTarget.size,268);
  const files=walk(assetRoot);
  assert.equal(files.length,268,'No duplicate PNGs, source images or unexpected public files');
  let sourceBytes=0, runtimeBytes=0;
  for(const asset of receipt.assets){
    const bytes=fs.readFileSync(path.join(assetRoot,asset.target));
    const info=losslessWebpInfo(bytes);
    const dimensions=asset.kind==='flower'?[384,512]:[256,256];
    assert.deepEqual([info.width,info.height],dimensions,asset.id);
    assert.equal(info.alpha,true,asset.id+' encoded transparency');
    assert.deepEqual([asset.width,asset.height],dimensions);
    assert.deepEqual(asset.rootPivot,asset.kind==='flower'?expectedPivot:[0.5,0.5]);
    assert.equal(bytes.length,asset.bytes,asset.id);
    assert.equal(digest(bytes),asset.sha256,asset.id);
    for(const key of ['sourceSHA256','sha256','sourceRGBA256','decodedRGBA256','alphaSHA256']) assert.match(asset[key],sha);
    assert.equal(asset.sourceRGBA256,asset.decodedRGBA256,asset.id+' decoded full RGBA');
    assert.equal(asset.pixelExact,true);
    assert.deepEqual(asset.alphaRange,[0,255]);
    assert(asset.transparentPixels>0 && asset.opaquePixels>0 && asset.partialAlphaPixels>0);
    assert.equal(asset.transparentPixels+asset.partialAlphaPixels+asset.opaquePixels,asset.width*asset.height);
    const [left,top,right,bottom]=asset.visibleBounds;
    assert(left>0 && top>0 && right<asset.width && bottom<asset.height,asset.id+' retained alpha padding');
    sourceBytes+=asset.sourceBytes; runtimeBytes+=asset.bytes;
  }
  assert.equal(sourceBytes,receipt.sizes.sourcePNGBytes);
  assert.equal(runtimeBytes,receipt.sizes.runtimeWebPBytes);
  assert.equal(sourceBytes-runtimeBytes,receipt.sizes.savedBytes);
  assert(runtimeBytes<sourceBytes,'Lossless conversion reduces the pack');
});
