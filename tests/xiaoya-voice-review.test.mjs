import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {
  collectXiaoyaVoiceReview, exportXiaoyaVoiceReview, manifestIntegrity, portableMetadata,
} from '../scripts/export-xiaoya-voice-review.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const createdAt = '2026-10-21T00:00:00.000Z';
const collected = await collectXiaoyaVoiceReview({root, createdAt});
const {manifest, copies} = collected;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const urlOf = item => item.versions[0].provenance.publishedUrls[0];
const itemAt = url => manifest.items.find(item => urlOf(item) === url);

test('all shipped voice files are covered, while BGM and SFX are explicitly excluded', async () => {
  const pack = JSON.parse(await fs.readFile(path.join(root, manifest.source.buildManifest), 'utf8'));
  const published = pack.map(entry => new URL(entry.url, 'https://xiaoya.invalid/xiaoya/').pathname.slice(1));
  const excluded = manifest.source.excluded.map(entry => entry.url);
  const voiceUrls = manifest.items.map(urlOf);
  assert.equal(new Set(voiceUrls).size, voiceUrls.length);
  assert.deepEqual([...voiceUrls, ...excluded].sort(), published.sort());
  assert.equal(manifest.source.counts.voiceFiles, voiceUrls.length);
  assert.equal(manifest.source.counts.publishedAudio, pack.length);
  assert.ok(excluded.includes('xiaoya/audio/v3/garden-piano.mp3'));
  assert.ok(manifest.source.excluded.some(entry => entry.reason === 'sfx'));
  assert.ok(manifest.items.every(item => !urlOf(item).includes('/sfx/')));
  assert.equal(manifest.source.counts.unknownText, 0);
});

test('current bytes and hashes are independently checked and export media is deduplicated', async () => {
  const hashes = new Set();
  for (const item of manifest.items) {
    const version = item.versions[0];
    const bytes = await fs.readFile(copies.get(version.file));
    assert.equal(version.sha256, hash(bytes));
    assert.equal(version.id, version.sha256);
    assert.equal(version.bytes, bytes.length);
    assert.equal(version.technical.current.buildManifest.hashStatus, 'match');
    assert.equal(version.technical.current.buildManifest.bytesStatus, 'match');
    hashes.add(version.sha256);
  }
  assert.equal(manifest.source.counts.uniqueAudioFiles, hashes.size);
  assert.ok(hashes.size < manifest.items.length, 'identical packaged recordings should share exported bytes');
});

test('three current example voices share phrase grouping, Chinese meaning, and the actual scene image', async () => {
  const examples = ['aiden', 'ryan', 'pip'].map(voice => itemAt(`xiaoya/audio/phrases-v015/daily-after-you/${voice}.mp3`));
  assert.ok(examples.every(Boolean));
  assert.equal(new Set(examples.map(item => item.groupId)).size, 1);
  assert.equal(new Set(examples.map(item => item.image)).size, 1);
  for (const [index, item] of examples.entries()) {
    assert.equal(item.voice, ['aiden', 'ryan', 'pip'][index]);
    assert.equal(item.text, 'After you.');
    assert.equal(item.translation, '你先请。');
    assert.equal(item.category, 'english-demo');
    assert.match(item.image, /^images\/[a-f0-9]{64}\.webp$/);
    assert.ok(item.appRefs.some(ref => ref.includes('daily-after-you')));
  }
  const image = await fs.readFile(copies.get(examples[0].image));
  assert.equal(image.toString('ascii', 0, 4), 'RIFF');
  assert.equal(image.toString('ascii', 8, 12), 'WEBP');
  assert.equal(path.basename(examples[0].image, '.webp'), hash(image));
  const hint = itemAt('xiaoya/audio/phrases-v015/daily-after-you/hint.mp3');
  assert.equal(hint.category, 'chinese-context');
  assert.equal(hint.voice, 'zh-CN-XiaoxiaoNeural');
  assert.equal(hint.image, examples[0].image);
  assert.notEqual(hint.groupId, examples[0].groupId);
});

test('runtime references include dynamic guidance but not similarly named button actions', () => {
  for (const name of ['garden-speech-partial', 'garden-speech-saved', 'welcome-hello-01', 'blindbox-seed-daisy']) {
    const item = itemAt(`xiaoya/audio/v3/${name}.mp3`);
    assert.ok(item?.appRefs.length, name);
    assert.equal(item.versions[0].provenance.usage, 'runtime-referenced');
  }
  const unused = itemAt('xiaoya/audio/v3/challenge-practice.mp3');
  assert.equal(unused.appRefs.length, 0);
  assert.equal(unused.deployedVersion, null);
  assert.equal(unused.versions[0].provenance.usage, 'shipped-only');
});

