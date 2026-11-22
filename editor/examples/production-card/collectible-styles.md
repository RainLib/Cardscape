# 五种卡牌风格示例

从 Cardscape 首页选择「示例工程」。每次打开都会创建可编辑副本并播放动作。需要导出时，在「展示与录制」选择「所选动作」、`9:16` 和 `24 fps`，即可录制一轮 4 秒、96 帧的循环。

| 卡片 | 风格与动作 | 工程和灰度图 |
| --- | --- | --- |
| 余烬铸锤 | 炉石式奇幻皮雕。铜与木纹围住炉膛远景和中景铁砧，流火沿双手锤柄汇入锤面，再散成余烬。 | [工坊](emberforge-keeper/emberforge-keeper.cardworkshop) · [深度图](emberforge-keeper/relief.png) |
| 裂潮行者 | SNAP 式全幅漫画。港湾、水墙与近景泡沫分层。水光沿双手叉柄集到三叉尖，激起破框的浪带。 | [工坊](rift-tide/rift-tide.cardworkshop) · [深度图](rift-tide/relief.png) |
| 月露铃兽 | 宝可梦式幻兽闪卡。蘑菇与露叶前后错落，种铃由两只前爪托住，铃光先聚后散成几层露环。 | [工坊](moonbell-sprite/moonbell-sprite.cardworkshop) · [深度图](moonbell-sprite/relief.png) |
| 零号回路 | 赛博朋克。湿街、金属护栏和近景碎片有独立景深，扫描沿实体刀身的走线推进，末端释放短促的综合色回波。 | [工坊](neon-null/neon-null.cardworkshop) · [深度图](neon-null/relief.png) |
| 裂界之矛 | 极限景深。远桥、断墙、符环、后层披风、人物和前景棱晶分层。近处晶面宽，远手与尾柄窄，结晶充能和裂界波沿同一动作依次展开。 | [工坊](worldsplitter/worldsplitter.cardworkshop) · [人物深度图](worldsplitter/relief.png) · [披风深度图](worldsplitter/cape-depth.png) |

三种游戏风格的例子使用原创角色、场景和版式。武器所在网格区使用连续平面，发光层随同一握持骨骼移动。裂潮行者、零号回路和裂界之矛的武器前端可独立破框，与框内的手臂、握柄共用网格。灰度图均已对齐 1024 × 1536 的素材，在网格的「深度图浮雕」里用 `0.25` 幅度导入。

远景底图、中景实体和前景物件分别使用独立素材与 Z 位置。最大倾斜时可以观察这些层和卡框的相对移动。动画从局部材质蓄力进入事件释放，再让粒子与余辉退出，最后回到起始姿态。

[素材生成提示](collectible-styles-artwork.md) · [雷曜誓约工坊](stormglass-oath/README.md)
