# 英语小芽 · 当前状态

更新：2026-10-12（Asia/Shanghai）。

## 当前交付

v1.4.1 自动更新已发布：代码 `6ce5a32fcc2806fe5dbc604c9660c1d274bf975f`，Pages 任务 `38210185440` 成功；线上构建 `32c0fc1b4d55`，本地 `63eedd283640`（换行规范化差异，已按 Git 字节复算并核对）。移除家长手动更新按钮，新版完整缓存后自动激活，各页面在空闲时应用；练习、录音、奖励展示和编辑不被刷新打断。原已打开的 v1.4.0 页面在新 worker 完整下载并激活后，普通刷新或重新打开进入新机制；此前尚未发现更新时，首次刷新可能只触发下载，不保证一次刷新即迁移。实现 src/auto-update.js、sw.template.js、scripts/build.mjs，设计边界见 docs/DESIGN.md「自动更新」。

适合 4—7 岁孩子和家长的每日一句、间隔复习、看图听说与简单花园收集。上一版 v1.4.0 手机单屏改版，代码提交 `3d969a5a402b1927447892783f2634f947f3c484`；GitHub Pages 任务 `38208510562` 成功，正式站构建 `ac13af5b07c0` 已验证。本地构建 `57a8f28a8efd` 与线上哈希不同源于 Git 换行规范化，已按提交字节复算核对。课程 1.1、学习状态 v1、三套完整配音和声音缓存 v5 均保持不变。

正式网址 https://jamstrak.github.io/english-sprout/ ，源码 https://github.com/JamStrak/english-sprout 。改版前 v1.3.0 已提交并上线（代码 `845b16b`，状态文档 `3999dcb`，线上构建 `17e9beb9937e`）；本轮另推送稳定标签 `v1.3.0-before-mobile-redesign-20261012`，指向 `3999dcb`，可回看或恢复。

本地 http://127.0.0.1:24736/ ，普通入口“启动英语小芽.vbs”。配音对照试听现在位于“家长 → 声音与语速”；直达 http://127.0.0.1:24736/?audition=1 仍可用。v1.4.1 开始自动应用更新，不再提供家长更新按钮，学习记录和声音缓存保留。

## 本轮变更

- 首页只突出一个当前任务：到期复习 → 今日未学新句 → 到期记忆小游戏 → 花园。每一类完成后重新计算下一步，不把提前计算的旧任务继续塞给孩子。漏学不跳课程，每日复习上限保持原规则。
- 新学按“听 → 选图 → 开口”，复习先看图回想，小测先回想再听辨。每一步独立一屏；大图与播放图标都能听。复习与小测进入时不自动放答案，主动听提示会同步揭晓；小测听提示后不可选“自己会说”。
- 首页和练习用紧凑的“换伙伴 / 语速”入口，需要时展开三角色和四档语速。仍直接点角色名切换并试听，没有下拉菜单；正在播放时，关闭面板后入口保留明显声波与状态。打开面板、改变未播放的语速不会自动说话。
- 短句书按主题和句子分页，保留全课程搜索。花园每次照顾一块地，三块地按钮切换，图鉴独立。家长功能分成练习习惯、声音与语速、离线与安装、进度备份、学习足迹、陪伴方法六个入口，每个子页只做一件事。
- 动物预设点选即保存返回；自拍按来源、头套、可选裁剪分步，不把全部控件挤在同一页。自拍仅本机。
- 手机布局使用可伸缩画面和视口高度，正常尺寸无需上下拖动；没有用裁切隐藏不可见按钮来假装单屏。点按圆圈、播放、答题、录音、花园奖励继续有就地反馈。
- 修复离开备份页后迟到的文件读取弹出导入确认，以及麦克风授权未返回时切后台可能继续开始录音的竞态。

本轮没有重新配音。Aiden / Ryan / Pip 泡泡猫各 120 句；Pip 为用户已选第四位女生，其他 Pogo / Milo / Lulu 仅四句样音，暂不扩充。保留原 251 段音频及原 manifest、Pip 120 段和当前音频缓存。制作历史与质量检查见 docs/VOICE_REVIEW.md 和 v1.3.0 稳定标签。

## 技术不变量

