.DEFAULT_GOAL := help
NPM ?= npm
CARGO ?= cargo
PORT ?= 8770
EDITOR := editor

.PHONY: help install setup build build-editor build-native start dev check test test-node test-native icons selection-setup cutout-setup

help: ## 列出常用命令
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## 安装锁定的 Node 依赖
	$(NPM) --prefix $(EDITOR) ci

setup: install ## 首次准备：依赖、编辑器前端、Rust worker
	$(MAKE) build

build: build-editor build-native ## 构建前端与原生 worker

build-editor: ## 打包 GLSL 编辑器前端
	$(NPM) --prefix $(EDITOR) run build:editor

build-native: ## 构建 Rust release worker
	$(CARGO) build --release --manifest-path $(EDITOR)/native/Cargo.toml

start: build-editor ## 启动 Electron 桌面端（先执行 make setup）
	$(NPM) --prefix $(EDITOR) start

dev: build-editor ## 启动本地网页端，可指定 PORT=8771
	cd $(EDITOR) && ATELIER_PORT=$(PORT) $(NPM) run dev

check: ## 构建前端并检查 JavaScript 语法
	$(NPM) --prefix $(EDITOR) run check

test: check test-native test-node ## 执行语法检查、Rust 与 Node 测试

test-node: ## 执行 Node 测试（需要已构建的 worker）
	$(NPM) --prefix $(EDITOR) test

test-native: ## 执行 Rust 测试
	$(CARGO) test --manifest-path $(EDITOR)/native/Cargo.toml

icons: ## 同步 macOS 应用包图标
	node $(EDITOR)/scripts/prepare-app-icon.cjs

selection-setup: ## 可选：安装 MobileSAM 本地智能选区
	$(NPM) --prefix $(EDITOR) run selection:setup

cutout-setup: ## 可选：安装本地抠图依赖与模型
	$(NPM) --prefix $(EDITOR) run cutout:setup
