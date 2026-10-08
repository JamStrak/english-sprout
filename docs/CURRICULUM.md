# 英语小芽：课程与内置语音

当前版本：`curriculum 1.1`，2026-10-08。

## 内容范围

`public/data/curriculum.json` 包含 **120 个不重复的实用短句、12 个主题，每个主题 10 句**。每句 2–7 个英文词，围绕打招呼、需要、感受、吃饭、洗漱、穿衣、游戏、整理、外出、家人、观察与友好相处展开。短句、中文释义、情境、亲子动作和回应提示由本项目编写，没有抓取或复用第三方课程、绘本和录音。

内容编排先从短而具体的表达开始，再逐步加入请求、提问与合作。主题是生活情境入口，不是严格的英语等级。`Stay where I can see you.` 等较长句子以听懂和做动作起步，不要求 4 岁孩子立即完整复述。

建议的家庭用法：

- 4–5 岁以听、模仿动作和一两次自愿跟说为主；家长读中文情境，和孩子交换角色。
- 6–7 岁可在同一情境中先尝试回忆，再听原声，最后在生活中实际说一次。
- 家长提示中的简短英文回应是对话参考，不是额外必背内容；没有要求这些回应也必须配音。
- 允许孩子说“不会”“不想说”，用再次示范代替扣分或强迫重复。
- 多个句子是家长常说的指令。孩子既可以练习听懂，也可以在玩偶角色扮演中使用。
- 界限表达（如 `Please stop.`）须得到家长真实尊重；安全主题只用于语言练习，不替代成人照看。

本课程是面向家庭练习的原创内容设计，未经过儿童随机对照试验或母语教师逐句认证。短句识别正确、打卡次数和自评熟悉度都不能证明口语准确或保证长期学习效果。应结合实际交流观察，复习安排由应用的学习状态模块负责。

## 数据契约

顶层为 `{ version, themes, lessons }`。

每个主题包含 `id / name / icon / color`。每个短句包含：

- `id`：稳定 ID，例如 `hello-01`；修改措辞时不随意改 ID，以免已有进度失联。
- `theme`：主题 ID。
- `english / chinese`：练习句和中文意义。
- `scene`：一句中文生活场景。
- `parentTip`：家长如何简短回应或组织练习。
- `action`：一项可以当场做的手势、观察或角色扮演。
- `emoji`：视觉辅助，不代替中文与英文。
- `choices`：三个 `{ label, emoji }` 选项；`answerIndex` 使用从 0 开始的下标。
- `audio`：相对站点公开目录的文件名，例如 `audio/hello-01.mp3`。

听辨选项中的干扰项来自其他情境，适合初学阶段的意义识别。源数据正确答案索引 0、1、2 各 40 次，界面每轮随机排列选项，单轮重试时位置不变，判定始终使用原选项索引。它们不是发音评分题；应用不应把选中正确中文解释成“口语合格”。

1.1 保留所有课程 ID，仅将四句调整为更贴合美式家庭场景或中文释义的表达：`needs-04` 为 “I need to use the bathroom.”，`tidy-03` 为 “Let's clean up.”，`feelings-10` 为 “Let's take a deep breath.”，`dress-05` 为 “Can you zip this up, please?”；对应四段音频同步更新。`family-07` 的家长回应改为 “Sure! Let's play.”，主句不变。

原先的 toilet、tidy up 等表达并非语法错误，此处为表达统一。参考：[剑桥 toilet 用法](https://dictionary.cambridge.org/us/dictionary/english/toilet)、[日常动作短语](https://dictionaryblog.cambridge.org/2016/06/08/phrasal-verbs-for-everyday-actions/)、[take a deep breath](https://dictionary.cambridge.org/us/dictionary/english/take-a-deep-breath)。

## 图像与内置语音

`src/illustrations.js` 按稳定课程 ID 提供 120 幅原创 SVG 情境图。听辨选项从同一套句意图片取图，不依赖读字；刷牙、穿脱鞋、捡积木、洗手、睡觉等使用具体动作区别。抽象礼貌表达仍需家长配合生活情境解释，不能仅靠单张图认定理解。

所有声音均在开发电脑预先合成，应用播放时不调用合成 API，不依赖手机安装的朗读声线。

| 项目 | 配置 |
|---|---|
| 英文示范 | Aiden / Ryan，各 120 句；默认 Aiden，可切换 |
| 英文引擎 | 本地 Qwen3-TTS-12Hz-0.6B-CustomVoice，自然模式，语言 en |
| 模型版本 | 85e237c12c027371202489a0ec509ded67b5e4b5 |
| 中文引导 | Microsoft Huihui Desktop，zh-CN，Rate 0；11 段 |
| 音量处理 | FFmpeg loudnorm I=-20 TP=-1.5 LRA=7 |
| 音频格式 | MP3，单声道，24 kHz，48 kbps |
| 文件证据 | public/audio/manifest.json：文本、声音、时长、字节数、SHA-256；英文另含模型、种子和采样参数 |

英文没有额外调速或升降音调。Aiden 文件沿用 `audio/<id>.mp3`，Ryan 在 `audio/ryan/<id>.mp3`；课程 ID 与学习进度共用。慢听是播放器 0.8 倍保调播放，用来听难处；原速用于模仿整体节奏。录音回听与声线切换互不改写学习记录。

声音缓存版本为 `english-sprout-audio-v3`，src/media.js 与 sw.template.js 一致。新旧声线不混用缓存；更新后在家长页重新保存全部 251 段声音，即可双声线离线练习。

## 开发维护

- `scripts/generate-neural-audio.py`：分批制作英文到 test-results，复用配音工作台现有环境和共享 GPU 锁；可续做，只重做指定 ID。
- `scripts/check-neural-speech.py`：CPU 离线转写核对，不向识别器提供参考台词，报告漏词、重复与文本差异。只做内容筛查，不做孩子发音评分。
- `scripts/install-neural-audio.py --check-only`：安装前核对两套是否齐全、文件哈希和转写结果；去掉参数才安装。旧包备份在不公开的 test-results/audio-archives。
- `scripts/generate-audio.ps1`：只更新中文提示并保留英文 manifest；不再生成 Zira 英文。

普通使用不需要这些制作组件。生成日志、原始 WAV、质量报告与模型文件不进入发布包。正式包仅含课程、成品声音和应用文件。

11 个中文提示为 listen、choose、speak、reveal、complete、review、record、welcome、try-again、well-done、checkup，覆盖听说步骤、错误鼓励、正确反馈与小测开始。

## 验证范围

课程测试检查 120 个 ID 和句子唯一、12 个主题各 10 句、必需字段与三个选项、答案与中文一致，以及两套声音和全部引导是否齐全、manifest 文本/哈希/字节是否匹配。图像覆盖与浏览器交互另行检查。

逐句英文需经过解码、非静音、削波、首尾静音与离线转写检查；差异句重新制作再核对。自动转写正确不代表自然度、重音、口音都已由真人认证。用户已认可两位声线的初始试听样本；全量制作的实际验证与限制见 [语音记录](VOICE_REVIEW.md)。
