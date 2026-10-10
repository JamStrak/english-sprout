# 声音播放优化与验证 · v1.2.1

2026-10-10。正式网址 https://jamstrak.github.io/english-sprout/ 。
发布提交 b3867f6，GitHub Pages 任务 38036547468 completed / success。
正式构建 40fe69f3b1e4；本地构建 403b4d0486dd。按提交 Git blob 的 LF 内容计算，精确得到正式编号。

## 修改

1. 网络响应直接供播放器使用，完整音频的缓存写入由后台 waitUntil 保活，取消原有 cache.put 等待。
2. 最多六个静默音频元素预热当前、相邻短句及其另一个角色，点播复用同一元素缓冲。普通停止不销毁缓冲；淘汰只清理不在播放的元素。
3. 相同声音和速度仍在加载/缓冲时，连点合并为原来的请求；播放后点击仍从头重播。按代次和媒体当前状态过滤旧事件，防止切换后显示错误状态。
4. 预加载不播放、不修改回想题提示或学习记录；录音不进入音频池。两套配音未改变，继续使用 v3 声音缓存。

## 验证

- npm test 90/90；npm run build 通过。
- 最终本地完整浏览器检查 48/48，见 UI_QA_local-v121-final.md。包括全 251 段保存后断网重开、两种声音、录音清理、学习/花园/头像/窄屏回归。
- Service Worker 专项单元回归：缓存写入未结束时响应可用；流尚未全部下载时播放器可读首段；存储故障不阻止播放；离线 Range 行为保持。
- 慢加载专项：用未放行的 MP3 网络响应模拟等待，进入课程后连续点击画面五次，Aiden 始终只有一个 Audio 元素、一次 play 调用和一个请求；Ryan 只静默预载一次。放行后真实播放 1.28 秒，状态从 loading 进入 playing，无 JS 异常。最终本地构建 403b4d0486dd；脚本和结果在 test-results/audio-latency-quick。
- 正式站独立 Edge 浏览器：两声线静默预热、角色/整图/图标真实 MP3 播放、无叠音、无自动中文、学习记录未变、无 JS 错误；已经缓冲的两种声音断网仍可重播。证据 test-results/live-v121/results.json。

下表是等待音频预加载就绪之后，DOM click 到浏览器 playing 事件的实测时间，不代表扬声器物理出声延迟或全国网络首播表现：

| 操作 | 时间 |
|---|---:|
| [data-voice="ryan"] | 13.2 ms |
| [data-voice="aiden"] | 4.1 ms |
| .scene-picture | 4.0 ms |
| .picture-play | 4.5 ms |
| [data-voice="ryan"] | 4.6 ms |
| [data-voice="aiden"] | 6.7 ms |

## 限制

第一次未缓存的句子依然依赖网络；浏览器可能限制 preload，GitHub Pages 在不同地区和网络下的延迟也不同。这里没有把热缓冲测试当作冷启动秒播保证。保留家长页显式保存所有声音的功能，不能把内存中的预热等同于全部课程已持久离线保存。手机视口不是实体 iPhone / Android 验证。
