# 小芽英语 · 文档索引

工程和素材目录分类见 [目录说明](../目录说明-先看这里.md)。
更新：2026-10-21，现行入口同步 v0.25.1，新增配音生产专项交接。先看当前事实，再按任务进入资料；“所有文档更新”指当前入口和适用范围清楚，不把历史报告重写成今天的验收。产品当前版本、构建哈希、代码位置和本轮验证只以 [PROJECT_CONTEXT](../PROJECT_CONTEXT.md) 为准。

## 当前资料

| 要做什么 | 入口 | 维护范围 |
| --- | --- | --- |
| 初次打开项目 | [README](../README.md) | 产品、启动、新旧工程区别 |
| 继续工作、核对交付版本 | [当前状态](../PROJECT_CONTEXT.md) | 当前目录/分支、功能基线、构建、验证与未完成项 |
| 了解项目约束 | [AGENTS](../AGENTS.md) | 开发工具无关的工程规则；遵循当前用户及宿主指令 |
| 换 AI、分工、跨设备、交回 | [AI 接力说明](AI_HANDOFF.md) · [任务模板](templates/AI_TASK_HANDOFF.md) | 接收与返回契约、分支与迁移方式 |
| 修改学习与游戏设计 | [设计约定](XIAOYA_DESIGN.md) | 已实现、保留意图、已淘汰方案、尚待验证的假设 |
| 试玩、审核资源与流程 | [使用说明](XIAOYA_USE.md) | 当前按钮、复习/挑战、花园数值、GM 与离线体验 |
| 改代码、存档、构建或测试 | [技术地图](XIAOYA_ENGINEERING.md) | 模块、状态、运行链路、环境和可执行验证方法 |
| 调整奖励、巨型花或备份全部参数 | [使用说明](XIAOYA_USE.md) · [技术地图](XIAOYA_ENGINEERING.md) | GM“数值与备份”11 项预览/保存；经济、成长、音效与音乐四类备份可导入，孩子数据仍只有导出；schema 5 和奖励快照的兼容边界 |
| 调整全流程声音与 GM 音效配置 | [声音设计与配置](XIAOYA_SOUND_DESIGN.md) | 17 个短音效、31 个配置点（30 个音效与 1 个花园 BGM）、默认绑定、声音避让及 GM 操作 |
| 核对声匣选音、来源与授权 | [声音筛选记录](XIAOYA_SOUND_SELECTION.md) · [机器可读清单](../design/xiaoya-sound-selection.json) | 候选与选择理由、17 个 CC0 短音效的来源和实测；原有 BGM 的授权边界与未人工听感验收说明 |
| 核对声音交付验证与边界 | [声音验收](XIAOYA_SOUND_QA.md) | 最终构建、真实播放与 GM 浏览器检查、离线专项的精确范围及未验收项 |
| 增加表达、图片与配音 | [内容流水线](XIAOYA_CONTENT_PIPELINE.md) · [美术入口](../xiaoya/art-README.md) | 制作→校验→接入→缓存，许可与可移植性 |
| 交给其他 AI 生成新句配音、中文提示或花名 | [配音生产交接手册](XIAOYA_VOICE_HANDOFF.md) | Qwen 三音色、Edge 中文、本机环境、批次脚本限制、制作/质检/导出、离线与 GM 接入、可复制任务指令 |
| 查某次实现和验证依据 | [实施记录](XIAOYA_IMPLEMENTATION.md) | 按版本追加；每条测试只对该次实际版本负责 |

项目无须通过原 Codex 聊天才能接续。资源生产方的聊天可作为补充，已接入产物、清单和代码才是协作输入。没有任务时不要按历史“下一步”擅自开发。

## 有版本的设计与资源记录

这些是来源和阶段记录。其内容仍可帮助理解取舍，但当前数值、范围与状态应回到现行文档核对。

