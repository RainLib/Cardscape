# 卡牌工坊应用图标

来源：`../../../outputs/card-app-icon-v1/card-atelier-icon.png`，经用户确认的 Ca 深灰／浅蓝图标。转换保留透明通道。

- `card-atelier.png`：1024 × 1024，macOS Dock 和 Linux 窗口图标。
- `card-atelier.ico`：16、24、32、48、64、128、256 px，Windows 窗口图标。
- `card-atelier.icns`：macOS 安装包图标素材，供未来打包使用。
- `../../renderer/favicon.ico`：网页标签页图标，与桌面 ICO 内容相同。
- `../../renderer/assets/branding/card-atelier.png`：256 × 256，编辑器菜单栏图标。

Electron 在启动时设置 Dock／窗口图标；网页入口引用带版本参数的 favicon，开发服务器返回 `image/x-icon`。已通过 32 个 JS 文件语法检查、隔离 Electron 启动和 HTTP 图标资源／MIME 检查。现有编辑窗口需要保存工程后重新启动，网页需要刷新。本项目当前以 Electron 开发启动器运行，尚未构建安装包。

macOS 的 Finder 与最小化窗口还可能读取应用包图标。`scripts/prepare-app-icon.cjs` 将本项目 Electron.app 的 `Contents/Resources/electron.icns` 同步为 `card-atelier.icns`，更新应用包时间并重新注册到 Launch Services。`npm start` 的 prestart 和 `.command` 启动器均执行同步；依赖重装后会自动恢复。如果原开发包有签名，替换后会重新作本地 ad-hoc 签名。已核对 Info.plist 实际引用的图标文件与项目 ICNS 字节一致；脚本及启动器语法检查通过。正在运行的进程可能持有旧图标缓存，需要保存后退出并重新启动。
