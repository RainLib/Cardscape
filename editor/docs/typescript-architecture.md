# TypeScript 与 Electron 架构

应用源代码使用 TypeScript，electron-vite 5 / Vite 7 负责主进程、隔离 preload 和桌面前端。原生图像处理仍使用 Rust，智能选区与抠图仍使用 Python。现有 Canvas/WebGL 编辑器继续承担绘制与交互。

## 目录与职责

| 路径 | 职责 |
| --- | --- |
| `electron/main.ts` | 应用生命周期、窗口与 IPC 组合入口 |
| `electron/application-menu.ts` | 桌面菜单与命令映射 |
| `electron/security.ts` | 桌面与 Vite 开发 origin 选择 |
| `electron/paths.ts` | 源资源、构建产物、SDK 与平台原生 worker 路径 |
| `electron/project-budget.ts` | 图像去重、显示素材与编辑源素材预算 |
| `electron/*-service.ts`、`*-export.ts` | 独立服务与导出适配器 |
| `renderer/app.ts` | 编辑器状态、交互事务及模块组合 |
| `renderer/core/` | 通信、恢复保存、图像/字体/Mask 资源、DOM、素材预检与快照 |
| `renderer/editing/` | 编辑工具、文字、Mask、边框、首页与布局 |
| `renderer/character/` | 骨架、蒙皮、网格、FFD、IK、Spine 与后台计算 |
| `renderer/animation/` | 动作与时间轴 |
| `renderer/rendering/` | WebGL、预览、纹理、空间视图及独立播放器 |
| `renderer/workshop/` | 工坊、组件、卡背及素材装配 |
| `renderer/shaders/` | GLSL、CodeMirror、节点图、Shader 延迟加载及 Material Maker 面板 |
| `renderer/agent/` | Agent、图片任务与抠图界面 |
| `shared/` | IPC、JSON 快照及文档的公共类型 |
| `build/` | 兼容运行文件的构建与开发增量编译 |
| `dist/` | 可重建产物，禁止手工修改、无需提交 |

新功能优先放入对应功能目录；共享能力放入 `core` 或 `shared`。`editor-entry.ts` 显式记录现有插件的初始化顺序，不依赖文件扫描顺序。

## 类型边界

`npm run typecheck` 同时运行两个 TypeScript 项目：

- `tsconfig.json` 检查全部应用、构建配置与桌面验证脚本。旧业务模型仍允许隐式动态类型与宽泛文档扩展字段，尚未达到全量 strict。`Window` 不再具有任意字段索引。
- `tsconfig.strict.json` 对核心、共享契约、preload、菜单、路径、安全 origin、快照编码，以及已迁移的业务模型和 Electron 服务运行 strict 检查。新增核心代码应保持在此检查范围内。当前覆盖 102 个应用源码文件，另包含 6 个编译期类型回归文件。

已迁移的历史模块包括图层树、文字版本、变换、快捷键、预览差异、导出设置，以及原生 Worker、加载窗口、工程预算、工坊存储、恢复记录、制作检查点、最近工程和 Agent 配置/问题解析服务。`shared/geometry.ts`、`layer-tree.ts`、`export-policy.ts`、`projects.ts` 和 `native-protocol.ts` 提供共用的结构与可区分联合类型。Worker 已明确声明进程、进行中的调用、计时器及各原生操作的返回值，扩展操作默认返回需要收窄的 `unknown` 字段。

角色核心已纳入 strict：`character-animation-model.ts`、`character-advanced-model.ts`、`character-ik-model.ts`、`character-deform-model.ts` 与 `character-mesh-scope.ts` 使用 `shared/character.ts` 的骨骼、绑定、权重、网格、曲线、FFD、IK 诊断和姿态契约。`CardDocument.characterRig` 与 `actions` 已连接这些类型。Spine 图集与 JSON 导入也进入 strict，`shared/spine.ts` 描述版本化输入、附件、轨道、图层映射及导入计划；实际输入仍保留原有结构、数值、版本和容量校验。只读检查仍可省略目标工程，导入图集图片时要求提供目标工程。

