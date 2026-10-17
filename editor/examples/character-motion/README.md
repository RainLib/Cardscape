# 抬枪与提腿动作轨道样例

`quantumslinger-raise-gun-leg.json` 记录通过编辑器画布实际拖动、逐姿势记录的四秒动作：准备 → 预备蓄力 → 抬枪提腿 → 瞄准 → 后坐 → 回稳 → 收枪落腿 → 回到准备，共八个关键姿势，使用平滑插值。

骨架为当前量子枪客的 `root`、`shoulder`、`forearm`、`far-arm`、`near-leg`、`far-leg` 和 `cloth`；右肩、右前臂由 `aim` 两节 IK 控制。手、握点与枪使用同一刚性影响，躯干与拆层边界保持原有共享权重。JSON 包含实际动作轨道、骨架指纹及阶段表；完整图片、Mask 和可编辑工程保存在本机验证目录中。此文件用于审查和复现轨道，不是完整的人物动画导入包。

在编辑器里保存并实际导出该卡后，可生成同一动作的 WebGL/Godot 对照采样：

```sh
node editor/scripts/prepare-character-clip-review.cjs \
  /absolute/path/to/card.cardproj \
  /absolute/path/to/exported-card \
  action-bc31fd83-3ea2-477f-898c-97ddd8ceaa0a \
  /absolute/path/to/review-output
```

该命令只读取工程，检查导出中的骨架与动作是否相同，以 120 fps 检查翻面、面积压缩和 IK 可达性，并为导出目录添加 QA 页与 Godot 对照数据。必须先使用编辑器真实导出；命令不会创建占位正面图，也不会改写工程。验证范围限定为这张卡现有素材与权重的轻幅卡牌动作，较大幅度需要重新检查蒙皮和隐藏补绘支撑。

## 大幅动作与独立关节蒙皮

`quantumslinger-wide-joints.json` 是后续大幅动作的真实轨道与素材指纹。近腿约 26°，瞄准阶段枪口移动约 177 个注册像素、近靴约 195 像素；两者均为同一固定相机下从准备到瞄准的位移。旧轨道仍保留在工程中。

本轮将各拆层改成独立权重，枪、手和护腕使用前臂 100% 刚性影响；肩和髋部使用过渡权重及支撑环。保留原有顶点、UV 和表情，重新连边并按每张图片的实际 Alpha 去除空三角形。真实生成的躯干补绘只写入选区中的透明缺口，并限制在原本被近臂／近腿遮住的范围，保留全部原有可见像素。生成候选、Mask、接缝截图和完整工程位于本机 `outputs/wide-character-motion-2026-10-16/`。

复现需使用上一版四秒动作工程及本轮实际补绘候选；候选指纹见 JSON。脚本准备一个新的离线副本，不会操作活跃编辑器或覆盖输入工程：

```sh
node editor/scripts/prepare-wide-character.cjs \
  /absolute/path/to/source.cardproj \
  /absolute/path/to/torso-support-candidate.png \
  /absolute/path/to/new-output \
  imagegen-exec-20b9ba5d-458b-4416-b9b6-03ee9cc38e44
```

在编辑器打开输出的 `大幅抬枪与提腿.cardproj`，选择“抬枪与提腿 · 大幅关节运动”，再保存并真实导出。沿用上方对照脚本，动作 ID 改为 `raise-gun-leg-wide`。此验收覆盖当前四秒动作与九个观察角度，不代表任意未来大幅姿势均可直接使用。
