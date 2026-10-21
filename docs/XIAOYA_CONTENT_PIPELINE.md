# 小芽英语：句子、图片与声音交接

核对日期：2026-10-21。当前为小芽英语·自由花园版 `0.20.0`，内测构建 `388ea80d6881`、公开构建 `ea9dc9eea89e`；交付提交见项目入口。本文说明已落地的内容管线；当前版本与实际工作树以 [PROJECT_CONTEXT](../PROJECT_CONTEXT.md) 为准。首次接手先读 [AI 交接入口](AI_HANDOFF.md)，按需查 [文档索引](INDEX.md)。无需读取任何聊天记录即可按本文续做。运行、GM 和发布入口见 [使用说明](XIAOYA_USE.md) 与 [实现说明](XIAOYA_IMPLEMENTATION.md)。

## 1. 先找到事实来源

| 内容 | 权威文件 / 作用 |
| --- | --- |
| 新增 60 句的定稿 | [phrases.json](../design/xiaoya-phrases-v015/phrases.json)、[筛选与画面说明](../design/xiaoya-phrases-v015/README.md) |
| 运行时句子与物品 | [phrase-pack-v015.js](../xiaoya/phrase-pack-v015.js)、[content.js](../xiaoya/content.js) |
| 核心顺序、同句归并 | [curriculum.js](../xiaoya/curriculum.js)；挑战分组见 [challenges.js](../xiaoya/challenges.js) |
| 图片映射、展示与加载 | [stories.js](../xiaoya/stories.js)、[story-assets.js](../xiaoya/story-assets.js)、[phrase-assets-v015.js](../xiaoya/phrase-assets-v015.js)、[story-pictures.js](../xiaoya/story-pictures.js) |
| 已验收资源回执 | [60 句图片回执](../design/xiaoya-phrases-v015/accepted-assets.json)、[音频回执](../design/xiaoya-phrases-v015/audio-manifest.json)、[交付记录](../design/xiaoya-phrases-v015/DELIVERY.md) |
| 较早内容的补图 | [美术补齐交付](../design/xiaoya-art-completion-20261019/DELIVERY.md)、[回执](../design/xiaoya-art-completion-20261019/accepted-assets.json) |
| 花园与 UI 美术 | [资源路标](../xiaoya/art-README.md)、[纸艺方向](../design/xiaoya-paper-v010/ART_DIRECTION.md)、[首批规格](../design/xiaoya-paper-v010/art-manifest.json) |
| 图片整包与离线校验 | `releases/<build>/art-pack.json` 由 [build-xiaoya.mjs](../scripts/build-xiaoya.mjs) 生成；[audio-pack.js](../xiaoya/audio-pack.js) 管理状态，[sw.template.js](../xiaoya/sw.template.js) 下载并校验 |
| 声音选取与离线清单 | [voices.js](../xiaoya/voices.js)、[audio-pack.js](../xiaoya/audio-pack.js)、[build-xiaoya.mjs](../scripts/build-xiaoya.mjs) |

基线包括 115 个事件、113 个去重表达、84 个核心学习表达、21 组挑战。新增包是 **60 个新表达**，其中 49 个 easy、11 个 later；这两个标签是编排选择，不是经儿童实验验证的年龄等级。已有 55 个事件 / 53 个表达保留。三个旧 `Help me please` 场景共享 `needs-08`，属于兼容数据，不得照此继续扩量，也不能为了报表去重直接删除旧 ID。

新增包已有 60 张主图（共 6,183,046 字节），240 段声音（3,793,542 字节）：每句 3 个英文音色和 1 个中文帮助。全量构建音频清单是 848 段 / 15,521,318 字节。正式图片包为 223 张（195 张故事＋28 张纸艺），19,638,436 字节，包版本 `c05c69f847cbcaf9`。内部 GM 审图索引是 228 项，即正式图包加 5 个应用图标；其中 2 个旧图标只供资源审核，不进入儿童界面。不能把审图项数当成独立故事数。数量是本次基线，不是未来扩包必须维持的上限。

## 2. 新句先定稿，再生产

