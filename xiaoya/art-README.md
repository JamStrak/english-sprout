# 小芽英语视觉组件

`art.js` 导出 SVG 字符串，均无外链、无可见文字；调用方负责交互按钮与中文无障碍名称。所有插图仅为场景内容，不含伪按钮。

```js
icon(name, size = 32)
buddy(mood = 'happy')
themeArt(themeId)
sceneArt(eventOrScene, phase = 'before')
itemArt(itemId)
roomArt()
```

- 主题：`hello / food / play / care / outside / bed`。事件 ID、奖励 ID 与 `content.js` 一致。
- 场景：传事件、事件 ID，或迁移情境 `{ ...event, ...context }`；`settingId` 决定具体语义物件，`sceneId / scene` 决定背景主题。迁移情境不能只传泛主题字符串。
- 状态：`before / request / resolved`。完成状态改变门、杯子、盒盖、拉链、物件位置等，不只加庆祝标记。十八个迁移情境各有对应的物件或地点变化。
- 伙伴：`happy / asking / wave / sleep / celebrate`；也识别 `request / listen / calm / resolved`。
- 图标：`back close play pause sound mic stop again help home parent check next lock gift hand ear book settings download trash moon sun star arrow eye heart cloud plus world`；别名 `house replay sparkle`。

`style.css` 使用主程序现有 class。六主题按钮加 `data-theme`，主题图包在 `.theme-art`。`event-view` 加 `data-phase` 以布局录音/奖励动作。家具 `.room-item` 的 `left/top` 是百分比定位，固定 `translate(-50%, -65%)`，拖动时不要覆盖该变换。核心触控尺寸不低于 48px。

适配目标为 320×568、390×844 和 768×1024。家长页与较长弹窗可滚动；支持系统减少动态效果偏好。
