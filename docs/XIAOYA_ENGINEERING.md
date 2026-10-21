# 小芽英语 · 技术地图

更新：2026-10-21，当前为小芽英语·自由花园版 v0.24.0。分支、构建指纹和本轮验证记录以 [PROJECT_CONTEXT](../PROJECT_CONTEXT.md) 为入口，历次证据见 [实施记录](XIAOYA_IMPLEMENTATION.md)。这里记录可定位的实现约定，不把历史设计提案当成当前行为。

## 1. 先分清两个产品

| 范围 | 新产品：小芽英语 | 旧产品：英语小芽 |
| --- | --- | --- |
| 源码 | `xiaoya/` | `src/` |
| 浏览器入口 | `/xiaoya/`；启动器使用 `/xiaoya/start-<build>.html`，所有入口均为自由花园 | `/` |
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
| 阶段挑战 | `challenges.js`：`CHALLENGE_UNITS`、`recordChallengeAttempt`、`recordChallengeHelp`、`challengeStepProgress`、`getChallenges`、`invitationFor` | 同一句三颗星一次或两颗星累计两次通过；一颗星不通过。已过步骤与第一次两星保留；游戏通关不等于长期掌握 |
| 旧花盆历史兼容 | `garden-history.js`：`readGardenHistory` | 只读旧轮次供学习兼容、保留原始归档供导出；不恢复 A 花园界面、余额交易或待发奖 |
| 自由花园经济 | `garden-meadow.js`：`rewardRound`、`claimReward`、`rewardChallenge`、`redeemChallengeSeed`、`ensureShop`、`reserveOffer`、`buyOffer`、`waterPlant` | 奖励、购买、逐关种子及旧关补发都需幂等；旧余额与未领取承诺保留 |
| 挑战目标花 | `challenge-flowers.js`；`challenges.js`、`garden-meadow.js` | 21 组分别固定映射一朵花，卡片明示目标；首次通关每组一颗对应种子，不再新增 3/6 组累计限定奖励 |
| 可保存经济数值 | `economy-settings.js`：`DEFAULT_ECONOMY_SETTINGS`、`getEconomySettings`、`normalizeEconomySettings`、`createEconomySettingsStore` | 11 项范围校验；奖励与新种子的成长属性各自在创建时保存快照，不追改旧承诺 |
| 每日轮换问候 | `welcome-greetings.js`：`nextWelcomeGreeting`、`createWelcomeGreetings`；`experience.js`：`scheduleWelcomeGreeting`、`dailyWelcomeId`、`welcomeVoice` | 六句洗牌、同日稳定；只影响外观偏好。离开首页/弹窗/后台取消，浏览器手势限制不能弹错误提示 |
| 六袋盲盒与种子配色 | `blindbox-ui.js`：`blindboxView`；`seed-appearance.js`：`seedAppearance`、`SEED_COLORS`；`experience.js`：`openBlindbox`、`buyMystery`、`blindboxVoice`、`plantBlindboxSeed` | 进入不扣费；选袋先持久化再动画；切页/后台/GM 取消迟到声音；色彩不改变花种身份或概率 |
| 自由花园画面及触摸 | `meadow-ui.js`：`meadowView`、`bindMeadowInteractions`、`layoutMeadowWatering`；`meadow-art.js`、`meadow-hit-shapes.js`、`meadow.css` | 根点、透明像素命中、水滴与对应植物、逐滴成长；不是只改 CSS 视觉尺寸 |
| 三种示范音色 | `voices.js`：`VOICES`、`readVoice`、`saveVoice`、`lessonAudio` | Aiden / Ryan / Pip 使用同一学习进度；切声音不能重复发奖 |
| 播放、录音、评分 | `audio.js`：`playSound`、`prepareRecording`、`beginRecording`、`finishRecording`、`replayClip`、`recognize`；`speech-local.js`、`speech-worker.js` | 真正录音就绪后才提示开口；停止/取消生命周期与临时音频清理 |
| 引导与反馈 | `experience.js` 的 `scheduleIdleHint`、`sound`；`feedback.js`；`feedback.css`、`paper.css`、`style.css` | 指引手仅闲置后出现；录音期间、后台与关弹窗时不能留下音效/提示 |
| 页面背景音乐 | `garden-music.js`：`createGardenMusic`、`gardenMusicSettings`、`gardenMusicGain`；`experience.js`：`syncGardenMusic`、`gmBridge.musicSettings/setMusicSettings/previewMusic` | 首页、花园、商店和选盲盒 4 个使用点复用原钢琴；总音量默认 50%，乘使用点音量后使用平方增益，语音压至 `min(0.12, gain*0.24)`。循环通道不随浇水重建；学习无 BGM，录音/后台/GM 时停止，GM 显式试听除外。来源与哈希见 `public/xiaoya/audio/garden-piano-source.json` |
| 交互声音与配置 | `sound-catalog.js`：`SOUND_ASSETS`、`SOUND_EVENTS`；`sound-settings.js`：`createSoundSettingsStore`；`sound-player.js`：`createSoundPlayer`；`experience.js`、`feedback.js` | 17 段声匣短音效，30 个交互＋4 个 BGM 使用点；语音/回听/录音优先，单个 SFX 通道按优先级和冷却间隔播放。默认录音启动无声、结束提示禁用。完整映射见 [声音设计](XIAOYA_SOUND_DESIGN.md)，来源见 [筛选记录](XIAOYA_SOUND_SELECTION.md) |
| GM 音效管理 | `gm-sounds.js`：`createSoundWorkbench`；`gm.js` | 按使用点查询、试听、禁用、解绑、替换、上传、恢复和导出；单文件 2 MiB、含 Base64 的总配置 5 MiB。修改不写学习或奖励，模拟模式只写内存；公开包排除管理面板，保留正常播放模块 |
| GM 内测 | `gm.js`、`gm.css`、`runtime.js`；`experience.js` 的 `gmBridge` | 八页：课程速查、声音库、图片库、背景音乐、音效管理、花朵成长、数值与备份、流程测试；公开包物理排除、内存存档隔离、模拟标记、真实儿童记录不变 |
| GM 花朵成长 | `gm-growth.js`、`growth-core.js`、`growth-motion.js`、`growth-settings.js`、`growth-catalog.js` | 审核目录有 50 花 × 5 阶段＋18 种子，其中 21 花已用于实际挑战，29 花仍为候选；审核默认 10 水、40/55/70/85/100%，逐滴插值；全画布根点 `(192,451)` 固定，不裁切。六项统一 motion 应用于实际花园，审核水数、阶段比例和单花覆盖仍只影响预览，不写儿童账本 |
| GM 数值与统一备份 | `gm-economy.js`、`tuning-backup.js` | 11 项即时预览、明确保存；导出四类已保存参数，导入全量预检、预览、确认后写入，写失败尝试回滚并报告；不导入孩子的学习、花园或录音 |
| 静态发布与离线 | `scripts/build.mjs`、`scripts/build-xiaoya.mjs`、`xiaoya/audio-pack.js`、`xiaoya/sw.template.js` | 两产品、渠道、完整声音/图片清单、后台 SHA-256 校验、版本更新需一起核对 |

