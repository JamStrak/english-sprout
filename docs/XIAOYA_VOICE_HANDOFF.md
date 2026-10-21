# 小芽英语启蒙正式版 · 配音生产交接手册

核对日期：2026-10-21。适用 `xiaoya/`，核对代码基线 `90c2040` / v0.25.1。本页是配音专项操作入口；工程位置、最新构建与接力规则以 [当前状态](../PROJECT_CONTEXT.md)、[AI 接力说明](AI_HANDOFF.md) 为准。本次只整理文档，没有生成新音频、下载模型或重新验收全包听感。

本机唯一正式工程：`E:\AI新项目\其他实验\儿童英语练习\小芽英语启蒙正式版`。以下相对路径均从该目录解析。父目录是旧产品；配音工作台、商业化工作目录和 MiniMax 实验目录是制作辅助，不是另一个正式版本。换机器后需重新定位制作环境，不能假设这些绝对路径随 Git 一起迁移。

## 1. 先分清四种声音工作

| 工作 | 实际工具与作用 | 何时联网 / 最终交付 |
| --- | --- | --- |
| 英文短句三音色 | 本机 Qwen3-TTS CustomVoice；项目 Python 脚本调用配音工作台的 Python、模型和 GPU 资源锁 | 模型已准备时离线生成；交付静态 MP3 |
| 中文情境帮助、欢迎、操作引导、种子名 | 近期批次为 `edge-tts 7.3.1` → Microsoft Edge Neural TTS，`zh-CN-XiaoxiaoNeural` | **制作时联网**，只发送通用文案；下载、校验后交付静态 MP3。旧批次也有本地 Qwen 中文，按 manifest 区分 |
| 背景音乐与短音效 | 用户用 MiniMax 生成现有 `garden_piano.mp3`；声匣筛选出 17 段 CC0 短音效 | 已接入静态文件；不是上述三音色的配音引擎，扩句不调用 MiniMax 或声匣 |
| 识别孩子说话 | 浏览器本机 Whisper / Transformers.js / ONNX；与生产质检用的 Python Whisper 分开 | 从同源准备模型后本机识别；不生成声音，不上传儿童录音，也不是音素级发音测评 |

配音工作台是本机工具与模型的宿主，**不是孩子运行 APP 必须常开的在线服务**。APP 播放预制文件，不调用 TTS。开发服务器提供网页、MP3 与模型文件；离线包准备完整后可从缓存读取。制作期 Edge 的联网依赖不能变成运行期“等服务生成一句话”。不要接浏览器 `speechSynthesis` 或在线现配作为默认兜底。

## 2. 当前资源与可靠事实来源

- 当前构建声音包为 **866 段 / 16,282,316 字节**，包含共享旧课、样音、中文引导、音乐和音效；不是 866 个课程表达。实际计数以构建的 `audio-pack.json` / `version.json` 为准。
- 新增 60 句 v015 已接入：每句 3 个英文音色＋1 个中文帮助，共 **240 段 / 3,793,542 字节**；24 段英文按原字节复用，156 段英文和 60 段中文新制。
- v015 回执仍写 `subjectiveListeningApproved: false`，表示工程检查完成但不宣称全包人工听感通过。不要替历史记录补写“全部真人试听通过”。
- 21 种新挑战花已有可见名称与通用引导，**专属花名配音尚未生产**。这是已知缺口，不是本次文档任务的生成授权。

