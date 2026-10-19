# 小芽英语 · 技术地图

更新：2026-10-20，当前 v0.16.1。分支、构建和本轮验证记录以 [PROJECT_CONTEXT](../PROJECT_CONTEXT.md) 与 [实施记录](XIAOYA_IMPLEMENTATION.md) 为入口。这里记录可定位的实现约定，不把历史设计提案当成当前行为。

## 1. 先分清两个产品

| 范围 | 新产品：小芽英语 | 旧产品：英语小芽 |
| --- | --- | --- |
| 源码 | `xiaoya/` | `src/` |
| 浏览器入口 | `/xiaoya/`；启动器使用 `/xiaoya/start-<build>.html`，B 花园用 `?garden=b` | `/` |
| UI 启动 | `xiaoya/app.js` → `experience.js` | 根 `index.html` 与 `src/` |
| 版本来源 | `scripts/build-xiaoya.mjs` 的 `XIAOYA_VERSION` | `package.json` 的 `version`，当前 1.8.1 |
| Windows 普通启动 | `启动小芽英语.vbs` → `launcher_xiaoya.py` | `启动英语小芽.vbs` → `launcher.py` |
| 日历规则 | `xiaoya/practice-plan.js` | `src/learning.js` |

两产品同仓、共同构建到 `dist/`；不是同一个 UI 换名字。`npm run preview` 启动旧产品。当前新产品本机位置见 PROJECT_CONTEXT；其绝对路径仅供本机定位，迁移后应以新 checkout 为工作目录。不能在旧目录修改，再以另一个 worktree 的服务器验收。

## 2. 代码定位

| 工作 | 主要文件与入口符号 | 修改时同时检查 |
| --- | --- | --- |
| 页面、学习会话、导航 | `xiaoya/experience.js`：`startEvent`、`playStory`、`teach`、`record`、`assessClip`、`applySpeechResult`、`finish`、`navigate` | 首学、复习、挑战必须区分；帮助后不能写独立掌握。切页/弹窗/后台须取消旧异步任务 |
| 课程与句子身份 | `content.js`：`EVENTS`；`phrase-pack-v015.js`；`curriculum.js`：`CORE_PHRASE_EVENT_IDS`、`phraseIdFor`、`canonicalEventId`、`phraseEvents` | 旧事件 ID 保留，通过表达归并避免重复当新课；不要重排既有挑战组成员 |
| 故事和情境图 | `stories.js`：`STORIES`、`storyFor`；`story-pictures.js`：`pictureFor`、`pictureSequence`、`createPictureLoader`；`story-assets.js`、`phrase-assets-v015.js` | 熟悉图用于复习；图片晚到只替换画面，不重置会话。资源生产详见 [内容流水线](XIAOYA_CONTENT_PIPELINE.md) |
| 学习证据 | `learning.js`：`recordEvidence`、`correctEvidence`、`effectiveEvidence`、`phraseStatus`、`phraseCheckupContext` | 参与、机器候选、家长确认分别记录，不能用奖励或星级推出掌握 |
| 日历复习与新学选择 | `practice-plan.js`：`recordPractice`、`getPracticePlan`、`addPracticeDays` | 使用本地日历；同日重复不跳完记忆间隔；帮助与独立尝试不同 |
| 阶段挑战 | `challenges.js`：`CHALLENGE_UNITS`、`recordChallengeAttempt`、`recordChallengeHelp`、`getChallenges`、`invitationFor` | 已过步骤保留，帮助记录跨刷新保留；游戏通关不等于长期掌握 |
| A 花盆 | `garden.js`：`rewardRound`、`openSeedPack`、`plantSeed`、`waterPlant` | 与 B 各自持有余额和植物，不能把 B 新数值直接套到 A |
| B 花园经济 | `garden-meadow.js`：`rewardRound`、`claimReward`、`rewardChallenge`、`redeemChallengeSeed`、`ensureShop`、`reserveOffer`、`buyOffer`、`waterPlant` | 奖励、购买、里程碑都需幂等；旧余额与未领取承诺保留 |
| B 花园画面及触摸 | `meadow-ui.js`：`meadowView`、`bindMeadowInteractions`、`layoutMeadowWatering`；`meadow-art.js`、`meadow-hit-shapes.js`、`meadow.css` | 根点、透明像素命中、水滴与对应植物、逐滴成长；不是只改 CSS 视觉尺寸 |
| 三种示范音色 | `voices.js`：`VOICES`、`readVoice`、`saveVoice`、`lessonAudio` | Aiden / Ryan / Pip 使用同一学习进度；切声音不能重复发奖 |
| 播放、录音、评分 | `audio.js`：`playSound`、`prepareRecording`、`beginRecording`、`finishRecording`、`replayClip`、`recognize`；`speech-local.js`、`speech-worker.js` | 真正录音就绪后才提示开口；停止/取消生命周期与临时音频清理 |
| 引导与反馈 | `experience.js` 的 `scheduleIdleHint`、`sound`；`feedback.js`；`feedback.css`、`paper.css`、`style.css` | 指引手仅闲置后出现；录音期间、后台与关弹窗时不能留下音效/提示 |
| GM 内测 | `gm.js`、`gm.css`、`runtime.js`；`experience.js` 的 `gmBridge` | 公开包物理排除、内存存档隔离、模拟标记、真实儿童记录不变 |
| 静态发布与离线 | `scripts/build.mjs`、`scripts/build-xiaoya.mjs`、`xiaoya/audio-pack.js`、`xiaoya/sw.template.js` | 两产品、渠道、资源清单、缓存完整性、版本更新需一起核对 |

