// Usage: node scripts/import-xiaoya-growth.mjs --source <v09-growth-complete> [--python python]
// Requires Pillow with WebP support only when importing. No image tool runs in the APP.
// Source PNGs, generator records and machine-specific paths are never published.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseArgs} from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {values} = parseArgs({options:{source:{type:'string'},python:{type:'string',default:'python'}}});
if (!values.source) throw Error('Pass --source <v09-growth-complete directory>.');
const sourceRoot = path.resolve(values.source);
const manifestBytes = await fs.readFile(path.join(sourceRoot, 'manifest.json'));
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const pivot = [0.5, 0.880859375];
const stageIds = ['sprout','young','bud','opening','mature'];
const stageNames = ['萌芽','幼株','花苞','初绽','盛放'];
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const assert = (condition,message) => { if (!condition) throw Error(message); };
assert(manifest.releaseId === 'v09-growth-complete', 'Expected the v09 growth release.');
assert(equal(manifest.stageNames,stageNames), 'Unexpected stage names.');
assert(equal(manifest.assetContract.canvas,[384,512]), 'Canvas contract changed.');
assert(equal(manifest.assetContract.rootPivot,pivot), 'Root pivot changed.');
assert(equal(manifest.assetContract.rootPixels,[192,451]), 'Root pixel contract changed.');
assert(manifest.flowers.length === 50 && manifest.seeds.length === 18, 'Incomplete release.');