表中未带目录的 JS/CSS 均在 `xiaoya/`。小模块大多是纯状态函数；`experience.js` 负责将 UI、存档写入、异步播放与它们连接。新增功能先找对应领域模块，不把全部规则继续写进界面事件回调。

`experience.js` 用 `uiGeneration`、故事/录音/声音的取消状态阻止旧 Promise、定时器回调污染新页面。`stopSession`、`suspend`、`resume`、`openModal` 是生命周期交界；修改导航、GM、录音、奖励时必须覆盖这些路径。

## 3. 数据与存档约定

正式数据保存在浏览器当前 origin 的 localStorage；领域模块先校验，UI 经 `runtime.js` 的 `appStorage` 读写。孩子的学习和花园存档目前只有 `experience.js` 的 `exportState` JSON 导出，没有导入、账户或云同步；错误状态导出可能含原始存档，属于用户数据，不应提交或作为公开测试样本。GM 已支持四类调参配置的统一导入/导出，它不恢复或改写孩子的数据。

| localStorage 键 | 源码 / 内容 |
| --- | --- |
| `xiaoya-english:state:v1` | `learning.js`，学习证据与更正 |
| `xiaoya-english:practice-plan:v1` | `practice-plan.js`，新学/复习/自由练习参与日志 |
| `xiaoya-english:challenges:v1` | `challenges.js`，挑战尝试、帮助、邀请、推迟记录；schema 2 新增可选 `stars`，旧记录不推断星级，继续按原结果兼容 |
| `xiaoya-english:garden:v1` | `garden-history.js` 只读旧 A 花盆归档；不删历史数据，也不再开放操作 |
| `xiaoya-english:meadow:v1` | `garden-meadow.js`，自由花园经济、购买、种植、挑战奖；当前对象 `schemaVersion: 5`，保留 `welcomeGifts: [{date, kind}]`，增加种子成长快照与逐关种子奖励；学习奖励 v4、挑战奖励 v2 保存金额快照，键名仍是 v1 |
| `xiaoya-english:welcome-greetings:v1` | `welcome-greetings.js`，schema 1 的日期、当日语音 ID、剩余轮换列表；只影响欢迎语，不是奖励凭据。经 appStorage 隔离 GM；存储失败回退内存，不阻塞学习 |
| `xiaoya-english:preferences:v1` | `experience.js`，麦克风许可意愿、引导及 `gardenMusic:{enabled,volume}`；缺失音乐偏好默认开启/0.5，数值夹到 0–1。GM 普通内测允许持久化此偏好，模拟模式通过 `appStorage` 只写内存，不覆盖真实设置 |
| `xiaoya-english:sounds:v1` | `sound-settings.js` 经 appStorage 保存音效总开关/音量、34 个使用点的素材绑定/开关/音量及上传音频；默认总音量 0.65，BGM 总音量仍在 preferences。单文件 2 MiB，UTF-8 序列化配置 5 MiB；失败保留最后有效设置。上传仅内嵌音频，不接受远程 URL；普通模式留当前浏览器，GM 沙盒刷新重置 |
| `xiaoya-english:growth-settings:v1` | `growth-settings.js` 经 appStorage 保存；schema `xiaoya-growth-settings/v1`，releaseId `v09-growth-complete`，统一 defaults 与稳定花 ID 的 overrides；新增顶层 motion，旧 v1 设置自动补默认值。动效范围：duration 700–2400ms、sway 0–18°、flex 0–100%、bounce 0–24%、crossfade 120–600ms（最多总时长一半）、particles 0–100%。总水量 4–50、五阶段比例 15–150%；GM 沙盒只写内存。无效输入不保存，写失败明确提示并支持重试/导出；只读打开不覆盖损坏数据 |
| `xiaoya-english:economy-settings:v1` | `economy-settings.js` 经 appStorage 保存 11 个平面数值：普通/首次/挑战的贝壳与水奖励、盲盒价、普通/巨型水数、巨型概率和倍率。奖励 0–1000 整数，盲盒价 1–1000 整数，水数 4–50 整数，概率 0–1，倍率 1–4；保存后派发 `economy-settings-changed` |
| `xiaoya-english:garden-variant:v1` | 旧 A/B 偏好键，当前忽略且不再写入；旧 URL `garden=a` 也不能进入 A |
| `xiaoya-english:voice:v1` | `voices.js`，示范声音选择 |