表中未带目录的 JS/CSS 均在 `xiaoya/`。小模块大多是纯状态函数；`experience.js` 负责将 UI、存档写入、异步播放与它们连接。新增功能先找对应领域模块，不把全部规则继续写进界面事件回调。

`experience.js` 用 `uiGeneration`、故事/录音/声音的取消状态阻止旧 Promise、定时器回调污染新页面。`stopSession`、`suspend`、`resume`、`openModal` 是生命周期交界；修改导航、GM、录音、奖励时必须覆盖这些路径。

## 3. 数据与存档约定

正式数据保存在浏览器当前 origin 的 localStorage；领域模块先校验，UI 经 `runtime.js` 的 `appStorage` 读写。当前没有账户、云同步或正式导入功能。`experience.js` 的 `exportState` 提供 JSON 导出；错误状态导出可能含原始存档，属于用户数据，不应提交或作为公开测试样本。

| localStorage 键 | 源码 / 内容 |
| --- | --- |
| `xiaoya-english:state:v1` | `learning.js`，学习证据与更正 |
| `xiaoya-english:practice-plan:v1` | `practice-plan.js`，新学/复习/自由练习参与日志 |
| `xiaoya-english:challenges:v1` | `challenges.js`，挑战尝试、帮助、邀请、推迟记录 |
| `xiaoya-english:garden:v1` | `garden.js`，A 花盆余额、种子、花朵 |
| `xiaoya-english:meadow:v1` | `garden-meadow.js`，B 经济、购买、种植、挑战奖；当前对象 `schemaVersion: 3`，键名仍是 v1 |
| `xiaoya-english:preferences:v1` | `experience.js`，麦克风许可意愿、引导等偏好 |
| `xiaoya-english:garden-variant:v1` | `experience.js`，A/B 选择；URL `garden` 可用于指定体验 |
| `xiaoya-english:voice:v1` | `voices.js`，示范声音选择 |

### 必须保留的不变量

- **身份稳定。** 115 个兼容事件归并为 113 个表达，84 句核心课程。旧事件不是可随意删除的重复数据；要用 canonical 映射归并。`CHALLENGE_UNITS` 当前按核心数组每 4 项切片组成 21 组，直接重排核心数组会改变同一挑战 ID 的含义；扩展或重组须显式处理迁移。
- **证据与参与分开。** `recordEvidence` 的 `attemptId` 去重，结果分 `independent` / `supported` / `not_yet` / `unclear` / `device_error`。来源、是否帮助、家长更正均有语义。家长更正追加记录，不抹掉原始事实；机器星级不等于语音学发音准确率。
- **日期是本地日历。** `localDay` 与 `addPracticeDays` 管理 YYYY-MM-DD，不用 UTC 日期截断代替本地天数。复习间隔 `REVIEW_INTERVALS = [1, 3, 7, 14, 30]`，同日重复不快速晋级。
- **A/B 分账，共享学习。** 学习证据、练习安排和音色共享，A/B 钱包与花朵分开。练习记录的 `rewardVariant` 关联奖励去向，不因切换花园重复领取。
- **奖励有凭据。** `experience.js` 的 `savePractice` / `restorePracticeRewards`、`challengeChange` / `restoreChallengeRewards`、`gardenChange` 管理落盘与断点恢复。奖励以轮次或挑战 ID 幂等，写入失败不能先展示领取成功；支持 Web Locks 的环境须在锁内重读最新值。
- **数值变化要迁移。** B 日常选择 2 贝壳或 2 水，首轮 2 贝壳＋3 水；普通花 5 次水、巨型花 10 次。挑战每组首次通关 4 贝壳＋6 水，完成 3/6 个不同组分别一次限定种子。A 仍为 3 贝壳＋2 水、两次开花。旧奖励版本与承诺数量不能因新常量重算。
- **存档不是宽松 JSON。** `validateState` / `validatePracticePlan` / `validateChallenges` / `validateMeadow` 校验字段、版本、已知 ID 与账本一致性。新增字段须同步创建、验证、迁移与测试，不能通过删 localStorage 避开迁移错误。
- **儿童音频不落盘。** 录音 Blob、回听 URL、原始转写只在内存，不上传、不进学习日志、不作为生成素材；下载到设备的预制示范音频是另一个概念。