test('missing generation history is explicit and does not invent unknown receipts or approval', () => {
  const missing = manifest.items.filter(item => !item.versions[0].provenance.receipts.length);
  assert.equal(missing.length, manifest.source.counts.unknownReceipts);
  assert.ok(missing.length > 0);
  for (const item of missing) {
    const provenance = item.versions[0].provenance;
    assert.match(urlOf(item), /^audio\/characters\/(lulu|milo|pogo)\//);
    assert.equal(provenance.generation.engine, 'unknown');
    assert.equal(provenance.generation.revision, 'unknown');
    assert.equal(provenance.generation.source, 'unknown');
    assert.ok(provenance.missingHistory.includes('original generation receipt unknown'));
    assert.match(provenance.textEvidence, /^public\/data\/curriculum\.json#/);
    assert.ok(item.text.length > 0);
    assert.equal(item.appRefs.length, 0);
  }
});

test('all human reviews remain pending and only evidenced APP usage receives a deployed version', () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.id, 'xiaoya-english');
  assert.equal(manifest.source.createdAt, createdAt);
  assert.equal(new Set(manifest.items.map(item => item.id)).size, manifest.items.length);
  for (const item of manifest.items) {
    assert.match(item.id, /^[a-z0-9_-]{1,128}$/);
    assert.equal(item.preferredVersion, null);
    assert.equal(item.deployedVersion, item.appRefs.length ? item.versions[0].sha256 : null);
    for (const version of item.versions) {
      assert.deepEqual(version.review, {status:'pending',note:''});
      for (const check of version.technical.historicalChecks) assert.ok(['match','mismatch','unknown'].includes(check.binding));
    }
  }
});

test('receipt mismatch and missing hashes are not mislabeled as verification', () => {
  const actual = {sha256:'a'.repeat(64),bytes:100};
  assert.deepEqual(manifestIntegrity({sha256:'b'.repeat(64),bytes:101}, actual), {
    declaredSha256:'b'.repeat(64),hashStatus:'mismatch',declaredBytes:101,bytesStatus:'mismatch',
  });
  assert.deepEqual(manifestIntegrity({}, actual), {
    declaredSha256:null,hashStatus:'unknown',declaredBytes:null,bytesStatus:'unknown',
  });
});

test('portable receipts retain source metadata while removing local paths and credentials', () => {
  const original = {sourceFile:'C:\\Users\\Jam\\old-app\\public\\audio\\hello.mp3',
    temporary:'E:/scratch/private/raw.wav',apiKey:'secret-value',nested:{authorization:'Bearer private',seed:73}};
  assert.deepEqual(portableMetadata(original), {
    sourceFile:'public/audio/hello.mp3',temporary:'[local-path-redacted]/raw.wav',apiKey:'[redacted]',
    nested:{authorization:'[redacted]',seed:73},
  });
  assert.equal(original.apiKey, 'secret-value');
  const exported = JSON.stringify(manifest);
  assert.doesNotMatch(exported, /[A-Z]:[\\/]/i);
  assert.doesNotMatch(exported, /C:\\\\Users|E:\\\\AI/);
  const richReceipt = itemAt('xiaoya/audio/phrases-v015/daily-after-you/aiden.mp3').versions[0].provenance.receipts[0];
  assert.ok(richReceipt.clip.provenance, 'original generation provenance must be preserved');
  assert.equal(richReceipt.integrity.hashStatus, 'match');
  assert.equal(richReceipt.metadataRef, richReceipt.manifest);
  assert.ok(manifest.source.receiptMetadata[richReceipt.metadataRef].voiceMapping, 'shared original receipt headers must remain complete');
  for (const item of manifest.items) for (const receipt of item.versions[0].provenance.receipts) {
    assert.ok(manifest.source.receiptMetadata[receipt.metadataRef]);
    assert.equal(receipt.metadata, undefined, 'shared headers must not repeat for every audio item');
  }
  assert.ok(Buffer.byteLength(JSON.stringify(manifest,null,2)) < 8 * 1024 * 1024, 'manifest must fit the importer size limit');
});

test('portable export has only the importer contract files and refuses unsafe destinations', async () => {
  const artifacts = path.resolve(root, 'test-results');
  await fs.mkdir(artifacts, {recursive:true});
  const temporary = await fs.mkdtemp(path.join(artifacts, 'voice-review-export-test-'));
  const out = path.join(temporary, 'bundle');
  try {
    const result = await exportXiaoyaVoiceReview({root,out,createdAt});
    assert.equal(result.out, out);
    assert.deepEqual((await fs.readdir(out)).sort(), ['images','manifest.json','media']);
    const saved = JSON.parse(await fs.readFile(path.join(out, 'manifest.json'), 'utf8'));
    assert.deepEqual(saved.source.counts, manifest.source.counts);
    for (const filename of [...copies.keys()]) {
      const bytes = await fs.readFile(path.join(out, filename));
      assert.equal(hash(bytes), path.basename(filename).split('.')[0]);
    }
    await assert.rejects(exportXiaoyaVoiceReview({root,out}), /new or empty/);
    await assert.rejects(exportXiaoyaVoiceReview({root,out:path.join(root,'public','cannot-export')}), /must not replace/);
    await assert.rejects(exportXiaoyaVoiceReview({root,out:root}), /must not replace/);
    await assert.rejects(exportXiaoyaVoiceReview({root}), /Specify --out/);
  } finally {
    const resolved = path.resolve(temporary);
    assert.equal(path.dirname(resolved), artifacts);
    assert.ok(path.basename(resolved).startsWith('voice-review-export-test-'));
    await fs.rm(resolved, {recursive:true,force:true});
  }
});