### 必须保留的不变量

- **身份稳定。** 115 个兼容事件归并为 113 个表达，84 句核心课程。旧事件不是可随意删除的重复数据；要用 canonical 映射归并。`CHALLENGE_UNITS` 当前按核心数组每 4 项切片组成 21 组，直接重排核心数组会改变同一挑战 ID 的含义；扩展或重组须显式处理迁移。
- **证据与参与分开。** `recordEvidence` 的 `attemptId` 去重，结果分 `independent` / `supported` / `not_yet` / `unclear` / `device_error`。来源、是否帮助、家长更正均有语义。家长更正追加记录，不抹掉原始事实；机器星级不等于语音学发音准确率。
- **星级与挑战通关一致。** `challengeStepProgress` 同时供界面和挑战汇总使用；三颗星一次通过，求助后也可通关，两颗星同一句累计两次通过。一颗星、无声和设备失败不清空已得的第一次两星。重玩按尝试边界重新累计，不能用历史通关自动通过；求助或两星累积通关不写独立掌握。
- **日期是本地日历。** `localDay` 与 `addPracticeDays` 管理 YYYY-MM-DD，不用 UTC 日期截断代替本地天数。复习间隔 `REVIEW_INTERVALS = [1, 3, 7, 14, 30]`，同日重复不快速晋级。
- **只有自由花园，历史不抹除。** 学习证据、练习安排、音色及既有自由花园存档继续使用原键。旧 A 轮次只用于学习历史兼容，原始归档可导出；不迁移 A 钱包、花朵或待发奖励到自由花园。历史 `rewardVariant` 保留，新奖励只写 `b`。
- **奖励有凭据。** `experience.js` 的 `savePractice` / `restorePracticeRewards`、`challengeChange` / `restoreChallengeRewards`、`gardenChange` 管理落盘与断点恢复。奖励以轮次或挑战 ID 幂等，写入失败不能先展示领取成功；支持 Web Locks 的环境须在锁内重读最新值。
- **欢迎小礼物不代表学习。** `garden-meadow.js` 的 `welcomeGift` / `claimWelcomeGift` 按显式本地日期判断资格；领取日期必须严格递增，倒退日期不重复发奖，按收据数交替送 1 贝壳 / 1 水。旧 schema 1–4 先验证原账本再迁移到 5；余额校验包括礼物，不写学习证据、练习轮次或首次学习奖。`experience.js` 的 `claimWelcomeGift` 复用 `gardenChange` 的存储适配与 Web Lock，先保存再显示成功；稳定挂载在 `#app` 外的原生 dialog 经 wrapped → opening → opened → closing 原地揭晓；背景 inert，只有一次拆礼物操作。收据先保存、最短展示 2.4 秒，听完用途后淡出；7 秒保护上限避免声音失败卡住。切页、后台、GM 与存储同步取消旧回调，恢复首页，不自动进入学习。GM `previewWelcome` 只操作内存花园。
- **问候不等于领取。** 首页礼物处于 wrapped、页面可见且无其他弹窗/声音时，400ms 后尝试当日欢迎语；同一页面会话每天只自动尝试一次。刷新保持同日选择，领完不自动播放。切页、弹窗、后台和 GM 工作台均取消；GM 沙盒不自动问候。`sound(...,{automatic:true})` 仅静默处理自动欢迎的 `NotAllowedError`，手动播放与其他真实故障保留反馈。六句循环不重复，下一轮首句避开上一轮末句；初次用户使用专用 first 介绍。
- **盲盒先保存再揭晓。** `buyMystery` 复用 `gardenChange` / `openSeedPack` 与 Web Lock；六袋只表示包装选择，不是六个预定品种或不放回奖池。待种种子阻止重复购买，存储失败不展示成功，刷新不重抽。`mysteryVoiceRun`、页面代际与 pendingSeed ID 防止退出/后台/GM 后播放旧结果。`seed-appearance.js` 只根据稳定 ID 或有效 `seedColor` 标签派生配色和花名，存档仍保存原 flowerId，不迁移 schema、不按颜色替换品种。
- **奖励数额在承诺时固定。** 推荐值为日常选择 2 贝壳或 2 水、首轮 2 贝壳＋3 水、挑战每组首次通关 4 贝壳＋6 水；GM 可保存调整。学习奖励 v4、挑战奖励 v2 在创建时保存金额，待领取和旧版本奖励不能按新设置重算。21 组首通各给对应种子；旧 3/6 限定花已得或已承诺的保留，但不新增累计奖励。旧已通关组补齐对应种子一次，不重发货币。
- **成长属性属于每颗种子。** 新盲盒和商店从 10 个普通品种中选择；每颗新种子（包括首次雏菊、指定购买和挑战奖励）独立抽巨型，推荐概率 5%、普通 5 水、巨型 10 水和 2.5 倍大小。取得时保存成长快照，旧花水数和尺寸不追改；旧存档已展示或保留的巨型商品继续兑现原品种、次数和尺寸，不重新抽取。
- **存档不是宽松 JSON。** `validateState` / `validatePracticePlan` / `validateChallenges` / `validateMeadow` 校验字段、版本、已知 ID 与账本一致性。新增字段须同步创建、验证、迁移与测试，不能通过删 localStorage 避开迁移错误。
- **儿童音频不落盘。** 录音 Blob、回听 URL、原始转写只在内存，不上传、不进学习日志、不作为生成素材；下载到设备的预制示范音频是另一个概念。

