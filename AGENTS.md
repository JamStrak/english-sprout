# 英语小芽

先读 PROJECT_CONTEXT.md 的当前状态；维护某一功能时只追读对应源码和文档。

- 纯静态网页；运行时不接付费 API，不上传儿童录音或学习记录。录音只在内存临时回听。
- src/learning.js 是日历与复习规则的唯一实现；界面不能把选择题答对当作发音准确或口语掌握。
- 以本地日历安排每日一句，漏学不跳课程；保留既有课程 ID，避免丢失学习记录。
- 发布前 npm test、npm run build；界面和媒体变化运行 tests/browser.cjs，端口或启动变化运行 Python 启动器测试。
- 构建输出只有 dist，可公开的课程与音频放 public；不发布运行日志、个人备份或本机设置。
- 首次下载音频后支持离线；音频内容变化要更新 src/media.js 与 sw.template.js 中一致的声音缓存版本。
- Windows 普通入口为 启动英语小芽.vbs。全局 notify 提示音保持启用。
