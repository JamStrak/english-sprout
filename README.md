# 小芽英语启蒙正式版

工程和素材目录分类见 [目录说明](目录说明-先看这里.md)。
面向 3–6 岁，以声音、生活情境和开口练习为核心的英语启蒙应用，交互优先照顾 3–4 岁。孩子用学习奖励收集种子、照顾花园；儿童主流程不依赖认读英文字母。

**当前版本为小芽英语启蒙正式版 v0.27.0。** 国内站已运行公开构建；GitHub 发布状态与验证范围见下方当前交接入口。GM 资源审核与免录音测试台仅包含在内测构建中。 当前代码、工作目录、验证与限制统一维护在 [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)。

## 使用

在当前新产品工程中双击 **启动小芽英语启蒙正式版.vbs**。启动器打开当前构建专属入口，仅保留自由花园。本机也可在父目录双击 **启动小芽英语启蒙正式版.vbs**。常用试玩入口 `http://127.0.0.1:24756/xiaoya/?garden=b`，重启电脑后需重新双击；端口冲突时启动器会使用备用端口。完整操作见 [使用说明](docs/XIAOYA_USE.md)。

内测页面点 **GM 内测**，可搜索课程、试听三种声音及全部引导、放大图片，进入无需录音的流程测试。GM 测试存档临时隔离；退出恢复原学习记录，公开构建不含此面板。

## 开发与接力

任意 AI 工具先读 [当前交接入口](PROJECT_CONTEXT.md) → [AI 接力说明](docs/AI_HANDOFF.md)，再按任务读相关源码；不需要原聊天记录或某种订阅服务。全部文档按范围归类在 [资料索引](docs/INDEX.md)。

```powershell
npm test
npm run build:dev
python launcher_xiaoya.py --no-browser
```

本机已核对 Node.js 24.19.0、Python 3.13.1，现有 CI 使用 Node.js 22；这不是其他版本的兼容承诺。应用运行无第三方 JS 安装依赖，浏览器自动化和资源制作工具另行配置，见 [技术地图](docs/XIAOYA_ENGINEERING.md)。对外构建用 `npm run build`，只发布 `dist`；构建公开版会替换本地构建，需要回到 GM 时重建内测版。不要直接以 file:// 打开 HTML。

## 同仓库的旧产品

旧「英语小芽」保留在 `src/` 和根路径 `/`；当前「小芽英语」位于 `xiaoya/` 和 `/xiaoya/`。`package.json` 的 1.8.1 属于旧产品，新产品版本在 `scripts/build-xiaoya.mjs`。`启动英语小芽（旧版）.vbs` 是旧入口；`npm run preview` 已指向当前产品，旧版命令为 `npm run preview:legacy`。

[旧产品说明](docs/LEGACY_README.md) 保留历史线上地址、规则和验证。GitHub Pages 的发布流程和状态见 [双渠道发布与交接](docs/XIAOYA_RELEASE_WORKFLOW.md)；main 推送会触发发布。两产品稳定 ID、学习记录及共享资源必须兼容。
