# 动态资源契约 0.5

工程仍使用 `card-atelier/1`，保持旧工程可读；新增字段为 `deformation`、`actions`、`slots` 和 `shader`。图层可增加 `slotId`、`adjustments` 和 `blend`。保存、撤销、重做和导出均保留这些字段。

唯一公共实现是 `renderer/runtime-model.js`，编辑器和独立播放器共用它。实际导出的 GLSL 为预览使用的同一段源代码，并在播放器中从 `.glsl` 文件读取、编译和链接。

## 坐标、Mask 与几何

卡体 x 为 -0.5..0.5，y 为 -0.75..0.75，正 z 面向查看者。UV 原点在左上。Mask 全部注册到 1024 × 1536 母版。`sourceWindow` 表示扩图后原画所在像素矩形；背景保留整张余量纹理，其他图层按注册区显示。

顶点 `fx = (motion*(1-rigid), inset, emission, phase)`。刚性区约束披风局部运动；整体卡体弯曲允许手臂随整张卡共同弯曲，不增设手部表面。`inset=1` 位于框后，`inset=0` 位于框前；按位置和深度限制穿框。发光和相位在片元阶段按像素采样，未用低分辨率顶点权重代替刻槽 Mask。

GLSL 的 Vertex 区域编辑 `vec3 deformCard(vec3 q, vec2 uv, float time, float bend)` 的函数体。默认:

```glsl
q.z += bend * (q.x * q.x - 0.25);
return q;
```

编译成功后才写入工程；编译失败保留之前的 Program。函数会在人物局部运动及 Slot 变换之后、卡片观察旋转之前执行。框、背景、附件和卡背共享函数，编辑画布显示二维母版。

## 动作

每个动作包含 `id/name/event/duration/loop/motion/emission/bend`。事件为 `idle/hover/trigger/flip`。循环动作包络为 1；一次性动作包络为 `sin(pi*clamp(elapsed/duration,0,1))`。运动、发光增益从 1 平滑往返，附加弯曲与包络相乘。翻转以 0..pi 观察旋转展示卡背，完成后保留翻转角。默认四个预设可编辑，也可新增独立预设。

当前编辑器提供手动预览事件；接入游戏时由游戏事件调用动作。不是已实现多轨时间轴、任意关键帧或物理布料。

## Slot

当前 Slot 的父节点为卡体，适用于正面的图像与文字图层。属性:

```json
{"id":"weapon-light","name":"锤光","u":0.5,"v":0.5,"z":0.16,"scale":1,"rotation":0,"clip":false,"effect":"flow","strength":1,"speed":1}
```

U/V 为母版中心的归一化锚点，图层位移作为附加偏移；Slot 缩放乘图层缩放，旋转以中心为轴。Z 单独控制层位，`clip` 控制是否限制在框内。`none/pulse/flow` 为当前内置局部材质效果，仍使用图层 Alpha 限定作用范围。图片仍可 AI 改图或替换文件，绑定保持。删除 Slot 会解除绑定，支持撤销。

当前没有骨骼父子锚点、粒子、3D 模型附件或背面 Slot；后续类型可以通过版本化适配器扩展，不能当作已经实现。

## 输出

- `card.cardproj`：完整可编辑工程。
- `layers/`：源纹理或字标 / 框体栅格，不叠加调色。
- `front.png`：二维图层合成，已包含当前调色和 Slot 位置；不烘焙时间动画。
- `baked-layers/`：可选 Rust 静态调色副本，不能再次套用调色参数。
- `back.png`、`masks/`、`fonts/`、`foreground-mesh.json`。
- `manifest.json`、`actions.json`、`slots.json`、`uniforms.json`。
- `shaders/card.vert.glsl`、`shaders/card.frag.glsl`：GLSL ES 1.00。
- `index.html` 与播放器 JS/CSS：通过静态 HTTP 服务独立预览，不依赖编辑器 API、Electron、AI 服务或 Rust 进程。

[WebGL 1 规范](https://registry.khronos.org/webgl/specs/latest/1.0/)确定这里的 Shader 编译接口。Godot 需要另外的 Shader 语言与场景 / ArrayMesh 适配，当前 GLSL 包不能直接作为完整 Godot 动态资源。


## 自定义材质函数

Fragment 区域编辑以下函数的函数体，默认 `return color;`：

```glsl
vec4 surfaceEffect(vec4 color, vec2 uv, float time, vec4 mask)
```

`color` 是已完成调色和内置流光的当前像素；`uv` 为母版注册 UV，`time` 为秒。`mask.rg` 是插值的运动/框内外顶点权重，`mask.ba` 是逐像素发光/相位权重。`angle` 为查看 yaw/pitch，单位弧度；`customStrength` 是配置的强度。GPU 根据下面字段限制新函数的作用范围：

```json
{"fragmentBody":"return color;","fragmentTarget":"foreground","fragmentMask":"emission","fragmentStrength":1}
```

`fragmentTarget` 为图层 ID 或 `all`，`fragmentMask` 为六种母版 Mask 之一或 `none`；限制 Mask 逐像素采样。最终使用 `mix(original, modified, clamp(maskWeight * strength, 0, 1))`。强度允许 0..3，混合权重饱和；用户函数也可直接使用 `customStrength`。当前只有一个自定义 Fragment 函数及一套绑定，不是逐层多效果栈。

两种函数各限制 4096 字符。错误代码不写入工程，旧程序继续渲染；保存与导出使用最后成功编译的代码。旧工程缺省为无自定义材质效果，仍可打开。播放器读取导出的 Shader 文件编译，并使用工程中的绑定参数。背景移动余量纹理、框体、文字、卡背不新增重复人物网格。为限制额外纹理采样，运行时只上传当前选择的控制图；当前代码生成器保留统一接口，具体设备仍需性能测试。