角色模块中的 `sourcePlacement` 统一处理槽位、旋转和枢轴。Spine 注册坐标和运行时预览共同调用此计算，避免导入和播放各维护一套坐标实现。矩阵、顶点深度、UV、绑定和稀疏 FFD 格式保持兼容。

角色编辑工具进一步进入 strict：拓扑工具、权重笔刷、关节过渡和姿态草稿明确顶点、三角形、锁定骨骼、插值、绑定与 FFD 轨道类型；`shared/mesh-editing.ts` 提供几何和拓扑编辑参数。权重工具直接使用角色核心的 `sourcePlacement`，不再依赖尚未迁移的完整运行时模型；槽位缩放、旋转、枢轴和动画后的编辑坐标与运行时保持一致。`CardDocument.slots` 使用显式 `CardSlot`。

IK 约束编辑面板已进入 strict，DOM 控件按 ID 区分输入框、下拉框、按钮和容器；读取结果返回明确的 `IKEdit`。`shared/character-editor.ts` 声明面板使用的宿主事务与姿态接口，`app.ts` 和高级面板在发布接口时以 `satisfies` 校验提供方；`app.ts` 尚未进入 strict，高级面板已在本轮迁移。失效约束控件报告错误，宿主事务在提交前抛错，避免修改当前工程。Mask 编辑、网格刚性、粒子批次与预览检查模型也已进入 strict。

网格创作与简化也已进入 strict：`character-mesh-authoring.ts` 描述补网、轮廓、关键点、约束边和动画质量回调；`character-mesh-reduction.ts` 描述 UV 采样、动作时间、表面定位、误差扫描、减面结果与前后对比。`shared/mesh-editing.ts` 区分尚未绑定图层的轮廓草稿与已绑定的蒙皮网格，局部圆形/矩形区域使用可区分联合类型。`shared/mesh-reduction.ts` 提供误差阈值、位置/运动/边界/权重指标、问题位置和减面 Worker 消息。

网格创作面板、动作检查、局部权重修正模型与权重检查面板已进入 strict。`shared/weight-audit.ts` 区分三角形问题与 IK 问题，以及检查、进度、修正和错误消息；收集问题时返回必含三角形列表的报告。面板使用具体 DOM、草稿、选择集和指针事务接口，异步结果继续受工程对象、版本、当前图层和取消状态保护。权重面板使用的高级面板、工作区和动画窄接口在各提供方以 `satisfies` 校验；工作区与动画提供方本身仍在普通类型检查范围内，高级面板已在本轮迁移。

减面和权重检查 Worker 也进入 strict。上述模型直接使用角色核心的源坐标变换，不再依赖 `runtime-model.ts`；两个 Worker 的经典脚本依赖分别从 13/15 个缩减到 7/9 个，移除了卡框、文字、Mask、空间和通用运行时初始化。原有经典 Worker 消息结构与共享网格、锁定权重、累计误差、绑定和 FFD 保持兼容，实际浏览器与 Node VM 回归共同检查依赖闭包。

骨架、高级和 Spine 导入面板已进入 strict。`shared/character-elements.ts` 区分动态创建的输入框、下拉框、按钮、画布与折叠面板；`shared/character-panels.ts` 明确编辑文档、动画上下文、骨架拖动、权重视图、误差比较和宿主接口。权重/比较视图、角色工作流/工作区和时间轴现已进入 strict，各提供方继续以 `satisfies` 校验接口。`app.ts` 及其余旧 UI 仍在普通类型检查范围内。新接口不把它们递归拉入 strict。