| 要查什么 | 文件 |
| --- | --- |
| 60 句定稿 / 配音交付 | [phrases.json](../design/xiaoya-phrases-v015/phrases.json) / [audio-manifest.json](../design/xiaoya-phrases-v015/audio-manifest.json) / [DELIVERY](../design/xiaoya-phrases-v015/DELIVERY.md) |
| 三音色路由 | [voices.js](../xiaoya/voices.js)；语言与中文帮助映射另见 [content.js](../xiaoya/content.js)、[phrase-pack-v015.js](../xiaoya/phrase-pack-v015.js) |
| 旧课 Aiden / Ryan、Pip 来源 | [manifest.json](../public/audio/manifest.json)、[pip-manifest.json](../public/audio/pip-manifest.json) |
| 早期中文文案 / 混合来源 | [prompts.json](../public/xiaoya/audio/prompts.json)、[voice-manifest.json](../public/xiaoya/audio/voice-manifest.json)；不能将它们当成所有新增批次的总表 |
| 每日礼物、随机欢迎、盲盒种子名 | [welcome-voice-manifest.json](../public/xiaoya/audio/welcome-voice-manifest.json)、[welcome-hello-manifest.json](../public/xiaoya/audio/welcome-hello-manifest.json)、[blindbox-voice-manifest.json](../public/xiaoya/audio/blindbox-voice-manifest.json) |
| 音乐 / 音效来源与播放规则 | [garden-piano-source.json](../public/xiaoya/audio/garden-piano-source.json)、[声音筛选](XIAOYA_SOUND_SELECTION.md)、[声音设计](XIAOYA_SOUND_DESIGN.md) |
| 浏览器识别模型 | [speech-assets.js](../xiaoya/speech-assets.js)、[随包许可](../public/xiaoya/speech/whisper-tiny-en-v1/NOTICE.md) |

## 3. 必须沿用的音色与文案规范

| 稳定音色 ID | 孩子看到的名字 | 生产配置 |
| --- | --- | --- |
| `aiden` | 小熊伙伴 | Qwen3-TTS 12Hz 0.6B CustomVoice / speaker `Aiden` / English |
| `ryan` | 小狐伙伴 | 同一 0.6B 模型 / speaker `Ryan` / English |
| `pip`（默认） | 泡泡猫 | Qwen3-TTS 12Hz 1.7B CustomVoice / speaker `Serena` / English，加已调定的角色方向 |

0.6B 模型 revision：`85e237c12c027371202489a0ec509ded67b5e4b5`；1.7B：`f00cf133b78d3c2c35857faba3b1be9b98c4f971`。参考回执里的模型来源和 revision，不把模型文件夹名或最新版下载结果当成同一模型。

Pip 的声音底色是轻柔、好奇、有表情的女性小猫声，不耳语、不额外笑、不加词或音效。直接复用 [generate-character-samples.py](../scripts/generate-character-samples.py) 中 `COMMON` 与 Pip 方向，以及 [generate-pip-course.py](../scripts/generate-pip-course.py) 的 `direction_for()`；不要让每个接手 AI 重写一套角色提示词。`COMMON` 要求清楚的美式英语、约每分钟 100 词、自然短停顿、目标句只说一次。Aiden / Ryan 当前请求没有这套 Pip 角色指令，不要误套。

Pip 采用保调 `atempo`，当前生成器按原始长度与目标长度在 0.65–0.85 内计算；不得统一变调制造童声，也不要播放时再叠加减速。Aiden / Ryan 当前导出不变速。实际生成 seed、方向和 tempo 必须保留在逐条请求/回执中。

文案要求：

1. 英文以常用、顺口、适合 3–6 岁自然使用的固定表达为主；一句一个明确意图。先用全部课程及 `accepted` 别名做文本与语义查重，不能给同句换三幅图当三句。完整定稿字段与课程兼容见 [内容流水线](XIAOYA_CONTENT_PIPELINE.md)。
2. 英文示范只读目标句一次，不读中文、编号、标题、解释、引号或评价；录音、复习和挑战逻辑不能随扩句一起偷偷改变。
3. 中文情境帮助先让孩子理解“发生什么、为什么说”，简短、亲切、一次只指导一个动作。不要依赖识字，不用长串指令或频繁夸奖。当前 v015 生成器会自动给 `hint` 追加 **“听我说。”**，输入不要重复追加。
4. 近期中文生产为自然参数 `rate='+0%'`、`pitch='+0Hz'`、`volume='+0%'`，不后期变速变调。新名字需要明确读音；显示文本自动派生不代表朗读资源自动出现。
5. 新中文操作提示应接入现有引导策略：新手首会话每情境首次提示；回访 60 秒无操作才提示，播完再等完整 60 秒。30 秒是按钮视觉提醒，不是语音频率。不要在每次 render / 页面进入时无条件播一次。