端口、主机名、浏览器或浏览器配置变更都会改变存档位置；`127.0.0.1` 与 `localhost` 也是不同 origin。启动器换备用端口后看到空花园，不应直接诊断为数据丢失。测试必须使用独立浏览器上下文，不能清空用户正在验收的存档。

### GM 隔离

`runtime.js`：`GM_SANDBOX = INTERNAL_BUILD && query.gm === 'test'`，`createSandboxStorage()` 在空白内存存档中只继承经济、成长、音效和 `gardenMusic` 四类设置，不复制孩子的游戏或学习记录。沙盒内修改参数、导入和跑流程都只写内存；刷新即重置，退出移除 GM 参数后重新读取正式设置和存档。打开工作台审核资源不等于进入免录音沙盒；普通内测 GM 保存参数会持久化到当前浏览器。

`garden-meadow.js` 的 `hasUnlimitedResources()` 同时要求内部沙盒和 `testMode: 'unlimited-resources'`。只有两者满足才免购买/浇水消耗；正式模式和公开包不接受这个标记。钱包显示 ∞，数值账本仍正常记录奖励；商品、待种种子、成熟植株及奖励幂等检查不跳过。详见 [GM 资源、音量与成长接入](XIAOYA_GM_RESOURCE_MOTION.md)。

实际浇水由 `meadow-motion.js` 的 `createMeadowMotion()` 接入共享 `growth-motion.js`；每滴重新读取保存的六项统一 motion，覆盖当前全部 35 种花。捕获旧画面、预解码新图后，固定根点 `(80,164)` 播放柔摆、双图淡化和回弹；取消导航/后台旧动画并释放层。21 种新花的 105 张阶段图已用于实际挑战和种植，另 29 种花与 18 张种子图仍是 GM 候选。成长审核的水数、阶段大小和单花覆盖只改变预览；数值页的水数/倍率用于之后取得的新种子。渲染的根点和基准尺寸一致，巨型倍率在外层应用一次。

新增持久化必须通过 `appStorage`；直接调用 localStorage 会穿透 GM 隔离。正式 storage 事件处理在 GM 下跳过；`gmBridge` 的玩法写入操作要求沙盒，参数保存则按当前模式写正式存储或内存。免录音操作通过共享 `applySpeechResult` 走流程，但不会启动麦克风或识别模型。GM 学习记录导出带 `testing.mode = 'gm-simulation'`、`realLearningEvidence: false` 和 `GM模拟记录-` 文件名前缀，不能作为真实学习效果证据。