端口、主机名、浏览器或浏览器配置变更都会改变存档位置；`127.0.0.1` 与 `localhost` 也是不同 origin。启动器换备用端口后看到空花园，不应直接诊断为数据丢失。测试必须使用独立浏览器上下文，不能清空用户正在验收的存档。

### GM 隔离

`runtime.js`：`GM_SANDBOX = INTERNAL_BUILD && query.gm === 'test'`，测试存储由空白 `createMemoryStorage()` 创建，不复制真实孩子的记录。刷新即重置，退出移除 GM 参数后重新读取正式存档。打开工作台审核资源不等于进入免录音沙盒。

新增持久化必须通过 `appStorage`；直接调用 localStorage 会穿透 GM 隔离。正式 storage 事件处理在 GM 下跳过；`gmBridge` 的写入操作要求沙盒。免录音操作通过共享 `applySpeechResult` 走流程，但不会启动麦克风或识别模型。GM 导出带 `testing.mode = 'gm-simulation'`、`realLearningEvidence: false` 和 `GM模拟记录-` 文件名前缀，不能作为真实学习效果证据。

公开构建不装入 `gm.js`、`gm.css`、`gm-catalog.json`；只改 URL 不能开启。运行时的构建标志与空桥接守卫仍在正常模块中，不能把“公开隔离”理解为源码中一个 GM 字符都不存在。

## 4. 声音、图片与识别的离线边界

| 资源 | 当前实现 | 什么情况下可离线 |
| --- | --- | --- |
| 英文示范、中文帮助和引导 | 821 段静态音频，14,886,530 字节；`audio-pack.js` 与 SW 校验字节数、SHA-256 | 当前构建完整声音包通过校验后；首次需从本站取得资源，运行时不生成 TTS |
| 课程与界面图片 | 229 张进入当前 GM 图片索引；故事按需加载，保留绘图降级 | 已访问并被缓存的图片；声音就绪不代表所有图片已缓存 |
| 语音识别 | 本机 Worker / WASM，Whisper tiny.en，`speech-assets.js` 的 10 项固定资源，总计 81,191,822 字节 | 单独下载并校验模型及运行时后；声音整包状态不代表模型就绪 |
| 核心界面 | 按构建指纹缓存的 JS/CSS/入口资源 | 服务工作线程正确安装并控制当前页面后 |

`audio-pack.js` 的 `startAudioPack` / `retryAudioPack` 等待匹配当前构建的控制器与缓存状态。`sw.template.js` 的核心缓存为 `xiaoya-core-<build>`，声音缓存为 `xiaoya-audio-v3`，识别缓存为 `english-sprout-speech-v1`。声音支持 Range 请求；整包下载可复用已校验项，安装成功后才接管。升级会兼顾仍开的旧标签页，不用清除全部缓存解决版本问题。

v0.16.1 的启动器打开带构建指纹的独立 HTML 路径，绕过旧 SW 对 `/xiaoya/` 的缓存命中；单纯添加查询参数不能达到这个效果。该 HTML 与本次 `index.html` 字节一致，列入核心缓存与完整性清单。新版 SW 对 `/xiaoya/` 和 `index.html` 导航先请求服务器的新页面；网络失败或响应不属于本产品时，回退本 SW 已校验的离线入口，不把新 HTML 写进旧构建的缓存。新版页面不等待整个声音包完成才可打开；声音整包仍需完整校验后启用，现有活动页不会被强制刷新。