1. 为下一包建独立的版本目录，例如 `design/xiaoya-phrases-vNNN/`。保留需求、定稿 JSON、图片回执、声音回执、交付说明，避免覆盖 v015 的历史证据。
2. 每句指定稳定 `id`、`english`、`meaning`、`themeId`、`goalId`、`title`、`scene`、`hint`、`difficulty`；当前完整字段参考 `phrases.json`。`number` 仅供排序，不是持久化主键。主题与目标必须存在于当前 `content.js`。
3. 按生活口语筛选熟悉、顺口、孩子能自然使用的固定表达。对所有现有表达、`accepted` 别名和本批逐一去重：NFKC 归一化、小写、忽略标点和多余空格后比较；另做人工语义去重，不能靠换物品、代词、场景凑数量。`I love you` 等已收录，`Well done!`、`Play with me.`、`Goodbye.` 等已有接受别名也不能作为全新句。
4. 一句确定一个明确沟通意图，先描述“谁在什么情况下对谁说”。孩子先建立声音与意思的联系，再开口；不用英文文字阅读作前提，不恢复听音选同图的旧流程。抽象表达可用简短中文语音帮助，不能把看不懂图当成孩子没学会。
5. 每句默认一张熟悉主图。初学、普通复习保持同一主图，减少等待；只有理解确有必要才加前后画面。异场景验证属于明确的家长生活小检验，不随意替换普通复习图。v015 每句只有一个情境，因此不能以反复完成这一情境宣称“跨情境掌握”。

保留已有 `event.id`、`lessonId`、`phraseId`、课程顺序与物品 ID。核心数组先是原 24 项，再是 v015 的 49 个 easy 和 11 个 later。挑战当前按核心数组每 4 项生成 `challenge-1` 等 ID；重排或中间插入会让旧挑战进度指向别的句子。新包应追加，保持旧 84 项与旧挑战成员不变；数量不能整组追加时，先设计明确的分组与存档迁移，不能让下一包改变已发布组的成员。

## 3. 图片从交付到接入

当前风格为手绘 273 手撕纸方向、柔和茶奶色系。沿用已交付角色和参考图；不要只凭聊天中的风格名称重新猜一套角色。主图不放英文、中文、字母、文字气泡或伪按钮。检查手掌朝向、肢体数量、物品归属、持握方式、主体动作与句意；伤痛、拒绝等表达也应温和清晰。美观与语义正确分别审核。

v015 主图合同是 **980 × 700 WebP，单图 1,000–240,000 字节，一句一张不同图**；文件名为 `{id}-paper-v015.webp`。这不是所有图标、花园背景或植物的统一尺寸，其他类别按各自清单与渲染代码处理。植物根点与透明边界见 [美术路标](../xiaoya/art-README.md)。

每批回执最少记录：稳定句子 ID、原图/运行图来源、目标相对路径、SHA-256、字节数、宽高、审核状态、逐图审核依据、生成来源清单及提示词位置。现有 `accepted-assets.json` 是完整范例。只有实际看过该图才写 `review: accepted`；接触表用于发现风格问题，不能取代逐图检查手部与语义。

当前导入器 [integrate-xiaoya-phrase-art.mjs](../scripts/integrate-xiaoya-phrase-art.mjs) 会先验证整批，再复制到 `public/xiaoya/stories/`，最后生成 `phrase-assets-v015.js`：检查允许的 ID、重复 ID/哈希、已审核证据、固定目标路径、WebP 标识、尺寸、体积与源文件哈希。`status: complete` 要求恰好 60 项；部分回执的映射只覆盖本次列出的项，持续接批时回执必须累计已验收项。

**该导入器硬编码 v015，不是通用扩包器。** 新包需要先改造或新建带版本的导入流程及对应测试，不能直接把新 60 句塞入 v015。较早补图使用 [integrate-xiaoya-art.mjs](../scripts/integrate-xiaoya-art.mjs)，输出 `story-assets.js`；两条映射不要混写。原始高分辨率图留制作目录，应用只接压缩运行图。

## 4. 三种英文音色与中文帮助