`character-import-registry.ts` 负责结构解码、适配器注册、交换格式合并和导入排序；适配器输入与输出先保留为 `unknown`。Spine 文件在映射前检查骨骼、附件、Skin 和动画容器的字段类型，版本、特性、容量、引用和几何检查仍由 Spine 模型执行。最终候选通过注入的完整文档校验后才返回 `CardDocument`；桌面面板使用宿主的 `validateDocument`，没有减弱原有运行时校验。`character-animation-import.ts` 保留旧 Node/经典脚本入口和默认完整校验，已清除显式 `any`，但因仍依赖通用运行时，兼容入口本身未纳入 strict。原生导出字段与资源数据保持原样。

高级面板的减面回调使用明确的 Worker 消息联合类型，已取消 Worker 的迟到错误不会覆盖当前反馈；过期动作、网格与表情操作明确报错。`character-mesh-repair.ts` 也进入 strict，通过 `shared/mesh-repair.ts` 描述 UV 选区、局部修复、全动作扫描与自动修复参数。空动作列表下仍保留初始骨架编辑，预览姿态继续保存在文档之外，只有记录操作写入事务。

权重视图、误差比较视图、角色工作流和网格修复 Worker 已进入 strict。权重视图明确选择集、骨骼锁、影响范围、画布帧、几何、笔刷和栅格缓存类型；本地工具设置先从 `unknown` 检查骨骼 ID 数组，损坏或不可读设置回退默认值。视图直接调用角色模型的槽位/枢轴变换，比较画布保留原有反向图层绘制顺序，不再为这两处视图引入完整旧运行时或数值标签模型。

`shared/mesh-repair.ts` 定义扫描、自动修复、进度、完成及失败消息；自动修复结果用 `changed` 区分无操作与包含恢复快照的结果。Worker 只加载实际使用的角色模型，回调不跨越消息边界。比较视图明确快照、UV 区域、表面采样和指针状态；取消或替换比较时终止旧 Worker，迟到结果仍需通过 Worker 身份、文档对象、令牌、版本及操作类型检查。工作流控件按 ID/元素类型声明，共用面板接口继续在提供方用 `satisfies` 校验。

角色工作区、时间轴与 `animation-authoring-model.ts` 已进入 strict。骨骼/图片搜索、折叠、键盘选中及页面导航使用具体元素与对象类型；时间轴明确动作、草稿、骨骼/IK/表情轨道、缓动、播放事件和画布反馈。预览事件先以 `unknown` 检查结构；没有动作时禁用编辑控件，重新出现动作时重建轨道。`CharacterAction.tracks` 统一声明为数值关键帧，不再经由扩展字段访问。旧的未实现图层控制目标从时间轴接口中移除，现有调用均使用骨骼、IK 或表情。

通用运行时实现拆分为 strict 的 `runtime-core.ts`（默认值、采样、坐标、颜色和 GLSL）及 `runtime-validation.ts`（参数和轨道校验），`shared/runtime.ts` 提供公共契约。`runtime-model.ts` 保留公共 API，仅把未迁移的旧业务校验器接入显式 `RuntimeValidators`；这个接线层及其旧依赖仍在普通类型检查范围内，不计入 strict 覆盖数。完整业务校验调用保持执行。时间轴直接依赖 strict 核心，避免把外观、组件等旧模型递归纳入检查。经典脚本清单、编辑页、播放器及导出复制列表同步包含两个新模块；Node/浏览器公共入口保持相同 API。

6 个导出服务 `card-export.ts`、`runtime-export.ts`、`export-textures.ts`、`workshop-export.ts`、`godot-export.ts` 与 `remote-export.ts` 均已改用显式 ESM 并进入 strict。`shared/export.ts` 声明清单、栅格输出、纹理变体、图像 Worker、IO 与远端资源记录；`electron/export-manifest.ts` 从 `unknown` 检查生成清单的容器和素材引用，再供后续阶段读取。源文档与骨架的完整业务校验仍在导出之前执行。远端共享字段使用独立的 JSON 引用类型，与本地清单结构分开，保留内容摘要、共享去重、LOD 和增量发布语义。

