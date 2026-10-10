# 正式站 1.2.0 浏览器复验

日期：2026-10-10。正式地址：https://jamstrak.github.io/english-sprout/

正式版本：1.2.0 / 89567ab3d572。Microsoft Edge Chromium / Playwright 独立浏览器上下文。

结果：同一版本的 **7 项检查均有通过证据**。首次行为检查 6 项通过；首屏检查因维护脚本误把课程期望写为 Hello! 而失败，实际 hello-01 为 Hello, everyone.。纠正为读取正式课程文件后，定向复验 390px / 320px 首屏位置与真实坐标点击均通过。此为原始结果加定向复验的综合结论，不是单次 7 项全绿；未因此修改或重新发布产品。

- **PASS** Published version is exactly the new 1.2.0 release
- **PASS** Daily sentence is visible and tappable on the first screen at 390px and 320px
- **PASS** Tapping Ryan immediately selects and actually plays Ryan with visible playback status
- **PASS** The whole lesson picture and its play icon each play Aiden; switching does not change learning progress
- **PASS** Entering a new sentence and moving through quiz and speaking never automatically plays Chinese guidance
- **PASS** Six animal presets save on this browser and avatar taps have visible non-blocking feedback in the dialog
- **PASS** New CSS and JavaScript load successfully with no browser errors or failed requests

## 证据与范围

- 原始 6/7 报告：test-results/live-v120-smoke/browser-results-initial.json；定向首屏复验：home-followup-results.json；综合摘要：browser-results.json。截图在同目录。
- 首次导航等待 networkidle 曾超出 45 秒，尚未进入行为测试；随后以 DOMContentLoaded 和实际 #hero-start 可见作为页面就绪标准，正式站成功运行全部行为检查。未把该等待超时归因为已确认的产品缺陷。
- 实际从正式站解码播放 Aiden、Ryan MP3；验证每日一句首屏坐标点击、整幅图与播放图标、无自动中文旁白、角色按钮、播放反馈、六个动物头像本机保存、点击反馈与新 CSS/JS 资源加载。
- 本次为发布后的定向复验，未重复下载全部 251 段音频；完整本地同版测试 48/48 见 UI_QA_local-v120-final.md。
- 390/320px 移动视口不代表实体 iPhone Safari / Android 验收；测试没有使用个人照片或用户学习数据。