当前三个英文音色键必须保留：`aiden`（小熊伙伴）、`ryan`（小狐伙伴）、`pip`（泡泡猫，默认）。旧音频分别来自 `public/audio/`、`public/audio/ryan/`、`public/audio/characters/pip/`。v015 为每句独立目录：

```text
public/xiaoya/audio/phrases-v015/{id}/
  aiden.mp3
  ryan.mp3
  pip.mp3
  hint.mp3
```

英文示范只读目标短句，中文帮助解释使用情境、引出示范，不依赖孩子读文字。生产前按文本和音色查找已有声音，只有文本完全匹配、音色正确且哈希可追溯才复用；当前 v015 复用 24 段英文，新做 156 段英文与 60 段中文。

[generate-xiaoya-phrase-pack-speech.py](../scripts/generate-xiaoya-phrase-pack-speech.py) 是本机 v015 制作工具，不是运行时服务，也不是可直接移植的新包生成器。它硬编码本包 60 句、输出目录、工作台、校验模型路径；支持 `plan / english / hints / check / crosscheck / export` 等分步操作。迁移时先读脚本的参数与依赖并改成新包配置，再执行；不要在缺模型时静默联网下载或切换声音。

| 阶段 | 当前生产来源与约束 |
| --- | --- |
| 英文 Aiden / Ryan | 本机 Qwen3-TTS 12Hz 0.6B CustomVoice；模型 revision 见声音回执 |
| 英文 Pip | 本机 1.7B CustomVoice，Serena 及已调方向；不是随便换一个 TTS 声线 |
| 中文帮助 | 制作阶段使用 Edge `zh-CN-XiaoxiaoNeural`、`edge-tts 7.3.1`；只提交通用文案，不提交儿童录音或记录 |
| 运行文件 | MP3、单声道、24 kHz、48 kbps；现有工具采用响度归一化与音头/音尾检查 |
| 自动校验 | 哈希、完整解码、非静音、时长/首尾边界、独立本机 ASR；中文另核对 WordBoundary。可疑英文再用另一模型核对原音与导出音 |
| 主观验收 | 逐句听清晰度、语速、停顿、情绪与短句自然度；自动 ASR 通过不能代替试听或儿童实测 |

导出工具拒绝覆盖同一路径上内容已经不同的已发布声音。新修订用新版本路径，并更新所有引用和回执。现有回执的 `subjectiveListeningApproved: false` 需要保留其真实含义：工程校验已做，不等于全包人工试听或儿童接受度已通过。

配音工具依赖本机 `E:\AI新项目\游戏工具\配音工作台`、其 Python 环境/模型/资源锁，以及 `ffmpeg`、`ffprobe`；中文还有隔离 `edge-venv`，ASR 校验模型另存在实验与商业化工作目录。它们不随本仓库携带。共享 GPU 的已有资源锁不能绕过；缺环境时报告缺什么，已有运行音频仍可构建、播放和审核。

### v0.18 欢迎小礼物语音

`scripts/generate-xiaoya-welcome-speech.py` 复用现有中文生产管线，制作 `welcome-gift-{first,intro,shell,water,play}.mp3` 共 5 段、138,700 字节、22.68 秒。声音为 `zh-CN-XiaoxiaoNeural` / `edge-tts 7.3.1`；仅制作期请求通用文案，运行时使用本地静态文件。清单 `public/xiaoya/audio/welcome-voice-manifest.json` 保留文案、来源、字节、时长、SHA-256 与词边界覆盖证据。已完成解码、边界和文字覆盖检查，浏览器验证贝壳/水滴用途与继续语音的原生播放、取消；主观试听和儿童接受度仍待用户验收。

五个新增 URL 已由构建枚举加入完整声音包，整包为 826 段；未覆盖既有音频或改变缓存策略，声音缓存名继续使用一致的 `xiaoya-audio-v3`，新版构建的完整性清单负责验证新增文件。

### v0.19 六袋盲盒与共享颜色种子

`xiaoya/seed-appearance.js` 提供 white / yellow / pink / red / blue / purple / natural 七个共用标签，现有 14 个 flowerId 有固定映射；新花可声明有效 `seedColor`，未知标签回落到 ID 映射或原色。显示名称直接取花名加“种子”，不为每种花制作一张种子图片；颜色不代替稳定 flowerId，不改变品种、价格、概率或存档。当前 `garden-art.js` 用已验收纸艺 seed.webp 的纹理和 alpha 生成配色，不恢复旧 SVG 教学插画。