- 纯静态，无付费运行时 API、账户或云端儿童数据。录音仅内存回听，离开卡片关闭麦克风并清理；头像仅本机。
- src/learning.js 是日期、复习、小测规则唯一实现；src/garden.js 重放奖励账本。本轮没有修改这两个模块。src/journey.js 只组合既有计划决定界面顺序。
- 稳定课程 ID、旧 v1 进度和备份兼容；选择题正确不等于发音准确或完全掌握。自由练习不刷学习记录和奖励。
- 学习备份导入替换不合并；声线、语速、头像与试听偏好独立，不随学习备份迁移。
- 0.75× / 0.9× / 1× / 1.15× 即时保调语速，播放中不重播、不重开请求；临时慢听 0.8×，录音和中文帮助 1×。中文玩法仅主动点击后播放。
- english-sprout-audio-v5 在 src/media.js / sw.template.js 一致，保留 v4 / v3 合法下载。保存全部声音为 383 个唯一文件（360 英文、11 中文帮助、12 额外样音）。公开 JSON manifest 属核心缓存。
- 只发布 dist；核心离线缓存已加入 focus.css 和 journey.js。不公开 test-results、原始照片、运行日志或本机配置。
- 启动器未改，仍隐藏终端、复用服务和处理端口；全局 notify 完成提示音保持启用。

## 文件定位

- 界面：src/app.js；新单屏样式 src/focus.css（最后加载）；基础 styles.css / interaction.css；任务顺序 journey.js。
- 媒体：src/media.js、voices.js；点按 feedback.js/css；头像 avatars.js/css；配图 illustrations.js。
- 配音与试听：public/audio、src/voice-audition.js/css、public/data/character-voices.json；制作与核对说明 docs/VOICE_REVIEW.md。
- 学习/收集：src/learning.js、garden.js；规则 docs/LEARNING.md，交互 docs/DESIGN.md。
- 发布/离线：scripts/build.mjs、sw.template.js、.github/workflows/pages.yml。

## 当前验证

v1.4.1 / `63eedd283640`：npm test 123/123、构建成功；tests/browser.cjs 36/36，摘要 docs/UI_QA_local-v141-auto-update.md；tests/update-browser.cjs 12/12，真实 Edge Service Worker 在隔离服务器切换版本，验证首次不刷新、空闲仅刷新一次、录音授权/录音/回听与完成页保留、草稿/头像保留、多标签分别更新、后台与播放暂缓、完整缓存失败与旧 HTML 拒绝激活、服务器真实断网后恢复、存储失败保护，以及新 worker 激活后旧 v1.4 普通刷新迁移。证据 test-results/automatic-updates/results.json；本机测试资料不发布。正式站 tests/release-focus.cjs 通过：v1.4.1 和构建标记一致，三声真实播放、Pip 0.9×、复习→新学→花园、断网重载后实际播放、进度正确、无页面异常，家长页无更新按钮；明细 test-results/live-v141/results.json。

以下为上一轮 v1.4.0 单屏改版的验证，布局本轮未改变。全部本地浏览器结果基于 v1.4.0 / `57a8f28a8efd`：

- npm test：117/117；npm run build 成功。包含新增任务优先级、漏学、每日上限、120 句完成和不修改状态等 8 个 journey 测试。
- tests/browser.cjs：36/36。覆盖三角色真实播放、十二主题 Pip、即时变速、真实 MediaRecorder、学习/复习/小测、备份、花园、头像、383 段全量离线、迟到异步事件和播放重试。摘要 docs/UI_QA_local-v140-focus.md，明细 test-results/local-v140-focus。
- tests/focus-browser.cjs：265/265。320×568、320×640、390×844、430×932、1440×1000，检查每个屏幕无文档横纵滚动、无隐藏裁切、按钮中心无遮挡；采用实际坐标操作，含最长文案、真实播放和录音前中后。明细 test-results/focus-mobile。
- tests/avatar-focus.cjs：14/14。动物头像及自拍分步在 320×568、390×844 的布局、保存、取消、删除与晚到响应。明细 test-results/avatar-focus。
- tests/audition-browser.cjs：10/10。样音和双声对照、即时语速、离线重载、失败重试、320×568 一屏及导航停止。明细 test-results/audition-local。
- tests/release-focus.cjs 本地预演通过：三声音 → 到期复习 → 新句 → 花园 → 离线重载实际播放，学习记录准确、无页面异常。明细 test-results/release-focus-local。正式站同一脚本也已通过，线上 v1.4.0 / `ac13af5b07c0` 与提交一致；三角色真实播放、Pip 0.9×、复习→新学→花园、断网重载后播放、390×844 无滚动及学习记录均正确，无页面错误。明细 test-results/live-focus/results.json。

手机视口和浏览器播放检查不是实体 iPhone / Android 真机验收，也不等于真人听感或儿童学习效果验证。大字体、软键盘及不同浏览器安全区仍以实际设备反馈为准。
