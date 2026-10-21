import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const posix = value => value.replaceAll('\\', '/');
const unique = values => [...new Set(values)];
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));

/** Remove machine-specific paths and credentials, while retaining historical evidence. */
export function portableMetadata(value) {
  if (Array.isArray(value)) return value.map(portableMetadata);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) =>
    [key, /^(api[_-]?key|access[_-]?token|secret|password|authorization)$/i.test(key) ? '[redacted]' : portableMetadata(child)]));
  if (typeof value !== 'string') return value;
  if (/^[a-z]:[\\/]|^\\\\|^\/(?:Users|home|mnt|tmp)\//i.test(value)) {
    const normalized = posix(value).replace(/\/{2,}/g, '/');
    const marker = normalized.match(/(?:^|\/)(public|test-results|design|scripts|tools)\//);
    return marker ? normalized.slice(marker.index + (marker[0].startsWith('/') ? 1 : 0)) : `[local-path-redacted]/${path.posix.basename(normalized)}`;
  }
  // Some old receipts include a path inside explanatory text.
  return value.replace(/[A-Z]:[\\/][^\r\n"<>]+/gi, '[local-path-redacted]');
}

async function walk(directory) {
  const files = [];
  for (const item of await fs.readdir(directory, {withFileTypes:true})) {
    if (item.isSymbolicLink()) throw new Error(`Refusing symbolic link in asset inputs: ${item.name}`);
    const name = path.join(directory, item.name);
    if (item.isDirectory()) files.push(...await walk(name)); else files.push(name);
  }
  return files.sort();
}

export function manifestIntegrity(record, actual) {
  return {
    declaredSha256:record.sha256 || null,
    hashStatus:!record.sha256 ? 'unknown' : record.sha256 === actual.sha256 ? 'match' : 'mismatch',
    declaredBytes:record.bytes ?? null,
    bytesStatus:record.bytes == null ? 'unknown' : record.bytes === actual.bytes ? 'match' : 'mismatch',
  };
}

function publicFile(manifest, clip) {
  let file = posix(clip.file || clip.url || '');
  if (!file && clip.id) file = `${clip.id}.mp3`;
  if (file.startsWith('./')) file = file.slice(2);
  if (file.startsWith('public/')) return file;
  if (file.startsWith('audio/') || file.startsWith('xiaoya/')) return `public/${file}`;
  if (!file.includes('/')) return `${path.posix.dirname(manifest)}/${file}`;
  return null;
}

async function loadReceipts(root) {
  const files = [
    ...await walk(path.join(root, 'public/audio')),
    ...await walk(path.join(root, 'public/xiaoya/audio')),
    ...await walk(path.join(root, 'design')),
  ].filter(file => /(?:voice[-]?manifest|audio-manifest|pip-manifest|\/audio\/manifest)\.json$/i.test(posix(file)) || /\/audio\/[^/]*manifest\.json$/i.test(posix(file)));
  const records = new Map(), sharedMetadata = {};
  for (const file of files) {
    const relative = posix(path.relative(root, file));
    const data = await json(file);
    const {clips = [], ...metadata} = data;
    sharedMetadata[relative] = portableMetadata(metadata);
    for (const clip of clips) {
      const target = publicFile(relative, clip);
      if (!target) continue;
      const list = records.get(target) || [];
      list.push({manifest:relative, metadata:sharedMetadata[relative], clip:portableMetadata(clip)});
      records.set(target, list);
    }
  }
  return {records, sharedMetadata, files:files.map(file => posix(path.relative(root, file)))};
}

function normalizeText(text) { return text.toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}']/gu, ''); }
function itemId(url) { return `voice-${url.replace(/\.mp3$/i, '').replace(/[^a-z0-9_-]/g, '-').slice(0, 100)}-${hash(url).slice(0, 10)}`; }
function inferVoice(url, receipt) {
  const phraseVoice = url.match(/\/phrases-v015\/[^/]+\/(aiden|ryan|pip)\.mp3$/)?.[1];
  if (phraseVoice) return phraseVoice;
  const character = url.match(/\/characters\/([^/]+)\//)?.[1];
  if (character) return character;
  if (url.startsWith('audio/ryan/')) return 'ryan';
  if (/^audio\/[a-z]+-\d+\.mp3$/.test(url)) return 'aiden';
  return receipt?.clip.voice || receipt?.metadata.chineseVoice || receipt?.clip.voiceId || 'unknown';
}

// Inspect only voice(...) arguments, so unrelated action names on the same
// minified source line cannot falsely mark a historical recording as deployed.
function voiceArguments(source) {
  const results = [];
  for (const match of source.matchAll(/\bvoice\(/g)) {
    const start = match.index + match[0].length;
    let depth = 1, quote = null, escaped = false, end = start;
    for (; end < source.length; end++) {
      const character = source[end];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = null;
      } else if (['"', "'", '`'].includes(character)) quote = character;
      else if (character === '(') depth++;
      else if (character === ')' && --depth === 0) break;
    }
    results.push({argument:source.slice(start, end),line:source.slice(0, match.index).split('\n').length});
  }
  return results;
}

function runtimeGuides(source, welcomeIds, flowerIds) {
  const result = new Map();
  const add = (id, evidence) => result.set(id, unique([...(result.get(id) || []), evidence]));
  const lines = source.split(/\r?\n/);
  for (const {argument,line} of voiceArguments(source)) for (const match of argument.matchAll(/['"]((?:flow|challenge|economy|meadow|blindbox|garden)-[a-z0-9-]+)['"]/g)) add(match[1], `xiaoya/experience.js:${line}`);
  // rewardVoice stores its decision in cue before passing it to sound(voice(cue)).
  lines.forEach((line, i) => {
    if (/const cue=receipt===/.test(line)) for (const match of line.matchAll(/['"]((?:flow|economy)-[a-z0-9-]+)['"]/g)) add(match[1], `xiaoya/experience.js:${i + 1}`);
    for (const match of line.matchAll(/narrate\(['"]([a-z-]+)['"]/g)) add(`garden-${match[1]}`, `xiaoya/experience.js:${i + 1}`);
  });
  if (source.includes('narrate(`speech-${kind}`')) for (const kind of ['saved','silent','partial','retry','wait']) add(`garden-speech-${kind}`, 'xiaoya/experience.js#assessmentVoice/speechFeedback');
  if (source.includes('voice(dailyWelcomeId())')) for (const id of welcomeIds) add(id, 'xiaoya/welcome-greetings.js#WELCOME_GREETING_IDS/FIRST_GREETING');
  if (source.includes('`welcome-gift-${')) for (const kind of ['shell','water']) add(`welcome-gift-${kind}`, 'xiaoya/experience.js#welcomeVoice');
  if (source.includes('`blindbox-seed-${seed.flowerId}`')) for (const id of flowerIds) add(`blindbox-seed-${id}`, 'xiaoya/experience.js#blindboxVoice + xiaoya/garden-meadow.js#ALL_FLOWERS');
  return result;
}

function categoryFor(url, event, text) {
  if (event && !/hint\.mp3$|\/v3\//.test(url)) return 'english-demo';
  if (event || /\/hint\.mp3$/.test(url)) return 'chinese-context';
  if (/\/welcome-|\/welcome\.mp3$/.test(url)) return 'welcome';
  if (/\/challenge-/.test(url)) return 'challenge';
  if (/speech-|flow-pass|blindbox-seed-|welcome-gift-(shell|water)|(?:reward|bloom|clear|earned|well-done|complete)\.mp3/.test(url)) return 'reward-feedback';
  return /[\u3400-\u9fff]/.test(text) ? 'operation-guide' : 'english-demo';
}

/** Read only public production inputs and the current build. Never reads local user data. */
export async function collectXiaoyaVoiceReview({root=DEFAULT_ROOT, createdAt=new Date().toISOString()}={}) {
  root = path.resolve(root);
  const readModule = relative => import(pathToFileURL(path.join(root, relative)).href);
  const [{EVENTS}, {STORIES}, {VOICES, lessonAudio}, {CORE_PHRASE_EVENT_IDS, canonicalEventId}, welcome, meadow] = await Promise.all([
    readModule('xiaoya/content.js'), readModule('xiaoya/stories.js'), readModule('xiaoya/voices.js'),
    readModule('xiaoya/curriculum.js'), readModule('xiaoya/welcome-greetings.js'), readModule('xiaoya/garden-meadow.js'),
  ]);
  const version = await json(path.join(root, 'dist/xiaoya/version.json'));
  if (!/^[a-z0-9_-]+$/i.test(version.build)) throw new Error('Invalid current build ID');
  const packRelative = `dist/xiaoya/releases/${version.build}/audio-pack.json`;
  const pack = await json(path.join(root, packRelative));
  const {records, sharedMetadata, files:receiptFiles} = await loadReceipts(root);
  const legacy = await json(path.join(root, 'public/data/curriculum.json'));
  const candidates = await json(path.join(root, 'public/data/character-voices.json'));
  const prompts = await json(path.join(root, 'public/xiaoya/audio/prompts.json'));
  const promptById = new Map(prompts.prompts.map(prompt => [prompt.id, prompt]));
  const storyById = new Map(STORIES.map(story => [story.id, story]));
  const core = new Set(CORE_PHRASE_EVENT_IDS);
  const usage = new Map();
  const addUsage = (url, event, reference, context) => {
    url = url.replace(/^\.\//, '');
    const rows = usage.get(url) || [];
    rows.push({event, reference, context}); usage.set(url, rows);
  };
  for (const event of EVENTS) {
    for (const voice of VOICES) addUsage(lessonAudio(event, voice.id), event, `xiaoya/content.js#${event.id} + xiaoya/voices.js#lessonAudio`, event.contexts[0]);
    if (event.hintAudio) addUsage(event.hintAudio, event, `xiaoya/content.js#${event.id}.hintAudio + xiaoya/experience.js#teach`, event.contexts[0]);
    else for (const context of event.contexts) addUsage(`xiaoya/audio/v3/${context.id}.mp3`, event, `xiaoya/content.js#${event.id}.contexts/${context.id} + xiaoya/experience.js#teach`, context);
  }
  const guideUsage = runtimeGuides(await fs.readFile(path.join(root, 'xiaoya/experience.js'), 'utf8'),
    [welcome.FIRST_GREETING, ...welcome.WELCOME_GREETING_IDS].filter(Boolean), meadow.ALL_FLOWERS.map(flower => flower.id));
  const musicSource = await fs.readFile(path.join(root, 'xiaoya/garden-music.js'), 'utf8');
  const musicFiles = new Set([...musicSource.matchAll(/['"](xiaoya\/audio\/[^'"]+\.mp3)['"]/g)].map(match => match[1]));
  const copies = new Map(), items = [], coverage = [], excluded = [];
  const imageCache = new Map();
  async function imageFor(rows) {
    for (const {event, context} of rows) {
      const story = storyById.get(event.id);
      const alternate = context?.id !== event.contexts[0]?.id;
      const filename = alternate ? story?.alternateImages?.request : story?.image;
      if (!filename || !/^[a-z0-9._/-]+\.webp$/i.test(filename) || filename.includes('..')) continue;
      const relative = `dist/xiaoya/stories/${filename}`;
      if (!imageCache.has(relative)) {
        try { const bytes = await fs.readFile(path.join(root, relative)); const destination = `images/${hash(bytes)}.webp`; copies.set(destination, path.join(root, relative)); imageCache.set(relative, destination); }
        catch (error) { if (error.code !== 'ENOENT') throw error; imageCache.set(relative, null); }
      }
      if (imageCache.get(relative)) return imageCache.get(relative);
    }
    return undefined;
  }
  for (const entry of pack) {
    const url = new URL(entry.url, 'https://xiaoya.invalid/xiaoya/').pathname.slice(1);
    if (url.startsWith('xiaoya/sfx/') || musicFiles.has(url)) { excluded.push({url, reason:url.startsWith('xiaoya/sfx/') ? 'sfx' : 'bgm'}); continue; }
    if (!/^(?:audio\/|xiaoya\/audio\/)[a-z0-9_./-]+\.mp3$/i.test(url) || url.includes('..')) throw new Error(`Unsafe published audio URL: ${url}`);
    const source = `public/${url.replace('xiaoya/audio/v3/', 'xiaoya/audio/')}`;
    const actualFile = path.join(root, 'dist', url);
    const data = await fs.readFile(actualFile);
    const actual = {sha256:hash(data), bytes:data.length};
    const buildIntegrity = manifestIntegrity(entry, actual);
    if (buildIntegrity.hashStatus !== 'match' || buildIntegrity.bytesStatus !== 'match') throw new Error(`Published build integrity failed: ${url}. Rebuild before exporting.`);
    const receipts = (records.get(source) || []).map(record => ({...record, integrity:manifestIntegrity(record.clip, actual)}));
    const best = receipts.find(record => record.integrity.hashStatus === 'match') || receipts.at(-1);
    const name = path.posix.basename(url, '.mp3');
    const rows = (usage.get(url) || []).sort((a,b) => Number(core.has(b.event.id)) - Number(core.has(a.event.id)));
    const event = rows[0]?.event;
    const lessonId = event?.lessonId || (url.includes('/phrases-v015/') ? url.split('/').at(-2) : name);
    const oldLesson = legacy.lessons.find(lesson => lesson.id === lessonId);
    const prompt = source.startsWith('public/xiaoya/audio/') ? promptById.get(name) : null;
    const isChineseContext = !!event && /hint\.mp3$|\/v3\//.test(url);
    const text = best?.clip.text || prompt?.text || (isChineseContext ? '' : event?.english || oldLesson?.english) || '';
    const language = /[\u3400-\u9fff]/.test(text) ? 'zh-CN' : text ? 'en' : 'unknown';
    const voice = inferVoice(url, best);
    const refs = unique([...rows.map(row => row.reference), ...(url.startsWith('xiaoya/audio/v3/') ? guideUsage.get(name) || [] : [])]);
    const id = itemId(url);
    const groupId = `phrase-${language.toLowerCase()}-${hash(text ? normalizeText(text) : url).slice(0, 24)}`;
    const image = await imageFor(rows);
    const historicalChecks = receipts.flatMap(receipt => {
      const checks = {};
      for (const key of ['seconds','flags','word_coverage','contentCheck','metrics','content_check','validation']) if (receipt.clip[key] !== undefined) checks[key] = receipt.clip[key];
      return Object.keys(checks).length ? [{manifest:receipt.manifest, binding:receipt.integrity.hashStatus, checks}] : [];
    });
    const character = candidates.candidates.find(candidate => candidate.id === voice);
    const category = categoryFor(url, event, text);
    const context = rows.length ? unique(rows.map(({event, context}) => `${event.title}：${context?.setup || event.setup || ''} ${context?.request || event.request || ''}`.trim())).join('\n')
      : oldLesson?.scene || (refs.length ? `当前界面语音：${name}` : '随当前安装包保留；未发现小芽英语当前学习/引导流程引用');
    const file = `media/${actual.sha256}.mp3`;
    copies.set(file, actualFile);
    const sourceBytes = await fs.readFile(path.join(root, source));
    const sourceMatchesBuild = hash(sourceBytes) === actual.sha256;
    const generation = best ? {engine:best.clip.engine || best.clip.model || best.clip.provenance?.model || best.metadata.model || 'unknown',
      voice:best.clip.voice || best.metadata.sourceSpeaker || character?.sourceSpeaker || 'unknown',
      revision:best.clip.modelRevision || best.clip.revision || best.clip.provenance?.revision || best.metadata.modelRevision || 'unknown',
      source:best.clip.source || best.metadata.source || 'unknown'} : {engine:'unknown',voice:character?.sourceSpeaker || 'unknown',revision:'unknown',source:'unknown'};
    const provenance = {
      sourceFiles:[source], publishedUrls:[url], usage:refs.length ? 'runtime-referenced' : 'shipped-only',
      sourceMatchesBuild, generation,
      textEvidence:best ? `${best.manifest}#clips/${best.clip.id || best.clip.phraseId || lessonId}` : event ? `xiaoya/content.js#${event.id}` : oldLesson ? `public/data/curriculum.json#${lessonId}` : prompt ? `public/xiaoya/audio/prompts.json#${name}` : 'unknown',
      contexts:rows.map(({event,context}) => ({eventId:event.id,lessonId:event.lessonId,canonicalEventId:canonicalEventId(event.id),core:core.has(event.id),contextId:context?.id,english:event.english,chinese:event.chinese})),
      receipts:receipts.map(({metadata,...receipt}) => ({...receipt,metadataRef:receipt.manifest})),
      ...(character ? {legacyVoiceCandidate:portableMetadata(character)} : {}),
      missingHistory:receipts.length ? ['raw generation takes are not reconstructed by this export','historical subjective approval is not transferred'] : ['original generation receipt unknown','original engine/model/revision/seed unknown','historical subjective approval unknown'],
      redaction:'Machine-specific paths and credential fields are redacted. Original clip fields are retained; shared manifest headers resolve via source.receiptMetadata[metadataRef]. Historical review claims are source data, not current approval.',
    };
    items.push({id, groupId, title:text || name, category, text, translation:language === 'en' ? event?.chinese || oldLesson?.chinese || '' : '', context, voice, language,
      appRefs:refs, ...(image ? {image} : {}), versions:[{id:actual.sha256,file,...actual,
        ...(best?.metadata.createdAt ? {createdAt:best.metadata.createdAt} : {}), provenance,
        technical:{current:{sha256Computed:true,bytesComputed:true,buildManifest:buildIntegrity}, historicalChecks,
          note:'Historical signal/ASR checks are retained with hash binding. This export does not run a new decoder, ASR, or human listening review.'},
        review:{status:'pending',note:''}}], deployedVersion:refs.length ? actual.sha256 : null, preferredVersion:null});
    coverage.push({url,sourceFile:source,itemId:id,sha256:actual.sha256,usage:provenance.usage});
  }
  let commit = 'unknown';
  try { commit = execFileSync('git', ['rev-parse','HEAD'], {cwd:root,encoding:'utf8',windowsHide:true}).trim(); } catch {}
  let workingTreeDirty = null;
  try { workingTreeDirty = !!execFileSync('git', ['status','--porcelain','--untracked-files=no'], {cwd:root,encoding:'utf8',windowsHide:true}).trim(); } catch {}
  items.sort((a,b) => a.id.localeCompare(b.id));
  const manifest = {schemaVersion:1,id:'xiaoya-english',title:'小芽英语启蒙正式版',source:{createdAt,appVersion:version.version,commit,workingTreeDirty,
    build:version.build,channel:version.channel,buildManifest:packRelative,receiptManifests:receiptFiles,receiptMetadata:sharedMetadata,
    counts:{publishedAudio:pack.length,voiceFiles:coverage.length,items:items.length,uniqueAudioFiles:[...copies.keys()].filter(name => name.startsWith('media/')).length,
      images:[...copies.keys()].filter(name => name.startsWith('images/')).length,runtimeReferenced:items.filter(item => item.appRefs.length).length,shippedOnly:items.filter(item => !item.appRefs.length).length,
      unknownText:items.filter(item => !item.text).length,unknownReceipts:items.filter(item => !item.versions[0].provenance.receipts.length).length,
      receiptHashMismatches:items.reduce((n,item) => n + item.versions[0].provenance.receipts.filter(receipt => receipt.integrity.hashStatus === 'mismatch').length,0)},
    excluded,coverage,scope:'Current built voice assets only; no child recordings, learning data, credentials, BGM or SFX. Actual APP references are distinct from shipped-only history.'},items};
  return {manifest,copies};
}

/** Existing non-empty directories are never merged/overwritten. Output stays outside sources. */
export async function exportXiaoyaVoiceReview({root=DEFAULT_ROOT,out,createdAt}={}) {
  if (!out) throw new Error('Specify --out <new export directory>');
  root = path.resolve(root); out = path.resolve(out);
  const relative = path.relative(root, out);
  if (!relative || (!relative.startsWith('..') && ['public','dist','.git','xiaoya','src','scripts','tests','docs','design'].includes(relative.split(path.sep)[0]))) throw new Error('Export directory must not replace app sources/builds');
  try { const info=await fs.lstat(out); if(info.isSymbolicLink() || !info.isDirectory() || (await fs.readdir(out)).length) throw new Error('Export directory must be new or empty'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const {manifest,copies} = await collectXiaoyaVoiceReview({root,createdAt});
  await fs.mkdir(out,{recursive:true});
  await fs.mkdir(path.join(out,'media'));
  await fs.mkdir(path.join(out,'images'));
  for (const [destination,source] of copies) {
    if (!/^(media\/[a-f0-9]{64}\.mp3|images\/[a-f0-9]{64}\.webp)$/.test(destination)) throw new Error('Unsafe export filename');
    const bytes = await fs.readFile(source);
    if (hash(bytes) !== path.posix.basename(destination).split('.')[0]) throw new Error('Asset changed during export; use a new output directory and retry');
    await fs.writeFile(path.join(out,destination),bytes,{flag:'wx'});
  }
  await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  return {out,manifest};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--out') { console.error('Usage: node scripts/export-xiaoya-voice-review.mjs --out <new directory>'); process.exitCode=1; }
  else try { const {out,manifest}=await exportXiaoyaVoiceReview({out:args[1]}); console.log(JSON.stringify({out,...manifest.source.counts},null,2)); }
  catch (error) { console.error(error.message); process.exitCode=1; }
}
