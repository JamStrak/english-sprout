# 英语小芽 · 当前状态

更新：2026-10-11（Asia/Shanghai）。

## 当前交付

适合 4—7 岁孩子和家长的每日一句、间隔复习、看图听说与简单花园收集。用户最新决定：只采纳第四位女生 Pip 泡泡猫，补齐完整课程；原 Aiden / Ryan 保留，其他三位新候选留待后续版本。不要继续自动扩充其他角色。

已发布 v1.3.0，课程 1.1，学习状态 v1。正式网址 https://jamstrak.github.io/english-sprout/ ，源码 https://github.com/JamStrak/english-sprout 。代码提交 845b16b30fc7f573b0c555bf7851e9153b00bb8b；GitHub Pages 任务 38115273444 成功。线上构建 17e9beb9937e，本地构建 a1b9a11f78ef（Git 换行规范化导致哈希不同，已按提交内容复算并验证线上一致）。

旧页面如仍显示两个角色，在“家长”点“新版本已准备好，重新打开”即可应用等待中的更新；不清除用户学习记录。

本地 http://127.0.0.1:24736/ ，普通入口“启动英语小芽.vbs”。家长页有“配音对照试听”，直达 http://127.0.0.1:24736/?audition=1 。

## 本轮变更

- 正式角色为 Aiden / Ryan / Pip，各 120 句。Pip 沿用用户已选的 Serena 底色和好奇小猫表演方向，复用四段原样音、新制 116 段；原 251 段音频及 manifest 不变。默认和已有角色选择保留，不强制切换到 Pip。
- Pip 共 1,346,064 字节、212.496 秒。119 句通过独立 CPU tiny.en 内容检查；meals-04 采用自然节奏 1.76 秒，由既有 faster-whisper-base 对原 WAV 和最终 MP3 交叉核对匹配。tiny.en 对这一句仍有差异，证据及公开 manifest 如实保留。未宣称全课程真人逐句验收。
- 四档 0.75× / 0.9× / 1× / 1.15× 即时保调语速，播放中换档不重播、不重新请求；记住偏好。临时慢听仍为 0.8×，孩子录音和手动中文帮助保持 1×。
- 首页、短句书、练习和家长页均直接点名字换声；整幅图和播放按钮都能重听。当前角色优先预载，池上限六段；重复加载请求合并、流式播放保留。
- 对照试听移至家长页，Pip 标明完整课程，其余三位只保留样音。保留原两声对照，不再提供待选择的男女投票操作。打开、关闭或换页不会额外自动说话。
- 声音缓存 v5，迁移并保留 v4 / v3 合法旧下载；下载全部为 383 个唯一文件（360 英文、11 中文帮助、12 额外对照样音）。Pip 四段样音与完整课程复用，不重复计数。音频旁 JSON manifest 属核心缓存，不走 MP3 范围请求。

沿用功能：120 幅图；首屏每日一句、点按反馈；无自动中文女生引导；六款动物头像与本机动物自拍；日历间隔复习、每周回想/听辨小测、花园养成。自由练习不改记录或刷奖励。

## 技术不变量

- 纯静态，无付费运行时 API、账户或云端儿童数据。录音仅内存回听，离开卡片关闭麦克风并清理；头像仅本机。
- src/learning.js 是日期、复习、小测规则唯一实现；src/garden.js 重放账本。稳定课程 ID，旧 v1 进度/备份兼容，选择题不能证明口语掌握。
- 学习备份导入替换不合并；声线、语速、头像与试听偏好独立，不随学习备份迁移。正式语速仅首次从合法试听语速迁移。
- english-sprout-audio-v5 在 src/media.js / sw.template.js 一致；新 116 段 Pip 不误读旧缓存。
- 只发布 dist；核心离线缓存含试听模块、样式和公开 manifest。不公开 test-results、原始照片、运行日志或本机配置。
- 启动器未改，仍隐藏终端、复用服务和处理端口；全局 notify 完成提示音保持启用。

## 文件定位

- 界面/媒体：src/app.js、styles.css、interaction.css、media.js、voices.js；点按 feedback.js/css；头像 avatars.js/css；配图 illustrations.js。
- 配音：public/audio/characters/pip、public/audio/pip-manifest.json；制作 scripts/generate-pip-course.py、generate-character-samples.py；说明 docs/VOICE_REVIEW.md。
- 试听：src/voice-audition.js/css、public/data/character-voices.json。其余候选 Pogo / Milo / Lulu 当前只有四句样音。
- 学习/收集：learning.js、garden.js；规则 docs/LEARNING.md，交互 docs/DESIGN.md。
- 发布/离线：scripts/build.mjs、sw.template.js、.github/workflows/pages.yml。

## 当前验证

- npm test：109/109；npm run build 成功。
- 完整浏览器：50/50，包含三角色真实 MP3、十二主题 Pip、即时变速不重开播放、录音/中文帮助原速、383 段离线下载后重载、学习记录/复习/花园/头像、320/390px 布局。证据 test-results/local-v130-pip，摘要 docs/UI_QA_local-v130-pip.md。
- 试听专项：10/10。16 段样音、原双声对照、即时变速、离线重载、失败重试、320px 和关闭/导航停止均通过。证据 test-results/audition-local。
- 正式站专项 tests/release-pip.cjs 通过：线上版本/构建与 120 条公开 manifest 完全一致，三角色真实播放、Pip 五句抽测、0.75× / 1×、偏好保存及断网重载通过，无页面错误，学习记录不变。证据 test-results/live-pip/results.json。
- 制作闸门 Python 16/16、两脚本编译通过；13 个句子返工 19 次。全部成品哈希、原 251 段和四段已选样音保留检查通过，GPU 锁已释放。
- 制作证据：test-results/pip-course-20261011/final-verification.json；原始 ASR test-results/speech-check/pip-course-20261011.json。单句交叉报告、未通过的尝试均保留本机，不公开。

手机视口、自动转写和浏览器实际播放不能代替实体手机或真人听感验收；后续反馈按具体句子局部改进，不自动扩充新声线。
