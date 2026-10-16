// Immutable same-origin assets; hashes are checked before executable/model use.
export const SPEECH_ENGINE = 'whisper-tiny.en-fp32-q8-v1';
export const SPEECH_BASE = 'xiaoya/speech/whisper-tiny-en-v1/';
export const SPEECH_REVISION = '2575352d61be1bf7225cf8f8b268a4678025fc58';
export const SPEECH_ASSETS = Object.freeze(([
  {
    "path": "xiaoya/speech/whisper-tiny-en-v1/model/config.json",
    "bytes": 2197,
    "sha256": "251ea843b5901a99efa58c0b99b8052c6019aa3e7d2baf46693a1128ff606233",
    "type": "application/json",
    "ranges": false
  },
  {
    "path": "xiaoya/speech/whisper-tiny-en-v1/model/generation_config.json",
    "bytes": 1646,
    "sha256": "7b2e8451ed5f118e75fdd991409d72119d21d2fef1eba9723f68fb9c57fe5dc9",
    "type": "application/json",
    "ranges": false
  },
  {
    "path": "xiaoya/speech/whisper-tiny-en-v1/model/onnx/decoder_model_merged_quantized.onnx",
    "bytes": 30718858,
    "sha256": "c0592d0749413c960569e1c7fb806b060d5d18f3ebad4a95cbf9a77dc6e9be52",
    "type": "application/octet-stream",
    "ranges": true
  },
  {
    "path": "xiaoya/speech/whisper-tiny-en-v1/model/onnx/encoder_model.onnx",
    "bytes": 32904992,
    "sha256": "8c361b9430a5ef6619ee64b7fe06c725df19f36d508cc8b847064b34a888a3fe",
    "type": "application/octet-stream",
    "ranges": true
  },
  {
    "path": "xiaoya/speech/whisper-tiny-en-v1/model/preprocessor_config.json",
    "bytes": 339,
    "sha256": "a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d",
    "type": "application/json",
    "ranges": false
  },
  {
    "path": "xiaoya/speech/whisper-tiny-en-v1/model/tokenizer_config.json",
    "bytes": 282662,
    "sha256": "93879c3dccdd4b976f709acd85b44778873f30c275e67026f30ca1e4c975230c",
    "type": "application/json",
    "ranges": false
  },
  {
    "path": "xiaoya/speech/whisper-tiny-en-v1/model/tokenizer.json",
    "bytes": 2405679,
    "sha256": "5eb60cec1e77aeeb6869a2bb5a8e01a84c3fe5d072d75369343021fe6f5310d0",
    "type": "application/json",
    "ranges": false
  },
  {
    "path": "xiaoya/speech/whisper-tiny-en-v1/runtime/ort-wasm-simd-threaded.mjs",
    "bytes": 24381,
    "sha256": "c57ca56328877353a575e51bbca6f18450027d6c9bf2307a2cb2c41363b4de9f",
    "type": "text/javascript",
    "ranges": false
  },
  {
    "path": "xiaoya/speech/whisper-tiny-en-v1/runtime/ort-wasm-simd-threaded.wasm",
    "bytes": 14264838,
    "sha256": "06ba057753da3847e4c24f02d91ab133455b0817c69a44993a9a53a2146df9e3",
    "type": "application/wasm",
    "ranges": true
  },
  {
    "path": "xiaoya/speech/whisper-tiny-en-v1/runtime/transformers-4.3.1.min.js",
    "bytes": 586230,
    "sha256": "8d6716d9086f57c30a4bf367dba61b887593573c770c454465e8019b2703e743",
    "type": "text/javascript",
    "ranges": false
  }
]).map(Object.freeze));
export const SPEECH_BYTES = SPEECH_ASSETS.reduce((total,asset)=>total+asset.bytes,0);