const jobs = [], targets = new Set(), sources = new Set(), flowerIds = new Set();
const targetFor = relative => relative.replace(/^assets\//,'').replace(/\.png$/,'.webp');
const addAsset = (asset,kind,id) => {
  assert(/^assets\/(flowers\/[a-z0-9-]+\/[a-z0-9-]+|seeds\/[a-z0-9-]+)\.png$/.test(asset.path), 'Unsafe source path.');
  assert(/^[a-f0-9]{64}$/.test(asset.sha256), 'Missing source SHA-256.');
  const dimensions = kind === 'flower' ? [384,512] : [256,256];
  const rootPivot = kind === 'flower' ? pivot : [0.5,0.5];
  assert(equal([asset.width,asset.height],dimensions) && asset.mode === 'RGBA', 'Incorrect canvas or mode.');
  assert(equal(asset.pivot,rootPivot), 'Incorrect pivot.');
  const target = targetFor(asset.path);
  assert(!targets.has(target) && !sources.has(asset.path), 'Duplicate asset.');
  targets.add(target); sources.add(asset.path);
  jobs.push({id,kind,source:asset.path,sourceSHA256:asset.sha256,target,width:asset.width,height:asset.height,rootPivot});
};
const seeds = new Map(manifest.seeds.map(seed => [seed.id,seed]));
assert(seeds.size === 18, 'Duplicate seed IDs.');
for (const seed of seeds.values()) addAsset(seed,'seed',seed.id);
const flowers = manifest.flowers.map(flower => {
  assert(/^[a-z0-9-]+$/.test(flower.speciesId) && !flowerIds.has(flower.speciesId), 'Invalid/duplicate flower ID.');
  flowerIds.add(flower.speciesId);
  assert(flower.stages.length === 5, 'Every flower needs exactly five stages.');
  const seed = seeds.get(flower.seed.id);
  assert(seed && seed.path === flower.seed.path && seed.colorTag === flower.seed.colorTag, 'Seed mapping mismatch.');
  const stages = flower.stages.map((stage,index) => {
    assert(stage.id === stageIds[index] && stage.name === stageNames[index] && stage.index === index, `Incorrect stage order: ${flower.speciesId}.`);
    addAsset(stage,'flower',`${flower.speciesId}/${stage.id}`);
    return {id:stage.id,name:stage.name,src:`./growth/v09/${targetFor(stage.path)}`};
  });
  return {id:flower.speciesId,name:flower.name,familyId:flower.familyId,familyName:flower.familyName,colorTag:seed.colorTag,
    seed:{id:seed.id,src:`./growth/v09/${targetFor(seed.path)}`},stages,rootPivot:pivot,width:384,height:512};
});
assert(jobs.length === 268, 'Expected 268 unique assets.');

// Decode source and output and compare all RGBA bytes, including invisible RGB.
// There is deliberately no crop, rescale, tint, alpha threshold or palette conversion.
const python = String.raw`
import sys, json, hashlib, io
from pathlib import Path
from PIL import Image, features, __version__
data = json.load(sys.stdin)
assert features.check('webp'), 'Pillow needs WebP support'
source_root, target_root = Path(data['sourceRoot']), Path(data['targetRoot'])
pending = []
for job in data['jobs']:
    source = (source_root / job['source']).read_bytes()
    assert hashlib.sha256(source).hexdigest() == job['sourceSHA256'], 'Source hash mismatch: ' + job['source']
    with Image.open(io.BytesIO(source)) as loaded:
        loaded.load()
        assert loaded.mode == 'RGBA' and loaded.size == (job['width'],job['height']), 'Canvas changed: ' + job['source']
        image = loaded.copy()
    alpha = image.getchannel('A')
    histogram = alpha.histogram()
    assert alpha.getextrema() == (0,255), 'Transparency missing: ' + job['source']
    bounds = alpha.getbbox()
    assert bounds and bounds[0] > 0 and bounds[1] > 0 and bounds[2] < image.width and bounds[3] < image.height, 'Visible edge clipping: ' + job['source']
    output = io.BytesIO()
    image.save(output, format='WEBP', lossless=True, exact=True, method=6)
    encoded = output.getvalue()
    with Image.open(io.BytesIO(encoded)) as decoded:
        decoded.load()
        rgba = decoded.convert('RGBA')
        assert rgba.size == image.size and rgba.tobytes() == image.tobytes(), 'Lossless decode mismatch: ' + job['source']
    pixels_hash = hashlib.sha256(image.tobytes()).hexdigest()
    record = dict(job, sourceBytes=len(source), bytes=len(encoded), sha256=hashlib.sha256(encoded).hexdigest(),
        sourceRGBA256=pixels_hash, decodedRGBA256=hashlib.sha256(rgba.tobytes()).hexdigest(),
        alphaSHA256=hashlib.sha256(alpha.tobytes()).hexdigest(), alphaRange=[0,255],
        transparentPixels=histogram[0], partialAlphaPixels=sum(histogram[1:255]), opaquePixels=histogram[255],
        visibleBounds=list(bounds), pixelExact=True)
    pending.append((job['target'],encoded,record))
# Only write after the complete source batch and decoded outputs validate.
for relative,encoded,record in pending:
    destination = target_root / relative
    destination.parent.mkdir(parents=True,exist_ok=True)
    destination.write_bytes(encoded)
print(json.dumps({'pillowVersion':__version__,'libwebpVersion':features.version('webp'),'assets':[row[2] for row in pending]}))
`;
const result = spawnSync(values.python,['-c',python],{
  input:JSON.stringify({sourceRoot,targetRoot:path.join(root,'public/xiaoya/growth/v09'),jobs}),
  encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true,
});
if (result.error) throw result.error;
if (result.status !== 0) throw Error(result.stderr || 'Image verification/conversion failed.');
const converted = JSON.parse(result.stdout);
const sourceBytes = converted.assets.reduce((sum,asset)=>sum+asset.sourceBytes,0);
const outputBytes = converted.assets.reduce((sum,asset)=>sum+asset.bytes,0);
const receipt = {
  schema:'xiaoya-growth-import/v1',releaseId:manifest.releaseId,status:'technical-candidate-pending-visual-review',userApproved:false,
  source:{laboratoryRelative:manifest.labRelative,manifestSHA256:sha256(manifestBytes),manifestStatus:manifest.status,
    contract:{canvas:[384,512],rootPivot:pivot,rootPixels:[192,451],seedCanvas:[256,256],seedIsGrowthStage:false}},
  conversion:{format:'lossless WebP',lossless:true,exact:true,method:6,pillowVersion:converted.pillowVersion,libwebpVersion:converted.libwebpVersion,
    cropped:false,resized:false,fullCanvasPreserved:true,allDecodedRGBAPixelsIdentical:true},
  counts:{flowers:50,stages:250,seeds:18,uniqueAssets:268},
  sizes:{sourcePNGBytes:sourceBytes,runtimeWebPBytes:outputBytes,savedBytes:sourceBytes-outputBytes,savedPercent:Number(((1-outputBytes/sourceBytes)*100).toFixed(2))},
  reviewLimitations:[
    'Technical integrity and lossless conversion are not final visual acceptance.',
    'Comet-tail stars, cloud petals and boomerang leaves differ from their design descriptions.',
    'The little-key opening looks embossed rather than reliably hollow.',
    'Tea-cup nest, story-book and wind-chime opening/bloom stages are close; verify at 72–108px game size.',
  ],
  assets:converted.assets,
};
const catalog = '// Generated by scripts/import-xiaoya-growth.mjs from v09-growth-complete.\n'
  + '// Technical candidate: user visual acceptance is pending. Full canvas and root pivot must be preserved.\n'
  + `export const GROWTH_STAGE_NAMES = Object.freeze(${JSON.stringify(stageNames)});\n`
  + `export const GROWTH_FLOWERS = Object.freeze(${JSON.stringify(flowers,null,2)});\n`
  + 'export const GROWTH_FLOWER_BY_ID = new Map(GROWTH_FLOWERS.map(flower => [flower.id, flower]));\n';
await fs.mkdir(path.join(root,'design'),{recursive:true});
await fs.writeFile(path.join(root,'xiaoya/growth-catalog.js'),catalog);
await fs.writeFile(path.join(root,'design/xiaoya-growth-v09-source.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(`Verified 268 assets; PNG ${sourceBytes} bytes → lossless WebP ${outputBytes} bytes (${receipt.sizes.savedPercent}% smaller). Visual acceptance remains pending.`);
