# 浏览器集成验证

验证日期：2026-10-25。Microsoft Edge / Playwright；地址 http://127.0.0.1:24756。

结果：36 项通过，0 项失败。

- **PASS** Fresh home offers one focused learning action and no autoplay
- **PASS** New lesson and whole illustration play real English without microphone or automatic Chinese guidance
- **PASS** Deliberate guidance, normal playback and temporary slow playback remain available
- **PASS** Wrong image answer retries gently and does not save mastery; correct answer reaches speaking
- **PASS** Real MediaRecorder records and replays locally, with tracks released after stopping
- **PASS** Three direct voice buttons preserve recording and progress; opening settings is silent
- **PASS** Rate changes affect the active player immediately without restart; recording and guidance remain 1x
- **PASS** A first lesson saves one next-day card and visibly offers the next new sentence
- **PASS** Library theme and sentence pagination plus global search expose all 120 lessons
- **PASS** Free practice changes neither learning nor rewards and stops audio on completion
- **PASS** Exiting a speaking card stops microphone capture and playback immediately
- **PASS** Parent habit settings persist and export a valid transferable backup
- **PASS** Voice and speed preferences survive reload and Pip covers all twelve themes
- **PASS** Install page QR decodes as an image and copy action uses the official URL
- **PASS** Invalid import and cancelled valid import preserve existing progress
- **PASS** Confirmed import retains 1 review limit and 16-character nickname after edits
- **PASS** Confirmed import retains 10 review limit and 16-character nickname after edits
- **PASS** Reset requires confirmation and an exported backup restores the saved lesson
- **PASS** Next local day prioritizes silent recall and picture understanding, then offers another sentence
- **PASS** All 383 MP3 files cache; three voices, guidance and Range/Vary work after offline reload
- **PASS** The main user journey has no uncaught JavaScript errors
- **PASS** Home priority and review completion guide a child into learning without first revealing answers
- **PASS** Weekly checkup hides answers, remembers the first choice, and keeps prompted speech separate from independent recall
- **PASS** After all 120 lessons, the main action remains review, then checkup, then garden
- **PASS** World garden seeds place freely, five waters bloom, collection and records persist
- **PASS** Independent garden practice can earn encouragement water without a parent or a fabricated speech pass
- **PASS** Late microphone permission from an exited card is discarded rather than attaching to the next lesson
- **PASS** Denied microphone explains the fallback and never blocks lesson completion
- **PASS** Cross-tab progress changes stop active practice, queued audio and stale lesson actions
- **PASS** A delayed backup read is ignored after leaving Backup and cannot replace an active recording page
- **PASS** A microphone permission arriving after the page goes into the background cannot start capture
- **PASS** Image choices retain source answer mapping and never reshuffle during retries or voice changes
- **PASS** Delayed cache-count replies cannot overwrite a completed download or a newly opened offline page
- **PASS** Audio loading and failure feedback remain visible and a second tap recovers the real clip
- **PASS** Tap feedback tracks the actual coordinate and does not cover the next control or keyboard navigation
- **PASS** Six animal presets persist separately and a selfie is saved only on request, then removable

范围：真实 MP3 播放与变速、假麦克风加真实 MediaRecorder、固定本地日历、离线 Service Worker、学习/导入/花园/头像。单屏手机尺寸和点击命中另见 focus-browser.cjs；未冒充实体手机或真人听音验收。
