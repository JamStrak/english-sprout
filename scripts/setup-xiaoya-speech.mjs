// Maintainer-only provisioning; no package installation or runtime CDN fallback.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {SPEECH_ASSETS, SPEECH_BASE, SPEECH_BYTES, SPEECH_REVISION} from '../xiaoya/speech-assets.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const verifyOnly = process.argv.includes('--verify');
const ort = '1.31.0-dev.20260914-8d85527a0';
function source(asset) {
  const name = asset.path.slice(SPEECH_BASE.length);
  if (name.startsWith('model/')) return `https://huggingface.co/onnx-community/whisper-tiny.en/resolve/${SPEECH_REVISION}/${name.slice(6)}`;
  if (name === 'runtime/transformers-4.3.1.min.js') return 'https://unpkg.com/@huggingface/transformers@4.3.1/dist/transformers.min.js';
  return `https://unpkg.com/onnxruntime-web@${ort}/dist/${name.slice(8)}`;
}
function matches(bytes, asset) {
  return bytes?.length === asset.bytes && createHash('sha256').update(bytes).digest('hex') === asset.sha256;
}
for (const asset of SPEECH_ASSETS) {
  const destination = path.join(root, 'public', asset.path);
  let bytes = await readFile(destination).catch(() => null);
  if (!matches(bytes, asset)) {
    if (verifyOnly) throw new Error(`Missing or invalid speech asset: ${asset.path}`);
    console.log(`Downloading ${asset.path}`);
    const response = await fetch(source(asset), {signal:AbortSignal.timeout(300000)});
    if (!response.ok) throw new Error(`Download failed (${response.status}): ${asset.path}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (!matches(bytes, asset)) throw new Error(`SHA-256 or size mismatch: ${asset.path}`);
    await mkdir(path.dirname(destination), {recursive:true});
    await writeFile(destination, bytes);
  }
  console.log(`Verified ${asset.path}`);
}
console.log(`Verified ${SPEECH_ASSETS.length} files, ${SPEECH_BYTES} bytes. License files and provenance are in public/${SPEECH_BASE}licenses/ and NOTICE.md.`);