| 资料 | 如何使用 |
| --- | --- |
| [v0.1 体验稿](XIAOYA_EXPERIENCE_V0_1.md) | 历史起点；六主题入口、小屋、字母探索等不是当前儿童流程 |
| [v0.7 计划](../design/xiaoya-v07-plan.md) | 历史短句/复习改造记录，不是当前待办 |
| [花园 A/B 初始计划](../design/xiaoya-garden-plan.md) | 解释自由播种、巨型花、蝴蝶结设计起源；数值已迭代 |
| [v0.12 经济方案](../design/xiaoya-economy-v012.md) | 商店与保留位来源；旧 5 水日奖已被后版替代 |
| [v0.13 挑战方案](../design/xiaoya-challenges-v013.md) | 挑战规则与阶段奖励来源；原 24 句/6 组已扩为 84 句/21 组。旧 3/6 组累计奖只保留历史承诺，当前每组首通给对应花种子 |
| [挑战目标花 r01](../design/xiaoya-challenge-flowers-r01.md) | 21 组目标花的设计来源；v0.24.1 已接入逐关种子、105 张阶段图与旧通关补发。当前实际 35 花，50 花审核目录里其余 29 花仍属候选 |
| [告别漫画试验](../design/xiaoya-goodbye-comic/README.md) | 最早漫画表达试验；不要求新课程重复四格 |
| [花园漫画包](../design/xiaoya-garden-comics/README.md) | 历史图包与接入依据 |
| [纸艺 v0.9](../design/xiaoya-paper-v09/ART_DIRECTION.md) · [纸艺 v0.10](../design/xiaoya-paper-v010/ART_DIRECTION.md) | 已用素材风格来源与版本，按最新资源清单选择 |
| [教学图 v0.11](../design/xiaoya-teaching-v011/ART_DIRECTION.md) | 核心主图风格与表达约束 |
| [全量补图需求](../design/xiaoya-art-completion-20261019/BRIEF.md) · [交付](../design/xiaoya-art-completion-20261019/DELIVERY.md) | v0.14 补图已完成；不能把需求清单再当待生成任务 |
| [新增 60 句](../design/xiaoya-phrases-v015/README.md) · [交付](../design/xiaoya-phrases-v015/DELIVERY.md) | 冻结句单、图片/三音色/中文的来源及审核；本批已接入完成 |
| [旧探险世界](../design/adventure-world/README.md) | 旧产品素材记录，不是小芽英语的新首页方案 |
| [整理前状态全文](history/PROJECT_CONTEXT_before_relay_20261019.md) | 51090a5 时原交接文件归档，保留新旧版本沿革；没有当前任务效力 |

设计文档中的清单/JSON/manifest 是交付依据，不必为本次目录整理重制素材。各批次制作脚本的固定 ID、数量和本机路径不意味着通用内容包导入接口，新增批次按内容流水线处理。

## 旧产品文档

以下资料属于 `src/` 的旧「英语小芽」或其历史验收。旧产品仍保留、共享模块仍需回归，但其听音选图、日历、Vosk、皮肤、数值与版本不能套用到 `xiaoya/`。

| 主题 | 资料 |
| --- | --- |
| 旧入口与部署历史 | [旧 README](LEGACY_README.md) · [启动](STARTUP.md) |
| 学习与课程 | [学习规则](LEARNING.md) · [课程](CURRICULUM.md) · [设计](DESIGN.md) · [探险](ADVENTURE.md) |
| 花园与外观 | [花园](GARDEN.md) · [花园检查](GARDEN_QA.md) · [皮肤](SKINS.md) |
| 声音与下载 | [音频性能](AUDIO_PERFORMANCE.md) · [识别下载](SPEECH_DOWNLOAD.md) · [音色审核](VOICE_REVIEW.md) |
| 界面与更新 | [手机计划](MOBILE_FOCUS_PLAN.md) · [UI 检查](UI_QA.md) · [v1.7 发布](RELEASE_v1.7.0.md) · [v1.7.2 更新检查](UPDATE_QA_v172.md) |
| 模型与许可 | [旧识别资源说明](../public/speech/README.md) · [新 Whisper 许可](../public/xiaoya/speech/whisper-tiny-en-v1/NOTICE.md)；许可文件保持原始内容，不能用索引代替分发要求 |

## 浏览器验收快照

`UI_QA*.md` 是按次保存的证据，正文版本、目标地址和实际覆盖决定适用范围。尤其 `xiaoya-*-legacy` 与 `*-old-regression` 是小芽改版期间对**旧产品**的回归，不代表该次新产品全流程验收。新版验证先看 PROJECT_CONTEXT，再进入实施记录的对应版本。

以下逐项列出全部既有快照；保留原结果、失败和时间，不统一改成“当前通过”。

<details>
<summary>展开历史浏览器报告</summary>