`electron/export-models.ts` 为尚未迁移的通用 renderer 模型提供窄接口，以便独立推进导出服务。这里仍有显式声明的 CJS 兼容边界，不能据此认为 `runtime-model.ts`、工坊、边框和外观模型的实现也已通过 strict；运行时核心和参数校验现已拆入 strict 模块，后续应继续迁移公共入口仍连接的工坊、边框、外观、组件、空间模型及其余 Worker 调度。

文件解析和进程响应先以 `unknown` 接收，再检查记录、字段类型、引用与摘要。成功加载的单卡/工坊、恢复状态和恢复失败结果具有明确契约，服务入口通过 ESM 导入使用这些类型。尚未迁移的工坊业务校验由 `electron/workshop-codec.ts` 暴露窄接口：迁移结果保留为 `unknown`，完整业务校验后才返回 `WorkshopDocument`，后续可替换此兼容边界。

`build/typecheck.mts` 还检查 strict 清单内的源码，禁止新增显式 `any`。`tests/types/contracts.ts` 用编译期反例守住 Worker 返回值、图层节点、文字样式、导出预设与 Agent 参数接口；`tests/types/character-export.ts` 另守住角色姿态、Spine 数值、蒙皮权重、图集和纹理引用接口。`tests/types/mesh-editor.ts` 守住笔刷模式、锁定骨骼 ID、顶点、FFD 动作、IK 限制、槽位、姿态草稿、轮廓草稿、区域类型、误差报告与 Worker 消息契约。运行时回归另外覆盖损坏响应、进程重启、损坏存储记录、槽位/旋转/枢轴下的 Spine 坐标一致性及损坏导出清单。

没有使用 `@ts-nocheck` 或 `noCheck` 跳过应用检查。`app.ts`、新核心模块及全局声明已清除显式 `any`；历史业务模型与服务中仍有动态类型，不能据此声称全工程已达到 strict。模型源码统一使用显式 ESM 导入/导出，跨面板接口由模块导出的 `moduleApi` 推导并集中声明在 `types/ui.d.ts`。历史 Node 测试和专项审计工具继续使用 CJS，几何 `.js` 文件属于保留的静态数据资产。

## 入口拆分

- `core/session-controller.ts`：恢复保存防抖、进行中的写入、序列号、切换会话、失败与 flush。
- `core/image-assets.ts`：解码缓存、字体注册、Canvas 创建与 PNG 转换。
- `core/mask-assets.ts`：Mask 类型、注册、颜色叠加、版本与区域统计。
- `core/dom.ts`：按 HTML ID 和标签返回正确的元素类型。
- `rendering/document-renderer.ts`：文字、透明通道、源图注册与调整后的栅格缓存。
- `editing/document-factory.ts`：空白文档与默认 Mask、网格、图层构造。
- `shared/editor-services.ts`、`shared/preview.ts`：IPC 返回结果、预览与 Shader 编辑器契约。

`app.ts` 保留当前编辑状态、手势事务和模块编排，已经格式化为可逐段阅读的代码。新增独立逻辑优先进入上述服务。UI ID/标签类型由 `build/editor-elements.mts` 从 HTML 生成；构建及类型检查都会先刷新该文件，不要手动编辑。Prettier 可用于格式化源码，生成类型和静态几何数据不参与手工格式化。

## 构建与兼容

源代码与产物分离：

1. `build/runtime.mts` 清理限定在本工程的 `dist/`，编译 TypeScript，并复制 HTML、CSS、素材和 Godot 控制脚本。
2. 主进程兼容模块输出到 `dist/electron/*.cjs`；Material Maker 编译器输出 ESM。
3. `build/renderer-modules.json` 记录兼容导出名，`build/classic-renderer.mts` 集中生成 Node/浏览器适配层，保留模型依赖的延迟读取和播放器可等待的异步启动结果。经典脚本供现有 `importScripts()` Worker、Node 回归测试和可移植 WebGL 导出使用。历史渲染文件名在产物中保持扁平；新增核心脚本保留 `core/` 路径。
4. electron-vite 再打包桌面的 main、preload 和前端模块。桌面首页使用生产包；导出播放器继续使用独立的经典脚本契约。

