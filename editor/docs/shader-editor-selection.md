# Shader 编辑器选型

核对日期：2026-10-12。Material Maker 1.7 已通过原生窗口联动接入；其余第三方编辑器仍为候选。操作、安装与限制见 [Material Maker 联动](material-maker-integration-v55.md)。

## 当前缺口

当前 LiteGraph 接入是 Cardscape 自有节点的连线界面。`shader-graph-model.js` 负责生成两个函数体；它没有通用 GLSL 节点编译器、逐节点 GPU 缩略图、函数节点和子图库。连线成熟度不能代替 Shader 作者工具的成熟度。

运行时保留 geometryBody / fragmentBody 两个函数体，并新增 fragmentPrelude 顶层函数区（64 KB），WebGL 和 Godot 均支持。Godot 导出仍拒绝自定义 uniform、采样器和 texture2D；这类分支使用图片 / Mask 回传。纹理动态采样和整卡几何仍需专用运行时适配。

## 候选及结论

| 方案 | 已由官方资料确认 | 接入限制 |
| --- | --- | --- |
| Material Maker | 输出端口预览；自定义 GLSL 节点；全局及实例函数；自定义材质导出；MIT | 基于 Godot 的原生应用，不是可直接挂载到 DOM 的 JS 组件。主要面向程序纹理与材质制作，需要额外承接整卡几何和粒子运行时。 |
| Babylon.js Node Material Editor | 完整材质连线编辑器；用 GLSL 封装自定义块；支持辅助函数 | 输出绑定 Babylon 的材质管线。官方资料不足以证明默认提供所有节点同步缩略图。不能将其完整 Shader 直接填入当前函数体。 |
| ShaderFrog | 可嵌入的 MIT 编辑器源码；GLSL 与节点混合；独立图编译核心 | 官方明确提醒编辑器未稳定、可能有破坏性变更，核心图 API 也标为实验性。不应作为“成熟稳定”的直接替代承诺。 |
| Godot VisualShader | Vertex / Fragment / Light 图；自定义端口表达式；全局定义节点；Godot 原生资源 | 使用 Godot Shading Language。原生编辑器不能当作 Electron 网页控件直接复用。适合作为游戏端的高级调整入口。 |

建议优先以 Material Maker 验证逐步骤材质创作及函数复用；Godot VisualShader 承接游戏端的最终调整。若要求所有操作都留在 Electron 内，Babylon NME 是可研究的完整网页编辑器，但必须先验证代码转换与逐节点预览，不能仅嵌入界面就宣称完成接入。

## 接入验收要求

1. 节点可显示输出缩略图；点击输出可查看大图；浮点显示灰度、向量显示通道颜色，几何位移显示位移量与网格预览。中间预览不改变卡片最终输出和连线。
2. 自定义函数具有明确的输入、输出类型和默认值。支持辅助函数、重名隔离、可复用子图，以及错误定位到节点和代码行。
3. 统一产物分开保存全局声明、Vertex / Fragment 函数体、纹理和参数绑定、节点图及版本。WebGL 和 Godot 分别生成包装代码，函数体不再承担完整 Shader 文件的职责。
4. 预览使用真实目标图层、Mask、时间和角度；缓存编译结果与纹理，仅更新受影响的下游分支。关闭工作台后停止节点缩略图渲染。
5. 先用“原图 → Mask → 可复用扫光函数 → 发光混合”验证每个中间结果，再测试纹理采样和顶点形变。必须在 Cardscape WebGL 与 Godot 实际 GPU 上验证、保存重开、撤销与导出。
6. 保留直接代码模式，但明确只保证从节点生成代码；任意手写 GLSL 不能承诺无损反向生成节点。

## 一手资料

- [Material Maker 节点预览](https://rodzill4.github.io/material-maker/doc/nodes_common.html)
- [Material Maker GLSL 与函数](https://rodzill4.github.io/material-maker/doc/shader_nodes.html)
- [Material Maker 材质与导出](https://rodzill4.github.io/material-maker/doc/material_nodes.html)
- [Material Maker 源码](https://github.com/RodZill4/material-maker)
- [Babylon NME 自定义 GLSL 块](https://doc.babylonjs.com/toolsAndResources/nme/customBlocks)
- [ShaderFrog 编辑器维护边界](https://github.com/ShaderFrog/editor/blob/main/CONTRIBUTING.md)
- [ShaderFrog 核心 API](https://github.com/ShaderFrog/core)
- [Godot VisualShader](https://docs.godotengine.org/en/stable/tutorials/shaders/visual_shaders.html)
- [Godot Expression 与全局定义](https://docs.godotengine.org/en/stable/classes/class_visualshadernodeexpression.html)
