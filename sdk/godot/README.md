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

`surfaceEffect` 及其片元辅助函数可调用 `vec4 sampleSource(vec2 uv)`，例如 `return sampleSource(uv + vec2(.005 * sin(time), 0.0));`，让源图按时间真实位移。传入当前函数的 `uv` 使用各自运行时的原有 UV 空间；WebGL 自动保留源图窗口、视差偏移和卡背翻转，Godot 自动保留背景扩展、源图窗口和卡背翻转。返回值是运行时原始源纹理 RGBA，未叠加调色、Mask 或已有光效；每次调用增加一次纹理采样，复用当前图层纹理。该辅助函数只用于片元效果，不用于几何函数，也不自动生成重复平铺。若位移需显露原透明区域，图层须开启 `shaderTransparent`，并由效果自身限制最终 Alpha。WebGL 与 Godot 导出均保留同一调用，无需在保存的函数体中编写 `texture2D` 或声明采样器。

验证：

```sh
godot --headless --editor --path . --import
godot --headless --path . --script tests/test_sdk.gd

# 实际 GPU 渲染截图（无需操作界面）
godot --path . --script tests/test_sdk.gd -- --capture
```

0.19.2 中人物、武器、字标、费用和战力均按导出的图层列表叠放，几何 Z 继续负责视差。框内／破框遮罩各自限制可见区域；`set_stats` 使用对应数值图层的绘制优先级，可被位于上方的武器遮挡。

独立 `card-back/1` 卡背场景不在正面图层中。旧版层列表保持兼容；0.19.30 的完整卡背文档和卡框文档复用 `CardscapeCard` 渲染器，保留自己的图层、深度、几何、Mask、Slot、自定义数学 Shader、图片字标和表面材质。卡背以刚性半转安装，翻面后显示，自己的边框不继承正面样式。使用 `set_component("back", resource_id, version)` 替换固定版本，只影响当前实例。

`component_node("back")` / `component_node("frame")` 返回当前组合中的独立渲染节点；可对它调用 `set_layer_transform`、`play_action` 和材质参数覆盖。组件复用父卡的效果时钟，整卡动作的位移、旋转、缩放和透明度同时作用于组件；组件自身的动作轨道保持独立。`effects_paused=true` 冻结特效，`seek_effects(seconds)` 定位效果时间，`effects_playing=false` 关闭动态效果与粒子。`pause_action` 单独控制动作播放。

粒子保持一个固定 MultiMesh；启用完整卡背 / 卡框里的粒子时，整个组合共同遵守 `particle_budget`，避免每个组件都各自占满预算。圆点和符号面向相机，倾斜整卡时不被压扁；沿框运动与自转分别控制。彩虹色使用和 WebGL 相同的光谱函数。字体图片仍为导出的纹理。

`library.tres` 只保留运行所需的纹理引用和配置；编辑用的补画备份、原图副本和内嵌 Base64 不进入该资源。原工坊源文件仍保存可编辑数据。真实验证工坊中的运行资源由约 60 MB 缩至约 2.6 MiB，纹理资产另存、共享并随 PCK 导出。

卡面背景随卡片的图层一起导出，不属于可切换的组件分类；底板、卡背、卡框、材质、特效与粒子仍可通过组件库组合。旧工坊的背景引用在编辑器打开时按固定版本转为卡片内素材。

0.19.25：导出按卡片保存的默认等级启用能力，支持 Foil / Prism / Gold / Ink 和独立粒子形状、单色 / 金色 / 彩虹配色。`particle_budget` 限制每个实例的活跃粒子（MultiMesh 固定 256 个实例）；游戏应按实际同屏数量分配预算。可用 `material_settings={"enabled":true,"style":"ink","target":"artwork","backgroundMode":"overlay"}` 转换卡面内容，`target="front"` 同时处理边框，`target="background"` 限定背景。`backgroundMode="replace"` 显示程序化效果底，源图保留。独立材质组件的图片层使用纹理引用导出，并在人物后面合成，参考层被排除。材质图片的独立组件时间轴、自定义 GLSL 和 Slot 尚未全部映射到 SDK；目前层位置 / 透明度 / 有界深度与标准材质支持动态组合。

