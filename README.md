# ComfyUI-LinkLite · V0.1

一款**轻量、简约、可靠**的 ComfyUI 连线美化插件。纯前端 Canvas2D 实现，**不引入重型特效、不占额外显存**，设置项少而清晰，支持中英双语界面。

A lightweight, minimal and reliable ComfyUI link-beautify extension **V0.1**. Pure frontend Canvas2D — **no heavy effects, no extra VRAM**, few clean settings, bilingual UI (中文 / English).

---

## 功能 | Features

- **纯连线美化**：只改连线外观，不改任何节点逻辑。Pure link styling only.
- **8 种连线形态 | 8 line styles**（走线参考 quick-connections，沿端口方向平滑滑出，不压节点面板）：
  - **曲线** `Curve`（默认，曲率固定最高）/ **直线** `Straight` / **置底** `Understated`
  - **折线** `Linear`（取中间走廊正交）/ **贴板** `Board`（PCB 式圆角贴面板外侧边缘走线）/ **波浪** `Wave`
  - **弹性** `Elastic`：橡皮筋式，控制点随两端距离动态变化——离得越远弯度越大、越近平直，弯向偏向端口合方向
  - **避让** `Auto-avoid`：在由端点与所有节点盒坐标构成的 Hanan 网格上跑 A* 自动绕开中间节点，再用圆角化，复杂工作流友好
- **连线动效 | 12 effects**，可在面板中自由切换（全部与线同色、无衬底、无白芯、可带渐隐拖尾）：
  - **流点** `Flow dots`、**水滴** `Water drop`、**箭头** `Arrow`（带更长的彗星式拖尾）、**彩带** `RGB`、**虚线** `Dash`、**脉动** `Pulse`、**彗星** `Comet`、**光环** `Ring`、**流星** `Meteor`、**流光** `Sweep`、**波纹** `Ripple`、**光子** `Photon`
  - 右上角**⚡ 设置面板**中选 **无** 即关闭特效（唯一开关，选中特效即持续流动，无「触发方式」）。
  - **路径致密化**：特效样本路径统一按 4px 步长重采样，折线/贴板等「拐角样式」与直线一样有均匀特效。
  - 特效尺寸随线宽自适应并设下限，只比线大一点点，透明度随主线，含蓄不刺眼。
- **连线高光 | Highlight link**（打勾功能，默认关）：**只对「选中节点 → 它直连的下一个节点」之间的那条连线**生效——粗细 +1 档、透明度 +30%，并叠加一层**克制的辉光**（衬底 → 主线 → 细白芯）。点选节点才点亮该通道，不是开启后全图加粗。
- **连线在面板下方/贴边**：用 `evenodd` clip 挖空两端节点面板，连线视觉上从节点下方穿过、贴住面板边缘；动效在 clip 之外绘制，箭头/点拨贴边时不被节点挡掉。Links are clipped under the node panels; effects render above the clip so arrows/pulse stay visible at edges.
- **动画自动驱动**：动效由插件自己的帧循环强制重绘驱动，**不依赖鼠标移动才触发**。
- **透明度**：调节连线整体透明度（0.1~1）。
- **颜色**：跟随连线类型色，或选择固定主题色。
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
> 2. 打开浏览器开发者工具（F12）的 Console，应能看到青色日志 `[LinkLite V0.1] 已加载 / loaded + 几何缓存 + 低GPU重绘`；若看到黄色警告 `未能接入渲染管线`，说明你的 ComfyUI 版本渲染接口变了，不影响使用但美化未生效。

Restart ComfyUI, force-refresh (**Ctrl+F5**), then look for the **⚡** button at top-right, or check the browser Console for `[LinkLite V0.1] loaded`.

> 注意：纯 UI 插件**不会出现在右侧节点搜索列表**。若你之前期待在节点菜单里找到它，那是误解——它只提供一个右上角的 ⚡ 设置按钮。
> Note: this pure-UI extension does NOT appear in the node search bar. It only adds a ⚡ button at the top-right.

> 也可通过 Manager / 手动 `git clone <你的仓库>/ComfyUI-LinkLite` 安装。

---

## 体积与性能 | Size & Performance

- 全部代码**单个 JS 文件**，零 Python 后端逻辑，静默加载、无日志刷屏。
- **路径几何缓存**：走线结果、致密化路径、长度测量与命中 Path2D 均按「样式/粗细/缩放/端点/节点盒」签名缓存，静止帧**零重算**，多工作流大量连线依旧流畅。
- **低 GPU 重绘**：动画仅强制重绘**前台画布**（跳过背景网格），并按 ~22fps 时间节流；画面上无连线时不重绘。纯 Canvas2D 基础绘制（描边/圆弧/渐变），**不使用 shadowBlur、WebGL/Shader**，显存占用小。
- 内存护栏：几何缓存超 1200 条自动清理，长时间运行不膨胀。

Single JS file, silent load, geometry cached (zero recompute when idle), throttled front-canvas redraw at ~22fps, no WebGL/shadowBlur — low GPU & VRAM, scales to many workflows.

---

## 配置说明 | Settings

| 设置 | 说明 |
|------|------|
| 启用 Enable | 总开关 |
| 连线形态 Line Style | 曲线 / 直线 / 折线 / 贴板 / 波浪 / 置底 / 弹性 / 避让（曲线曲率固定最高） |
| 连线动效 Effect | 无 / 流点 / 水滴 / 箭头 / 彩带 / 虚线 / 脉动 / 彗星 / 光环 / 流星 / 流光 / 波纹 / 光子 |
| 连线高光 Highlight | 打勾后仅「选中的节点 → 直连的下一节点」那条连线加粗 +1 档、透明度 +30% |
| 方向箭头 Arrow | 勾选后在目标端显示静态方向箭头 |
| 颜色 Color | 跟随类型 / 固定主题色 |
| 速度 / 粗细 / 透明度 | 滑杆调节 |
| 界面语言 Language | 自动 / 中文 / English |

---

## 已知取舍 | Trade-offs

- 动效**始终流动**（开启后即持续动画）；选择「无」即彻底关闭，不再有独立的「触发方式」开关。
- 曲线曲率固定为最高，去掉了曲率滑杆，保证形状始终明显。
- 为避免刺眼，所有光效均「与线同色、无衬底、无白色热芯泛光」，观感含蓄。

## 兼容性 | Compatibility

采用「特性探测 + 可回退原方法」的方式覆写 `renderLinkDirect / renderLink / drawLink`，同时兼容经典 litegraph 与新渲染管线；某版本若方法不存在则自动退化为原始渲染，功能优雅降级。

## Changelog

- **V0.1**：连线形态与动效改为 2 字命名（动效改名为「连线动效」）；新增弹性曲线、正交避让两种走线；箭头拖尾加长；移除「触发方式」；路径几何缓存 + 低 GPU/显存优化。
- V0.x 之前为开发版迭代（形态/特效增减、发光渲染重构、绝对速度相位修复、翻页缓存修复等）。

## License
MIT