## 4. 本机环境与迁移检查

以下路径在 2026-10-21 检查存在；Edge 环境查询得到 `7.3.1`。这只是路径/版本核对，**本轮没有重新加载 Qwen、运行 GPU 合成或测试 Edge 服务可用性**。

| 依赖 | 当前本机路径 / 检查要点 |
| --- | --- |
| 工作台 Python | `E:\AI新项目\游戏工具\配音工作台\.venv\Scripts\python.exe`；不要用系统 Python 替代其 torch / qwen 环境 |
| 工作台辅助模块 | 工作台下 `upstream/voicebox/backend/services/local_runtime.py`、`scripts/emotion_resources.py`；脚本会配置本机运行工具 |
| 0.6B 模型 | `E:\AI新项目\商业化工作\validation\voice-upgrade\local-qwen\model` |
| 1.7B 模型 | `E:\AI新项目\商业化工作\validation\voice-upgrade\qwen-1.7b-custom\model` |
| GPU 资源锁 | 工作台 `local_config.json` 的 `resource_guard` 指向 `E:\AI新项目\商业化工作\pipeline\resource_guard.py`；只读取需要的键，不把整份本机配置写进日志或交接 |
| 中文隔离 Python | 正式工程下 `test-results\xiaoya-neural-help-20261016\edge-venv\Scripts\python.exe`，包 `edge-tts==7.3.1` |
| FFmpeg / FFprobe | 优先工作台 `runtime/ffmpeg/bin/`；中文等脚本允许回退 PATH。系统 PATH 本次可找到两者 |
| 生产英文初检模型 | `E:\AI新项目\其他实验\儿童英语练习\test-results\speech-check\models\whisper-tiny.en`；由工作台 Python 运行 |
| 独立复核模型 | `E:\AI新项目\商业化工作\marketing\jobs\V003\work\r002\asr-model`；同级 `asr-venv\Scripts\python.exe`，faster-whisper CPU / int8 |

英文生成会设置离线环境、通过共享资源锁分批使用 GPU，不直接绕锁运行 worker；当前每批最多 20 条、单次合成超时 180 秒。缺模型、缺环境、资源锁忙时明确报告，不默默联网下载大模型、换音色或终止其他任务。移机需单独准备这些制作依赖，已有正式 MP3 的构建/播放不需要它们。

安全的定位与只读参数检查（在正式工程内）：

```powershell
git rev-parse --show-toplevel
git branch --show-current
git status --short
$voicePython = 'E:\AI新项目\游戏工具\配音工作台\.venv\Scripts\python.exe'
$edgePython = Join-Path (Get-Location) 'test-results\xiaoya-neural-help-20261016\edge-venv\Scripts\python.exe'
& $edgePython -c "import importlib.metadata; print(importlib.metadata.version('edge-tts'))"
& $voicePython scripts/generate-xiaoya-phrase-pack-speech.py --help
```

`test-results` 被忽略入库，证据和隔离环境不随仓库自动迁移。交接要列缺失项，不要承诺另一台电脑可以不配置就继续生成。

## 5. 选对脚本，不直接重跑历史整批

| 脚本 | 可以复用什么 | 硬编码与风险 |
| --- | --- | --- |
| [generate-xiaoya-phrase-pack-speech.py](../scripts/generate-xiaoya-phrase-pack-speech.py) | 英文三音色、精确旧音复用、中文 hint、编码、独立识别、整包检查后导出 | **固定 v015、60 句、目录与回执**；不是通用扩包命令，没有 `--pack` 参数 |
| [generate-xiaoya-context.py](../scripts/generate-xiaoya-context.py) | `request()`、`generate()`：Edge 请求、词边界、转码、指标 | 无参数会生成历史 Edge 批次；其旧导出路径不能当成统一防覆盖导出器 |
| [generate-xiaoya-welcome-variants.py](../scripts/generate-xiaoya-welcome-variants.py) | 新中文小批次的优先改造样板，先验证整批、拒绝不同字节覆盖、独立 manifest | 固定六条 `ROWS`、v020 证据目录、输出 ID；无参数会开始生成，不是 dry-run |
| [generate-xiaoya-help.py](../scripts/generate-xiaoya-help.py) | 旧中文 Qwen 生产、工具与指标辅助 | 历史方案；近期中文采用上面的 Edge 链路，不能无提示换回旧声线 |
| [generate-pip-course.py](../scripts/generate-pip-course.py) | Pip 表演、保调和校验逻辑 | 固定旧 120 句，不是新课程批次导入器 |
| [generate-neural-audio.py](../scripts/generate-neural-audio.py)、[check-neural-speech.py](../scripts/check-neural-speech.py) | 媒体指标 / 英文独立内容转写 | 是生产工具，不是网页评分接口 |