`scripts/generate-xiaoya-blindbox-speech.py` 复用 `edge-tts 7.3.1` / `zh-CN-XiaoxiaoNeural` 制作 16 段静态 MP3：选袋引导、揭晓后种植引导、14 个种子名，共 299,984 字节 / 48.6 秒。文案、来源、SHA-256、解码与词边界检查见 `public/xiaoya/audio/blindbox-voice-manifest.json`。运行时不调用配音服务；构建自动收录到完整声音包和 GM 索引，v0.19 当时整包为 842 段 / 15,325,214 字节。未来花名的文字会自动适配，**新花名的朗读仍需提前生产对应 MP3**，不能依赖在线现配。

实验室可提供统一种子外形/各颜色成品，按颜色标签替换共享外观即可，不需要为几十种花逐个做种子。未来 50 种花截至本次只有概念/标准和阶段 ID，0 张合格运行图片接入；先交付一个花种的完整生长阶段，核对尺寸、透明边、根点、SHA 和颜色标签后再逐批接入，不使用概念裁图或伪造阶段。本版未增加花朵品种，正式图片包仍是 223 张。

### v0.20 每日轮换欢迎语

`scripts/generate-xiaoya-welcome-variants.py` 复用既有生产工具、`edge-tts 7.3.1` 与 `zh-CN-XiaoxiaoNeural`，新增 `welcome-hello-01` 至 `06` 六段静态中文 MP3，共 **196,104 字节 / 32.16 秒**。采用自然速率和音高，没有后处理变速或变调。完整文案、来源、长度和 SHA-256 在 `public/xiaoya/audio/welcome-hello-manifest.json`；制作期证据在忽略入库的 `test-results/xiaoya-welcome-voices-v020/`。六段解码、波形和词边界覆盖均通过，主观亲切感仍需用户试听。

运行时仅由 `welcome-greetings.js` 选择已制成文件，不连接配音服务；构建自动纳入离线清单和 GM 声音库。全包为 **848 段 / 15,521,318 字节**。初次使用仍调用 `welcome-gift-first`，回访六句循环洗牌，尚未领取礼物时首页自动问候，浏览器手势限制由点礼物继续播放。新文案修订应使用新版本化 ID，生产脚本拒绝覆盖已有不同字节的文件；单纯构建/运行不执行生产脚本。

## 5. 新包的接线清单

仅把图片和 MP3 复制进 `public` 还不算接入。当前需要同步检查这些位置：

| 位置 | 新包工作 |
| --- | --- |
| 新 `phrase-pack-vNNN.js` | 定稿的静态运行副本，包含事件、奖励物品、情境、三音色对应的共同 ID 与中文帮助路径；对照 JSON 做一致性校验 |
| `content.js` / `curriculum.js` | 合并事件与物品；追加核心顺序；保留旧学习主键与挑战组 |
| 新图片映射 / `stories.js` | 引入映射，默认 `imageLayout: single`；按需要设置 `cueFrame`、`introFrame`、`teachingFrames` |
| `voices.js` | `lessonAudio()` 当前专门识别 v015 ID 集合。必须扩展新包解析，否则会回落到旧目录请求不存在的文件 |
| `scripts/build-xiaoya.mjs` | 新 JS 模块加入显式 `MODULES`；新音频与正式故事/纸艺图片加入枚举、复制、长度和 SHA-256 清单；完整图包字节必须影响内测与公开构建指纹，不能只靠文件存在 |
| 同一构建脚本的 GM catalog | 新包声音路径需要正确分类为 Aiden / Ryan / Pip / 中文帮助；当前有 `/phrases-v015/` 特判 |
| 未来花种与共用种子 | `seed-appearance.js` 的 ID/颜色映射或花种 `seedColor`；花名自动派生，配套新增 `blindbox-seed-<id>.mp3`；同步花种模型/校验与阶段图映射，不只改图片目录 |
| 资源回执与测试 | 对应新包的尺寸、哈希、覆盖数、去重、旧 ID 兼容、音频解析与构建资产测试 |

