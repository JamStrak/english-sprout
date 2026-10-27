// Copy explicitly reviewed batches, verify their bytes, and rebuild the view-only
// story map. Originals and generation records stay in the asset laboratory.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const receiptPath = path.join(root, 'design/xiaoya-art-completion-20261019/accepted-assets.json');
const receipt = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
const stories = {};
const targets = new Map();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pending = [];
for (const asset of receipt.assets) {
  if (asset.review !== 'accepted') throw Error(`Asset not reviewed: ${asset.assetId}`);
  if (!/^xiaoya\/(?:stories|paper\/v2(?:\/flowers)?|icons)\/[a-z0-9-]+\.(?:webp|png)$/.test(asset.target)) throw Error(`Invalid target: ${asset.target}`);
  const target = path.join(root, 'public', asset.target);
  const previous = targets.get(target);
  if (previous && previous !== asset.sha256) throw Error(`Conflicting files: ${asset.target}`);
  targets.set(target, asset.sha256);
  const bytes = await fs.readFile(asset.source);
  if (bytes.length !== asset.bytes || hash(bytes) !== asset.sha256) throw Error(`Source changed: ${asset.assetId}`);
  pending.push({target, bytes});
  if (!asset.eventId) continue;
  const story = stories[asset.eventId] ||= {};
  const file = path.basename(asset.target);
  if (asset.role === 'primary') Object.assign(story, {image:file, imageLayout:'single'});
  else if (asset.role === 'intro') Object.assign(story, {introImage:file, introFrame:0});
  else if (asset.role === 'alternate-request' || asset.role === 'alternate-resolved') {
    (story.alternateImages ||= {})[asset.role.slice('alternate-'.length)] = file;
  } else throw Error(`Unknown story role: ${asset.role}`);
}
// Validate the entire batch before writing anything.
for (const {target, bytes} of pending) {
  await fs.mkdir(path.dirname(target), {recursive:true});
  await fs.writeFile(target, bytes);
}
const map = Object.fromEntries(Object.entries(stories).sort(([a], [b]) => a.localeCompare(b, 'en')));
const source = '// Generated from reviewed batches by scripts/integrate-xiaoya-art.mjs.\n'
  + '// View-only overrides: stable course IDs, learning evidence and rewards are unchanged.\n'
  + `export const STORY_ASSETS = Object.freeze(${JSON.stringify(map, null, 2)});\n`;
await fs.writeFile(path.join(root, 'xiaoya/story-assets.js'), source);
console.log(`Integrated ${receipt.assets.length} approved usage mappings, ${targets.size} files, ${Object.keys(stories).length} stories.`);
