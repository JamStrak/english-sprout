# 小芽英语工作树（同时保留旧英语小芽）

先读 PROJECT_CONTEXT.md 的当前状态；维护某一功能时只追读对应源码和文档。

- 纯静态网页；运行时不接付费 API，不上传儿童录音或学习记录。录音只在内存临时回听。
- 当前小芽英语代码在 xiaoya/，入口 experience.js；practice-plan.js 负责本地日历复习与新故事安排，learning.js 负责学习证据。机器星级或参与奖励不等于发音准确、独立掌握。
- 旧英语小芽代码在 src/；仅旧产品的日历、每日一句与复习规则由 src/learning.js 唯一实现。两个产品的课程 ID 和既有学习记录都必须保留。
- 发布前 npm test、npm run build；小芽英语界面和媒体变化运行相关 tests/xiaoya-*-browser.cjs，并用 tests/browser.cjs 确认旧产品不回归；端口或启动变化运行 Python 启动器测试。
- 构建输出只有 dist，可公开的课程与音频放 public；不发布运行日志、个人备份或本机设置。
- 音频按实际下载缓存后支持离线；旧产品音频变化要同步 src/media.js 与 sw.template.js 的声音缓存版本，新产品核对 xiaoya/sw.template.js 与相应媒体构建清单。
- Windows 小芽英语普通入口为本工作树的 启动小芽英语.vbs；启动英语小芽.vbs 是旧产品入口。全局 notify 提示音保持启用。