v015 事件仍有 `choices` 等兼容结构，不能据此重新推出“听一听选图”儿童流程；当前产品交互以 `experience.js` / `app.js` 为准。内容扩包也不能自行改变奖励、学习证据或评分算法。

## 6. 缓存、体积与离线

[build.mjs](../scripts/build.mjs) 会将 **整个 `public/` 复制进 `dist/`**。原图、密钥、制作环境、真实用户资料、录音、日志不能放进去。旧产品仍共用 `public/audio`，不能按“新目录没引用”就删除旧资源。可发布产物只有构建后的 `dist`，不是整个仓库或制作目录。

新应用 `xiaoya/audio.js` 与 `xiaoya/sw.template.js` 的声音缓存名当前均为 `xiaoya-audio-v3`。变化涉及缓存策略/版本时必须一起改；旧产品 `src/media.js` 与根 `sw.template.js` 是另一套入口，不能只改它们就认为新应用已更新。构建生成按内容哈希校验的 `audio-pack.json`，新音频必须进入该清单；同源预制音频准备完成后可离线播，不在使用时现生成。

前台只解码当前故事帧与必要相邻帧；后台按 `art-pack.json` 准备完整 223 张图片，不以是否看过该故事决定缓存。当前图片缓存为 `xiaoya-art-c05c69f847cbcaf9`。核心、声音和图片整包都通过长度与 SHA-256 校验后，新 SW 才可激活；未完成时不能承诺全包离线。家长页显示插画包进度和重试入口。

缺图使用中性占位和重试，禁止恢复旧 SVG 故事或旧界面兜底；后到图片只局部替换，不重建录音会话。只有带 `event.hintAudio` 的新 60 句在首次新学缺图时自动补充预制中文情境说明，旧课继续使用原上下文帮助；复习和挑战不自动给答案。

**图片内容已进入两个渠道的构建指纹。** 修改图片后重新构建会更新图片清单、图包版本及构建指纹；不依赖 GM 扫描来保证公开版更新。仍优先使用新版本路径并更新映射，保持已发布资源一致性；音频同样保留发布 URL 不覆盖的约束。新版 SW 已安装后，任意旧 `start-<hash>.html` 在线读取当前入口、离线读取该 SW 已校验入口。重启电脑用当前 VBS 启动服务；浏览器清除站点数据后，需要服务重新提供资源，不能把缓存当成永久离线安装。

## 7. 验证与交付

先确认 Node / Python / Pillow、浏览器及 Playwright 的可用位置。浏览器脚本默认带本机 Playwright 路径，换工具/机器应设置 `PLAYWRIGHT_MODULE` 为实际可解析模块路径，不能假定 Codex 运行库存在。使用独立测试浏览器和临时记录，不能清理用户真实存档。测试入口、服务与构建通道按 [实现说明](XIAOYA_IMPLEMENTATION.md) 核对。

常用完整构建检查（PowerShell，在实际工作树执行）：

```powershell
npm test
npm run build
# 需要内部 GM 审核时，重新构建内部版：
npm run build:dev
```

按实际改动补充证据，不把只读或 GM 模拟点击说成真实语音验收：

| 改动 | 对应验证 |
| --- | --- |
| 新句、ID、素材清单 | `tests/xiaoya-phrase-pack.test.js`、`xiaoya-phrase-delivery.test.js`、`xiaoya-phrase-integration.test.js`；为新包扩展等价覆盖 |
| 完整 60 句学习/复习/图片 | `node tests/xiaoya-phrase-pack-browser.cjs`；默认自建临时服务，可用 `TEST_URL` 指定隔离的本机服务；过滤执行须写明覆盖范围 |
| 图片整包、构建指纹与重启离线 | `tests/xiaoya-build.test.js`、`node tests/xiaoya-restart-art-browser.cjs`；覆盖完整图包校验、旧入口和未浏览图片离线读取 |
| 图片加载与帧序 | `node tests/xiaoya-story-pictures-browser.cjs`；纸艺相关 `xiaoya-paper-art-browser.cjs` / `xiaoya-paper-layer-browser.cjs` |
| 植物替图 | 先运行 `python scripts/generate-meadow-hit-shapes.py`，再 `python -m unittest discover -s tests -p test_meadow_hit_shapes.py`，以及 `xiaoya-meadow-hit-browser.cjs` / `xiaoya-meadow-anchor-browser.cjs` |
| 音频覆盖、缓存与离线 | `node tests/xiaoya-offline-audio-browser.cjs`；必须让 `TEST_URL` 对应刚构建的隔离版本，覆盖首次准备、完整性与断网重播 |
| GM 审图、试听、免录音流程 | `node tests/xiaoya-gm-browser.cjs`；内部与公开通道分别核对，不能把 GM 模拟评分当真实识别效果 |
| 公共图片/媒体回归 | 按仓库要求执行 `node tests/browser.cjs`，防止影响同仓旧产品 |

