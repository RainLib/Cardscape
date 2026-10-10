# 外部 Agent 图像任务协议

卡牌工坊 0.3 支持从选中的图片层提交改图、选区局部重绘、扩图、参考图生成。入口在图片缩略图旁的 **AI** 按钮；双击缩略图也可打开。文字先转成图片后，使用同一流程。

外部 Agent 负责调用它已有的图像模型 / MCP / 图像工具。编辑器负责准备素材、跟踪任务、校验输出、合成保护区、预览候选、应用和撤销。Codex CLI 已安装和已登录，并不代表已配置图像生成能力。

## 三种接入方式

- **Codex CLI**：主进程直接调用 `codex exec`，复用本机登录和 MCP 配置。设置里可指定可执行文件和模型；模型留空沿用本机配置。不修改 `~/.codex/config.toml`。可取消任务，最长运行 10 分钟。
- **自定义外部 Agent**：设置可执行文件与 JSON 参数数组。参数可使用 `{jobDir}`、`{contract}`、`{prompt}`、`{result}`。提示词还会通过标准输入传入。使用进程参数调用，不解析 shell 命令字符串。
- **文件交接**：生成任务包后，由任意外部 Agent 操作任务目录，写回 PNG 和结果清单。点击“收取 result.json”，或使用“导入产出 PNG”。适用于 Codex 桌面、其他 Agent、外部生图服务与人工交接。