等级、粒子预算、材质图片引用和作用范围可运行 `tests/test_cosmetics.gd` 检查（使用对应验证导出库）。无头测试确认参数与资源链路，不代表 GPU 视觉逐像素一致。

使用仓库的 GPU 验证入口会同时检查退出码、结果标记和引擎错误，避免 Shader 报错而脚本仍打印通过：

```sh
cd editor
npm run test:sdk -- --project /absolute/path/to/export/godot --script tests/test_components.gd --output outputs/components-gpu.log
```

`test_components.gd` 验证独立正背面、卡框、同步时钟、整卡透明度和组合粒子预算；`test_cosmetics.gd` 需要配套外观验证工坊。默认使用本机 Godot，可用 `GODOT_BIN` 指定二进制；运行必须有实际 GPU 显示环境，默认超时 45 秒。新增的材质与边框配方仍处于参考原型阶段，未完成 Snap 全部效果的逐帧验收。

粒子支持 `trajectory: "halo"`（沿源轮廓贴近环绕）与 `"outward"`（原有向外发射）、`radius`（以卡宽为单位的中心最大外浮距离）和 `opacity`。`orb` 为纯色大圆点，`mixed` 为圆点与星芒，同一 MultiMesh 内按种子分配外形和大小。全尺寸周边跟随切角框，命名区域沿自身轮廓运动；源图层变换与正背面绑定沿用既有规则。

Frame exports include an optional planar `aura` band. Neon uses a soft outer glow;
cosmic uses small timed sparks; ice and fire have local outer light. This mesh is
hidden for other finishes and contributes 16 triangles, with no geometry covering
the card interior. Regenerate exports to obtain this band in existing assets.
WebGL and Godot share the same procedural helper code. Shader processor wrappers
remain engine-specific; GPU verification rejects compilation errors even if a
GDScript test reports success.


粒子组件可设置 `placement: "front"` 作为前景覆盖，默认 `"behind"` 保留卡后效果。`trajectory: "float"` 在发射区域内漂浮；`z` (-0.5～0.5) 决定相机视差的深度。`pixel`、`heart`、`leaf` 分别为纯色方块、描边心形与翻转叶片，仍共享 256 个实例的 MultiMesh。`particle_settings` 可以运行时切换布置、轨迹和形状；发射面与命名区域继续生效。前景覆盖明确经过人物前方，不受人物贴图透明排序影响。

`0.19.33` 补充 `tone` 半调网点图形。Tone 的点阵使用同一实例的片元函数，不按网点生成节点；旧 `sprite` 等枚举索引保持稳定。Gold 默认 `target: background`、`backgroundMode: overlay`、`strength: 1`，将原背景亮度映射为金色；`replace` 仍可用于程序背景覆盖。金属框的亮脊、暗槽和视角反射与 WebGL 共享函数，几何保持平面。

卡后粒子优先级为 -120，先于背景和透明人物绘制；前景覆盖优先级为 120。此排序修复了卡后光点压在披风上的问题。`placement` 与 `z` 分别控制合成顺序和相机视差，不应只靠透明材质的物理距离决定遮挡。
# Glimmer 揭示与持续粒子

导出包含 `particles.reveal` 和 `shard` 闪片外形。揭示只触发一次，持续粒子保留自己的循环；两者共用一个固定 256 实例的 MultiMesh，受 `particle_budget` 总预算限制。

```gdscript
card.play_particle_reveal() # 从当前效果时钟触发一次，不重置其他材质效果。
card.effects_paused = true
card.seek_particle_reveal(0.09) # 检查揭示第 0.09 秒。
card.seek_effects(0.30) # 定位整体动效时钟。
```

`enter` 动作自动触发揭示；组件跟随整卡揭示时间。暂停后继续使用同一批次和随机种子。长光线的尺寸由局部缩放确定，屏幕朝向与旋转由 Shader 完成，避免缩放旋转顺序造成宽度变化。

在编辑器目录运行 `node scripts/test-godot.cjs --project EXPORTED_GODOT_DIR --script tests/test_particle_reveal.gd --output LOG_FILE` 可验证 WebGL/Godot 相同时刻的采样、暂停、重播、预算、组件时钟与正背面。检查器自动生成测试参考 JSON；可加 `--captures DIRECTORY` 输出揭示和持续阶段的实画。