图片按需缓存；改图优先使用明确的新资源路径并更新映射，避免同名文件被旧缓存覆盖。声音更换须让构建清单中的字节数和 SHA 变化，核对新产品声音缓存方案；旧产品声音则遵守 `src/media.js` 与根 `sw.template.js` 的版本同步约定。

### 本地识别的实现和限制

`speech-local.js` 的 `prepareSpeech` / `assessRecording` 使用 `speech-assets.js` 清单，经共享 `src/speech-download.js` 校验下载；`speech-worker.js` 只允许已校验同源资源和自己创建的 Blob URL，不允许模型库回退到 CDN。模型不接收目标答案提示，识别输出再交给共享 `src/speech-match.js` 做句子匹配。修改这两个共享文件要回归旧产品。

固定依赖及许可见 `public/xiaoya/speech/whisper-tiny-en-v1/NOTICE.md` 和其 licenses 目录：Whisper 模型 revision `2575352d61be1bf7225cf8f8b268a4678025fc58`（MIT）、Transformers.js 4.3.1（Apache-2.0）、ONNX Runtime Web `1.31.0-dev.20260914-8d85527a0`（MIT 及第三方声明）。这些是当前锁定版本，不表示最新版本。旧 `public/speech/` 的 Vosk 资料属于旧产品。

`node scripts/setup-xiaoya-speech.mjs --verify` 校验本地模型；不带 `--verify` 可能联网获取清单中的缺失/损坏资源，是维护命令，不是儿童端调用付费 API。评分是词句匹配结果，真实幼儿口音、噪声和设备差异仍需实测。GM 模拟、合成示范音回归都不能证明幼儿识别准确率。

浏览器回收缓存、首次打开新 origin、缺少 Service Worker 或用 `file://` 打开时，不能承诺完整离线。发布/分享须使用支持相应浏览器能力的静态 HTTPS 站点，或保留本地 HTTP 启动器及资源；本机调试服务不自动等于对外部署。

## 5. 环境、构建与启动

### 环境核对

- 当前本机核实 Node **24.19.0**、Python **3.13.1**；现有 Pages CI 使用 Node **22**。这是已核对环境，不是所有版本兼容承诺。
- `package.json` 没有 dependencies/devDependencies；常规构建和 Node 单测使用内置模块，不需要先执行 `npm ci`。音频/图片生产脚本另有各自依赖，按内容流水线读取。
- Python 启动器使用标准库。`启动小芽英语.vbs` 的 Pythonw 查找候选含本机 Python 3.13 路径；换机必须核对实际 Pythonw/pyw，可维护性问题不能通过依赖 Codex 私有安装路径解决。
- 浏览器脚本使用 Playwright，当前可用版本 **1.62.1**，通常启动已安装的 `msedge`。依赖未列入 package.json；默认回退路径是本机 Codex 缓存，其他 AI/设备应设置 `PLAYWRIGHT_MODULE` 为自己的 Playwright 模块路径并确认浏览器存在。不要误以为 `npm test` 会安装它。

### 标准命令

以下从实际 checkout 根目录执行；只有维护者需要命令行，用户日常双击启动器。

```powershell
npm test
npm run build:dev                    # 内测，含 GM
python launcher_xiaoya.py --no-browser
# 对外构建时使用：
npm run build                        # 默认 public，不含 GM 工作台
```

`scripts/build.mjs` 清理本仓的 `dist/`、复制 `public/` 与旧产品，再调用 `buildXiaoya`。两种构建都会覆盖同一个 dist，不能并发构建或在浏览器测试中途换渠道。`public/` 会整体进入发布包；不要把日志、真实存档、私密配置或生成过程文件放进这里。只部署公开构建的 dist，不发布工作树本身。

`build-xiaoya.mjs` 的 `MODULES` 是显式模块列表；新增模块须同步打包与离线清单。构建生成 `build-config.js`、`releases/<build>/`、`start-<build>.html`、`audio-pack.json`、`version.json` 和 SW；内测另生成 GM 资源索引。共享识别匹配/下载模块会复制进新产品 release 的 `shared/` 并重写导入，不直接以源码原路径发布。

v0.16.1 核对值：内测 `662cdacbb1dd`，公开 `c3fda79f50af`。构建指纹来自文件字节，换行或资源变化可改变它，不手改指纹去“对齐”。核验 `dist/xiaoya/version.json` 和浏览器实际页内版本；看到相同 URL 不能证明侧栏正在运行最新模块。

