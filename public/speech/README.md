# Local speech recognition assets

These static files run recognition on the device. The application never sends
recorded audio or transcripts to a recognition service. The transcript is used
temporarily to compare the ordered words of a sentence; it is **not** a phoneme,
accent, pronunciation accuracy, or mastery assessment.

- `vosk-0.0.8.js`: unmodified `package/dist/vosk.js` from the pinned npm package
  [vosk-browser 0.0.8](https://registry.npmjs.org/vosk-browser/-/vosk-browser-0.0.8.tgz),
  by Ciaran O'Reilly and contributors. Apache License 2.0; see
  `VOSK-COPYING.txt` and `VOSK-NOTICE.txt` for the bundled dependencies' notices.
  [Project source](https://github.com/ccoreilly/vosk-browser).
- `model-en-us-0.15.tar.gz`: the Vosk small US English 0.15 model, by Alpha Cephei,
  from the library author's [browser model archive](https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz).
  [Official model listing and original ZIP](https://alphacephei.com/vosk/models)
  identify this model as Apache License 2.0.
  Archive size: 41,184,862 bytes. SHA-256:
  `f0b24bb92a48ca575b6a96500d6b543f0f079c573dfe85bbe16001fc0404e1d8`.
  All 14 model files were byte-compared against the publisher's original ZIP
  on 2026-10-12 with no differences. Original ZIP SHA-256:
  `30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498`.

Assets are loaded only when the child opens a speaking practice. The script is
cached separately in CacheStorage; Vosk stores the extracted model in IndexedDB.
Neither is part of the mandatory first-page download or service-worker core
installation. Preparing and assessing can be cancelled, with bounded waits.

This model's published benchmarks concern adult/general English speech, not
four-year-old learners. Recognition can miss children's speech. Do not treat a
miss as proof of poor pronunciation, and do not force children into retry loops.
The model publisher estimates about 300 MB of runtime memory for small models.
The build avoids WebGPU, WASM SIMD, and shared-memory requirements; real iPadOS
15.1 performance still needs validation on the actual device.
