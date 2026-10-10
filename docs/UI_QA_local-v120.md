# 浏览器集成验证

验证日期：2026-10-10。实际运行 Microsoft Edge Chromium / Playwright，地址 http://127.0.0.1:24736。

结果：48 项通过，0 项失败。

- **PASS** Desktop home renders, 120 lessons available, no horizontal overflow
- **PASS** Real bundled home audio plays with finite duration
- **PASS** New lesson starts without requiring a microphone
- **PASS** Normal and slow audio use real MP3 and correct playback rates
- **PASS** Chinese guidance remains available when deliberately requested
- **PASS** Wrong answer gives gentle retry, correct answer enables speaking
- **PASS** Real MediaRecorder accepts fake microphone, stop and playback work
- **PASS** Voice name buttons immediately replay the current sentence and preserve recording and progress
- **PASS** First completion saves one card and next-day review; no second new sentence
- **PASS** Library search and all twelve theme filters select relevant lessons
- **PASS** Free library practice does not schedule or alter learning progress
- **PASS** Leaving free practice via completion stops current playback
- **PASS** Exit practice immediately stops active microphone and audio
- **PASS** Settings persist and export produces valid transferable backup
- **PASS** Parent voice preference survives reload and applies to home and phrase-book audio without altering progress
- **PASS** Parent phone QR renders and copy-link uses the intended public URL
- **PASS** Invalid import is rejected without changing progress
- **PASS** Import requires confirmation; cancel preserves state and confirm restores
- **PASS** Imported 1 daily reviews and 16-character nickname survive settings edits
- **PASS** Imported 10 daily reviews and 16-character nickname survive settings edits
- **PASS** Reset cancel preserves progress; confirmed reset can be restored from export
- **PASS** Next local calendar day schedules exactly one new sentence plus due review
- **PASS** All 251 bundled audio files cache and both English voices play after offline reload
- **PASS** App reports no uncaught JavaScript errors
- **PASS** Mobile 390px first-screen main button is unobscured and starts today's new lesson without scrolling
- **PASS** Mobile 390px home and navigation fit without overflow
- **PASS** Mobile 390px lesson, quiz and speaking fit without overflow
- **PASS** Mobile 320px first-screen main button is unobscured and starts today's new lesson without scrolling
- **PASS** Mobile 320px home and navigation fit without overflow
- **PASS** Mobile 320px lesson, quiz and speaking fit without overflow
- **PASS** Late microphone permission is discarded after exiting and entering another card
- **PASS** Denied microphone shows fallback and does not block completion
- **PASS** Shuffled choices retain answer mapping and stay in place during retries
- **PASS** Delayed cache counts cannot overwrite download success or a newer parent page
- **PASS** Learning stages, answer feedback and completion never automatically start Chinese narration
- **PASS** The complete scene picture and its play icon both replay the current sentence
- **PASS** Child tap feedback marks the actual tap, survives navigation and never blocks the next action
- **PASS** Audio feedback shows loading, playback and idle, then recovers from a failed clip on the next tap
- **PASS** Home main entry teaches only the daily new sentence despite due reviews, then repeats it without rewards
- **PASS** After all 120 sentences the main entry offers due review, then the checkup, then the garden
- **PASS** Home names and pictures due reviews; review-only entry never introduces a new lesson
- **PASS** Weekly checkup recalls before listening, preserves first choices and separates meaning from prompted speech
- **PASS** Garden uses earned materials, one action per plot, daily care and a persistent collection
- **PASS** Garden buttons offer only remaining reward-bearing tasks and otherwise wait for tomorrow
- **PASS** A learning-state update from another tab stops current and queued practice audio
- **PASS** Six animal presets are selectable and persist separately from learning progress
- **PASS** A local selfie is composed only after Save, stays out of learning backups and remains available offline
- **PASS** Deleting the saved selfie removes local photo data and returns to an animal preset

## 范围与限制

- 桌面宽度 1440px，移动视口 390px 与 320px；截图见 test-results/local-v120。移动视口不是实体 iPhone Safari / Android 测试。
- 检查 MP3 的真实浏览器播放事件、时长和速度；未进行人工逐句听音。
- 录音成功路径使用 Edge 假麦克风设备与真实 MediaRecorder；拒绝路径注入 NotAllowedError。
- 日期通过 Playwright clock 固定在中国时区，验证次日复习。
- 离线用 service worker 缓存＋浏览器断网模拟，不等同于验证全国移动网络或系统长期缓存保留。
- 报告对应验证地址 http://127.0.0.1:24736 当时返回的版本；本地修改须重建，正式网页须部署后再复验。
