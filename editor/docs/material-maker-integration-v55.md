# Material Maker 联动

Cardscape 0.19.55 使用官方 Material Maker 1.7 的完整原生节点编辑器。它在独立窗口运行，支持官方输出端口预览、自定义 GLSL、函数与节点分组；Cardscape 管理选中图层的输入、回传和应用。

## 安装与打开

本机已准备官方源码和完整 Godot 4.7.1。其他开发机器需要安装完整 [Godot 4.7](https://godotengine.org/download/archive/)，在 `editor` 中执行：

```sh
npm ci
# 非标准安装位置先设置 GODOT_BIN 为可执行文件绝对路径
npm run material-maker:setup
npm start
```

安装脚本下载 [官方 1.7 标签源码](https://github.com/RodZill4/material-maker/tree/1.7)，记录压缩包 SHA-256，并初始化 Godot 资源缓存。上游源码保持原样；控制器在 Cardscape 自己的目录中。源码路径可由 `CARDSCAPE_MATERIAL_MAKER_SOURCE` 指定，Godot 路径可由 `GODOT_BIN` 指定。

当前实际 GPU 和原生窗口验证在 macOS 完成；其他平台需要提供相应程序路径，尚未完成原生窗口验证。

选中图层 → Shader → **Material Maker** → **打开节点编辑器**。原图和已有 Mask 作为输入节点出现。首次创建带有一个可编辑的扫光函数以及唯一的 **Cardscape Output**。打开时适配完整节点图并选中 Effect 对应节点的 2D 预览，输入节点显示具体通道名称。

1. 在原生编辑器连接节点；输出端口可以查看中间结果。
2. 动态程序效果接 Effect；灰度接 Motion / Emission / Phase / Foil / Inset / Rigid；完整图片接 Source。
3. ⌘/Ctrl S 保存 `.ptex`，Cardscape 自动同步；也可点击“同步已保存工程”。
4. 选择“回传为”，确认预览后点击“应用到当前图层”。应用可撤销。

自动同步只生成候选结果。它不自动改卡片。节点工程和辅助函数随卡片保存；“卡内特效”组件发布也保留这部分数据，应用到另一张卡时重新绑定目标图层。

## 运行与恢复

节点窗口与纹理导出使用同一 Godot 进程、同一 RenderingDevice；不为了同步再启动一个有界面的应用。文件事件由定时轻量检查承接，原生编辑器限制为 30 FPS。

客户端重开后根据本地任务和原生心跳接回同一图层的窗口。反复点击不会并发启动；重开操作重新绑定当前文档和修订号。应用时再次验证文档、选中图层和修订号，避免把旧结果写到其他卡片。

输入图片和 Mask 是打开原生工程时的快照。接回窗口保留输入和未保存的节点操作。要使用新的原图 / Mask，先保存并关闭原生窗口，再从当前图层打开。`.ptex` 只有在应用结果后才随卡片保存；尚未应用的节点操作留在任务目录。“工程目录”可以查看原文件与输出。

仅安装官方 Material Maker 桌面版也可在面板中选择程序路径。该模式用无窗口 CLI 同步程序 GLSL；图片 / Mask 需要在原生应用手动导出至任务的 `output/material_<通道>.png` 后再同步。完整 Godot + 官方源码模式提供自动图片导出，推荐使用。

## 当前边界

| 产物 | 支持范围 |
| --- | --- |
| 动态 Fragment GLSL | 程序节点及其可达辅助函数；时间映射为运行时 `t` / Godot `clock`；应用前实际 GPU 编译 |
| 图片 | PNG 回传为新图层或替换图片；原生纹理导出 512 × 512，以卡片 UV 归一化到 1024 × 1536 |
| 灰度 Mask | 目前注册到人物共享 Mask；轮廓与刚性保护继续参与约束；其他图层的独立 Mask 系统需另行扩展 |
| 工程 | `.ptex` 节点结构保存；已知原图 / Mask 输入重新绑定；自行添加的外部图片路径需保留原文件，尚未自动打包 |
| 自定义采样器 / uniform / 引擎代码 | 不能直接作为动态 Shader 回传；界面提示改用烘焙图片 / Mask |
| Vertex、粒子发射器 | 保留 Cardscape 自有 GLSL / 粒子工具；Material Maker 纹理图不会自动转为粒子或整卡几何图 |
| 代码转节点 | 节点生成代码；不承诺任意手写 GLSL 无损反向生成节点 |

Material Maker 完整 UI 使用 Godot 原生控件，不能作为 Electron DOM 编辑器直接挂载。联动保留官方编辑器和升级路径。未来若需要单窗口，可以独立研究原生子窗口或 Web 构建；当前未验证跨平台可靠性。

## 验证

- 官方原生编辑器启动、同 PID 导出动态函数、图片与灰度 Mask。
- 客户端真实点击应用、GPU 编译、撤销 / 重做、保存重开、重复同步及重新绑定。
- Godot 实际 OpenGL GPU 播放：两个时间点差异 41,312 像素，Shader 编译错误为 0。
- 相关自动化覆盖输入重绑、函数裁剪及重名处理、外部纹理拒绝、工程校验、组件复用、服务重启后接回与过期绑定保护。
- 全量测试曾遇到智能选区测试 120 秒超时；该项独立重跑也超时，未计为通过。

验证文件位于 `editor/outputs/material-maker-v55/`；结果摘要以其中 `verification.json` 为准。

第三方许可：Material Maker MIT，ShaderFrog GLSL Parser 7.0.1 ISC。保留于 `editor/licenses/` 并随 WebGL / Godot 导出复制；只使用其 GLSL Parser，没有接入实验性的 ShaderFrog 编辑器。
