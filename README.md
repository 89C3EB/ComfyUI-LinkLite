# ComfyUI-LinkLite

一款**轻量、简约、可靠**的 ComfyUI 连线美化插件。纯前端 Canvas2D 实现，**不占 GPU/显存，不引入重型特效**，设置项少而清晰，支持中英双语界面。

A lightweight, minimal and reliable ComfyUI link-beautify extension. Pure frontend Canvas2D — **no GPU/VRAM cost, no heavy effects**, few clean settings, bilingual UI (中文 / English).

---

## 功能 | Features

- **纯连线美化**：只改连线外观，不改节点逻辑。Pure link styling only.
- **6 种连线形态 | 6 line styles**（走线参考 quick-connections，沿端口方向滑出，不压节点面板）：
  - 曲线 `Curve`（默认，**曲率固定最高**）/ 直线 `Straight` / 置底(低调平直) `Understated`
  - 折线 `Linear`（取中间走廊正交）/ 贴板 `Orthogonal`（紧贴面板外侧边缘走线，两者不同）/ 波浪 `Wave`
- **8 种动效 | 8 effects**，可在面板中自由切换：
  - **水滴** `Water drop`、**流动点** `Flow dots`、**箭头** `Arrow`、**RGB** `RGB`、**虚线** `Dash flow`、**点拨** `Pulse`、**彗星** `Comet`、**能量环** `Energy Ring`
  - **分层发光**：每个光点/箭头/彗星都绘制为"外层光晕 → 色带 → 亮核 → 白色热芯"的分层发光体（参考 LinkFX / Enhanced-Links 思路），用 `lighter` 加法叠加。**即使单帧也清晰可见**，彻底解决"只有虚线、RGB 有动效，其余动效看似失效"的问题。
  - 特效尺寸**随线宽自适应并设下限**（细线也清晰可见），只比线大一点点；透明度随主线走，既有光效又不至于刺眼。
  - **路径致密化**：特效样本路径统一按 4px 步长重采样，折线/贴板等"拐角样式"与直线一样有均匀特效，不再只在直线段有动效、拐角处也不丢失。
  - **速度参考虚线**：水滴/流动点/箭头等效应的基速明显调慢，调到"最慢"时肉眼可见地舒缓，不会太快。
- **触发方式 | Trigger**：`始终流动 / 关闭`（已移除"仅选中时"，默认始终流动，动效稳定显示、不再因未选中而"失效"）。
- **连线高光 | Highlight link**（打勾功能，默认关）：**只对"选中节点 → 下一个连线节点面板"之间的那条连线**生效——粗细 +2 档（宽设为 1 时变 3）、透明度 +30%，并在其上加**多层加法辉光（外→内→白色热芯，贴近参考图）**。**点击节点才会点亮该通道**，且只提亮与选中节点直连的那条线，**不是开了就全部连线加粗**。
- **连线在面板下方/贴边**：渲染时用 `evenodd` clip 挖空两端节点面板，连线视觉上"从节点下方穿过、贴在面板边缘"，不再压在节点面板上；**动效在 clip 之外绘制**，箭头/点拨等贴边时不会被节点挡掉。Links are clipped under the node panels; effects render above the clip so arrow/pulse stay visible at edges.
- **动画自动驱动**：动效由插件自己的帧循环用 `canvas.draw()` 强制重绘驱动，**不依赖鼠标移动才触发**。
- **透明度 | Opacity**：调节连线整体透明度（0.1~1）。
- **颜色 | Color**：跟随连线类型色，或选择固定主题色。
- **置顶按钮 ⚡**：右上角一键开合设置面板，所有改动即时生效并自动保存（localStorage）。

---

## 安装 | Install

把 `ComfyUI-LinkLite` 文件夹放进你的 ComfyUI 目录：

```
ComfyUI/
└── custom_nodes/
    └── ComfyUI-LinkLite/      ← 放到这里
        ├── __init__.py
        └── js/
            └── linklite.js
```

然后**重启 ComfyUI**（前端最好 **Ctrl+F5 强刷**，避免旧缓存）。

> ⚠️ **重要：这是一个纯 UI 插件，节点列表里永远不会出现节点。** 加载成功与否，看两处：
> 1. 页面右上角会出现一个 **⚡** 按钮，点击即可打开设置面板；
> 2. 打开浏览器开发者工具（F12）的 Console，应能看到青色日志 `[LinkLite] 已加载 / loaded`；若看到黄色警告 `未能接入渲染管线`，说明你的 ComfyUI 版本渲染接口变了，不影响使用但美化未生效。

Restart ComfyUI, force-refresh (**Ctrl+F5**), then look for the **⚡** button at top-right, or check the browser Console for `[LinkLite] loaded`.

> 注意：纯 UI 插件**不会出现在右侧节点搜索列表**。若你之前期待在节点菜单里找到它，那是误解——它只提供一个右上角的 ⚡ 设置按钮。
> Note: this pure-UI extension does NOT appear in the node search bar. It only adds a ⚡ button at the top-right.

> 也可通过 Manager / 手动 `git clone https://github.com/你的仓库/ComfyUI-LinkLite` 安装。

---

## 体积与性能 | Size & Performance

- 全部代码**单个 JS 文件**，零 Python 后端逻辑，静默加载、无日志刷屏。
- 动画只在"存在选中节点"时驱动浏览器重绘，空闲时**零渲染开销**。
- 仅用 Canvas2D 基础绘制（描边/圆弧/渐变），不使用 shadowBlur、WebGL，大工作流也不卡。

Single JS file, silent load, animation only runs while a node is selected, zero idle cost.

---

## 配置说明 | Settings

| 设置 | 说明 |
|------|------|
| 启用 Enable | 总开关 |
| 连线形态 Line Style | 曲线 / 直线 / 折线 / 贴板 / 波浪 / 置底（曲线曲率固定最高） |
| 动效 Effect | 无 / 水滴 / 流动点 / 箭头 / RGB / 虚线 / 点拨 / 彗星 / 能量环 |
| 触发方式 Trigger | 始终流动 / 关闭 |
| 连线高光 Highlight | 打勾后仅"点击选中的节点→下一节点"的连线加粗+2档、透明度+30% |
| 方向箭头 Arrow | 勾选后在目标端显示方向箭头 |
| 颜色 Color | 跟随类型 / 固定主题色 |
| 速度 / 粗细 / 透明度 | 滑杆调节 |
| 界面语言 Language | 自动 / 中文 / English |

## 兼容性 | Compatibility

采用"特性探测 + 可回退原方法"的方式覆写 `renderLinkDirect / renderLink / drawLink`，同时兼容经典 litegraph 与新渲染管线；某版本若方法不存在则自动退化为原始渲染，功能优雅降级。

## License
MIT