旧 `generate-audio.ps1` 的 Windows SAPI、角色试听里的 Pogo / Milo / Lulu，都不是新增正式句子的默认方案。`VOICE_REVIEW.md` 是历史记录，不是替换当前三音色的指令。

## 6. 新英文短句包：完整操作顺序

1. **冻结输入**：新建 `design/xiaoya-phrases-<新批次>/`，保存句单与适用情境，稳定 ID 去重。旧发布的句子/音色/ID 不原地改义；三音色共享同一个句子与学习记录。
2. **准备新批次工具**：参考 v015 脚本，明确新 `SPEC_PATH`、`PUBLIC`、`EVIDENCE`、`MANIFEST`、数量校验和运行模块。保留整批预检、不同字节禁止覆盖、锁、失败证据和独立识别。可参数化或新建带批次名脚本，但本项目目前没有现成通用扩包 CLI。不要修改 v015 句单来迁就“必须 60 句”。
3. **先列计划**：按“完全相同的目标文本＋同一个音色＋源文件哈希”查复用，不因意思接近而复用。保留 `plan.json`，列新制、复用、缺漏数量和句单哈希。
4. **小批样本**：先覆盖短句、问句、否定句、较长句，用三音色听清是否沿用原角色，再处理余下已授权内容。没有听音能力的 AI 只能报告技术指标并提供试听，不能伪写主观验收。
5. **生成与质检**：先英文，再中文 hint，保存原始 WAV / Edge MP3、请求、词边界、编码参数、失败尝试和选中结果；跑独立转写并检查最终 MP3。失败重做保留旧记录，不覆盖同一 seed 的尝试。
6. **审核后导出**：整批 ID / 音色矩阵齐全、技术 flags 处理完、回执绑定最终哈希，再导出正式 MP3；主观审核独立标记为已试听/待试听。若用户授权先做技术接入，明确尚未完成的听感验收，不能改写成已通过。
7. **接入并测试**：按第 9 节修改运行映射与构建；只生成文件、未加入清单或运行引用，不能宣布 APP 已完成扩句。

现有 v015 的分步命令语义如下。**这些是旧批次维护命令；新包必须先完成第 2 步，再把脚本路径换成实际的新工具。** 不要整段无脑执行或顺便重做 v015。

| 阶段 | 参数 / 执行器 | 行为 |
| --- | --- | --- |
| 计划 | 工作台 Python + `--plan` | 写入该批次 `plan.json`，不合成 |
| 英文 | 工作台 Python + `--english --ids <ID> --voices aiden ryan pip` | 生成指定句；不带 IDs 则全批，voices 默认三种 |
| 中文 | Edge Python + `--hints --ids <ID>` | 制作该句中文情境提示；需要网络 |
| 初检 | 工作台 Python + `--check --ids <ID>` | 本地独立 Whisper tiny 英文核对，不提供参考答案给识别器 |
| 复核 | 工作台 Python + `--crosscheck --ids <ID>` | 自动转交已存在的 base ASR Python，分别核对原 WAV 与最终 MP3 |
| 重做 | 英文命令追加 `--redo --seed-offset <新整数>` | 新尝试；同一已存在尝试不会被覆盖，之后须重做该条质检 |
| 导出 | 工作台 Python + `--export` | 当前 v015 要求完整 60 × 4，不能用 `--ids` 当部分发布；先整批检查后复制并写回执 |