本次新增 16 段盲盒预制声音，已接入声音包与 GM 索引，并完成解码、词边界、静态清单与浏览器真实播放/离线检查；不代表全包逐句主观试听或儿童实测通过。后续每批交付记录：包名/范围、基线与最终提交、稳定 ID、资源哈希和总量、来源与许可记录、运行入口、实跑命令/结果、未验收项。分别标记“已生成”“已看图/试听”“已接入”“自动检查通过”“儿童体验待验收”，不要统称“全部完成”。

## 8. 可移植性、来源与许可边界

| 类别 | 当前能否随项目交接 |
| --- | --- |
| 运行 JS、压缩图、预制 MP3、浏览器识别资源及许可证 | 已入 Git；接手方可直接构建。`dist` 可重新生成，无需先启动美术实验室或配音工作台 |
| 图片回执中的 `source` / `sourceManifest` / `sourcePrompt` | 是本机历史来源路径，不是运行依赖；换机器需要另外迁移原始制作目录，不能虚称路径仍存在 |
| 高分辨率原图与制作记录 | 主要位于 `E:\AI code Project\AI GAME\创意资产实验室\studies\小芽英语-手撕纸花园-r001-9f81c1\delivery\` 下的 `v015-phrases`、`v04-completion` 等；按回执取确切文件，不能仅凭线程名称找资源 |
| TTS 模型、Python 环境、独立 ASR 模型、GPU 工作台 | 本机工具，不随仓库迁移；应记录版本、依赖与来源，获授权并准备环境后再生成 |
| `test-results` / 缓存 / 浏览器个人数据 | 不是公开运行包；只交付已筛选的验证摘要，不携带真实儿童数据 |

浏览器识别使用 [speech-assets.js](../xiaoya/speech-assets.js) 锁定的资源。当前 10 个运行文件共 81,191,822 字节，已随仓库保存；`node scripts/setup-xiaoya-speech.mjs --verify` 只校验本地哈希，不带 `--verify` 会从固定来源下载/修复。当前组合是 Transformers.js 4.3.1、锁定的 ONNX Runtime Web、`onnx-community/whisper-tiny.en` 固定 revision 的 FP32 encoder / Q8 decoder；以脚本和清单为精确版本依据，不盲换 CDN 最新版。模型首次同源下载与完整语音包是两件事。

保留 [识别 NOTICE 与随附许可证](../public/xiaoya/speech/whisper-tiny-en-v1/NOTICE.md)：Whisper MIT、Transformers Apache-2.0、ONNX Runtime MIT 及其第三方声明等。生产用本机 ASR 与浏览器模型用途不同。识别先独立转写，再比对可接受表达；不能把目标答案喂给识别器来“提高正确率”，也不能把文本命中当作音素级发音评分或掌握证明。

AI 生成图片的工具/提示词/来源清单、Qwen TTS 的模型 revision/来源、Edge TTS 的工具与服务来源都要随批次回执保留。当前回执是可追溯证据，**不是独立完成的商用权利审核**；更换工具或对外发布前按实际模型、服务与素材的适用条款核对。不要把开源代码许可证自动等同于所有声音或图片产物的任意再分发许可。运行阶段继续保持纯静态、无付费 API、不上传儿童录音/学习记录的产品边界。
