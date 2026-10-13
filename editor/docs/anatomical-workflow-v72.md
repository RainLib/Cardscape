# 人物遮挡关系与制作约束 · 0.19.72

人物的近/远手臂、腿、翼和衣料按实际遮挡、纵深拆为注册表面。制作前记录人物自身左右、观察近远、遮挡对象、连接点、隐藏补绘、刚性握持关系和允许角度；同深度且没有独立遮挡的部分继续保持整体。前层抽取后，后层必须真实补绘；平面 Z 或灰度深度图不能补出被挡解剖。

仓库与本机安装的 `card-atelier` 同步更新。每次客户端聊天和图片任务都物化相同的 Skill 与 anatomical-depth 引用，不依赖旧聊天记忆。规则适用于新卡、旧卡细化和有人物的组件；握持组可以包含手、护腕和前臂，不因 `weapon` 分类机械拆开。没有翼的构图不追加翼。

`characterDepth.characters.partFamilies` 列出每个角色当前可见的手臂、腿、翼与衣料，`hiddenSurfaceIds` 另列隐藏部件。分类只帮助对照计划，不能判定图像实际解剖或隐藏支撑已经合格。

新增 `occlusionPairs` 同时检查父子表面的绘制先后与深度：frontId / backId 是按 front / rear 角色预期的遮挡；painterMatches 表示前层是否在后层之后绘制；depthDelta 为前层减后层的深度，未启用空间相机时为 null。图片任务另保留 active，隐藏前层用于观察后层，不能证明可见合成正确。已有旧契约不含该字段仍可使用；新字段必须与实际 surfaces 一致，不能伪造遮挡检查结论。

审计用 painter-role-conflict 标记层序冲突；它与既有 depth-role-conflict 分开。只提供具体层 ID 和待核对关系，不自动排序或放大 Z。父子检查不覆盖所有兄弟表面的交叠，前腿、前臂、衣料等仍需实际图像与倾角检查。

只读检查了 runtime 中 39 个保存工程，得到 187 个卡片/组件版本记录，读取错误 0；这些记录包括不同工坊和组件版本，不是 187 张独立新卡。共有 unclassified 225、single-character-plane 168、hidden-support-review 36、hidden-support-unverified 2，未发现 painter-role-conflict。未批量改写原画，旧素材仍按逐卡清单补齐及验收。清单和审计为 `outputs/anatomical-v72/scene-files.txt`、`saved-scene-audit.json`。

当前恢复工坊单独检查：原卡三个表面，验证副本七个表面。验证副本六组父子遮挡的 painterMatches 全为 true、depthDelta 全为正；主体仍含发丝，保留未分类，避免将它强制锁为 torso。既有补绘回执仍要求视觉复查。恢复记录只读审计见 `live-scene-audit.json`，正式工坊文件 SHA-256 保持 `3c470ce90ab9d78b83b5287341b6cbdca2e5b06c0918249bcbe84f20c3ef7930`。

真实客户端恢复至 0.19.72，检查正面、左右 ±20°、上下 ±12°及四个组合角度：七个表面、十四次框内外绘制，九次 GL 错误码均为 0，编译计数 2 / 资源重建计数 1 保持不变。当前查看尺寸未看到明显新增断层，不能据此声明任意角度的完整 3D 人物或所有历史卡通过。截图及状态在 `client-nine-angles.png`、`client-nine-angles.json`；仅操作共享浏览器客户端，未自动操作独立 Electron 窗口。

全部 316 项 Node 测试和 188 文件语法检查通过；仓库与安装 Skill 验证通过。图片工作者回归实际启动本地契约检查进程，验证选中部件与完整人物参考分开、遮挡关系绑定、服务重启恢复；该回归是契约夹具，不是真实生图。此轮没有重新生成或补绘人物，不增加纹理、网格或绘制次数，未新增 FPS 测量或 Godot GPU 测试。

另从客户端发起真实 Codex CLI 只读核验，沿用 gpt-6.1-sol / xhigh。当前任务确实收到新版 Skill、引用、七个表面和六组遮挡关系，字节匹配记录在 `client-ai-contract-review.json`。最终回复与验证汇总见同目录产出。

该核验实际发现选中拆层 `image` 时，聊天只携带 Mask 统计，没有附图。现已让人物拆层图片（包括临时隐藏的部件）与 foreground 一样携带真实 Mask 和母版，普通图片、背景及预览参考仍被拒绝。通过同一共享判定函数处理客户端与服务端，隐藏部件不依赖可见表面审计列表。

修复后的真实客户端任务收到七张 1024×1536 Mask，逐张与当前文档源 PNG 字节一致，scope 明确为 document-character-masks。全局 Mask 可能包含别的部件，必须与选中图片 Alpha/ownership 相交；不能把它当作当前披风的整个运动范围。实际披风 Alpha >16 的 201,029 个像素中，强运动区 10,080、强刚性区 16,143，两者强区交集为 0；发光、流光进度与金属箔面在该披风内均为 0。统计不替代摆动与连接验收。证据为 `client-ai-mask-contract.json` 和 `selected-part-mask-pixels.json`，完整只读回复单独保留。
