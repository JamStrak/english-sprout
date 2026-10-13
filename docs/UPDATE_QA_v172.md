# v1.7.2 自动更新验收

日期：2026-10-13（Asia/Shanghai）。最终候选：`a5dc17837adb`。测试使用隔离 Edge、真实 Service Worker、本地独立发布服务器，未操作用户浏览器存档。识别包下载不属于本次生命周期测试；麦克风测试使用真实 MediaRecorder 和模拟设备，不声称真实儿童发音准确率或实体 iPad 验收。

## 原因与修复

- 原 worker 只验证 HTML 版本，HTTP 200 的旧 CSS 仍可能进入新版缓存。新版 JavaScript/CSS 使用构建目录，核心资源逐个校验 SHA-256，全部成功才安装激活。
- 原页面没有周期重试；新版前台自动检查并重试，worker 安装也有有限退避，以覆盖尚未升级的 v1.7.1 页面。
- 失败样式可能仍有非空 `link.sheet` 对象，因此必须核对实际 CSS 规则。完整缓存就绪后安全恢复样式，同构建最多自动恢复一次，永久拦截不会循环刷新。
- 旧 worker 可能在异步清理时删除新安装缓存；清理现在检查 installing/waiting，并验证实际 active worker 与自身构建一致。
- 断网恢复后 worker 可能完整安装却仍 waiting。页面仅对已 installed、且构建匹配实际发布目标的 worker 发送兼容激活消息；页面刷新继续受录音、练习、奖励、输入和未保存状态保护。

## 浏览器证据

以下为按同一目标分阶段验证的 **12 个原有保护场景和 16 个恢复场景**；不是声称所有测试在最终构建一次性重跑。保留失败报告，最终专项针对发现的问题重测。

| 报告（仓库 `test-results/` 下，忽略不发布） | 构建 | 实际结果与范围 |
| --- | --- | --- |
| `automatic-updates/results.json` | `4a35e9ffe317` | 10/12 通过；两项失败是重复播放、失败下载后离线恢复，后续已定位并修复。包括多标签、后台页面、麦克风许可/录音/回听、草稿、头像弹窗、保存失败、旧 v1.4 迁移。保存失败退出通过键盘完成，不将此场景当触屏可达性证明。 |
| `automatic-updates/results-final-prune.json` | `0494329560f2` | 重复播放通过；断网恢复仍失败。 |
| `automatic-updates/results-waiting-skip-diagnostic.json` | `0494329560f2` | 诊断失败保留：waiting worker 的 skipWaiting 已完成，52 个核心资源全部 SHA 匹配。诊断包含测试辅助激活，不用于通过验收。 |
| `automatic-updates/results-final-waiting.json` | `a5dc17837adb` | 原两项失败场景 2/2 通过；未使用诊断注入或测试辅助激活。产品自己恢复，循环播放不被打断。 |
| `release-recovery/results.json` | `0271e0fecb17` | 14/15 通过；首次样式恢复失败促成 CSSOM 修复。其余覆盖真实缓存 v1.7.1 普通打开/一次普通刷新、旧版首次安装失败后恢复、后台发现更新、HTTP 200 旧 CSS、503 依赖、旧 HTML、离线重开、伪造 URL 版本号、存档及偏好保留、麦克风和草稿、忙碌旧页面的旧资源离线读取、无 worker 的首次模块失败恢复。没有测试代码主动调用 registration.update。 |
| `release-recovery/results-final-styles.json` | `0494329560f2` | 3/3 通过：真实旧 v1.7.1 首次失败迁移、HTTP 503 导致 0 条反馈 CSS 规则后自动恢复、永久 CSP 样式拦截仅恢复一次不循环；均核对实际 B controller。 |
| `release-recovery/results-final-partial.json` | `0494329560f2` | 发布依赖暂时不可用，保持旧版，资源恢复后自动升级，无再次刷新或辅助更新调用。 |

后续最终候选仅增加 waiting worker 激活兼容分支，原失效场景已在最终候选重测。单位测试、原功能回归、版本/离线/全部核心 SHA 检查由主任务执行，具体最终发布构建与正式站证据写入 PROJECT_CONTEXT.md。

首页与练习页显示的是当前文档的版本和实际构建；URL 的 `v` 参数不能伪造此标记。新版本准备与离线状态有可见反馈。自动更新不以清除学习记录、头像、音色、皮肤或离线音频为恢复方式。
