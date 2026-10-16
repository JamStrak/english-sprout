# Local speech assets — whisper-tiny-en-v1

These files are served from this application's own origin and loaded only when
speech recognition is requested. Audio stays in browser memory. No inference
request is sent to Hugging Face, OpenAI, or a third-party API.

## Pinned sources

- Model: [onnx-community/whisper-tiny.en](https://huggingface.co/onnx-community/whisper-tiny.en/tree/2575352d61be1bf7225cf8f8b268a4678025fc58), revision `2575352d61be1bf7225cf8f8b268a4678025fc58`.
  Files are the seven paths under `model/`; `model/` is the local folder name,
  not part of the upstream repository. The encoder is FP32; the merged decoder
  is Q8. Original Whisper code and weights are MIT licensed; see
  `licenses/whisper-MIT.txt` and [OpenAI Whisper](https://github.com/openai/whisper).
- Transformers.js: npm `@huggingface/transformers@4.3.1`, standalone
  `dist/transformers.min.js`, renamed `runtime/transformers-4.3.1.min.js`.
  [Upstream repository](https://github.com/huggingface/transformers.js).
  Apache-2.0 license retained in `licenses/transformers-Apache-2.0.txt`.
- ONNX Runtime Web: npm `onnxruntime-web@1.31.0-dev.20260914-8d85527a0`,
  `dist/ort-wasm-simd-threaded.mjs` and `.wasm`. These are the plain WASM files,
  not JSEP/Asyncify variants. CPU execution is configured to one worker thread.
  [Upstream commit](https://github.com/microsoft/onnxruntime/tree/8d85527a0).
  MIT license and upstream third-party notices are retained in `licenses/`.
- Dependencies bundled into the standalone transformer script include
  `@huggingface/tokenizers@0.2.0` (Apache-2.0) and
  `@huggingface/jinja@0.5.10` (MIT); their licenses are retained in `licenses/`.

## Integrity and maintenance

The application source `xiaoya/speech-assets.js` contains the exact byte counts
and SHA-256 hashes of all ten runtime/model files. Total runtime download:
**81,191,822 bytes (81.19 MB / 77.43 MiB)**. Notices are not model downloads.
Each cached or downloaded file is checked before executable/model use.

Run `node scripts/setup-xiaoya-speech.mjs --verify` to validate local copies.
Without `--verify`, the script repairs missing or corrupt files from the pinned
sources and refuses bytes that do not match the manifest. This is a maintainer
tool; the application never uses those external source URLs at runtime.

The model returns an open transcript without receiving the lesson's expected
answer. It does not certify pronunciation, comprehension, or learning mastery.
Browser smoke checks and recorded demonstration audio do not establish accuracy
for children aged 3–4.
