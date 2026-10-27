import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {SOUND_ASSETS, SOUND_EVENTS} from '../xiaoya/sound-catalog.js';

const root = path.resolve(import.meta.dirname, '..');
const directory = path.join(root, 'public/xiaoya/sfx');
const selection = JSON.parse(fs.readFileSync(path.join(root, 'design/xiaoya-sound-selection.json'), 'utf8'));
const sources = JSON.parse(fs.readFileSync(path.join(directory, 'SOURCES.json'), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sfx = SOUND_ASSETS.filter(asset => asset.kind !== 'bgm');

test('all 17 selected Soundbox SFX retain reviewed CC0 provenance and exact output hashes', () => {
  assert.equal(sfx.length, 17);
  assert.equal(selection.assets.length, 17);
  assert.equal(sources.assets.length, 17);
  assert.equal(new Set(sfx.map(asset => asset.id)).size, 17);
  assert.equal(selection.validation.candidateCount, 104);
  assert.equal(selection.validation.candidateHashesVerified, 104);
  assert.equal(selection.validation.candidateDecodePass, 104);
  assert.equal(selection.validation.humanListeningPerformed, false);
  const permittedHosts = new Set(['kenney.nl', 'opengameart.org']);
  for (const asset of sfx) {
    const selected = selection.assets.find(item => item.id === asset.id);
    const published = sources.assets.find(item => item.id === asset.id);
    assert.ok(selected && published, `${asset.id} must have both review and public provenance`);
    assert.equal(selected.file, `${asset.id}.mp3`);
    assert.equal(published.sourceCandidateId, selected.sourceCandidateId);
    assert.equal(published.license, 'CC0');
    assert.equal(published.licenseUrl, 'https://creativecommons.org/publicdomain/zero/1.0/');
    assert.ok(permittedHosts.has(new URL(published.sourceUrl).hostname));
    assert.match(published.sourceCandidateId, /^catalog-/);
    const candidate = selection.candidates.find(item => item.id === published.sourceCandidateId);
    assert.ok(candidate, `${asset.id} source must be among the actual reviewed candidates`);
    assert.equal(candidate.sha256, published.sourceSha256);
    assert.equal(candidate.archiveSha256, published.archiveSha256);
    assert.equal(candidate.analysis.sourceHashVerified, true);
    assert.equal(candidate.analysis.decoded, true);
    const bytes = fs.readFileSync(path.join(directory, published.file));
    assert.equal(bytes.length, published.output.bytes);
    assert.equal(digest(bytes), published.output.sha256);
    assert.deepEqual(published.output, selected.output);
    assert.equal(published.output.codec, 'mp3');
    assert.equal(published.output.sampleRate, 44100);
    assert.equal(published.output.channels, 1);
    assert.ok(published.output.duration > 0 && published.output.duration < 1.5);
    assert.ok(Math.abs(asset.duration - published.output.duration) < 0.000001, `${asset.id} catalogue must use the measured duration`);
  }
  assert.equal(sources.assets.reduce((total, item) => total + item.output.bytes, 0), 104188);
  assert.doesNotMatch(JSON.stringify(sources), /[A-Z]:\\|127\.0\.0\.1|localhost|learning-record|recording/i, 'Published provenance must not leak local paths or records');
});

test('all 31 usage slots resolve local static audio and preserve recording-safe defaults', () => {
  assert.equal(SOUND_EVENTS.length, 31);
  assert.equal(new Set(SOUND_EVENTS.map(event => event.id)).size, SOUND_EVENTS.length);
  const assets = new Map(SOUND_ASSETS.map(asset => [asset.id, asset]));
  const base = new URL('https://example.test/nested/course/');
  for (const event of SOUND_EVENTS) {
    const asset = assets.get(event.assetId);
    assert.ok(asset, `${event.id} references a shipped asset`);
    assert.ok(event.title && event.module && event.trigger);
    assert.ok(Number.isFinite(event.volume) && event.volume >= 0 && event.volume <= 1);
    assert.match(asset.url, /^xiaoya\/(?:sfx|audio\/v3)\/[a-z0-9-]+\.mp3$/);
    const url = new URL(asset.url, base);
    assert.equal(url.origin, base.origin);
    assert.ok(url.pathname.startsWith('/nested/course/xiaoya/'));
    assert.equal(url.search + url.hash, '');
    const source = asset.url.replace('xiaoya/audio/v3/', 'xiaoya/audio/');
    assert.ok(fs.statSync(path.join(root, 'public', source)).size > 0, `${event.id} must have a bundled static source`);
    assert.equal(event.kind, asset.kind === 'bgm' ? 'bgm' : 'sfx');
  }
  assert.equal(SOUND_EVENTS.find(event => event.id === 'record-stop').enabled, false);
  assert.ok(!SOUND_EVENTS.some(event => /^record-(?:start|ready)$/.test(event.id)));
  const bgm = SOUND_ASSETS.find(asset => asset.id === 'garden-piano');
  const original = JSON.parse(fs.readFileSync(path.join(root, 'public/xiaoya/audio/garden-piano-source.json'), 'utf8'));
  assert.equal(digest(fs.readFileSync(path.join(root, 'public/xiaoya/audio/garden-piano.mp3'))), original.sha256);
  assert.doesNotMatch(bgm.license, /CC0/);
});

test('all shipped SFX decode to non-silent PCM with the reviewed durations and safe sample peaks', t => {
  const available = spawnSync('ffmpeg', ['-version'], {windowsHide:true, encoding:'utf8'});
  if (available.error?.code === 'ENOENT') return t.skip('FFmpeg is not installed; provenance/hash/static-path tests still run');
  assert.equal(available.status, 0, available.stderr || available.error?.message);
  for (const asset of sources.assets) {
    const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', path.join(directory, asset.file), '-f', 'f32le', '-ac', '1', '-ar', '44100', 'pipe:1'], {windowsHide:true, maxBuffer:1024*1024});
    assert.equal(decoded.status, 0, `${asset.id}: ${decoded.stderr?.toString() || decoded.error?.message || 'decode failed'}`);
    assert.ok(decoded.stdout.length > 0 && decoded.stdout.length % 4 === 0);
    const count = decoded.stdout.length / 4;
    assert.ok(Math.abs(count / 44100 - asset.output.decodedDuration) < 0.000001, `${asset.id} actual decoded duration`);
    let peak = 0, energy = 0;
    for (let index = 0; index < count; index++) {
      const sample = decoded.stdout.readFloatLE(index * 4);
      assert.ok(Number.isFinite(sample));
      peak = Math.max(peak, Math.abs(sample));
      energy += sample * sample;
    }
    const peakDbfs = 20 * Math.log10(peak), rmsDbfs = 20 * Math.log10(Math.sqrt(energy / count));
    assert.ok(peakDbfs < -6 && rmsDbfs > -50, `${asset.id} must remain audible without clipping`);
    assert.ok(Math.abs(peakDbfs - asset.output.samplePeakDbfs) < 0.05);
    assert.ok(Math.abs(rmsDbfs - asset.output.rmsDbfs) < 0.05);
  }
});
