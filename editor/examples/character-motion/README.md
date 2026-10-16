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
