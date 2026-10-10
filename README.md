# Cardscape

Cardscape（卡境）是一款面向动态卡牌创作的桌面编辑器，将平面插画、图层、Mask、空间层级和 GPU 动效组合成可编辑的 2.5D 卡牌场景。

基于 **Electron + JavaScript / WebGL + Rust**。当前版本为 **0.15.1**，原项目名称为「卡牌工坊 / Card Atelier」。现有 `.cardproj` 格式、`card-atelier/*` 协议标识和 `ATELIER_*` 环境变量保留兼容。

## 主要能力

- 图层编辑、文字与图片导入、自由变换、撤销／重做、工程保存与重开。
- 选区、Mask 绘制与修整；可选的本地 MobileSAM 智能选区与 U2Net / ISNet 抠图。
- 2D 合成、3D 卡牌预览、空间层级检查、破框与遮挡、卡背与翻转。
- 自定义 GLSL、动作与素材 Slot，以及可编辑的卡牌工坊与组件工作流。
- 外部 AI Agent 聊天、图片生成／编辑任务及候选结果应用。
- PNG、Mask、工程、动态参数与独立 WebGL 播放器导出。

详细使用说明与历史能力记录见 [编辑器文档](editor/README.md)，当前功能边界见 [能力审计](editor/CAPABILITY_AUDIT.md)。

## 快速开始

需要 Node.js 22 或更新版本、npm、支持 Rust 2024 edition 的稳定 Rust 工具链；本地 AI 功能还需要 Python 及相应依赖。

```sh
git clone git@github.com:RainLib/Cardscape.git
cd Cardscape
make setup
make start
```

网页开发预览：

```sh
make dev
# http://127.0.0.1:8770/index.html
# 使用其他端口：make dev PORT=8771
```

macOS 也可以双击 `editor/启动卡牌工坊.command`。启动器名称保留以兼容已有使用方式。Node.js 必须可从终端 PATH 访问。

运行所需的样卡素材已保存在 `editor/assets` 和 `editor/renderer/assets`，首次启动无需执行旧的 `prepare:assets`。该旧脚本及历史审计脚本可能依赖本机 `outputs/` 设计源文件，不属于普通安装和测试流程。

## Makefile 命令

| 命令 | 用途 |
| --- | --- |
| `make help` | 查看命令 |
| `make setup` | 安装依赖并构建前端、Rust worker |
| `make install` | 按 package-lock 安装 Node 依赖 |
| `make build` | 构建前端与 release worker |
| `make start` | 启动桌面端 |
| `make dev PORT=8770` | 启动本地网页端 |
| `make check` | 前端打包与 JavaScript 语法检查 |
| `make test` | 语法检查、Rust 与 Node 测试 |
| `make test-node` / `make test-native` | 单独执行测试 |
| `make icons` | 同步 macOS 应用包图标 |
| `make selection-setup` | 安装可选的本地智能选区 |
| `make cutout-setup` | 安装可选的本地抠图 |

模型准备命令需要联网，下载的模型、第三方源码和 Python 环境保存在本机，不提交到仓库。模型加载后的图片处理在本地完成。AI Agent 图片服务需要用户自己的 CLI 登录与模型权限，详见 [Agent 协议](editor/AGENT_PROTOCOL.md)。

## 项目结构

```text
editor/
  electron/       主进程、IPC、工程与 Agent 服务
  renderer/       编辑器 UI、WebGL 与独立播放器
  native/         Rust 图像与 Mask worker
  native-ai/      Python 智能选区与抠图 worker
  assets/         默认素材与应用图标
  scripts/        构建、初始化及本地验证工具
  tests/          Node 测试
Makefile          项目常用命令入口
```

本机工程、导出、Agent 会话与设置位于 `editor/runtime/`；可通过 `ATELIER_RUNTIME` 指定独立目录。仓库排除运行数据、依赖、模型权重、测试产物与历史设计导出，不包含登录凭据。

## 应用图标与兼容性

当前沿用已确认的 Ca 图标，桌面 Dock、窗口、macOS 开发应用包及网页 favicon 共用同一套素材。`npm start` 和 macOS 启动器会自动同步应用包图标；更新后保存工程并退出重开即可。图标文件见 [图标说明](editor/assets/icons/README.md)。

当前为开发运行版本，尚未提供签名安装包。真实绘图板、跨平台原生 UI 与完整 Godot 动态场景的验收范围，请以能力审计文档为准。本仓库为私有项目，第三方依赖与下载模型保留各自许可。