`.cardproj`、工坊格式、`atelier://`、Agent 协议与 Godot SDK 内容保持兼容。`electron/paths.ts` 区分构建目录和源资源目录，Windows 原生 worker 使用 `.exe`。

开发时，主进程服务与共享模型的变化会触发兼容模块更新及主进程重启；渲染源码变化会更新 Worker 兼容文件并刷新页面。Vite 开发页、启动页和经典 Worker 共用同一套产物与服务。严格 CSP 使用每次 HTML 响应生成的 nonce，Vite CSS 与 CodeMirror 使用匹配的 nonce。

## 性能策略

- 桌面把分散的脚本请求合并到 Vite 依赖图；约 602 kB 的 CodeMirror/LiteGraph 压缩包在首次打开 Shader 面板时加载，首页不初始化这些编辑器。
- 图片请求共享 Promise，最多同时解码 4 张图片。缓存按最近访问顺序淘汰，最多 32 项、估算 96 MiB，计算解码 RGBA 与 base64 key 的保留成本。超预算图片可正常交付给当前文档，但不继续留在缓存中。
- 素材预检与当前文档切换分离；解码失败、尺寸错误或 Shader 编译失败不替换正在编辑的工程。
- 撤销快照只复制可变编辑元数据，大图字符串继续共享。
- 恢复快照最多并发哈希 4 张图，确认保存后释放不再使用的完整 base64 引用；撤销回旧图片时可以重新发送。
- 字体注册共享进行中的 Promise；失败时清除缓存，允许后续打开重试。
- 动画持续运行时，大量 `dataset` 序列化、几何 checksum 和 `gl.getError()` 诊断最多每 250 ms 采样一次；暂停/手动编辑的绘制立即更新诊断。动作采样、渲染与逐帧事件继续运行。

可在开发控制台调用 `cardEditorHost.imageCacheStats()` 检查命中、解码数、估算内存、排队数与活动解码数。

## 命令

需要 Node.js 22.18+。首次安装后先构建 Rust worker：

```sh
npm ci
npm run native:build
npm run dev             # Electron + Vite 开发
npm start               # 构建并运行生产桌面界面
npm run dev:web         # 原有 HTTP 网页预览，默认 127.0.0.1:8770
npm run typecheck
npm run check
npm test
npm run native:test
npm run test:electron
npm run test:electron:dev
```

如果本机 npm 设置为忽略安装脚本，Electron 二进制需要额外执行 `node node_modules/electron/install.js`。

## 验证范围

Node 回归覆盖文档预算、保存重开、恢复时序、纹理共享、Worker 依赖图、独立 WebGL/Godot 导出、动画与 Shader 一致性；可选 AI 模型不存在时，相应的两个集成用例会跳过。

桌面验证使用独立临时运行目录，实际执行首页、新建、WebGL 预览、IK 控件读取/关节限制/切换事务/失效控件保护、网格补网与关键点事务、实际权重检查及减面 Worker、骨架创建/绑定/姿态草稿与记录、表情形变、原生及 Spine 文件导入/过期检查保护、Shader 延迟加载、CodeMirror、节点工作台、原生保存对话框适配、未保存修改的恢复与刷新。保存对话框使用固定测试路径替身，未自动操作系统对话框。截图和指标写入不提交的 `qa/typescript-electron*.png/json`。

桌面自动化使用 SwiftShader，验证真实 WebGL 代码路径；其耗时不能当作硬件 GPU 的帧率提升数据。当前主机的硬件 GPU 在自动化中出现过 context loss，硬件驱动稳定性及复杂卡片长期播放性能仍需要在目标机器上测量。本次没有进行真实 AI 服务调用或全量 Godot GPU 场景验收。