公开构建不装入 `gm.js`、`gm.css`、`gm-catalog.json`、`gm-sounds.js`、`gm-growth.js`、`gm-economy.js`、`tuning-backup.js`、`growth-catalog.js`，排除剩余 163 张候选图（29 花 × 5 阶段＋18 种子）；只改 URL 不能开启。`economy-settings.js`、`challenge-flowers.js`、正常声音/成长模块及已上线 105 张阶段图仍随公开产品发布，运行时的构建标志与空桥接守卫也保留，不能把“公开隔离”理解为源码中一个 GM 字符都不存在。

### 参数保存、备份和恢复

“数值与备份”即时比较同种普通/巨型花，采用相同地平线和根点，逐水预览不扣资源。11 项输入先留在草稿，必须点击“保存数值”且写入成功才生效；“放弃草稿”和“载入推荐值”不冒充已保存。数值、成长、音效（含上传音频）及背景音乐统一导出为 `xiaoya-tuning-backup/v1`，上限 8 MiB，只导出已保存值，并提示未保存草稿不在备份中。

`tuning-backup.js` 对四类配置的完整字段、版本、范围、上传内容和体积预检，成功后先展示导入预览，确认“恢复这份参数”才写入；坏文件不写任何设置。写失败尝试按原始值回滚，并明确报告失败或回滚失败，不伪报成功。恢复只替换 preferences 中的 `gardenMusic`，不覆盖其他偏好，更不导入学习证据、花园、钱包或录音。成功派发 `tuning-restored`，现有播放和花园读取新的已保存设置。

## 4. 声音、图片与识别的离线边界

| 资源 | 当前实现 | 什么情况下可离线 |
| --- | --- | --- |
| 英文示范、中文帮助、引导、SFX 及 BGM | 866 段静态音频，16,282,316 字节；新增 17 段声匣短音效；`audio-pack.js` 与 SW 校验字节数、SHA-256 | 当前构建完整声音包通过校验后；首次需从本站取得资源，运行时不生成 TTS 或交互音效 |
| 课程与界面图片 | 公开包 329 张（195 故事＋29 纸艺＋105 新花阶段图），25,083,280 字节；内测再加 163 张候选，共 492 张、33,120,438 字节；`art-pack.json` 列出长度与 SHA-256 | 整包后台下载并校验后，包含从未浏览过的课程图；图片包与声音包分别显示状态 |
| 语音识别 | 本机 Worker / WASM，Whisper tiny.en，`speech-assets.js` 的 10 项固定资源，总计 81,191,822 字节 | 单独下载并校验模型及运行时后；声音整包状态不代表模型就绪 |
| 核心界面 | 按构建指纹缓存的 JS/CSS/入口资源 | 服务工作线程正确安装并控制当前页面后 |

`audio-pack.js` 同时管理声音与图片包状态：`startAudioPack` / `retryAudioPack`、`artPackStatus` / `retryArtPack` / `onArtPackChange`。`sw.template.js` 的核心缓存为 `xiaoya-core-<build>`，声音缓存为 `xiaoya-audio-v3`，图片缓存按渠道清单生成，当前构建指纹以 [PROJECT_CONTEXT](../PROJECT_CONTEXT.md) 为准；识别缓存为 `english-sprout-speech-v1`。核心、完整声音包及完整图片包通过长度与 SHA-256 校验后，新 SW 才可激活接管；下载可复用已校验项。本轮音效使用新增 `./sfx/` 路径，未替换既有音频字节，沿用 v3 音频缓存并由清单增量校验；`audio/` 和 `sfx/` 均支持离线 Range 请求。家长页分别显示包进度与重试入口，不用清除全部缓存解决版本问题。

当前 GM 审图索引为 497 项：已上线插画 329 张、剩余候选图 163 张加 5 个应用图标，其中 2 个旧应用图标只供资源审核，不会回到儿童界面。这不是独立故事数量。成长图来源及逐文件哈希、像素一致性回执见 `design/xiaoya-growth-v09-source.json`；重导入用 `scripts/import-xiaoya-growth.mjs --source <v09-growth-complete>`，仅此维护脚本需要带 Pillow/WebP 的 Python，APP 不增加依赖。整批 268 张无损 WebP 共 13,335,410 字节，原 PNG 共 19,680,312 字节；保留完整 RGBA、透明留白与锚点。其中 21 花的 105 图已经接入实际挑战和花园，其余继续在 GM 审核；技术接入不代表用户已验收全部美术。