### 启动器与版本诊断

`launcher_xiaoya.py` 从自身位置定位工程，使用 loopback `127.0.0.1`，候选端口 24756–24766。通过 `/__xiaoya_english_health` 的 app/protocol/project 身份验证复用同工程服务；其他应用占用端口则尝试后续端口。缺少 dist 时生成内测包；已有 dist 时不会擅自覆盖，因而要主动核对现有包是 internal 还是 public。

重启电脑后双击当前工程的 `启动小芽英语.vbs`，它传入 `--garden b` 打开 B 花园临时预览；本机父目录的 `启动小芽英语最新版.vbs` 转交到此入口。`startup_path` 从本地 `version.json` 校验 12 位十六进制指纹、对应 HTML 文件及目录边界后选择新入口；旧构建没有该文件时兼容回退 `/xiaoya/`。`launcher_xiaoya.py --garden a|b` 支持指定预览，端口来自实际启动/复用结果；无参数仍选择新入口，但沿用保存的花园偏好。VBS 修改日期只代表脚本最后修改时间，不代表其所加载的构建日期，版本以 GM 标题和 `/xiaoya/version.json` 为准。运行中刷新页面不会自动替你构建或替换错误工程；排查顺序是工程目录 → 服务健康身份 → dist 渠道/版本 → 页面实际版本 → 对应资源响应。只有需要更新的受控步骤才重启，不用结束所有 Python/Node 进程。

`.github/workflows/pages.yml` 在 main 推送或手动触发时执行 Node 单测、公开构建并发布 dist；这属于既有仓库 Pages 流程，新产品当前没有对外发布。保存接力提交不构成发布授权。换分支与 worktree 合作见 [AI 接力说明](AI_HANDOFF.md)。

## 6. 按风险选择验证

发布基础要求是 `npm test`、`npm run build`。UI/媒体变更执行相关新产品浏览器脚本，并回归旧产品 `tests/browser.cjs`；端口/启动行为变更执行 Python 启动器测试。无行为变化的文档维护只检查事实、链接和差异，不覆盖用户正在测试的构建。

| 变更风险 | 优先验证入口（均相对仓库根） |
| --- | --- |
| 课程归并、复习、证据 | `tests/xiaoya-curriculum.test.js`、`xiaoya-learning.test.js`、`xiaoya-practice-plan.test.js`；`tests/xiaoya-practice-browser.cjs`、`xiaoya-compact-browser.cjs` |
| 挑战、奖励账本、断点恢复 | `tests/xiaoya-challenges.test.js`、`xiaoya-challenge-rewards.test.js`、`xiaoya-economy.test.js`、`xiaoya-meadow.test.js`；对应 `xiaoya-challenge-browser.cjs`、`xiaoya-economy-browser.cjs` |
| 单击录音、引导、声效 | `tests/xiaoya-single-tap.cjs`、`xiaoya-recording-latency.cjs`、`xiaoya-idle-hint-browser.cjs`、`xiaoya-three-stars-browser.cjs`；`xiaoya-ui-guidance.test.js` |
| 花园命中、根部、浇水 | `tests/xiaoya-meadow-hit-browser.cjs`、`xiaoya-meadow-anchor-browser.cjs`、`xiaoya-watering-browser.cjs`；`xiaoya-watering-layout.test.js`、`xiaoya-watering-gesture.test.js` |
| 图片/配音/内容包 | `tests/xiaoya-phrase-pack.test.js`、`xiaoya-phrase-delivery.test.js`、`xiaoya-phrase-art.test.js`；`xiaoya-phrase-pack-browser.cjs`、`xiaoya-art-completion-browser.cjs`、`xiaoya-offline-audio-browser.cjs` |
| 识别与下载完整性 | `tests/xiaoya-speech-signal.test.js`、`speech-match.test.js`、`speech-download.test.js`、`speech-download-recovery.test.js`；`xiaoya-speech-quality.cjs`、`xiaoya-speech.cjs` |
| GM 隔离、构建渠道 | `tests/xiaoya-build.test.js`、`xiaoya-runtime.test.js`；内测/公开两种构建分别运行 `tests/xiaoya-gm-browser.cjs` |
| 启动器、端口 | `python -m unittest tests.test_launcher tests.test_xiaoya_launcher` |
| 旧 SW 升级、首次启动、离线入口 | `tests/xiaoya-startup-update-browser.cjs`，独立服务与浏览器，保留旧 SW 缓存行为作回归 |
| 首页挑战/花园入口排列与显隐 | `tests/xiaoya-home-entry-browser.cjs`，桌面、窄屏、横屏及真实开放条件 |
| 共用构建或共享模块 | 上述相关项＋旧产品 `tests/browser.cjs`；必要时旧产品领域单测 |