框架和 CSP 的行为参考 [electron-vite 文档](https://electron-vite.org/guide/) 与 [Vite CSP nonce 文档](https://vite.dev/guide/features.html#content-security-policy-csp)。

2026-10-22 上一轮验证：完整类型检查、62 个应用源码文件的 strict 检查、生产构建与 302 个脚本语法检查通过；551 项 Node 用例中 549 项通过、2 项可选模型用例跳过。该轮按 TypeScript AST 统计移除 201 处显式 `any`（Electron 143 → 69，renderer 937 → 810）；全工程仍未达到 strict。新增显式 `any` 禁止检查也通过了临时反例验证。生产与开发模式的 Electron 流程均通过，页面脚本错误为 0，Shader 重依赖未出现在首页加载请求中。恢复保存新增覆盖会话切换、错误、flush 和连续并发编辑；兼容适配层新增覆盖导出播放器的异步完成、局部变量遮蔽、属性名、循环依赖和 Node/浏览器发布契约。

既有服务回归覆盖 Worker 异常 JSON/响应结构、异常进程退出与重新请求、Agent 配置兼容与所选配置解析、损坏恢复元数据、写入队列失败后继续保存、最近工程索引损坏项和检查点元数据/路径回归。聊天集成测试的等待改为 15 秒截止时间，保留原有完成状态与内容断言，避免全量并行运行时固定 3 秒轮询窗口造成超时。

上一轮角色、Spine 和导出迁移新增编译期类型反例，并补测槽位缩放/旋转/枢轴下 Spine 与预览的坐标一致性、无目标工程的只读 Spine 检查、生成清单扩展字段保留，以及损坏的素材映射、字体引用、预览边界、LOD 变体和导出预设。原有权重、IK、FFD、动作、蒙皮、图集、独立播放器、工坊、Godot SDK 数据和远端缓存/增量发布测试继续通过。

2026-10-22 上一轮角色面板、网格工具与通用模型验证：移除 83 处显式 `any`（renderer 810 → 727），strict 覆盖从 62 扩大到 73 个应用源码文件，另有 3 个编译期契约文件。完整类型检查、显式 `any` 禁止检查、生产构建和 302 个脚本语法检查通过；552 项 Node 用例中 550 项通过、2 项可选模型用例跳过。生产与开发 Electron 流程均通过，页面脚本错误为 0；新增验证 IK 默认值、无效数值、约束切换提交和失效控件保护，并修复默认误差 0.05 与原输入步长不兼容的问题。拓扑编辑原有绑定、UV、深度、表情和所有动作 FFD 插值回归继续通过；新增权重编辑坐标与运行时在槽位、旋转、枢轴和动画蒙皮下的一致性回归。全工程仍未达到 strict。

2026-10-22 上一轮角色面板、网格创作和简化迁移验证：移除 132 处显式 `any`（renderer 727 → 595），strict 覆盖从 73 扩大到 83 个应用源码文件，另有 3 个编译期契约文件。完整类型检查、显式 `any` 禁止检查、生产构建与 302 个脚本语法检查通过；553 项 Node 用例中 551 项通过、2 项可选模型用例跳过。72 项角色/网格专项回归全部通过，覆盖约束边、共享拓扑、UV、绑定、FFD、累计减面误差、锁定权重、修正取消及旧版本结果保护。新增错误 Worker 回复类型、Worker 异常及失败响应不得提交修正的回归。生产与开发 Electron 流程均通过，页面脚本错误为 0；新增实际 DOM 补网、关键点编辑、权重检查 Worker 与减面 Worker 的验证，并确认 Worker 不修改当前工程。Shader 延迟加载、IK、保存与恢复继续通过。全工程仍未达到 strict，剩余角色骨架/高级/导入面板、权重视图、比较面板及批量网格修复可继续迁移。

2026-10-22 上一轮骨架、高级和导入面板验证：三个目标面板、导入注册器与网格修复模型进入 strict，移除 51 处显式 `any`（renderer 595 → 544），strict 覆盖从 83 扩大到 92 个应用源码文件，另有 4 个编译期契约文件。完整类型检查、显式 `any` 禁止检查、生产构建和 304 个脚本语法检查通过；556 项 Node 用例中 554 项通过、2 项可选模型用例跳过。新增导入结构解码、嵌套坐标/附件/时间线损坏、适配器元数据损坏、完整校验失败不修改当前工程的回归。生产与开发 Electron 流程均通过，页面脚本错误为 0；新增真实控件创建父子骨架、初始姿势与末端、图层绑定、网格和表情形变、姿态草稿及记录、原生文件导入、Spine 检查/应用和过期导入保护。原有 IK、网格、权重 Worker、Shader 延迟加载、保存与恢复继续通过。全工程尚未达到 strict；权重视图、误差比较视图、角色工作流/工作区、时间轴及通用运行时仍可继续迁移。

2026-10-22 本轮权重视图、误差比较视图与角色工作流验证：三个目标模块及网格修复 Worker 进入 strict，移除 66 处显式 `any`（renderer 544 → 478），strict 覆盖从 92 扩大到 96 个应用源码文件，另有 5 个编译期契约文件。补齐选择/锁定状态、缓存帧、Canvas、DOM、UV 选区和扫描/自动修复消息类型；新增类型反例确保顶点与骨骼 ID 不混用、消息按操作收窄且回调不能跨 Worker 传递。完整类型检查、显式 `any` 禁止检查、生产构建及 304 个脚本语法检查通过；556 项 Node 用例中 554 项通过、2 项可选模型用例跳过，15 项网格修复专项回归全部通过。真实 Worker 回归新增完成消息模式、进度阶段和非法操作失败断言。

生产与开发 Electron 完整流程均通过，页面脚本错误均为 0。新增验证设置/动画与整卡/人物范围切换、权重框选取消、笔刷归一化与异步撤销/重做、拓扑比较两侧时刻/误差类型同步、实际全动作扫描、取消处理不改工程、选区保护恢复源网格及文档变化使比较失效；保留空对象列表时不自动滚动的行为。原有导入、IK、表情、Shader 延迟加载、保存和恢复检查继续通过。全工程尚未达到 strict；角色工作区、时间轴、通用运行时及其他历史模型/服务仍可继续迁移。

2026-10-23 本轮角色工作区、时间轴和通用运行时验证：移除 23 处显式 `any`（renderer 478 → 455），strict 覆盖由 96 扩大到 102 个应用源码文件，另有 6 个编译期契约文件。角色工作区、时间轴、关键帧创作模型、运行时核心和自身参数校验进入 strict；公共 `runtime-model.ts` 接线层已无显式 `any`，其尚未迁移的旧模型依赖仍不计入 strict。完整类型检查、显式 `any` 禁止检查、生产构建、307 个脚本语法检查和修改文件格式检查通过。559 项 Node 用例中 557 项通过、2 项可选模型用例跳过。新增校验损坏 Shader/缓动/关键帧、旧扩展校验仍执行及不含 CommonJS 的浏览器装配；原有预览开关/时钟回归改用语法树提取完整函数，保持原行为断言。

对迁移前源码进行独立对照：4 组默认/自定义及诊断 GLSL 输出逐字节一致，20 组循环/端点/无效时间采样和 3 组默认值补全结果一致。导出复制列表和播放器加载顺序包含 `runtime-core.js`、`runtime-validation.js`，原有保存、独立播放器与 GLSL 导出回归通过。全工程仍未达到 strict，剩余旧外观、边框、组件、工坊和空间模型继续保留原校验与兼容入口。

本轮生产与开发模式的完整 Electron 流程均通过，页面脚本错误及 WebGL 错误均为 0。新增真实 DOM 骨骼/图片独立搜索、空搜索结果、树折叠、键盘选择与属性页导航，以及骨骼/IK/表情/整卡轨道的未记录预览、关键帧记录、60 fps 步进、相邻关键帧、键盘删除、异步撤销/重做、清除单轨道保留其他控制、连续播放/暂停、无效输入和空动作列表保护。原有网格、权重、导入、Shader 延迟加载、保存与恢复检查继续通过。