启动器打开带当前构建指纹的独立 HTML 路径，绕过旧 SW 对 `/xiaoya/` 的缓存命中；单纯添加查询参数不能达到这个效果。该 HTML 与本次 `index.html` 字节一致，列入核心缓存与完整性清单。自 v0.17.0 起，SW 对 `/xiaoya/`、`index.html` 及任意旧 `start-<hash>.html` 导航，在线都请求服务器当前入口；离线回退本 SW 已校验的入口，不把新 HTML 写进旧构建的缓存。此规则以新版 SW 已安装为前提，首次脱离旧控制器仍应使用当前启动器。页面无需等待全包准备才能打开，现有活动页不会被强制刷新。

正式图片全包后台准备，前台只解码当前画面及必要相邻帧；完整图片字节已进入内测和公开构建指纹。改图仍优先使用版本化路径并更新映射，以保持旧发布包一致性。缺图只显示中性占位和重试，不调用旧 SVG 故事或界面兜底；图片后到局部替换，不重建麦克风会话。仅有 `event.hintAudio` 的新 60 句在首次新学缺图时自动补充预制中文情境说明，旧课保留其原上下文帮助；复习、挑战不会因此自动播放答案。声音更换也须改变清单长度/SHA；旧产品声音仍遵守 `src/media.js` 与根 `sw.template.js` 的版本同步约定。

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

`scripts/build.mjs` 清理本仓的 `dist/`、复制 `public/` 与旧产品，再调用 `buildXiaoya`。两种构建都会覆盖同一个 dist，不能并发构建或在浏览器测试中途换渠道。`public/` 默认进入发布包；`public/xiaoya/growth/` 中仅已上线 21 花的 105 张阶段图进入公开包，完整 268 图进入内测。不要把日志、真实存档、私密配置或生成过程文件放进这里。只部署公开构建的 dist，不发布工作树本身。

`build-xiaoya.mjs` 的 `MODULES` 是显式模块列表；新增模块须同步打包与离线清单。构建生成 `build-config.js`、`releases/<build>/`、`start-<build>.html`、`audio-pack.json`、`art-pack.json`、`version.json` 和 SW；内测另生成 GM 资源索引。新产品模块清单包含 `garden-history.js`、`sound-catalog.js`、`sound-settings.js`、`sound-player.js`、`economy-settings.js`、`challenge-flowers.js`；`gm-sounds.js`、`gm-economy.js`、`tuning-backup.js` 等工作台模块仅在内测列表。不再打包旧 `garden.js` 与 `story-art.js`。`public/xiaoya/sfx/` 的 MP3 复制到输出 `sfx/` 并进入音频清单，`SOURCES.json` 同步复制但不算音频条目。共享识别匹配/下载模块会复制进新产品 release 的 `shared/` 并重写导入，不直接以源码原路径发布。

v0.24.0 的内测、公开构建指纹以 [PROJECT_CONTEXT](../PROJECT_CONTEXT.md) 为准。构建指纹来自文件字节，换行或资源变化可改变它，不手改指纹去“对齐”。核验 `dist/xiaoya/version.json` 和浏览器实际页内版本；看到相同 URL 不能证明侧栏正在运行最新模块。

### 启动器与版本诊断

`launcher_xiaoya.py` 从自身位置定位工程，使用 loopback `127.0.0.1`，候选端口 24756–24766。通过 `/__xiaoya_english_health` 的 app/protocol/project 身份验证复用同工程服务；其他应用占用端口则尝试后续端口。缺少 dist 时生成内测包；已有 dist 时不会擅自覆盖，因而要主动核对现有包是 internal 还是 public。

重启电脑后双击当前工程的 `启动小芽英语.vbs`；本机父目录的 `启动小芽英语最新版.vbs` 转交到此入口，均打开自由花园版。`startup_path` 从本地 `version.json` 校验 12 位十六进制指纹、对应 HTML 文件及目录边界后选择新入口；旧构建没有该文件时兼容回退 `/xiaoya/`。`launcher_xiaoya.py --garden a|b` 只保留旧命令兼容，均归一为自由花园；无参数同样进入自由花园，旧偏好不起作用。端口来自实际启动/复用结果。VBS 修改日期只代表脚本最后修改时间，不代表其所加载的构建日期，版本以页面标题/页头、GM 标题和 `/xiaoya/version.json` 为准。浏览器清除站点数据后仍需运行服务重新取得资源；浏览器缓存不能替代重启后的启动器。运行中刷新页面不会自动替你构建或替换错误工程；排查顺序是工程目录 → 服务健康身份 → dist 渠道/版本 → 页面实际版本 → 对应资源响应。只有需要更新的受控步骤才重启，不用结束所有 Python/Node 进程。

`.github/workflows/pages.yml` 在 main 推送或手动触发时执行 Node 单测、公开构建并发布 dist；这属于既有仓库 Pages 流程，新产品当前没有对外发布。保存接力提交不构成发布授权。换分支与 worktree 合作见 [AI 接力说明](AI_HANDOFF.md)。

## 6. 按风险选择验证

