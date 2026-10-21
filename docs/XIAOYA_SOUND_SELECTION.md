# 小芽英语音效筛选记录

筛选日期：2026-10-21。使用用户本机 **声匣** 的固定公开素材目录，实际检索、取得候选原件并比较后，选入 17 段短音效。资源位于 `public/xiaoya/sfx/`，总计 **104,188 字节**。本文件记录资源选择；全流程触发位置及 GM 行为以项目音效配置和功能说明为准。

## 风格与边界

- 纸艺花园使用轻点、翻书、柔性包装、水泡、水花和短拨弦。高频按钮声音短；完成、开花、揭晓声音稍长，以便形成可区分的反馈。
- 互动反馈不代表发音准确、口语掌握或声学评分。资源不足使用温和提示，不使用尖锐失败警报。
- 不给录音开始添加声音，避免提示音进入儿童录音。录音结束素材已准备，默认禁用，只有录音完全停止后才适合触发。
- 不把短成功音效循环作为 BGM；不把音效混进英语示范或儿童录音文件。

## 逐项选择

时长为导出后 FFprobe 测量值。下列文件均在 `public/xiaoya/sfx/`。

| 文件 | 建议用途 | 声匣原件 | 时长/秒 | 取舍 |
| --- | --- | --- | ---: | --- |
| `ui-tap.mp3` | 常规按钮点击 | Kenney UI · `click1.ogg` | 0.090930 | 极短；频谱重心低于 click4/5，减少高频点击负担 |
| `ui-select.mp3` | 页签、选项、设置开关 | Kenney UI · `rollover5.ogg` | 0.108844 | 比 rollover2/3/4 的频谱重心低，与轻提醒分开 |
| `panel-open.mp3` | 弹层、菜单打开 | Kenney RPG · `bookOpen.ogg` | 0.151066 | 短纸页材质；与关闭组成一对 |
| `panel-close.mp3` | 返回、关闭弹层 | Kenney RPG · `bookClose.ogg` | 0.230612 | 同系列合书声，衰减后重新编码 |
| `page-turn.mp3` | 课程卡、收藏翻页 | Kenney RPG · `bookFlip3.ogg` | 0.230612 | 三种翻页中最短，不使用较长摩擦声 |
| `soft-blocked.mp3` | 暂不可用、资源不足、轻提醒 | Kenney UI · `rollover6.ogg` | 0.171587 | 频谱重心约 383 Hz，避免蜂鸣或长警报 |
| `record-stop.mp3` | 完全停止录音后，默认禁用 | Kenney Jingles · `jingles_PIZZI09.ogg` | 0.568776 | 短双音拨弦；不参与录音启动 |
| `success.mp3` | 完成一步、选择正确 | Kenney Jingles · `jingles_PIZZI10.ogg` | 0.797211 | 客观主峰序列上行，比开花音效短 |
| `reward-shell.mp3` | 贝壳奖励、购买成功 | Kenney RPG · `handleCoins2.ogg` | 0.338209 | 比 handleCoins 短，轻物件碰动 |
| `reward-water.mp3` | 水滴奖励 | rubberduck Water · `bubble_02.ogg` | 0.360340 | 三个水泡中最短且频谱重心最低 |
| `gift-open.mp3` | 欢迎礼袋展开、领取 | Kenney RPG · `cloth1.ogg` | 0.661043 | 柔性材料展开，避开金属带扣声 |
| `seed-reveal.mp3` | 盲袋种子揭晓 | Kenney Jingles · `jingles_PIZZI16.ogg` | 0.461542 | 短上行拨弦，突出揭晓瞬间 |
| `seed-plant.mp3` | 播种落下 | Kenney RPG · `handleSmallLeather.ogg` | 0.338209 | 轻放物件；比硬币声音频谱重心低 |
| `watering.mp3` | 一次浇水 | rubberduck Water · `splash_02.ogg` | 0.717868 | 比 splash01/07 短、比 splash06/08 频谱重心低 |
| `flower-bloom.mp3` | 花朵长成、开花 | Kenney Jingles · `jingles_PIZZI02.ogg` | 0.955737 | 较长上行拨弦，保留稀少奖励的层级 |
| `challenge-start.mp3` | 挑战进入 | Kenney Jingles · `jingles_PIZZI04.ogg` | 0.564127 | 双音短开场，减少示范前等待 |
| `challenge-complete.mp3` | 完成整组挑战 | Kenney Jingles · `jingles_PIZZI15.ogg` | 0.811202 | 与普通成功、开花使用不同拨弦序列 |

