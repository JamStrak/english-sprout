import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const XIAOYA_VERSION = '0.20.1';
export const XIAOYA_NAME = '小芽英语·自由花园版';
const MODULES = ['paper.css', 'paper-art.js', 'app.js', 'experience.js', 'practice-plan.js', 'feedback.js', 'feedback.css', 'stories.js', 'garden-meadow.js', 'meadow-art.js', 'meadow-ui.js', 'meadow.css', 'garden-art.js', 'voices.js', 'art.js', 'content.js', 'curriculum.js', 'learning.js', 'audio.js', 'speech-local.js', 'speech-worker.js', 'speech-assets.js', 'speech-signal.js', 'style.css'];
const SHARED = ['speech-match.js', 'speech-download.js'];
MODULES.push('blindbox-ui.js', 'seed-appearance.js', 'seed-shop.js', 'economy.css', 'meadow-hit-shapes.js', 'audio-pack.js', 'challenges.js', 'challenge-ui.js', 'challenge.css', 'story-assets.js', 'story-pictures.js');
MODULES.push('phrase-pack-v015.js', 'phrase-assets-v015.js');
MODULES.push('runtime.js', 'garden-history.js', 'welcome-greetings.js');
const INTERNAL_MODULES = ['gm.js', 'gm.css'];
const ICONS = ['icon-paper-v04-48.png', 'icon-paper-v04-192.png', 'icon-paper-v04-512.png'];
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

async function soundFiles(directory, prefix = '') {
  const entries = await fs.readdir(directory, {withFileTypes:true}).catch(error => {
    if (error.code === 'ENOENT') return []; throw error;
  });
  const files = [];
  for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name, 'en'))) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await soundFiles(path.join(directory, entry.name), `${name}/`));
    else if (entry.isFile() && entry.name.endsWith('.mp3')) files.push(name);
  }
  return files;
}

async function imageFiles(directory, prefix = '') {
  const entries = await fs.readdir(directory, {withFileTypes:true}).catch(error => {
    if (error.code === 'ENOENT') return []; throw error;
  });
  const files = [];
  for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name, 'en'))) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await imageFiles(path.join(directory, entry.name), `${name}/`));
    else if (entry.isFile() && /\.(png|jpe?g|webp|svg|gif|avif)$/i.test(entry.name)) files.push(name);
  }
  return files;
}

/** Public resource paths, never source paths or children's browser data. */
async function gmCatalog(root, audio) {
  const images = [];
  for (const relative of await imageFiles(path.join(root, 'public/xiaoya'))) {
    if (relative.endsWith('.svg')) continue;
    const bytes = await fs.readFile(path.join(root, 'public/xiaoya', relative));
    images.push({url:`xiaoya/${relative}`, bytes:bytes.length, category:relative.split('/')[0], name:path.posix.basename(relative), sha256:digest(bytes)});
  }
  return JSON.stringify({images, audio:audio.map(entry => {
    const url = new URL(entry.url, 'https://catalog.invalid/xiaoya/').pathname.slice(1);
    const voice = url.includes('/phrases-v015/') ? path.posix.basename(url, '.mp3')
      : url.startsWith('xiaoya/audio/') ? 'guide'
      : url.includes('/characters/pip/') ? 'pip' : url.includes('/ryan/') ? 'ryan' : 'aiden';
    return {...entry, url, name:path.posix.basename(url), category:voice};
  })});
}