发布基础要求是 `npm test`、`npm run build`。UI/媒体变更执行相关新产品浏览器脚本，并回归旧产品 `tests/browser.cjs`；端口/启动行为变更执行 Python 启动器测试。无行为变化的文档维护只检查事实、链接和差异，不覆盖用户正在测试的构建。

| 变更风险 | 优先验证入口（均相对仓库根） |
| --- | --- |
| 课程归并、复习、证据 | `tests/xiaoya-curriculum.test.js`、`xiaoya-learning.test.js`、`xiaoya-practice-plan.test.js`；`tests/xiaoya-practice-browser.cjs`、`xiaoya-compact-browser.cjs` |
| 挑战、奖励账本、断点恢复 | `tests/xiaoya-challenges.test.js`、`xiaoya-challenge-rewards.test.js`、`xiaoya-economy.test.js`、`xiaoya-meadow.test.js`；对应 `xiaoya-challenge-browser.cjs`、`xiaoya-economy-browser.cjs` |
| 单击录音、引导、声效 | `tests/xiaoya-single-tap.cjs`、`xiaoya-recording-latency.cjs`、`xiaoya-idle-hint-browser.cjs`、`xiaoya-three-stars-browser.cjs`；`xiaoya-ui-guidance.test.js` |
| 静态音效、页面音乐与 GM 配置 | `tests/xiaoya-sound-assets.test.js`、`xiaoya-sound-settings.test.js`、`xiaoya-sound-player.test.js`、`xiaoya-sound-pool.test.js`、`xiaoya-sound-preview-volume.test.js`、`xiaoya-sound-music-routing.test.js`、`xiaoya-garden-music.test.js`；`xiaoya-sound-browser.cjs`、`xiaoya-garden-music-browser.cjs`，并核对构建内的 SFX 清单和离线 Range；解码/哈希检查不能代替扬声器听感验收 |
| 自由花园唯一入口、历史兼容 | `tests/xiaoya-free-garden.test.js`；旧 `garden=a`、保存偏好和 GM 均不得恢复 A |
| 花园命中、根部、浇水 | `tests/xiaoya-meadow-hit-browser.cjs`、`xiaoya-meadow-anchor-browser.cjs`、`xiaoya-watering-browser.cjs`；`xiaoya-watering-layout.test.js`、`xiaoya-watering-gesture.test.js` |
| 图片/配音/内容包 | `tests/xiaoya-phrase-pack.test.js`、`xiaoya-phrase-delivery.test.js`、`xiaoya-phrase-art.test.js`；`xiaoya-phrase-pack-browser.cjs`、`xiaoya-art-completion-browser.cjs`、`xiaoya-offline-audio-browser.cjs` |
| 识别与下载完整性 | `tests/xiaoya-speech-signal.test.js`、`speech-match.test.js`、`speech-download.test.js`、`speech-download-recovery.test.js`；`xiaoya-speech-quality.cjs`、`xiaoya-speech.cjs` |
| GM 隔离、构建渠道 | `tests/xiaoya-build.test.js`、`xiaoya-runtime.test.js`；内测/公开两种构建分别运行 `tests/xiaoya-gm-browser.cjs`，内测同时覆盖求助后三星通过、两星累积/中断恢复/重玩及奖励防重 |
| 无限资源与真实花园动效 | `tests/xiaoya-gm-economy.test.js`、`tests/xiaoya-meadow-motion-browser.cjs`；隔离账本、保存参数下一滴生效、花朵根点稳定与导航取消；全部 35 花的渲染覆盖同时核对花种/成长单测 |
| 数值草稿、快照与统一备份 | `tests/xiaoya-economy-settings.test.js`、`xiaoya-economy-snapshots.test.js`、`xiaoya-tuning-backup.test.js`、`xiaoya-economy-browser.cjs`；11 项保存、普通/巨型同根比较、四类备份恢复、坏文件不写入、失败回滚、沙盒隔离及 320px |
| GM 花朵成长 | `tests/xiaoya-growth.test.js`、`xiaoya-growth-motion.test.js`、`xiaoya-growth-assets.test.js`、`xiaoya-growth-browser.cjs`；真实 RAF 帧、逐滴变化、根点、淡化时长、减少动态效果、停止/切换/后台取消、保存/导出/失败重试、沙盒与儿童账本隔离、268 图解码及窄屏全画布。候选资源同时受构建渠道排除测试约束 |
| 启动器、端口 | `python -m unittest tests.test_launcher tests.test_xiaoya_launcher` |
| 旧 SW 升级、首次启动、离线入口 | `tests/xiaoya-startup-update-browser.cjs`、`tests/xiaoya-restart-art-browser.cjs`；独立服务与浏览器，覆盖旧 SW、旧指纹入口和未浏览图片的重启离线读取 |
| 欢迎小礼物、存档迁移与交互 | `tests/xiaoya-welcome-gift.test.js`、`tests/xiaoya-welcome-greetings.test.js`、`tests/xiaoya-welcome-voices.test.js`、`tests/xiaoya-welcome-browser.cjs`；每日幂等与轮换、原生声音、自动播放恢复、双标签、写失败重试、居中遮罩与键盘隔离、单击到账自动淡出、取消、真实动画帧、小屏与 GM 隔离 |
| 六袋盲盒、颜色和结果语音 | `tests/xiaoya-seed-appearance.test.js`、`xiaoya-blindbox-voices.test.js`、`xiaoya-economy.test.js`；购买、刷新、双标签、失败重试、后台取消和离线开袋的历次浏览器证据见实施记录，不当作本轮重跑；儿童布局选择器限定 `#app`，不将独立 GM 面板计入 |
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

