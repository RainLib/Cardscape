# 自有人物动画 · 第一期

开发分支：`feature/native-character-animation`。本期使用自有数据、采样器及编辑工具，制作 2D 刚性部件动作，并与现有 2.5D 卡片合成。网格蒙皮、IK、非均匀缩放／剪切、面部形变和动作混合留待本期验证之后建设。

## 制作

1. 先拆分人物，补齐运动时会露出的关节和后层。为手、握点和武器保持连续的握持关系，检查动作的允许范围。
2. 打开右侧 **动画 → 人物关节与图层绑定**。新建根关节和子关节；新关节的位置来自当前图层的旋转中心。原图可显示初始关节与父子连线。
3. 设置关节名称、父节点和初始坐标。根节点使用 1024×1536 母版坐标，子关节使用父节点的局部坐标。初始姿势只定义转轴和关系，不移动原始图片。
4. 选中并解锁图片，点击 **绑定当前图层**。多个图片可绑定同一关节；未独立绑定的拆层衣料跟随母版，显式绑定优先。父子关系不改变图层排序与 Z。
5. 点击 **制作关节动画**，或在底部时间轴的 **动画目标** 选择关节。编辑水平／垂直位移、旋转、统一缩放和透明度。数值先临时预览，点击 **记录关键帧** 才保存；删除关键帧／清除轨道／撤销沿用现有操作。
6. 在右侧实际卡片预览检查运动、倾斜、破框和光效。左侧原图是初始素材工作区，不代表动画的烘焙输出。保存重开后继续编辑，动态导出分别检查独立 WebGL 播放器和 Godot。

修改初始关节会改变已有动作的转轴和局部坐标关系，需重新检查动作。删除关节前先删除子关节；删除会同时清除其绑定及各动作中的对应轨道。删除图片会清理其绑定。绑定操作拒绝锁定图层。

## 原生契约

`document.characterRig.schema = card-character-rig/1`：

- `bones[]`：`id / name / parentId / x / y / rotation / scale`。父节点必须存在且无循环；允许多个独立人物根节点。
- `bindings[]`：`layerId / boneId`。每张图片最多绑定一个关节，多个图片可以共用关节。
- `actions[].boneTracks[boneId]`：`x / y / rotation / scale / opacity` 的关键帧字典。关键帧沿用 `at ∈ [0,1] / value / ease`，支持 linear、smooth、hold。

坐标为源图像素，Y 向下，角度为顺时针度数。骨骼世界姿势按父子顺序计算，部件变换为 `posedWorld × inverse(restWorld)`，然后组合图层原有变换与旋转中心。因此默认姿势恢复原画，Mask 和 UV 跟随部件，刚性部件保持形状。整卡动作再作用于完整卡片。柔性拆层的根部连接继续使用现有连接权重。

上限：64 个关节、64 条绑定；每动作每关节每轨道 64 个关键帧，动作数量／时长沿用工程限制。旧工程缺少 `characterRig` 时保持原有行为。采样不改写工程，播放只更新现有表面的变换／透明度，不重新生成纹理或网格。

WebGL 使用 `character-animation-model.js`，Godot 使用自有 `character_animation.gd`。两端按相同时间和插值契约采样；暂停定位可到达循环动作的结束关键帧。

## 导入适配

`character-animation-import.js` 提供注册式格式适配器。适配器由应用代码安装，不执行导入文件中的脚本：

```js
const registry = CardCharacterImport.createRegistry();
registry.register({
  id: 'example-format',
  convert(source, { document, layerMap }) {
    return {
      schema: 'card-character-animation-import/1',
      characterRig: nativeRig,
      actions: nativeActions,
      unsupported: []
    };
  }
});
const candidate = registry.convert('example-format', source, document, { layerMap });
```

转换结果必须通过原生绑定、轨道及完整运行时校验后原子应用；有不支持的能力时明确拒绝，不能静默丢弃。当前仅内置原生 JSON 导入／导出，交换文件不包含图片，需要匹配当前工程的图层 ID。导入替换绑定，替换同 ID 动作；其他动作的整卡轨道保留，旧人物轨道清除。