- [UI_QA_economy-v012-legacy.md](UI_QA_economy-v012-legacy.md)
- [UI_QA_flow-v0123-legacy.md](UI_QA_flow-v0123-legacy.md)
- [UI_QA_live-offline-diagnostic.md](UI_QA_live-offline-diagnostic.md)
- [UI_QA_live-v120.md](UI_QA_live-v120.md)
- [UI_QA_live.md](UI_QA_live.md)
- [UI_QA_local-v080-legacy.md](UI_QA_local-v080-legacy.md)
- [UI_QA_local-v120-final.md](UI_QA_local-v120-final.md)
- [UI_QA_local-v120.md](UI_QA_local-v120.md)
- [UI_QA_local-v121-final.md](UI_QA_local-v121-final.md)
- [UI_QA_local-v121.md](UI_QA_local-v121.md)
- [UI_QA_local-v130-pip.md](UI_QA_local-v130-pip.md)
- [UI_QA_local-v130-speed.md](UI_QA_local-v130-speed.md)
- [UI_QA_local-v130.md](UI_QA_local-v130.md)
- [UI_QA_local-v140-focus.md](UI_QA_local-v140-focus.md)
- [UI_QA_local-v141-auto-update.md](UI_QA_local-v141-auto-update.md)
- [UI_QA_local-v150-skins.md](UI_QA_local-v150-skins.md)
- [UI_QA_local-v151-avatars-final.md](UI_QA_local-v151-avatars-final.md)
- [UI_QA_local-v152-ipad-startup.md](UI_QA_local-v152-ipad-startup.md)
- [UI_QA_local-v153-nickname.md](UI_QA_local-v153-nickname.md)
- [UI_QA_local-v160-garden.md](UI_QA_local-v160-garden.md)
- [UI_QA_local-v161-garden.md](UI_QA_local-v161-garden.md)
- [UI_QA_local-v170-final.md](UI_QA_local-v170-final.md)
- [UI_QA_local-v171-final.md](UI_QA_local-v171-final.md)
- [UI_QA_local-v172-final.md](UI_QA_local-v172-final.md)
- [UI_QA_local-v173-final.md](UI_QA_local-v173-final.md)
- [UI_QA_local-v180-final.md](UI_QA_local-v180-final.md)
- [UI_QA_meadow-anchor-v0124-legacy.md](UI_QA_meadow-anchor-v0124-legacy.md)
- [UI_QA_reward-v181-final.md](UI_QA_reward-v181-final.md)
- [UI_QA_three-stars-v0122-legacy.md](UI_QA_three-stars-v0122-legacy.md)
- [UI_QA_v010-original.md](UI_QA_v010-original.md)
- [UI_QA_v011-original.md](UI_QA_v011-original.md)
- [UI_QA_watering-v0121-legacy.md](UI_QA_watering-v0121-legacy.md)
- [UI_QA_xiaoya-old-regression.md](UI_QA_xiaoya-old-regression.md)
- [UI_QA_xiaoya-v013-legacy.md](UI_QA_xiaoya-v013-legacy.md)
- [UI_QA_xiaoya-v014-legacy.md](UI_QA_xiaoya-v014-legacy.md)
- [UI_QA_xiaoya-v0141-legacy.md](UI_QA_xiaoya-v0141-legacy.md)
- [UI_QA_xiaoya-v015-legacy.md](UI_QA_xiaoya-v015-legacy.md)
- [UI_QA_xiaoya-v016-legacy.md](UI_QA_xiaoya-v016-legacy.md)
- [UI_QA_xiaoya-v02-old-regression.md](UI_QA_xiaoya-v02-old-regression.md)
- [UI_QA_xiaoya-v03-old-regression.md](UI_QA_xiaoya-v03-old-regression.md)
- [UI_QA_xiaoya-v04-old-regression.md](UI_QA_xiaoya-v04-old-regression.md)
- [UI_QA_xiaoya-v05-old-regression.md](UI_QA_xiaoya-v05-old-regression.md)
- [UI_QA_xiaoya-v06-old-regression.md](UI_QA_xiaoya-v06-old-regression.md)
- [UI_QA_xiaoya-v061-old-regression.md](UI_QA_xiaoya-v061-old-regression.md)
- [UI_QA_xiaoya-v07-old-regression.md](UI_QA_xiaoya-v07-old-regression.md)
- [UI_QA_xiaoya-v09-legacy.md](UI_QA_xiaoya-v09-legacy.md)
- [UI_QA_xiaoya-v125-legacy-final.md](UI_QA_xiaoya-v125-legacy-final.md)
- [UI_QA_xiaoya-v126-legacy-final.md](UI_QA_xiaoya-v126-legacy-final.md)

</details>

## 文档怎么随版本维护

| 实际变化 | 应更新的文档 |
| --- | --- |
| 新可交付版本、工程位置、构建渠道、重要风险 | PROJECT_CONTEXT 当前摘要 + 实施记录；位置/入口变化才同步旧目录导航 |
| 新用户流程、按钮、奖励数值、巨型花或 GM 用法 | XIAOYA_USE；若改变产品约束，同步 XIAOYA_DESIGN |
| 模块、存档、参数备份格式、缓存、启动、测试命令 | XIAOYA_ENGINEERING；相关规则变更再更新 AGENTS |
| 新句、资源、制作或接入方式 | XIAOYA_CONTENT_PIPELINE / art-README / 对应批次交付清单 |
| 声音触发点、默认绑定、GM 配置或选音来源 | XIAOYA_SOUND_DESIGN / XIAOYA_SOUND_SELECTION；用户操作与运行接口变化再同步 XIAOYA_USE / XIAOYA_ENGINEERING |
| 跨 AI 暂停、并行分工、异地返回 | 使用任务交接模板，给出起点与交付 SHA；不另建重复任务系统 |
| 仅问答、只读检查或无行为变化的小修改 | 不制造新发布或大篇交接；留下必要事实即可 |

同一事实尽量只维护一处。当前摘要保留结论与链接，过程保存在版本记录；原始日志不进 Git 时要说明证据在本机及可移植摘要在哪里。区分“实现”“自动验证”“人工审核”“用户认可”，标明版本、日期、范围和未验证项。对旧数值添加取代说明，不能悄悄改写历史报告。