v0.24.0 的实际验证范围、结果和构建哈希以 [当前状态](../PROJECT_CONTEXT.md) 与 [实施记录](XIAOYA_IMPLEMENTATION.md) 为准。挑战浏览器使用模拟识别与真实预制语音，不能代替实体麦克风和真实儿童验收。声音资产的来源、文件哈希、解码、时长和静态路径验证不等于人工听感验收；实体设备、扬声器音量和儿童使用时的舒适度仍待用户验收。

历史 v0.22.1：Node 全量单测 **786/786**；欢迎礼物浏览器 **14/14**、GM **10/10**、公开排除 **1/1**、[旧产品浏览器](UI_QA_xiaoya-v0221-legacy.md) **36/36**。两渠道构建通过，最终 dist 为内测。覆盖原生语音、单击领取、原地揭晓及自动淡出、背景不可操作、刷新/双标签防重、存储失败重试、后台取消、GM 沙盒隔离和桌面/320px/横屏布局；截图已查看。该轮未改启动器或媒体文件，未重跑 Python 启动器、完整离线下载、成长动效或独立 BGM 全套。这些不是 v0.23.0 重跑结果，详细证据见 [实施记录](XIAOYA_IMPLEMENTATION.md)。

历史 v0.20.0：Node 单测 **753/753**、欢迎礼物原生浏览器 **11/11**、旧产品浏览器 **36/36**，公开/内测构建通过；这些不是本轮重跑结果。

历史 v0.16.1：Node 单测 689/689、GM 内测浏览器 9/9、公开隔离 1/1、旧产品浏览器 36/36、Python 启动器 30 项（29 通过、1 平台跳过）；最终包首页布局 7/7、旧 SW 升级 7/7、图片加载定向 4/4。完整命令、构建差异与实际范围见 [实施记录 v0.16.1](XIAOYA_IMPLEMENTATION.md) 和 [旧产品回归摘要](UI_QA_xiaoya-v0161-legacy.md)。

原始日志在忽略入库的 `test-results/`，不会自动随 Git 转移。下一个 AI 不应凭这些历史数字宣称自己改动已通过；交回时写清提交、渠道、命令、通过/失败/跳过、证据路径及未测项。真实幼儿、物理麦克风、实体手机、长期学习效果与经济节奏仍需用户验收。

## 7. 常见问题定位

| 症状 | 先检查 |
| --- | --- |
| 侧栏还是旧版或没有 GM | worktree / 服务身份 / `dist/xiaoya/version.json` 渠道 / 页内构建；不要只添加随机 URL 参数 |
| 图片未就绪 | 家长页插画包进度/重试、`art-pack.json` 长度/SHA、当前 SW 与构建；新版只显示中性占位，出现旧 SVG 时应追查旧控制器或错误构建，不恢复绘图兜底 |
| 大部分声音不播 | `audio-pack.js` 状态、当前 SW 构建、MP3 响应与清单校验、用户手势/暂停生命周期；不要直接改成在线 TTS |
| 声音就绪但评分未就绪 | 独立的 `speech-assets.js` 模型资源、下载/校验与 Worker 状态，不能把 81 MB 识别包当 15 MB 配音包 |
| 按钮要点两次或录音漏开头 | `prepareRecording` / `beginRecording` 的实际 ready 回调、点击处理和麦克风许可意愿；检查单击及录音延迟用例 |
| 花朵漂移、点不到、浇错 | `meadow-art.js` 的根点、`meadow-hit-shapes.js` 的可见命中区、`layoutMeadowWatering`；换花图后按需重生成命中数据 |
| 奖励重复或没有到账 | 稳定 round/challenge ID、领域校验、锁内重读、pending 恢复流程；不直接修改余额凑结果 |
| 学习记录“消失” | 浏览器/端口/origin 是否变了、是否处于 `gm=test`、校验错误；先保留与导出原始记录，不能先清空缓存/存档 |

技术变更交回时同步实际受影响的短交接与使用文档，不重复建立另一套状态中心；具体模板见 [AI 任务交接模板](templates/AI_TASK_HANDOFF.md)。
