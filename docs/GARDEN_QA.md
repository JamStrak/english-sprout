# v1.6.0 花园与独立跟读验证

日期：2026-10-12（Asia/Shanghai）。本地正式候选构建26716a20a44c，隔离Edge/Playwright，不操作用户真实学习记录。

| 验证 | 结果 | 范围 |
| --- | --- | --- |
| npm test | 153/153 | 日期/复习、v1/v2迁移、12步生长、奖励轮次去重、备份、词句匹配 |
| npm run build | 成功 | dist静态输出、按需识别资产、核心缓存新增模块 |
| tests/browser.cjs | 36/36 | 原学习/复习/小测、三声音、录音、导入、头像、全部音频离线、花园新流程 |
| garden-interaction.cjs | 10/10 | 触屏/鼠标/键盘、取消、多指、重复事件、cleanup |
| garden-play-browser.cjs | 25/25 | 320×568、360×640、390×844、768×1024、1024×768真实touch，单屏及奖励刷新 |
| speech-local-browser.cjs | 通过 | 两句真实示范匹配、无关句和静音不通过、准备/评测取消、只下载一次、冷页面离线重开 |
| garden-speech-browser.cjs | 4/4 | 真实MediaRecorder→本机识别→三颗星→领取；重复点击只发一次，迟到结果不发奖，无上传 |
| garden-races-browser.cjs | 4/4 | 同屏取消后重录、重录失败禁旧回听、领水及播种保存失败回滚 |
| startup-browser.cjs | 15/15 | 旧Safari缺失能力模拟、首用恢复、旧学习/身份保留、种植及离线 |

证据分别位于忽略发布的test-results/local-v160-garden、garden-interaction、garden-play、speech-local、garden-speech、garden-races、startup-browser；基础回归摘要为UI_QA_local-v160-garden.md。

自动评星衡量英文词句匹配。真实模型测试使用已有课程配音与静音，真实录音链路使用已知配音模拟麦克风；这些测试不能证明四岁儿童口音识别准确率。五尺寸与缺失能力测试不等于实体iPadOS15.1验收。识别不清/设备资源不足/麦克风不可用时，孩子可重试或完成明确不评分的自主跟读领鼓励水。

首次跟读按需下载模型约41MB与脚本约6MB；不占首页必要请求。识别在本机执行，录音与识别文本不保存到学习备份、无网络上传。额外跟读不提升或推迟普通复习计划。