IDs 只是内容筛选，不是“自动新建句子”。不同命令不要跨 Python 环境混跑；尤其 `--hints` 不能假设工作台装有锁定的 Edge 版本。初检和复核记录必须对应选中音频的最终哈希。

## 7. 新中文引导或花名：小批次流程

从 `generate-xiaoya-welcome-variants.py` 改造新批次工具：替换 `ROWS`、`EDGE.EVIDENCE`、输出 ID 与 manifest 文件名，保留共享 Edge helper 和整批导出保护。输入每条至少有稳定 `id` 与最终要朗读的 `text`，先查既有回执是否能原字节复用。使用新版本 ID 修订旧文案，不覆盖旧 MP3。

用 Edge 隔离 Python 执行新脚本的 `--ids <新ID>` 做样本，再生成其余文案；检查 `production.json` 和逐条 `report.json`、`words.jsonl`，试听最终文件后执行该新脚本 `--export`。这个样板 **不带 `--export` 就会生成**；导出必须全批齐全。它不是第 6 节的多阶段参数接口，不支持 `--hints` / `--english`。

Edge helper 使用请求内容哈希建立证据子目录，仅在请求一致、最终文件哈希一致且无 flags 时跳过；遇到残留的不完整尝试会停止。保留失败目录并定位原因，再显式安排新尝试，不能删除所有记录后循环重试。旧客户端 7.2.8 的 403 是历史故障记录，不表示本轮已验证当前服务永远可用。若锁定客户端失效，应验证新客户端、记录差异并试听，不能静默升级后继续沿用旧来源声明。

花名资源要同时接入实际朗读映射；仅按命名约定放一个 `blindbox-seed-<id>.mp3` 不代表代码一定会播放。现有 14 个种子名批次与新增 21 种挑战花分开，不将已做过图误写为已配完音。

## 8. 编码、技术质检与听感分开验收

统一运行格式：**MP3 / 单声道 / 24 kHz / 48 kbps / libmp3lame / 去源元数据**。制作工具使用 `loudnorm=I=-20:TP=-1.5:LRA=7`；Pip 先保调变速再归一化。这里是编码目标，不是未经测量的“每段实际响度完全相同”。短句需与相邻示范、中文及音乐混播试听，不能直接套 BGM 的 GM 音量参数。

| 检查 | 现有实现 / 应保留的证据 |
| --- | --- |
| 文件身份 | 最终 SHA-256、字节数、稳定 ID、音色、源文件来源；复用文件也校验，不能只看文件名 |
| 完整性 | FFprobe 时长＋FFmpeg 完整解码为 PCM；非空、有限样本、非静音，RMS 至少 0.0001 |
| 通用指标 | 小于 0.3 秒或大于 20 秒、首尾低于 -45 dB 的静音超过 0.8 秒、样本峰值达到 0.99997 等会标 flag；具体以 `media_metrics()` 为准，不能简单延长阈值掩盖问题 |
| 英文长度 | v015 另按 `max(5, 词数 × 1.2 + 1)` 秒限制；防止句子重复、尾部乱码与失控长音 |
| 英文内容 | `check-neural-speech.py` 用本机 Whisper tiny，无目标提示；可疑/需要复核的条目用 base 对原音、最终音分别识别。漏 `not`、漏词、重复读、截断必须处理，不能靠放宽匹配率通过 |
| 中文内容 | 返回 WordBoundary 非空、归一化后覆盖完整文案；最后词边界不得超音频超过 0.15 秒，尾部空余不得超过 1.2 秒。这是服务元数据核对，**不是独立中文 ASR 或人工听辨** |
| 听感 | 自然发音、语速/停顿、问句语气、否定清晰、亲切度、头尾是否完整、有没有爆音或额外笑声；按 ID、音色、哈希记录实际试听结果 |

生产 tiny 模型 revision 为 `87c7102498dcde7456f24cfd30239ca606ed9063`；检查脚本固定模型权重哈希。base 的权重校验值由 `generate-pip-course.py` 的 `BASE_MODEL_SHA256` 复用。不要把生产 Python 模型与网页 `whisper-tiny.en-fp32-q8-v1` 的 revision 或路径混用。