“上行”等序列描述来自短时傅里叶主峰估算，不等于人工听辨或乐谱分析。每条候选、替代项、具体声匣 ID、原件哈希、选择理由和导出参数均保存在 `design/xiaoya-sound-selection.json`。

## 实际工具与筛选过程

实际工具为 `E:\AI新项目\游戏工具\游戏音效工作台`，连接前通过 `/api/health` 核对工具身份。使用声匣现有目录 API：

1. `/api/catalog/packs` 核对素材包。
2. `/api/search?provider=catalog&...&use_ai=false` 按 click、rollover、switch、book、cloth、handle、bubble、splash、pizzicato 九组条件检索；去重后 **104 个候选**。
3. `POST /api/catalog/previews/{id}`，按声匣文档携带 `X-Soundbox-Client: local`，由工具核验固定下载包、提取选定原件；通过返回的 `/api/catalog/audio/{id}` 取得原文件。
4. 104 个候选均重新核对目录中逐文件 SHA-256，使用 FFmpeg 解码浮点 PCM，计算时长、样本峰值、均方电平与频谱重心；拨弦额外比较近似主峰变化。
5. 选定 17 个原件后，只做兼容性转码与线性增益调整。未合成、未裁剪、未叠加音乐；未写入声匣个人库或收藏记录。声匣的可清理预览缓存由正常预览接口产生。

目录快照核验日期为 **2026-09-30**。2026-10-21 复核了下列官方来源页的 CC0 标注；OpenGameArt 页面直接读取出现服务错误，检索到的同一官方页面内容仍明确列出作者与 CC0，且本机固定目录保留来源与授权证据哈希。

## 来源与授权

这 17 个新增音效来自四个 **CC0 1.0** 素材包。公开分发目录内的 `SOURCES.json` 保留原件路径、声匣 ID、作者、官方来源、原始下载包 URL/哈希、原文件哈希与导出文件哈希；不含本机路径、录音或学习记录。

| 素材包 | 作者 | 官方来源 | 授权 |
| --- | --- | --- | --- |
| UI Audio | Kenney | [Kenney UI Audio](https://kenney.nl/assets/ui-audio) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| RPG Audio | Kenney | [Kenney RPG Audio](https://kenney.nl/assets/rpg-audio) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Music Jingles · Pizzicato | Kenney | [Kenney Music Jingles](https://kenney.nl/assets/music-jingles) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| 40 CC0 water / splash / slime SFX | rubberduck | [OpenGameArt 原始素材页](https://opengameart.org/content/40-cc0-water-splash-slime-sfx) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

## BGM 决策

本次未从声匣新增 BGM。其相关音乐目录为短 jingles，没有在本轮筛选中找到适合长时间循环的完整柔和曲目。

现有 `public/xiaoya/audio/garden-piano.mp3` 可供项目继续使用。既有 `garden-piano-source.json` 说明：这是用户用 MiniMax 生成、提供并要求作为本 App 花园音乐使用的文件，原样保留，SHA-256 为 `da84c375b1cca187f6541f41613d4c49a00df50fd271abaa3ce7d2e440dcddd8`。**没有附带单独许可文档，不能标注成 CC0 或声匣来源。** 首页、商店等界面的复用范围由当前产品配置记录；本次没有向外获取或购买新曲目。

## 验证与待验收

- 候选源文件哈希核验 **104/104**；候选 FFmpeg 解码 **104/104**。
- 导出音效 **17/17** 可解码，均为单声道、44.1 kHz、96 kbps MP3，无零长或全静音文件。
- 以均方电平 -24 dBFS、样本峰值 -9 dBFS 上限和最多 +6 dB 增益计算每条线性增益；峰值优先，瞬态拟音的均方电平因此更低。MP3 重采样/编码后再次实测样本峰值介于 **-13.80 至 -8.53 dBFS**，没有样本削波。这里没有声称真峰值或响度 LUFS 测量。
- 总文件体积 **104,188 字节**。原件与输出哈希、精确时长、实际增益、峰值和均方电平都可复核。
- **本轮未进行人工听感试听。** 筛选依据为实际工具目录、来源语义、解码和频谱/电平比较。GM 中应可以逐条试听并替换，最终儿童使用场景、实体扬声器与连续点击听感仍需人工验收。
- 本文的资源检查不代替运行时触发、语音避让、静音、GM 持久化及离线缓存测试；这些检查由功能集成记录报告。
