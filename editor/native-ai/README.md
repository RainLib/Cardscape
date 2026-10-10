# 本地智能对象选区

`npm run selection:setup` 准备官方 MobileSAM 固定版本、本地权重及项目 `.venv`。本机 Python 3.12 / Torch 2.2.2 / timm 1.0.24 / OpenCV 4.11.0 已实际运行。虚拟环境优先复用已安装依赖，缺少依赖时只在项目环境安装。可用 `ATELIER_PYTHON` 指定其他 Python。

官方源码、Apache-2.0 许可和模型版本保留在 `vendor/MobileSAM`，准确 revision、权重 SHA-256 见 `source-manifest.json`。权重约 39 MiB，使用 `torch.load(weights_only=True)` 读取。桌面版分发时必须包含这些文件及可用 Python 环境；目前没有签名安装包与跨平台打包验收。

`selection_worker.py` 接收 JSON Lines `info` / `select`。select 接受注册 PNG、正/负提示点或 box，以及 `sam` / `grabcut`；返回同尺寸灰度 PNG、引擎、模型评分、选中像素数和缓存状态。灰度结果与源 Alpha 取最小值，透明源像素不会被选中。所有图像推理在本机，输入不发送到图像服务。

模型延迟加载、只缓存一张图片 embedding，缓存键为源 PNG SHA-256。取消任务终止该进程，下一次操作自动重新启动。16 MP / 单边 8192、64 个点、120 秒超时。提示分割并不能替代发丝、薄纱和边缘去污染 Matting；模型评分不是生产 Mask 品质保证。Rust 负责后续修整、羽化、Mask 合并与导出。