## 卡面与框缘漂浮（0.19.35）

`trajectory: "field"` 在发射区域和 `radius` 指定的邻近范围中漂浮；速度按卡宽单位计算。矩形在四边淡出后循环，椭圆与点保持有界区域。`shard` 使用种子控制大小、柔光点比例和慢速自转；不增加纹理或批次。`radius: 0` 把位置限定在原区域内。


0.19.36 的 `visual: cosmic` 使用卡后星云和卡前流星两次绘制，两个节点引用同一份固定 MultiMesh 和预算；切回普通粒子时隐藏流星节点。`placement: front` 把两种形状均放到卡前。`material_settings` 的 `strength` 同时作用于叠加和替换模式，替换模式从基础底色过渡到完整效果，不透回原画。验证 `tests/test_finish_composition.gd` 需实际 GPU，检查强度和原画覆盖；参考片段仍不足以证明全量 Snap 1:1。

0.19.37 增加 `wakanda` 粒子外观，索引追加为 20。细轮廓、光线、节点共享一个 MultiMesh，不增加贴图；命名区域、前背面、暂停/时刻和多卡预算与编辑器一致。原有外观索引不变。
## 0.19.38 火焰边框验证

框沿类型 `fire` 保持索引 10，新增 `fire-iridescent` 索引 11。两者共用窄外环与向上的程序流场，速度 0 可静止，不改变框体几何。材质 `prism` 增加宽银白反射。效果设置随资源保存，正面框沿与卡背仍独立。

实际导出后可运行 `node editor/scripts/test-godot.cjs --project EXPORTED_GODOT_DIR --script tests/test_frame_fire.gd --output LOG_FILE --captures CAPTURE_DIR`，生成九种配色的测试配置，使用真实 GPU 检查火舌、暂停、速度 0 和范围；测试不会改写 SDK 核心文件。当前采用 Godot OpenGL Compatibility，完整 Snap 动效周期与其他渲染后端仍需校准。

## 0.19.39 连接纹路与单背景替换

追加材质类型 `symbiote`（索引 24），旧索引保持不变。六款配色独立；框体刚性，纹路固定，反射由相机和效果时钟驱动。`material_settings.backgroundMode = "replace"` 只让一个原背景面承载替换效果；切回 `"overlay"`、关闭材质或关闭效果会恢复原背景面。原图、素材叠加和独立卡背继续保留。

新增实际 GPU 检查脚本：

```sh
node editor/scripts/test-godot.cjs --project EXPORTED_GODOT_DIR --script tests/test_connective_finish.gd --output GPU_LOG_FILE --captures CAPTURE_DIRECTORY
```

请把示例中的三个路径替换为实际路径。该命令由当前配方生成测试数据，检查六款颜色、暂停、速度零、旋转、覆盖原图和叠加恢复图层。科技光环的斜向细线和小节点仍共用一组 MultiMesh；从编辑器导出的默认数量为 52，可用 `particle_budget` 限制总数量。参考纹路仍属待逐帧校准的原型，不宣称全系列 1:1。

0.19.40 增加 `circuits`（25）、`frosted`（26）、`raysrainbow`（27），保留先前材质编号。`rays` 的图案保持固定，光照响应时间和视角；`wakandanglass` 使用转折刻线；`web` 框材质仍为 5。磨砂叠加原图时使用五次有界采样并保留原 Alpha，增加四次纹理采样而不增加绘制批次。正式导出包含相同着色器。`tests/test_surface_reference.gd` 和 `tests/test_frame_web.gd` 可配合编辑器的 `test:sdk` 脚本运行实际 GPU 验证；完整游戏 1:1 校准仍未验收。

### v0.19.41 细节边框

追加 `chains`、`glyphs`、`refraction`、`overloaded`，原编号保持兼容。链环的透明孔隙使用 shared rimCoverage；符文时钟、相机折光与局部光晕沿用现有接口。`test_frame_detail.gd` 按导出的真实网格和独立配方在 GPU 上验证透明孔隙、角度、暂停、零速、翻背与播放期间的网格复用。详见 `editor/docs/border-detail-v41.md`；均为待完整游戏动效校准的原型。

