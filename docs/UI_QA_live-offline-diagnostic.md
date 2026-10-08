# 浏览器集成验证

验证日期：2026-10-08。实际运行 Microsoft Edge Chromium / Playwright，地址 https://jamstrak.github.io/english-sprout/。

结果：24 项通过，0 项失败。

- **PASS** Desktop home renders, 120 lessons available, no horizontal overflow
- **PASS** Real bundled home audio plays with finite duration
- **PASS** New lesson starts without requiring a microphone
- **PASS** Normal and slow audio use real MP3 and correct playback rates
- **PASS** Chinese guidance audio plays
- **PASS** Wrong answer gives gentle retry, correct answer enables speaking
- **PASS** Real MediaRecorder accepts fake microphone, stop and playback work
- **PASS** Changing English voice stops old playback and preserves the same recording and progress
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
- **PASS** Delayed cache counts cannot overwrite download success or a newer parent page

## 范围与限制

- 桌面宽度 1440px，移动视口 390px 与 320px；截图见 test-results/live-offline-diagnostic。移动视口不是实体 iPhone Safari / Android 测试。
- 检查 MP3 的真实浏览器播放事件、时长和速度；未进行人工逐句听音。
- 录音成功路径使用 Edge 假麦克风设备与真实 MediaRecorder；拒绝路径注入 NotAllowedError。
- 日期通过 Playwright clock 固定在中国时区，验证次日复习。
- 离线用 service worker 缓存＋浏览器断网模拟，不等同于验证全国移动网络或系统长期缓存保留。
- 报告对应验证地址 https://jamstrak.github.io/english-sprout/ 当时返回的版本；本地修改须重建，正式网页须部署后再复验。