表格中省略 `tests/` 前缀的文件仍在 tests 目录。不是每次小改都把所有历史脚本跑一遍；根据修改路径和未解决风险扩展验证。浏览器用例有些注入假麦克风/识别结果，有些播放真实预制声音；报告需说清范围，不能只写“全部体验通过”。

GM 两渠道验证示例（会覆盖 dist，不与其他构建并行）：

```powershell
npm run build:dev
node tests/xiaoya-gm-browser.cjs
npm run build
$env:XIAOYA_EXPECT_PUBLIC = '1'
node tests/xiaoya-gm-browser.cjs
Remove-Item Env:XIAOYA_EXPECT_PUBLIC
# 若交回给用户的是内测环境，再运行 npm run build:dev，并核对最终版本。
```

GM 脚本默认临时启动隔离静态服务；其他脚本多数需要已运行的本地服务。`TEST_URL` 一般传 origin，如 `http://127.0.0.1:24756`；`xiaoya-speech-quality.cjs` 传完整 `/xiaoya/` 入口。执行前读脚本开头，不能把一个环境值盲用到全部脚本。部分脚本支持 `XIAOYA_TEST_FILTER`；筛选运行必须标明未跑其余用例。

旧产品浏览器默认 24736；要测新产品同一 dist 中的旧页面，可设置 `TEST_URL=http://127.0.0.1:24756`。`REPORT_NAME` 应用新的安全名称，报告会写 `test-results/`，并可能生成 `docs/UI_QA_<REPORT_NAME>.md`；提交前核对归属，不把所有自动报告一并入库。

### 基线证据与真实边界

v0.16.1：Node 单测 689/689、GM 内测浏览器 9/9、公开隔离 1/1、旧产品浏览器 36/36、Python 启动器 30 项（29 通过、1 平台跳过）；最终包首页布局 7/7、旧 SW 升级 7/7、图片加载定向 4/4。完整命令、构建差异与实际范围见 [实施记录 v0.16.1](XIAOYA_IMPLEMENTATION.md) 和 [旧产品回归摘要](UI_QA_xiaoya-v0161-legacy.md)。

原始日志在忽略入库的 `test-results/`，不会自动随 Git 转移。下一个 AI 不应凭这些历史数字宣称自己改动已通过；交回时写清提交、渠道、命令、通过/失败/跳过、证据路径及未测项。真实幼儿、物理麦克风、实体手机、长期学习效果与经济节奏仍需用户验收。

## 7. 常见问题定位

| 症状 | 先检查 |
| --- | --- |
| 侧栏还是旧版或没有 GM | worktree / 服务身份 / `dist/xiaoya/version.json` 渠道 / 页内构建；不要只添加随机 URL 参数 |
| 大部分声音不播 | `audio-pack.js` 状态、当前 SW 构建、MP3 响应与清单校验、用户手势/暂停生命周期；不要直接改成在线 TTS |
| 声音就绪但评分未就绪 | 独立的 `speech-assets.js` 模型资源、下载/校验与 Worker 状态，不能把 81 MB 识别包当 15 MB 配音包 |
| 按钮要点两次或录音漏开头 | `prepareRecording` / `beginRecording` 的实际 ready 回调、点击处理和麦克风许可意愿；检查单击及录音延迟用例 |
| 花朵漂移、点不到、浇错 | `meadow-art.js` 的根点、`meadow-hit-shapes.js` 的可见命中区、`layoutMeadowWatering`；换花图后按需重生成命中数据 |
| 奖励重复或没有到账 | 稳定 round/challenge ID、领域校验、锁内重读、pending 恢复流程；不直接修改余额凑结果 |
| 学习记录“消失” | 浏览器/端口/origin 是否变了、是否处于 `gm=test`、校验错误；先保留与导出原始记录，不能先清空缓存/存档 |

技术变更交回时同步实际受影响的短交接与使用文档，不重复建立另一套状态中心；具体模板见 [AI 任务交接模板](templates/AI_TASK_HANDOFF.md)。