后续 Spine 导入流程为：读取 skeleton／atlas／图片，准备本机素材图层，映射骨骼与图层 ID，再转换为原生绑定和动作。带权重网格、IK、剪切或复杂约束的文件，须等自有系统具备对应能力后才能完整导入。Spine 导入尚未实现；接口不依赖 Spine 播放器或第三方运行时。

## 验证与边界

```sh
cd editor
node --test tests/character-animation.test.cjs
node scripts/verify-native-character.cjs ../outputs/native-character-animation
```

第二个命令在隔离目录生成程序化部件测试卡、导出播放器／Godot 工程及 JS 姿势参考；`verification-paths.json` 给出实际路径。使用输出的 Godot 路径运行：

```sh
node scripts/test-godot.cjs --project EXPORTED_GODOT_DIR \
  --script tests/test_character_animation.gd --captures CAPTURE_DIR
```

新 Godot 工程须先由 Godot 编辑器导入资源。GPU 测试比较跨端姿势、实际像素变化、暂停稳定性和网格复用。程序化夹具只证明功能链路，不证明真人物原画的解剖、隐藏补绘、极限关节角或移动端性能。

本期没有动态层序轨道、关节角限制、动作过渡／混合、关节拖动工具、粒子发射点跟随关节、蒙皮、IK 或复杂表情。原图中的大幅透视和侧面信息仍须真实素材支持。

## 真实人物卡验证（2026-10-16）

使用现有量子枪客 `27-quantumslinger-v2` 和风暴断峰 `11-stormbreaker-v1`，保留原始工程与图层像素，在隔离副本中加入人物整体、近/远手臂、近/远腿关键帧。握持组内的枪、双手、锤柄不拆开。双手锤是闭链构图，当前刚性绑定不能自动保证两端关节同时闭合。

```sh
node editor/scripts/verify-real-character.cjs
node editor/scripts/serve-real-character.cjs
```

默认输出 `outputs/real-character-animation/`，不写入原始工坊。`part-plan.json` 先记录部件计划；`verification-paths.json` 给出验证副本和实际导出目录。打开服务器中的验证页，点击生成按钮，使用导出播放器的公开接口采集动作/时间/相机姿势及 PNG。页面拒绝旧帧，逐关节比对参考矩阵，保留九角度原始截图、独立隐藏前层和翻面截图。准备脚本的 `front.png` 仅是主体占位，完整静态卡图仍须用真实编辑器的**导出**按钮生成、查看；不能用占位图验收静态导出。

Godot 工程导入资源后运行 `tests/test_real_character_animation.gd`。该脚本检查位置、角度、缩放、暂停像素稳定与网格复用，并采集九角度、隐藏前层、卡背及放大关节图。

| 项目 | 本次结果 |
|---|---|
| 两端动作 | WebGL 180 帧、Godot 180 帧；20 组跨端图层姿势采样通过 |
| 武器跟随 | 前后枪与双手巨锤的握持组保持刚性，检查范围内无手/武器相对滑动 |
| 保存与导出 | 两张无 `back` 的旧工程副本在实际编辑器打开、保存、导出完整静态卡图；量子枪客再次重开后保留关节与关键帧 |
| 兼容修复 | 缺少可选卡背时原先请求 `undefined` 导致打开失败；现使用已有卡背场景源或中性卡背 |
| 风暴断峰关节 | **未通过**：握锤组 4° 转动时，人物左肘/上臂连接出现明显楔形接缝；需修正拆层归属、转轴及真实隐藏重叠 |
| 量子枪客衣料 | **未通过**：极值动作与衣料同时运行时，腰侧和衣摆根部露出细长背景缝；需检查连接权重及补绘支撑覆盖 |

本次程序/导出检查通过不代表人物视觉验收通过。两项接缝修复并按相同矩阵复验前，**不进入自有网格蒙皮、IK 或复杂表情**。详细证据与复现时间在本地 `verification-results.json`，放大截图位于 `godot/<人物>/joints-*.png`。这两张卡的结论不能外推到其他原画或更大动作范围。