/** Build approved static files; the GM workbench requires explicit internal=true. */
export async function buildXiaoya({root, dist = path.join(root, 'dist'), internal = false} = {}) {
  if (typeof internal !== 'boolean') throw new TypeError('internal must be an explicit boolean');
  const channel = internal ? 'internal' : 'public';
  const source = path.join(root, 'xiaoya');
  const template = await fs.readFile(path.join(source, 'index.html'), 'utf8');
  const swTemplate = await fs.readFile(path.join(source, 'sw.template.js'), 'utf8');
  const manifest = (await fs.readFile(path.join(source, 'manifest.webmanifest'), 'utf8')).replaceAll('__XIAOYA_VERSION__', XIAOYA_VERSION);
  const files = new Map();
  for (const name of [...MODULES, ...(internal ? INTERNAL_MODULES : [])]) {
    let text = await fs.readFile(path.join(source, name), 'utf8');
    if (name.endsWith('.js')) text = text.replace(/(['"])\.\.\/src\/(speech-(?:local|match|download)\.js)\1/g, '$1./shared/$2$1');
    files.set(name, text);
  }
  files.set('build-config.js', `// Generated build channel; URL parameters cannot change this.\nexport const INTERNAL_BUILD = ${internal};\nexport const BUILD_CHANNEL = '${channel}';\n`);
  if (internal) files.set('app.js', `${files.get('app.js')}\nimport './gm.js';\n`);
  for (const name of SHARED) files.set(`shared/${name}`, await fs.readFile(path.join(root, 'src', name), 'utf8'));
  const icons = new Map();
  for (const name of ICONS) icons.set(name, await fs.readFile(path.join(root, 'public/xiaoya/icons', name)));
  // Prepare every shipped voice, including all three English partners. Models
  // and artwork stay separate; this pack contains only public static MP3s.
  const audio = [];
  for (const [directory, url, recursive] of [['public/xiaoya/audio', './audio/v3/', false], ['public/audio', '../audio/', true], ['public/xiaoya/audio/phrases-v015', './audio/phrases-v015/', true]]) {
    for (const name of await soundFiles(path.join(root, directory))) {
      if (!recursive && name.includes('/')) continue;
      const bytes = await fs.readFile(path.join(root, directory, name));
      if (!bytes.length) throw new Error(`Empty built-in voice: ${name}`);
      audio.push({url:url + name, bytes:bytes.length, sha256:digest(bytes)});
    }
  }
  const audioManifest = JSON.stringify(audio);
  // Art is a required, complete offline pack. Do not include generator logs or
  // retired SVG fallbacks. Hash the actual bytes, including for public builds.
  const art = [], artwork = new Map();
  for (const directory of ['stories', 'paper']) {
    for (const name of await imageFiles(path.join(root, 'public/xiaoya', directory))) {
      if (!/\.(png|jpe?g|webp|gif|avif)$/i.test(name)) continue;
      const relative = `${directory}/${name}`;
      const bytes = await fs.readFile(path.join(root, 'public/xiaoya', relative));
      if (!bytes.length) throw new Error(`Empty built-in artwork: ${relative}`);
      artwork.set(relative, bytes);
      art.push({url:`./${relative}`, bytes:bytes.length, sha256:digest(bytes)});
    }
  }
  const artManifest = JSON.stringify(art), artVersion = digest(artManifest).slice(0, 16);
  if (internal) files.set('gm-catalog.json', await gmCatalog(root, audio));
  const hash = crypto.createHash('sha256').update(XIAOYA_VERSION).update(channel).update(template).update(swTemplate).update(manifest);
  hash.update(audioManifest).update(artManifest);
  for (const [name, bytes] of files) hash.update(name).update(bytes);
  for (const [name, bytes] of icons) hash.update(`icons/${name}`).update(bytes);
  const build = hash.digest('hex').slice(0, 12);
  const release = `releases/${build}`;
  const output = path.join(dist, 'xiaoya');
  await fs.mkdir(path.join(output, 'icons'), {recursive:true});
  for (const [name, bytes] of icons) await fs.writeFile(path.join(output, 'icons', name), bytes);
  // buildXiaoya also works independently of the legacy outer builder.
  for (const [name, bytes] of artwork) {
    const target = path.join(output, name);
    await fs.mkdir(path.dirname(target), {recursive:true});
    await fs.writeFile(target, bytes);
  }
  // A new pathname avoids stale Chinese bytes even while the parent product's
  // previous service worker still controls this tab. Keep legacy URLs for tabs
  // that have not reloaded. The worker verifies the separate complete voice pack.
  const publicAudio = path.join(root, 'public/xiaoya/audio');
  const voiceFiles = await fs.readdir(publicAudio).catch(error => {
    if (error.code === 'ENOENT') return []; throw error;
  });
  if (voiceFiles.length) {
    const voiceOutput = path.join(output, 'audio/v3');
    await fs.mkdir(voiceOutput, {recursive:true});
    for (const name of voiceFiles.filter(name => name.endsWith('.mp3'))) {
      await fs.copyFile(path.join(publicAudio, name), path.join(voiceOutput, name));
    }
  }
  // Copy only approved sound files; provenance and generator logs are not runtime assets.
  for (const name of await soundFiles(path.join(publicAudio, 'phrases-v015'))) {
    const target = path.join(output, 'audio/phrases-v015', name);
    await fs.mkdir(path.dirname(target), {recursive:true});
    await fs.copyFile(path.join(publicAudio, 'phrases-v015', name), target);
  }
  await fs.mkdir(path.join(output, release, 'shared'), {recursive:true});
  for (const [name, bytes] of files) await fs.writeFile(path.join(output, release, name), bytes);
  await fs.writeFile(path.join(output, release, 'audio-pack.json'), audioManifest);
  await fs.writeFile(path.join(output, release, 'art-pack.json'), artManifest);
  const html = template.replaceAll('__XIAOYA_BUILD__', build).replaceAll('__XIAOYA_VERSION__', XIAOYA_VERSION)
    .replaceAll('xiaoya/app.js', `xiaoya/${release}/app.js`).replaceAll('xiaoya/style.css', `xiaoya/${release}/style.css`).replaceAll('xiaoya/feedback.css', `xiaoya/${release}/feedback.css`).replaceAll('xiaoya/meadow.css', `xiaoya/${release}/meadow.css`).replaceAll('xiaoya/paper.css', `xiaoya/${release}/paper.css`);
  const page = html.replaceAll('xiaoya/economy.css', `xiaoya/${release}/economy.css`).replaceAll('xiaoya/challenge.css', `xiaoya/${release}/challenge.css`);
  await fs.writeFile(path.join(output, 'index.html'), page);
  // A distinct pathname bypasses already-installed workers that always serve
  // their old index for /xiaoya/, even when its query contains a new build ID.
  const startup = `start-${build}.html`;
  await fs.writeFile(path.join(output, startup), page);
  await fs.writeFile(path.join(output, 'manifest.webmanifest'), manifest);
  const core = ['./', './index.html', `./${startup}`, './manifest.webmanifest', `./${release}/audio-pack.json`, `./${release}/art-pack.json`, ...ICONS.map(name => `./icons/${name}`), ...Array.from(files.keys(), name => `./${release}/${name}`)];
  const integrity = {};
  for (const file of core) integrity[file] = digest(await fs.readFile(path.join(output, file === './' ? 'index.html' : file)));
  const sw = swTemplate.replaceAll('__XIAOYA_BUILD__', build).replace('__XIAOYA_CORE__', JSON.stringify(core))
    .replace('/*__XIAOYA_INTEGRITY__*/{}', JSON.stringify(integrity))
    .replace('/*__XIAOYA_AUDIO__*/[]', audioManifest)
    .replace('/*__XIAOYA_ART__*/[]', artManifest).replaceAll('__XIAOYA_ART_VERSION__', artVersion);
  await fs.writeFile(path.join(output, 'sw.js'), sw);
  await fs.writeFile(path.join(output, 'version.json'), JSON.stringify({name:XIAOYA_NAME, version:XIAOYA_VERSION, build, channel, garden:'free', audio:{count:audio.length, bytes:audio.reduce((sum,file) => sum + file.bytes, 0)}, art:{version:artVersion, count:art.length, bytes:art.reduce((sum,file) => sum + file.bytes, 0)}}));
  console.log(`Built ${XIAOYA_NAME} ${XIAOYA_VERSION} · ${build} · ${channel}`);
  return {name:XIAOYA_NAME, version:XIAOYA_VERSION, build, channel, core, artVersion};
}
