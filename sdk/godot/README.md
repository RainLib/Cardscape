# Cardscape Godot SDK

Godot 4.7.1 已实际验证；使用 Godot 4 的 Node3D / ArrayMesh / ShaderMaterial / MultiMesh。打开 project.godot 后运行 demo/main.tscn。将 addons/cardscape、assets、shaders、library.tres 拷贝进游戏；若目录改变，更新 library.tres 中 res:// 引用。不要把整个预览项目覆盖到现有游戏。

```gdscript
var card := CardscapeCard.new()
card.library = preload("res://library.tres")
card.card_id = card.library.catalog().activeCardId
add_child(card)
card.set_component("frame", "resource-id", 1) # 固定版本
card.set_component("back", "resource-id", 2)
card.locale = "en"
card.depth_strength = 1.0
card.set_stats(3, 6) # 战斗数值，切换语言/组件后保留
card.particle_settings = {"enabled":true,"count":96,"spread":.6}
card.material_settings = {"enabled":true,"style":"holographic","strength":.25}
card.play_action("enter")
card.inspect(18, 8)
```

Godot Inspector 中可设置 library / card_id / locale / component_overrides / material_settings / particle_settings / gameplay_stats；Node3D 的 transform 管理场景中的位置、大小和朝向。set_layer_transform 接受母版像素位置，set_custom_shader 接受真正的 Godot Shader，set_effect_parameter 调整材质 uniform，Slot 与动作轨道随卡片导出。组件参数是每个实例的覆盖，资源及原工坊保持不变。另一个卡片实例拥有独立材质；纹理和 Shader 由 ResourceLoader 共享。

两次绘制共用同一个连续人物网格，通过相机在卡片空间的投影裁切区分框内/框外。底边默认封闭，武器按刚性 Mask 的三角形覆盖保护；卡框不接受局部弯曲。框体正面/倒角/侧壁为真正几何，背景与卡背为独立表面。卡后扩散粒子为一个 MultiMesh 绘制批次，最多 256 个实例，具有独立深度、色彩和扩散参数。粒子随整卡移动；游戏需要世界空间效果时可把自定义场景挂在卡节点外。

职责：工坊制作原图、Mask、图片字标、共享组件版本、默认几何与特效、动作。游戏引擎管理战斗数值、卡片放置、互动/选中、换装组合、触发时机、质量档位和参数覆盖。原始素材的大改回工坊，游戏覆盖可以留在场景/Resource 中；不要把运行中的战斗状态回写成美术源文件。

shader_type spatial 已适配；导出支持纯数学的 deformCard / surfaceEffect 函数体，遇到 WebGL 专有标识或纹理采样声明会明确拒绝，不会静默降级。任意 Godot 特有代码请在游戏中使用 set_custom_shader。PNG/Mask 引用封装在 library.tres 中，随 PCK 一起导出，不依赖运行时解析散落的 JSON。0.19 支持 spatial 的远/中/近景、人物后/主体/前部与图片字标深度，统一相机并校正正面注册；旧卡保留原深度规则。游戏可用 set_layer_transform 的 z 参数调整实际层间距离，修改相机基准时同步 Camera3D 与 spatial.cameraDistance。本 SDK 是动态接入基础，并不宣称逐帧复制 Marvel Snap。

验证：

```sh
godot --headless --editor --path . --import
godot --headless --path . --script tests/test_sdk.gd
# 实际 GPU 渲染截图（无需操作界面）
godot --path . --script tests/test_sdk.gd -- --capture
```

0.19.2 中人物、武器、字标、费用和战力均按导出的图层列表叠放，几何 Z 继续负责视差。框内／破框遮罩各自限制可见区域；`set_stats` 使用对应数值图层的绘制优先级，可被位于上方的武器遮挡。
