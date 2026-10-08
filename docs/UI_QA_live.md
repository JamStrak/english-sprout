# 正式站浏览器验证

验证日期：2026-10-08。正式地址：https://jamstrak.github.io/english-sprout/ 。实际运行 Microsoft Edge Chromium / Playwright。

## 结果

同一发布版本的 41 项检查均有通过证据：一次完整运行 39 项通过、2 项离线下载等待超时；随后保留完整学习、录音、设置与备份前置，复验 24 项全部通过，其中包括此前超时的 2 项。**这是完整运行加补充复验的合并结论，不是单次 41 项全绿。** 产品代码与声音未因复验而修改。

- 发布提交：`66507ac71db1901594bd4f216f7b4c7201a820a9`。
- 正式站 version.json：1.1.0 / `4cd5faa9cab7`。
- 本地同版构建：`fd8cd71888f8`。将本地构建输入中的 CRLF 换行为 Linux LF 后，按原构建顺序计算得到 `4cd5faa9cab7`，确认编号差异来自发布环境的换行格式。
- 本地验证：75 项单元测试通过、构建成功、41 项浏览器检查全部通过，见 [本地摘要](UI_QA.md)。

## 两项离线复验

1. 251 段声音保存、断网双声线播放：通过。复验保存耗时 103,956 ms；缓存精确 251 段。Aiden 与 Ryan 的正式 MP3 均在断网后触发真实播放事件；范围请求返回 206、128 字节及正确 Content-Range。
2. 缓存查询竞态：通过。先挂起 240 条旧查询，在全部声音保存后释放，完成提示保持正确；上一家长页的旧查询也不能覆盖新页面状态。

公网下载比本地慢且有波动。最初沿用本地 30 秒下载预算时超时，随后一轮使用 180 秒预算仍有上述两项超时；当时未捕获即时下载状态，不能据此认定某一种底层网络错误。窄诊断及保留完整前置的复验均完成下载，未确认产品回归。两次独立下载诊断约 104 秒完成，均无失败请求、非成功音频响应或 JavaScript 错误；固定日期与四种麦克风/浏览器启动权限组合未复现持久存储授权挂起。

维护测试保留本地页面 8 秒、离线保存 30 秒预算；正式站页面 30 秒、离线保存 180 秒，可通过 `NAVIGATION_TIMEOUT_MS`、`OFFLINE_TIMEOUT_MS` 调整。内容、成功提示、缓存数量、实际播放与 Range 断言未放松；增加下载进度、按钮状态、缓存数量、持久存储请求及网络错误的超时诊断。

## 原始证据

- [完整运行报告：39 通过 / 2 超时](../test-results/live/browser-results.json)；[该轮原始摘要](../test-results/live/UI_QA.md)。保留原失败记录，不覆盖为成功。
- [完整前置与离线复验：24 通过 / 0 失败](../test-results/live-offline-diagnostic/browser-results.json)；[复验摘要](UI_QA_live-offline-diagnostic.md)。
- [冷启动下载诊断](../test-results/live/offline-diagnostic.json)、[固定日期下载诊断](../test-results/live/offline-clock-diagnostic.json)、[持久存储权限诊断](../test-results/live/persist-diagnostic.json)。
- 桌面与 390/320px 首屏截图保留在 `test-results/live`；本地证据保留在 `test-results/local`，未被线上覆盖。

## 范围与限制

- 检查桌面 1440px、移动视口 390px 与 320px，包括首屏按钮实际坐标点按、学习/复习/小测/花田、双声线、录音、备份与离线流程。
- 移动视口不代替实体 iPhone Safari 或 Android 验收。录音成功路径使用 Edge 假麦克风与真实 MediaRecorder。
- 网络离线由浏览器模拟，不代表全国移动网络可达性或系统长期保留缓存。音频自动播放检查不等于真人逐句听音与学习效果评估。
