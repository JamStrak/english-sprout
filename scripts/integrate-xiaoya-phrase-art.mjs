// Originals stay in the laboratory. Only explicitly inspected WebP files enter the app.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(root,'design/xiaoya-phrases-v015');
const phrases=JSON.parse(await fs.readFile(path.join(directory,'phrases.json'),'utf8'));
const receipt=JSON.parse(await fs.readFile(path.join(directory,'accepted-assets.json'),'utf8'));
const allowed=new Set(phrases.map(phrase=>phrase.id)), seen=new Set(), hashes=new Set(), pending=[];
const map={};
for(const asset of receipt.assets){
  if(!allowed.has(asset.id)||seen.has(asset.id))throw Error(`Unknown or repeated phrase: ${asset.id}`);
  if(asset.review!=='accepted'||!asset.reviewEvidence)throw Error(`Picture needs inspection: ${asset.id}`);
  if(asset.target!==`xiaoya/stories/${asset.id}-paper-v015.webp`)throw Error(`Unexpected target: ${asset.target}`);
  if(asset.bytes>240_000||asset.bytes<1000||asset.dimensions?.join('x')!=='980x700')throw Error(`Picture outside runtime budget: ${asset.id}`);
  const bytes=await fs.readFile(asset.source),hash=createHash('sha256').update(bytes).digest('hex');
  if(bytes.length!==asset.bytes||hash!==asset.sha256)throw Error(`Source changed after review: ${asset.id}`);
  if(hashes.has(hash))throw Error(`Two expressions share one picture: ${asset.id}`);
  if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')throw Error(`Not WebP: ${asset.id}`);
  seen.add(asset.id);hashes.add(hash);
  pending.push({bytes,target:path.join(root,'public',asset.target)});
  map[asset.id]={image:path.basename(asset.target),imageLayout:'single'};
}
if(receipt.status==='complete'&&seen.size!==60)throw Error('Completed pack must contain all 60 inspected pictures');
// Validate the entire receipt before writing any runtime file.
for(const {bytes,target} of pending){await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}
const ordered=Object.fromEntries(Object.entries(map).sort(([a],[b])=>a.localeCompare(b,'en')));
await fs.writeFile(path.join(root,'xiaoya/phrase-assets-v015.js'),
  '// Generated from inspected batches by scripts/integrate-xiaoya-phrase-art.mjs.\n'
  +`export const PHRASE_ASSETS_V015 = Object.freeze(${JSON.stringify(ordered,null,2)});\n`);
console.log(`Integrated ${seen.size}/60 new single-scene pictures (${pending.reduce((sum,item)=>sum+item.bytes.length,0)} bytes).`);