### 粒子与背景细化（v0.19.42）

新增 `flower`、`paw`、`pizza` 三种图形，按旧枚举之后的 21/22/23 编号导出。它们共享既有 MultiMesh 与 Shader，无新增图片依赖；围框模式支持分布、淡入淡出、短距离漂移和大小变化。`seek_effects()`、暂停、发射区域及预算使用同一套控制；花朵与披萨的旋转角保持在一圈内以避免长时间累加的实例精度损失。

替换型背景材质按卡片局部空间定位，调整源图缩放、位移和裁剪不会再改变特效中心；叠加模式继续保留素材坐标。放射背景改为较细的弧形条纹、灰银底与淡彩反射。新的 GPU 检查位于 `tests/test_particle_icons.gd`、`tests/test_background_registration.gd`，跨渲染采样检查由 `test_particle_reveal.gd` 覆盖，包括一天后的采样。

`adamantium` 为编号 25 的多色面具粒子：圆边、面罩与眼睛由共享 Shader 绘制，不需要额外纹理。普通混合保留黑色图形，围框分布、轻摆、大小变化和出生前淡出使用同一采样规则。默认 40 个；既有预算、卡背或图层发射区域、暂停和 `seek_effects()` 同样适用。公开参考只有短序列，目前仍属于待视觉和时序校准的实现。

0.19.51 将 `adamantium` 的围框运动改为从框内带状区域径向向外扩散并逐步放大，外漂范围受轮廓与 `radius` 控制。`speed`、`lifetime`、`spread` 可单独调整，既有实例布局和预算接口不变。正式导出实际 GPU 与 WebGL 采样一致；修改依据短片内可见轨迹，完整游戏时序仍待校准。参考量测与验证见 `editor/docs/emblem-motion-v51.md`。

0.19.52 将面具尺寸随机种子与出生相位分离，采用可辨识与微小两组尺寸，减少全场共同膨胀；低粒子预算仍保留两组。WebGL / Godot 使用相同采样，无新增纹理或绘制批次。新实验预设寿命 0.4 秒，既有资源保留所保存的寿命参数。真实 GPU 尺寸分布比较及正式导出验证见 `editor/docs/emblem-size-v52.md`；尺寸统计不作为完整游戏 1:1 验收。

0.19.53 的六色 `symbiote` 材质共用 21 条固定弧形拉丝与连接点扩宽，时间和查看角度驱动银灰反射，仍使用编号 24。解析计算没有新增纹理或绘制批次，背景替换与原图叠加沿用既有接口；正式导出六色实际 GPU、暂停、速度零与其他材质回归通过。局部参考量测与剩余校准范围见 `editor/docs/symbiote-detail-v53.md`，目前没有完整 1:1 验收。


节点 Shader 的图数据随 manifest 保存，运行时直接使用生成的几何／材质函数，游戏中不需要 LiteGraph。节点编辑器和手写 GLSL 共用 Shader 参数与 Mask。卡背发射点在组合坐标中反转 X 和外法线；`surface` 布置表示沿发射源外侧偏移。粒子接受深度测试，并根据当前面相对源的近远位置选择透明绘制优先级。正式导出可执行 `test_shader_emission.gd` 验证节点 Shader GPU 编译、正／侧／背／倾斜位置和像素遮挡；Node 测试入口会自动生成对照样本。


### 0.19.92 霓虹错峰揭示

`particles.reveal.profile` 可选 `burst`（旧统一扩散）或 `trails`（快慢两组霓虹射线），`stagger` 限制为 0–0.8，`travel` 限制为 0–3 卡宽。缺省为 burst/0，保留旧工程行为；揭示仍复用固定 MultiMesh 与整体粒子预算。显式 `inspect()` / `flip_to_back()` 会立即同步发射面显隐，暂停特效时也生效。

导出工程后执行 `node editor/scripts/test-godot.cjs --project EXPORTED_GODOT_DIR --script tests/test_particle_reveal.gd --output GPU_LOG_FILE --captures CAPTURE_DIRECTORY`，检查跨渲染采样、错峰边界、暂停与翻面。路径必须替换成实际位置。此项验证不代表与游戏相同场景的逐帧视觉验收。
