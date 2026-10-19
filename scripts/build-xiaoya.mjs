import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const XIAOYA_VERSION = '0.12.6';
const MODULES = ['paper.css', 'paper-art.js', 'app.js', 'experience.js', 'practice-plan.js', 'feedback.js', 'feedback.css', 'stories.js', 'story-art.js', 'garden-meadow.js', 'meadow-art.js', 'meadow-ui.js', 'meadow.css', 'garden.js', 'garden-art.js', 'voices.js', 'art.js', 'content.js', 'curriculum.js', 'learning.js', 'audio.js', 'speech-local.js', 'speech-worker.js', 'speech-assets.js', 'speech-signal.js', 'style.css'];
const SHARED = ['speech-match.js', 'speech-download.js'];
MODULES.push('seed-shop.js', 'economy.css', 'meadow-hit-shapes.js', 'audio-pack.js');
const ICONS = ['icon.svg', 'icon-192.png', 'icon-512.png'];
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

/** Add only public Xiaoya files to an already-built dist. */
export async function buildXiaoya({root, dist = path.join(root, 'dist')} = {}) {
  const source = path.join(root, 'xiaoya');
  const template = await fs.readFile(path.join(source, 'index.html'), 'utf8');
  const swTemplate = await fs.readFile(path.join(source, 'sw.template.js'), 'utf8');
  const manifest = await fs.readFile(path.join(source, 'manifest.webmanifest'), 'utf8');
  const files = new Map();
  for (const name of MODULES) {
    let text = await fs.readFile(path.join(source, name), 'utf8');
    if (name.endsWith('.js')) text = text.replace(/(['"])\.\.\/src\/(speech-(?:local|match|download)\.js)\1/g, '$1./shared/$2$1');
    files.set(name, text);
  }
  for (const name of SHARED) files.set(`shared/${name}`, await fs.readFile(path.join(root, 'src', name), 'utf8'));
  const icons = new Map();
  for (const name of ICONS) icons.set(name, await fs.readFile(path.join(root, 'public/xiaoya/icons', name)));
  // Prepare every shipped voice, including all three English partners. Models
  // and artwork stay separate; this pack contains only public static MP3s.
  const audio = [];
  for (const [directory, url, recursive] of [['public/xiaoya/audio', './audio/v3/', false], ['public/audio', '../audio/', true]]) {
    for (const name of await soundFiles(path.join(root, directory))) {
      if (!recursive && name.includes('/')) continue;
      const bytes = await fs.readFile(path.join(root, directory, name));
      if (!bytes.length) throw new Error(`Empty built-in voice: ${name}`);
      audio.push({url:url + name, bytes:bytes.length, sha256:digest(bytes)});
    }
  }
  const audioManifest = JSON.stringify(audio);
  const hash = crypto.createHash('sha256').update(XIAOYA_VERSION).update(template).update(swTemplate).update(manifest);
  hash.update(audioManifest);
  for (const [name, bytes] of files) hash.update(name).update(bytes);
  for (const [name, bytes] of icons) hash.update(`icons/${name}`).update(bytes);
  const build = hash.digest('hex').slice(0, 12);
  const release = `releases/${build}`;
  const output = path.join(dist, 'xiaoya');
  await fs.mkdir(path.join(output, 'icons'), {recursive:true});
  for (const [name, bytes] of icons) await fs.writeFile(path.join(output, 'icons', name), bytes);
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
  await fs.mkdir(path.join(output, release, 'shared'), {recursive:true});
  for (const [name, bytes] of files) await fs.writeFile(path.join(output, release, name), bytes);
  await fs.writeFile(path.join(output, release, 'audio-pack.json'), audioManifest);
  const html = template.replaceAll('__XIAOYA_BUILD__', build).replaceAll('__XIAOYA_VERSION__', XIAOYA_VERSION)
    .replaceAll('xiaoya/app.js', `xiaoya/${release}/app.js`).replaceAll('xiaoya/style.css', `xiaoya/${release}/style.css`).replaceAll('xiaoya/feedback.css', `xiaoya/${release}/feedback.css`).replaceAll('xiaoya/meadow.css', `xiaoya/${release}/meadow.css`).replaceAll('xiaoya/paper.css', `xiaoya/${release}/paper.css`);
  await fs.writeFile(path.join(output, 'index.html'), html.replaceAll('xiaoya/economy.css', `xiaoya/${release}/economy.css`));
  await fs.writeFile(path.join(output, 'manifest.webmanifest'), manifest);
  const core = ['./', './index.html', './manifest.webmanifest', `./${release}/audio-pack.json`, ...ICONS.map(name => `./icons/${name}`), ...Array.from(files.keys(), name => `./${release}/${name}`)];
  const integrity = {};
  for (const file of core) integrity[file] = digest(await fs.readFile(path.join(output, file === './' ? 'index.html' : file)));
  const sw = swTemplate.replaceAll('__XIAOYA_BUILD__', build).replace('__XIAOYA_CORE__', JSON.stringify(core))
    .replace('/*__XIAOYA_INTEGRITY__*/{}', JSON.stringify(integrity))
    .replace('/*__XIAOYA_AUDIO__*/[]', audioManifest);
  await fs.writeFile(path.join(output, 'sw.js'), sw);
  await fs.writeFile(path.join(output, 'version.json'), JSON.stringify({version:XIAOYA_VERSION, build, audio:{count:audio.length, bytes:audio.reduce((sum,file) => sum + file.bytes, 0)}}));
  console.log(`Built 小芽英语 ${XIAOYA_VERSION} · ${build}`);
  return {version:XIAOYA_VERSION, build, core};
}