每批回执至少包含：输入规格哈希、批次/ID/文本/音色、模型及 revision、客户端版本、方向/seed/速率/音高、原始和最终路径/哈希、编码与指标、复用出处、词边界/ASR 证据、失败与重做说明、**技术状态和主观审核状态分别记录**。输出格式参考已有 `audio-manifest.json`；小批中文参考 `welcome-hello-manifest.json`。原始 WAV、模型、日志与环境留 E 盘制作/证据目录，不放 `public/`。

## 9. 接入网页、离线包与 GM

当前路径关系：

```text
public/audio/{lessonId}.mp3                    共享 Aiden
public/audio/ryan/{lessonId}.mp3               共享 Ryan
public/audio/characters/pip/{lessonId}.mp3     共享 Pip
public/xiaoya/audio/phrases-v015/{id}/         aiden / ryan / pip / hint.mp3
public/xiaoya/audio/<中文引导ID>.mp3           构建为 dist/xiaoya/audio/v3/<ID>.mp3
```

共享 `public/audio` 是有效复用，不等于 APP 加载错旧版本。新增独立包使用自己的版本目录；修改已发布内容用新路径、新引用，避免同 URL 不同字节与旧缓存混用。

接线必须逐项完成：

1. `voices.js` 的 `lessonAudio()` 当前只特判 v015 集合，新包要扩展解析；中文帮助的 `hintAudio` / 引导事件映射也要明确配置。保持课程 ID、三音色和进度关系不变。
2. 新 JS 模块加入 `scripts/build-xiaoya.mjs` 的显式 `MODULES`。构建音频目前只枚举 `public/xiaoya/audio` **根层**、递归 `public/audio`、单独递归 `phrases-v015` 和 `xiaoya/sfx`；新建嵌套文件夹不会自动进入完整声音包。补充新包枚举、复制、长度与 SHA-256 清单。
3. 同一构建脚本的 GM catalog 还有 v015 路径特判。新批次必须正确显示句子、Aiden / Ryan / Pip / 中文分类，保证可逐条试听与定位。
4. 声音缓存名 `xiaoya-audio-v3` 同时出现在 `xiaoya/audio.js`、`xiaoya/sw.template.js`。只加新版本化资源且不变缓存策略时，由新构建清单更新；若改变缓存版本/策略，两处一起改。旧 `src/media.js` 与根 SW 是旧产品，不能只改旧入口。
5. 对应新包增加覆盖与引用检查，验证文件数、精确矩阵、无未知 ID、解析 URL、哈希、离线包枚举和旧 ID 兼容。整份 `public` 会复制到 `dist`，先排除原始录音、日志、模型制作缓存与本机配置。

新增引导复用现有音频播放器与取消/淡出机制，操作完成不能让上一页继续讲。正常 BGM 进出/开关为 600ms 渐变，语音时 120ms 压低音乐；录音、后台、卸载的即时隔离沿用当前行为。不要新建另一个音频实例绕过设置、避让和取消控制。详细行为见 [声音设计](XIAOYA_SOUND_DESIGN.md)。

## 10. 构建与验收顺序

真正新增音频或接线后，在正式工程运行适用检查；本次纯文档核对不假装重新执行这些测试。

```powershell
npm test
npm run build
# 要交给用户在 GM 中审核时，最后构建内测包：
npm run build:dev
```

两个构建命令都写同一个 `dist`。不要最后留公开版却告诉用户可以点 GM；也不要手改旧 `start-<hash>.html` 当发布。构建后核对 `dist/xiaoya/version.json`、当前 build 的 `audio-pack.json` 和真实启动来源；双击正式目录的 `启动小芽英语启蒙正式版.vbs` 打开当前包。

