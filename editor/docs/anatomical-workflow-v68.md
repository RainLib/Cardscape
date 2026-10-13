# 腿部真实补绘与编辑源预算 · 0.19.68

继续客户端 `card-atelier` 的“星潮守卫 · 肢体景深验证”副本。原卡和正式工坊文件保留，所有拆层和修补由客户端原子应用；不直接修改活跃工程文件。

人物右近腿沿 95 点实际轮廓拆为刚性 `leg/right` 表面，Z=.085、motion=0，保留当前大腿、膝甲和胫甲。右髋根任务 `b6840c10-dc4a-472e-85cc-086c8feb54d1` 实际 READY，候选为 1024×1536，选区外差异为 0。独立统计选区 >127 的原透明区域新增 5,062 个可见像素，剩余 408 个包含合理的身体外侧透明区，不能直接记为穿洞。

客户端应用 `repairLayer`，回执新增 17,901 个支撑像素；它统计整个羽化补层范围，与上述子集不同。随后恢复近腿、前布及图片字标。证据在 `outputs/anatomical-v67/near-hip-ready-analysis.json`、`near-hip-support-candidate.png` 和客户端聊天回执。腿部极限角度、膝胫连续性和播放接缝仍须验收。

左远腿的 74 点拆层批次被旧 64 MiB 上限原子拒绝，未产生部分编辑或远腿候选。实际修订 653 的本卡总去重存储为 65,001,496 字节，其中显示素材 32,350,832 字节、保留原稿 32,650,497 字节。新拆层增加可编辑原稿后越过旧合计预算；单纯删除母版会损失后续修补依据。

现在分别保留 64 MiB 显示素材与 64 MiB 编辑源预算，组合工程/工坊仍为 192 MiB。仅图层 master、splitEdgeOriginal 和 underpaint 中 original/originalMaster/candidate/preSplitEdges 的图像属于编辑源；Mask、当前 src、未知字段及其他实际引用仍计显示预算。同一图像同时为当前素材与母版时只计显示预算一次。没有删图、降质或改变 PNG，独立组件与嵌套限制保留。这是 UTF-8 去重存储预算，不是 GPU 显存或 FPS 限制。

新回归验证 40 MiB 当前素材与 28 MiB 原稿可继续编辑，原对象不变；超过显示或编辑源预算仍拒绝，不能借未知字段或支持 Mask 绕过显示预算。全部 313 项 Node 测试和 187 文件语法检查通过。证据为 `outputs/stickers-v68/budget-tests.log`、`actual-source-budget.json`、`node-tests-final.log` 与 `check-final.log`。

AI 回复完成仅表示本轮回复结束，不证明制作目标全部完成；相应提示已改为“本轮回复完成”。客户端升级到 0.19.68 并重开恢复副本后，左远腿的 74 点拆层实际成功，保留 `leg/left`、Z=.055、刚性 motion=0。

真实远腿任务 `be4b0d48-c4cc-4929-bdcd-c5d5568ccf20` 已 READY 并由客户端 `repairLayer` 应用 38,556 个支撑像素。最终候选摘要 `81db63dfc811d816e9f279d7017bbb73e0678dd471e6181abf83000fa7a47bf3`，1024×1536，选区外及原可见像素差异均为 0。独立统计强选区原透明 26,709 像素，其中 23,639 个新增可见像素；剩余 3,070 个含边缘、外轮廓与低 Alpha 部分，不能单凭此统计认定穿洞或通过。

在共享客户端渲染器实际观察正面、左右 ±20°、上下 ±12°及四角组合，当前预览尺寸下未看到明显新增断层；倾角变化没有增加编译或资源重建计数，九个 GL 错误码均为 0。另检查衣料 .69 / 1.05 秒及播放、暂停，双腿、远上臂与握持组维持刚性。此证据不覆盖任意侧面、所有历史卡片或未观察的摆幅，独立 Electron 窗口未被自动操作。

客户端 AI 另用两项 `characterPart` 将前垂布标为 skirt/center、后披风标为 cape/center，保留所有像素、Mask、深度、连接点和 motion。主体仍含发丝，不强行分类 torso 将它全部锁为刚性。

完整素材 GPU 验证的客户端导出为 `runtime/cosmetics-v25-qa/exports/workshop-1791834266915-9319e7f3`；补齐两项分类后的最终导出为 `runtime/cosmetics-v25-qa/exports/workshop-1791834761436-d367d83b`。九张当前内嵌图层 PNG 与最终导出、Godot 素材逐字节一致，部件类型、连接和深度保留；两份 Godot 定义仅这两项分类及明确的 mode=cloth 不同，Shader、主网格和 Mask 相同。没有把第一次 GPU 测试误记为另一次运行。

原卡恢复记录与 v67 基线一致，正式工坊文件摘要未变。原卡基线比较的是带 `$blob` 的原始恢复记录，不能与展开后的 JSON 摘要混用。

实际 Godot 4.7.1 / OpenGL / Intel UHD 630 运行九个倾角及衣料两时刻：四个刚性组各有两次框内/破框绘制，共用六索引平面网格；暂停变化 0，倾角变化 66,967 像素，动效变化 28,205 像素，无 Shader 错误。运行有 23 个表面，构建 2.532 秒，加载至五帧就绪 59.712 秒，后续截图 32–111 毫秒。首次绘制开销仍明显；这些时长不是 FPS 或单次首帧测量。

证据集中在 `outputs/anatomical-v68/`：`far-leg-ready-analysis.json`、`client-angle-states.json`、`client-nine-angles.png`、`export-analysis.json`、`godot-gpu.log` 与 `verification.json`。所有历史场景仍需逐张真实素材和倾角验收；公共渲染能力、元数据审计及这张样卡不能替代该项工作。
