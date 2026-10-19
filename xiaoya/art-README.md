# 小芽英语美术资源路标

核对日期：2026-10-19，基线 `51090a5` / 小芽英语 `0.16.0`。当前是纸艺图片增强 + SVG 兜底，不再以旧 `art.js` 的场景图与家具系统代表整个产品。当前工程入口见 [PROJECT_CONTEXT](../PROJECT_CONTEXT.md)，新增句子、配音、导图、缓存与验证的完整步骤见 [内容制作管线](../docs/XIAOYA_CONTENT_PIPELINE.md)。

## 资源与代码位置

| 用途 | 运行资源 | 决定引用与行为的源码 |
| --- | --- | --- |
| 原有故事主图 / 必要前后画面 / 生活小检验图 | `public/xiaoya/stories/` | [stories.js](stories.js)、[story-assets.js](story-assets.js)、[story-pictures.js](story-pictures.js) |
| 新增 60 句主图 | 同目录中的 `daily-*-paper-v015.webp` | [phrase-assets-v015.js](phrase-assets-v015.js)、[phrase-pack-v015.js](phrase-pack-v015.js) |
| 伙伴、工具、种子、幼苗、普通/巨大/蝴蝶结花 | `public/xiaoya/paper/v1/` | [paper-art.js](paper-art.js)、[meadow-art.js](meadow-art.js) |
| 三音色头像、花盆前景、挑战旗、里程碑花 | `public/xiaoya/paper/v2/` | `PAPER_ASSETS` 映射与调用组件 |
| 花园布局、浇水目标与点击轮廓 | 素材由上述映射选取 | [meadow-ui.js](meadow-ui.js)、[meadow-hit-shapes.js](meadow-hit-shapes.js)、[meadow.css](meadow.css) |
| 普通花园与基础图标兜底 | 程序 SVG，无需下载才能显示 | [garden-art.js](garden-art.js)、[art.js](art.js)、[story-art.js](story-art.js) |
| 安装图标 | `public/xiaoya/icons/`，48 / 192 / 512 PNG | 构建脚本与应用 manifest |

映射里的图片 URL 相对于页面的项目根 `<base>`，不是相对于带哈希的 JS 发布目录。实际目录以代码映射为准，不能仅按文件夹猜哪些图片已上线。内部 GM 图片页可浏览全量扫描资源，但“被扫描”不等于某句正在使用；须点进该句核对。

## 故事主图合同

- 一句一个清晰的生活沟通意图，默认一张熟悉主图。普通复习不换陌生故事、不重复慢播四格；必要时才增加起始/结果帧。
- v015 主图是 980 × 700 WebP、单图最多 240,000 字节。其他旧图或类别按原清单规格，不机械缩成这一尺寸。
- 保持已交付纸艺角色、材质与配色。画面不出现字母、文字、文字气泡或伪按钮；逐图核对手掌朝向、肢体、持物归属、动作语义。
- `stories.js` 的 `imageLayout`、`cueFrame`、`introFrame`、`teachingFrames` 与 `story-pictures.js` 共同决定显示。`alternateImages` 是显式生活小检验用途，不是普通复习随机换图。
- 换画面只改资源映射与必要展示参数，不改旧事件/学习 ID、奖励或掌握证据。画面不能独立表达抽象句意时，保留简短中文语音帮助。

## 植物必须长在地上

[paperPlantLayer()](paper-art.js) 的现有合同：植物源画布 **384 × 512**，透明背景，可见根点在源图归一坐标 **(0.5, 0.88)**。默认绘制盒宽 124.5、高 166，根点落在 SVG **(80, 164)**。代码使用 `xMidYMax meet` 并补偿留白，锚定的是画出的根部，不是图文件底边。

替图要保持透明画布、根点和尺寸；禁止随手紧裁导致种子/花朵漂浮。动画绕根部，静态命中轮廓和动画视觉层分离。不要为图片加可点击矩形盖住邻近植物；图层自身 `pointer-events: none`，外层控件负责交互。每次浇水都要有生长变化；普通花当前 5 次、巨大花 10 次，换美术不能悄悄改成长数值。

改过种子、幼苗、花苞或花朵像素后，重新运行：

```powershell
python scripts/generate-meadow-hit-shapes.py
python -m unittest discover -s tests -p test_meadow_hit_shapes.py
```

生成器需要 Pillow，从 alpha ≥ 24 的轮廓按行提取命中路径，并把图片 SHA-256 写入 `meadow-hit-shapes.js`。它目前自动扫描 v1 的花、种子/幼苗/花苞，显式列出 v2 的彩虹/星光蝴蝶结花；新目录、新花种需要扩展发现规则。然后跑花园根点、命中与触摸浏览器检查，检查水滴目标紧邻对应进度条且不被其他花遮挡。

非植物规格各不相同：首批伙伴 768 × 896、工具 384 × 384，具体以 [art-manifest.json](../design/xiaoya-paper-v010/art-manifest.json) 及后续验收回执为准。不要给所有资产套植物根点或相同留白。

## 加载与更新不破坏交互

`paperLayer()` 保持 SVG 的 viewBox、外层布局和完整兜底，只替换内部美术。`installPaperArt()` 安装一次，在原生图片真正加载后显示增强层；新增子树逐个处理，不因图片加载重建整个页面、抢焦点或打断录音。失败时仍能看见并点击原控件。

故事图只预取当前与必要邻帧；慢网/失败走 `story-pictures.js` 的状态与兜底。检查慢加载、缓存命中、首次离线未缓存图，以及窄屏下裁切。可点击性、提示语音、按钮动效由 UI 负责，不在美术里画假的按钮或一直跳动的小手。

资源内容修订采用新文件名/版本目录并改映射，避免同 URL 在旧缓存中仍显示旧像素。公开版构建不能只靠替换图片字节自动换构建哈希，需重新构建并验旧缓存升级。上传/发布只用压缩运行资源；`public` 会整目录进入 `dist`，不要放原图、日志或私密文件。

## 验收与制作来源

已接入资源的依据分别是 [旧内容补齐交付](../design/xiaoya-art-completion-20261019/DELIVERY.md) 和 [60 句交付](../design/xiaoya-phrases-v015/DELIVERY.md)。逐图回执含哈希、宽高、体积、审核意见、原图/提示词/制作来源位置；不能把“生成成功”当作“画面验收通过”，也不能把截图验收当儿童语义理解实测。

运行 WebP 已入 Git。回执内 `E:\AI code Project\AI GAME\创意资产实验室\...` 等路径是本机制作来源，换设备不保证存在。接手运行项目不需要这些源目录；需要重新加工或核对生产证据时，另行迁移对应源资产。创意资产实验室是可选协作渠道，不是构建依赖。任何生成工具、模型、服务或第三方素材的来源、版本与适用权利要留在批次回执中，不能因资产已进入仓库就推定所有商业用途均已审核。
