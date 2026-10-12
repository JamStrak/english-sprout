# 可反复练习花园 v1.6.0

孩子循环：花园 → 练一句熟悉的 → 本机跟读结果 → 领取2次浇水 → 拖水壶给小花。每3轮另得种子。无需家长确认；自动词句匹配失败可自主开口练，领取标注清楚的鼓励水。

种子、水壶、营养均有可拖放的大图标，中央花田有落点光圈、松手提示、水滴与成长反馈。保留点工具再点花田和键盘操作。取消、拖错、多指、重复结束事件不消耗或重复扣资源。12步长成新植物，每次照顾增加尺寸，分阶段更换植物形态，成熟点植物收进图鉴。旧植株及收藏保持原进度。

## 状态边界

- `src/garden.js`：奖励派生、v1/v2账本验证、迁移、12步生长、唯一attemptId去重。
- `src/garden-interaction.js`：PointerEvent拖放与点选，仅触发动作回调，切屏cleanup。
- `src/garden-art.js`、`garden-play.css`：图形、伸缩成长和单屏布局。
- `src/speech-local.js`、`speech-match.js`：按需准备本机Vosk、临时录音解码、无目标约束识别、顺序词句匹配。正确识别句子可得三颗跟读星星；不是发音准确率。
- 跟读记录仅保存日期、已学课程ID、attemptId、assessment（local-speech或practice-effort）。音频/临时文本仅内存，不上传、不进存档。额外跟读不改变cards/days/checkups。
- 先成功保存，再返回花园及庆祝；存储失败回滚。独立录音请求代数阻止迟到权限/旧评测干扰新轮次。

## 离线和设备

识别脚本约6MB、英文模型约41MB，静态资源在`public/speech`，来源、许可、校验见该目录README。进入跟读才准备，核心页面和原声音不等待模型。脚本独立缓存，模型IndexedDB保存；准备与评测限时，失败可继续或重试。识别结果无儿童口音准确性保证；本地PC及模拟旧浏览器已验证，实体iPadOS15.1性能仍待验收。

## 验证

`npm test`、`npm run build`、`tests/browser.cjs`为发布基线。新增garden-interaction、garden-play-browser、speech-local-browser、garden-speech-browser、garden-races-browser专项分别验证拖放、五尺寸单屏、实际模型、真实MediaRecorder到领水、取消竞态与存储失败。实际模型烟测使用已有课程配音和静音，不能替代真实儿童语音测试。测试记录在忽略发布的`test-results`目录。