Codex 适配使用 `--json` 读取进度、`--image` 传入源图、`--output-schema` 约束最终结果、`--output-last-message` 写结果清单，任务工作区为单独的任务目录，使用 workspace-write。官方调用说明：[OpenAI Docs：非交互模式](https://learn.chatgpt.com/docs/non-interactive-mode)。

0.6 起，每个图片任务的 `contract.json` 和任务记录包含 `agent: {adapter, model, reasoning}`，可带关联聊天 `sessionId`。Codex 用 `--model` 和 `-c model_reasoning_effort="..."` 传入本次选择，留空读取 CLI 默认或应用 Agent 配置的明确覆盖值；快照中记录实际解析值，不修改全局配置。配置参考：[OpenAI Docs：model / model_reasoning_effort](https://learn.chatgpt.com/docs/config-file/config-reference)。所选模型控制 Agent 推理，生图工具自身的模型由外部 Agent 配置。模型目录来自本机 `models_cache.json`，已知模型只展示目录声明的推理档位；目录与实际账号、CLI 版本及自定义 Provider 的可用性仍需区分。

自定义 Agent 可配置多个独立条目，图片 `args` 与聊天 `chatArgs` 分开。参数数组新增 `{model}`、`{reasoning}`、`{sessionId}`；进程通过标准输入收到提示词。聊天参数留空表示不支持内置聊天。可执行文件经本机检测，以参数数组调用，不拼接 Shell 字符串。

内置聊天使用 `card-atelier-chat/1` 契约，位于 `agent-chats/<会话 UUID>/<回合 UUID>/contract.json`。包含最近最多 32 条有效对话、当前编辑器上下文、可选 `input.png`，以及 Agent / 模型 / 推理快照。Codex 使用 read-only 沙盒，每轮通过 CLI 调用并重放对话；当前不使用 Codex 原生会话 resume。只展示公开回复和任务进度，不展示内部推理。外部聊天程序输出文本到标准输出，或写 UTF-8 `reply.txt`；后者优先。图片制作走独立候选任务，预览后再应用到图层。

`session.json` 保存完整的本机会话、消息状态及每轮参数；支持继续、改名、归档恢复、取消与应用重启后的中断恢复。最多两个聊天同时运行，一次一个图片任务；单会话最多 100 轮，并受约 2.5 MB 容量限制。会话和任务不内嵌在 `.cardproj`，跟随本机运行目录管理。

## 任务目录

```text
agent-jobs/<UUID>/
  input.png              源图，可带透明度
  selection-mask.png     局部重绘选区；只在 inpaint 中提供
  contract.json          尺寸、区域、任务类型、用户要求与输出约定
  prompt.txt             Agent 任务提示词
  result.schema.json     最终结果 JSON Schema
  result.json            Agent 的结果清单
  output/result.png      Agent 产出的真实 PNG
  candidate.png          Rust 校验和保护区合成后的候选
  job.json               任务状态与简洁进度
```

独立源图与选区快照保存在 `agent-snapshots`。即使 Agent 改写任务目录里的 input.png，合成仍以编辑器保存的源图快照为准。任务目录不包含工程的其他原图或凭据。

读取 `contract.json` 的 `output.width` / `output.height`，必须按该尺寸返回 PNG。`selection-mask.png` 是 **白色可修改，黑色保留，灰色混合**；它的 Alpha 不是选区权重。图像工具如采用相反约定，应在其适配器中转换。局部重绘的选区会按原图注册范围换算，支持已扩展背景和经过移动、缩放的图层。

结果清单：

```json
{"status":"completed","image":"output/result.png","message":"使用已配置的图像工具完成"}
```

没有可用图像工具或生成失败时：

```json
{"status":"unavailable","image":"","message":"具体原因"}
```

`image` 必须是任务目录内的相对路径。编辑器检查真实路径、PNG 解码、像素预算和输出尺寸。生成结果必须是真实图片；只有文字说明不算完成。

手动交接帮助命令：

```sh
node scripts/agent-job.cjs inspect /absolute/path/to/job
node scripts/agent-job.cjs complete /absolute/path/to/job /absolute/path/to/generated.png
```

这只负责交接已有图片，不执行生图。提交后回编辑器点击收取即可。

## 应用规则与注册坐标

- 整图编辑 / 参考图生成：输出尺寸与源图一致。
- 局部重绘：Rust 按选区灰度合成，选区外保持源图的 RGBA 像素。矩形选区沿用工具栏羽化设置，多边形 / 磁性套索沿用已生成的羽化选区。
- 扩图：按 `[left, top, right, bottom]` 增加尺寸，每侧 0–1024 px，整体不超过 16 MP。Rust 把源图原样放回 `(left, top)`，不允许 Agent 缩小原画。
- 图层 `sourceWindow` 记录原来的卡面区域。2D 合成保持原构图，新的连续网格背景预览用完整扩图纹理移动采样。勾选“扩图后整图适应图层”可把完整产出缩放到图层范围。
- 原图层应用检查工程 ID、版本与源图指纹；等待期间发生编辑，会禁止直接覆盖。候选可在同一工程作为新图层加入。工程保存后可恢复任务候选；尚未保存的独立工程无法跨重启恢复绑定。
- 应用保留图层变换和人物现有的六张 Mask，不根据新画面自动重算 Mask。改动人物、武器轮廓或位置后，应在实时预览中重新检查权重区域。
- 生成 PNG、注册区域和来源信息随 `.cardproj` 保存，素材包也导出完整图层纹理与 `sourceWindow`。Godot 动态运行时适配仍是后续工作。

## 当前验收

2026-10-09：Rust 8 项单元测试和 Node 6 项集成测试通过。自定义进程适配使用明确标记的测试进程验证协议与取消；并不作为 AI 提供者提供给用户。本机真实 Codex CLI 0.153.4 已启动会话，但当前默认 `gpt-6.1-sol` 被其 ChatGPT 登录账户拒绝，尚未验证该 CLI 的生图能力。

真实图像编辑演示通过当前 Codex 的 imagegen 工具产出，走文件交接流程导回编辑器，验证候选预览、局部像素保护、应用、撤销、重做和保存。图像工具来源与 CLI 验证结果分别记录在 `../outputs/card-agent-audit-v1/`。

## 0.7 聊天操作契约

附编辑上下文且启用编辑控制时，`contract.json.editorCommands` 提供有限指令说明。最终公开回复在正文后附一段 `<atelier-actions>{"commands":[...]}</atelier-actions>`；不启用控制则提供文字建议。核心定义见 `renderer/editor-commands.js`，可用操作为 select / move / transform / visibility / reorder / rename / text / effect / deformation / view / pose / time / action；最多 24 项，不允许任意代码或文件操作。

`context.binding` 包括工程 ID、文档 revision、视图与目标指纹；来自本轮上下文，Agent 不能自行替换。完整回复后解析并逐项验证，前端再核对绑定和图层锁。全部通过后一次提交，并用现有 Undo / Redo 恢复图层与观看状态。普通设计建议不含指令，不产生编辑。未应用的历史操作提供按钮，历史恢复不触发自动操作。`session.json.messages[].commandResult` 保存实际执行 / 失效 / 失败状态，和 Agent 文本区分显示。

CLI 默认只读取配置中模型、推理与 profile 字段，不将 provider 地址、密钥或完整配置传给界面。模型目录不等于实际账号权限；当前本机 gpt-6.1-sol 默认被公共 CLI 的 ChatGPT 账户拒绝，应由用户选择可用模型。已知可用型号的验证记录独立列出，不修改全局默认作为验证手段。


## CLI 就绪条件（0.7.1）

`agent-setup-status / login / install / check-update / update` 都绑定配置中所选 adapter 的可执行文件。Codex 状态由 `codex login status` 确认；每次 `agent-chat-send` 和 `agent-start` 先检查，不使用界面缓存作为授权依据。状态返回 public 分类和版本，不包含登录原始输出。终端登录、安装或更新完成后仍需重新检测。

外部 profile 支持 `requiresLogin`（默认 true）、`statusArgs`、`loginArgs`、`updateArgs`、`statusSuccessText`。三个参数都是 JSON 字符串数组，不经 shell；`statusArgs` 的退出码须表示登录状态，提供成功文本时还须匹配。无检测参数则为 unconfigured，阻止 AI 执行。`requiresLogin:false` 仅用于本地无需账号的程序和协议测试。

CLI 不支持参数显示版本 / 参数诊断；账号拒绝模型显示模型诊断，均提供更新检查入口。更新检查明确区分可更新、当前、未确认及网络失败，不以模型拒绝证明版本过旧。安装 / 更新入口依据当前 CLI 来源选择官方命令；登录使用当前 CLI 和同一个 CODEX_HOME 路径，不复制或读取凭据。macOS 原生终端入口完成后需用户返回检测，其他入口显示命令。
