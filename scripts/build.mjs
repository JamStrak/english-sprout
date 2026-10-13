import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {ANIMALS} from '../src/avatars.js';
import {serializeCurriculum} from '../src/startup.js';
const appVersion=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8')).version;
const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root,'dist');
// Only replace this project's generated dist directory.
if (path.dirname(dist) !== root || path.basename(dist) !== 'dist') throw new Error('Unsafe build target');
await fs.rm(dist,{recursive:true,force:true});
await fs.mkdir(dist,{recursive:true});
await fs.cp(path.join(root,'public'),dist,{recursive:true});
await fs.cp(path.join(root,'src'),path.join(dist,'src'),{recursive:true});
const template=await fs.readFile(path.join(root,'index.html'),'utf8');
if(!template.includes('<!-- APP_CURRICULUM -->'))throw new Error('Missing inline curriculum marker');
const course=serializeCurriculum(await fs.readFile(path.join(root,'public/data/curriculum.json'),'utf8'));
await fs.writeFile(path.join(dist,'index.html'),template.replace('<!-- APP_CURRICULUM -->',`<script id="curriculum-data" type="application/json">${course}</script>`));
await fs.writeFile(path.join(dist,'.nojekyll'),'');
const core=['./','./index.html','./src/app.js','./src/styles.css','./src/learning.js','./src/media.js','./src/voices.js','./src/illustrations.js','./src/garden.js','./data/curriculum.json','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/phone-qr.png','./illustrations/garden.svg'];
const hash=crypto.createHash('sha256');
core.push(...ANIMALS.map(animal=>animal.image));
core.push('./src/startup.js','./src/compat.js','./src/dialog.js','./src/dialog.css');
core.push('./src/child-feedback.js','./src/child-feedback.css');
core.push('./src/garden-canvas.js','./src/garden-world.css','./src/garden-world.js');
core.push('./src/garden-art.js','./src/garden-interaction.js','./src/garden-play.css','./src/speech-local.js','./src/speech-match.js','./src/speech-download.js');
core.push('./src/skins.js','./src/skin-picker.js','./src/skins.css');
core.push('./src/focus.css','./src/journey.js','./src/auto-update.js');
core.push('./src/interaction.css','./src/avatars.js','./src/avatars.css','./src/feedback.js','./src/feedback.css');
core.push('./src/voice-audition.js','./src/voice-audition.css','./data/character-voices.json','./audio/pip-manifest.json');
for (const f of core.slice(1)) hash.update(await fs.readFile(path.join(dist,f)));
let sw=await fs.readFile(path.join(root,'sw.template.js'),'utf8');
hash.update(sw);hash.update(appVersion);
const version=hash.digest('hex').slice(0,12);
// New releases never request the old worker's unversioned JS/CSS keys.
const release=`releases/${version}/src`;
await fs.mkdir(path.join(dist,release),{recursive:true});
await fs.cp(path.join(dist,'src'),path.join(dist,release),{recursive:true});
const index=(await fs.readFile(path.join(dist,'index.html'),'utf8'))
  .replace('__APP_BUILD__',version).replace('__APP_VERSION__',appVersion)
  .replace(/(?:href|src)="\.\/src\/([^"<>]+)"/g,match=>match.replace('./src/',`./${release}/`));
await fs.writeFile(path.join(dist,'index.html'),index);
const releasedCore=core.map(file=>file.startsWith('./src/')?file.replace('./src/',`./${release}/`):file);
const integrity={};
for(const file of releasedCore){
 const bytes=await fs.readFile(path.join(dist,file==='./'?'index.html':file));
 integrity[file]=crypto.createHash('sha256').update(bytes).digest('hex');
}
sw=sw.replace('__BUILD_ID__',version).replace('__CORE_FILES__',JSON.stringify(releasedCore))
 .replace('/*__CORE_INTEGRITY__*/{}',JSON.stringify(integrity)).replace('__APP_VERSION__',appVersion);
await fs.writeFile(path.join(dist,'sw.js'),sw);
await fs.writeFile(path.join(dist,'version.json'),JSON.stringify({version:appVersion,build:version}));
console.log('Built English Sprout '+appVersion+' · '+version);