| 验证层 | 入口 / 交回时要说明什么 |
| --- | --- |
| 新包自动检查 | 参考 `tests/xiaoya-phrase-pack.test.js`、`xiaoya-phrase-delivery.test.js`、`xiaoya-phrase-integration.test.js`，扩展到新包，不能只测 v015 |
| 构建资源 | `tests/xiaoya-build.test.js`；新音频影响构建、清单完整、公开/内测范围正确 |
| 实际界面 | GM「声音」逐条试听、切三音色；目标学习情境、帮助按钮、操作后取消、回访引导频率。免录音模拟只证明流程，不证明音频听感或识别正确 |
| 浏览器回归 | 媒体变化按项目规则运行 `node tests/browser.cjs`；相关新产品流程参考 `node tests/xiaoya-phrase-pack-browser.cjs`、`node tests/xiaoya-gm-browser.cjs` |
| 离线声音 | `node tests/xiaoya-offline-audio-browser.cjs`；指定刚构建的隔离 `TEST_URL`，验证完整准备、哈希、断网原生播放。不能用“某一段播放成功”声称整包离线通过 |

这些浏览器脚本的环境/参数按 [技术地图](XIAOYA_ENGINEERING.md) 核对，必要时指定实际 `PLAYWRIGHT_MODULE`。使用隔离浏览器与测试数据，不清除用户学习/花园存档。启动器或端口未变不额外声称启动器重验；改变了才补 Python 启动器测试。手机扬声器、实体麦克风与儿童听感未实测时明确保留待验收。

## 11. 常见问题与交回格式

| 现象 | 先检查 |
| --- | --- |
| 新包声音 404 / GM 找不到 | `lessonAudio` 新包路由、构建根层/递归枚举、GM 分类、最终 dist；不是先换 TTS |
| 音色突然变了 | ID→speaker→模型 revision→方向→tempo→请求哈希；不要依据目录名称判断 |
| 中文很机械 / 太啰嗦 | 是否误用 SAPI / 旧 Qwen；文案是否过长；是否重复追加“听我说”；是否绕过 60 秒引导策略 |
| 文件在但导出拒绝 | 完整矩阵、最终哈希与质检绑定、缺词/静音 flag、已有发布路径字节冲突；不要删校验或用强制覆盖解决 |
| Edge 403 / timeout / 残留尝试 | 锁定环境版本、网络、逐次请求与失败日志；保留失败记录，不把未生成文件接入上线 |
| 网页提示声音没播出 | 当前构建和服务来源、资源清单/缓存完整性、手势播放限制、播放器错误；已预制文件不应临时请求 Edge |

交回另一 AI 至少提供：本次用户目标、分支与起点/交付提交；句单与脚本、模型/工具版本、生成/复用/失败数；音频回执与路径；实际修改的运行映射；构建号和验证证据；未试听/未生成/未接入部分。只提交核对过归属的源码、规范与可发布素材，不提交密钥、环境、原始录音或整批大型制作证据。简短摘要更新到现有 PROJECT_CONTEXT，不必把所有生成日志塞入交接入口。

可以直接交给下一位 AI：

> 在正式工程先读 AGENTS.md、PROJECT_CONTEXT.md、docs/XIAOYA_VOICE_HANDOFF.md。我的任务是〔新增短句 / 中文引导 / 花名〕，输入为〔句单或目标〕，范围为〔仅生成 / 生成并接入〕。核对 Git 和已有资源，沿用 aiden、ryan、pip 及锁定的中文声音。先为新批次准备独立规格、证据、输出和回执，不重写 v015，不覆盖已发布 URL；复用已核验声音，生成新音，检查最终 MP3 与独立内容证据。实际听过才记录听感通过。按授权范围接入声音路由、完整离线包与 GM，完成相应测试，交回提交号、运行入口、证据与待验收项。缺模型或服务失败如实报告，不静默更换工具或上传儿童数据。

来源与权利说明：Qwen 模型来源/revision、Edge 客户端与服务来源以批次 manifest 为准；Edge 客户端来源为 [rany2/edge-tts](https://github.com/rany2/edge-tts)。既有制作回执可追溯，不等于已经独立审核全部产物的商用分发权利。现有 BGM 是用户提供的 MiniMax 成品，短音效保留各自 CC0 来源。更换生产工具或准备对外分发时，核对实际模型、服务和素材的适用条款，保留对应许可；不要把工具开源许可当成所有声音的任意授权。
