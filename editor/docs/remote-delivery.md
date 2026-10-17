# OSS 远端内容与游戏按需加载

顶部「导出」选择使用场景，再将「交付方式」切到 **OSS 远端按需加载**。整套工坊统一使用所选方式，各卡的图层规则继续独立保存。生成：

- `remote/`：上传 OSS / CDN 的内容目录。`catalog.json` 是入口，`objects/` 是不可变资源对象，`index.html` 可直接验证 WebGL 下载、动画和缩放。
- `godot-remote/`：仅含 SDK、Shader 和远端加载示例，不含本地卡牌图片及 `library.tres`。运行后输入目录 URL；游戏可使用其中的 SDK 接入 APK。
- 原有 WebGL 和 `godot/` 本地导出继续可用；源工程是否附带仍由原有选项决定。

图片使用前一层导出预设的 WebP / 原图策略；骨架、动作、FFD、几何、Mask 和组件配置会进一步按对象压缩，Gzip 不节省时保留原编码。对象以原始内容 SHA-256 命名，下载后先解压、校验，再写缓存。共享边框、卡背、几何、骨架及动作独立引用，卡面图片逐素材引用。因此两张卡使用同一边框时只需下载一次，更新一张卡的头像也不需要重新下载它的骨架和动作。

目录为每张卡分别列出 WebGL / Godot 的基础与高清依赖。列表先加载小图、Mask 和运行配置；高清图片在实际放大后下载，整档就绪才切换，原动画继续。已完成的对象跨卡和版本复用，失败只需重试未完成对象；这是对象级续传，不是单个大文件的字节 Range 续传。默认最多 4 个同时下载，HTTP 失败有界重试。缓存损坏会删除后重取；下载或校验失败保留已有档位和画面。新卡失败时，游戏应保留当前卡，待新库返回成功后替换。

`download-report.json` 列出未压缩字节、下载字节、每张卡基础档及新增高清档大小。`upload-manifest.json` 提供上传时需要的缓存与 MIME 设置。

## OSS / CDN 配置

保留整个 `remote/` 的相对路径。对象使用 `Content-Type: application/octet-stream`，**不要为 `.gz` 对象设置 `Content-Encoding: gzip`**，由 SDK 处理压缩；避免浏览器自动解压后再被 SDK 重复解压。`catalog.json` 使用 `application/json` / `Cache-Control: no-cache`，不可变对象使用 `public,max-age=31536000,immutable`。跨域 WebGL 允许游戏域名的 GET / HEAD；有自定义鉴权请求头时同时允许对应头。入口和对象支持 HTTPS。

先上传新增对象，最后替换入口目录；保留仍有客户端使用的旧对象。资源版本为内容摘要，SDK 可指定期望的 release，避免混用不同目录版本。缓存按内容摘要复用，默认 256 MiB，满后淘汰较早的下载；游戏可清理或更换缓存目录。浏览器使用 CacheStorage，不可用时退回当前会话内存缓存；Godot 使用 `user://`，应用重启后仍可复用。断网时尝试上一份有效目录及已完成的资源。

私有 OSS 由游戏业务服务器签发临时 URL 或请求头。WebGL 的 `resolveURL` 和 Godot 的 `url_resolver` 可接业务签名；SDK 不需要 OSS AccessKey。不要把永久 OSS 凭据放到 APK。此导出不会自动上传或修改 OSS 配置。

## Godot / APK

将 `addons/cardscape/` 随应用打包；远端数据不依赖 Godot 编辑器的 `.import` 文件。使用标准的 [HTTPRequest](https://docs.godotengine.org/en/stable/classes/class_httprequest.html)、[Gzip 解压](https://docs.godotengine.org/en/stable/classes/class_packedbytearray.html#class-packedbytearray-method-decompress-dynamic) 及 [运行时图片加载](https://docs.godotengine.org/en/stable/tutorials/io/runtime_file_loading_and_saving.html)。Android 导出启用 Internet 权限，生产地址使用 HTTPS。

```gdscript
var delivery := CardscapeRemote.new()
add_child(delivery)
if await delivery.open("https://cdn.example.com/cards/catalog.json"):
    var id: String = delivery.catalog.cards[0].id
    var library := await delivery.load_card(id) # 基础档就绪后返回
    if library:
        var card := CardscapeCard.new()
        card.library = library
        card.card_id = id
        add_child(card)
        card.play_action(library.card(id).actions[0].id)
```

场景需要正常的 Camera3D。卡片大小和相机变化沿用自动细节策略；UI SubViewport 可设置 `card.detail_pixel_width`。`delivery.progress(stage, downloaded_bytes, cache_hits)` 用于下载提示，`failed(message)` 反馈失败。`clear_cache()` 在下载空闲时清理本 SDK 缓存；`max_cache_bytes` 控制缓存上限。

单独下载组件版本后即可沿用已有换装接口：

```gdscript
if await delivery.load_component("frame", frame_id, version, card.library):
    card.set_component("frame", frame_id, version)
```

SDK 固定在 APK 中；远端内容只包含 JSON、图像与可移植 Shader 数据，不下载和执行 `.gd` 脚本。新增不兼容运行能力仍需更新 SDK / APK。

## WebGL

导出播放器支持 `runtime/index.html?catalog=../catalog.json&card=卡片ID`。也可把本地 SDK 和播放器随游戏提供，用 `catalog` 指向跨域 HTTPS 内容目录。

自定义接入使用 `CardRemoteAssets.create()` → `open(url)` → `loadCard(id)`，返回 `manifest / actions / slots / vertex / fragment / foregroundMesh`。基础图片已转换为 Blob URL；未加载的高清引用在送入 Image 前经过 `await delivery.resolve(src)`。缩放切档继续由 `CardAdaptiveTextures` 完整批次替换。销毁播放器时调用 `close()`，释放对象 URL 并取消下载。更换资源目录时，保持旧画面直至新内容就绪。

## 验证

Node：`node --test editor/tests/remote-assets.test.cjs` 检查分层依赖、压缩、摘要、共享复用、高清延迟、并发、损坏缓存、HTTP 重试、断网重开及版本更新。

Godot：将 `sdk/godot/tests/test_remote_card.gd` 用于实际双卡导出，设置 `CARDSCAPE_REMOTE_URL` 指向测试 HTTP 目录，运行 `editor/scripts/test-godot.cjs`。测试加载真实 Spine 卡牌的全部动作，检查原始下载图片生成的实际 GPU 纹理、骨架 / 权重 / FFD、缩放连续性与第二张卡的新增对象数量。可选的 `CARDSCAPE_REMOTE_CONTROL` 仅用于本地故障注入服务器，检查 503 重试和离线缓存，不是业务接口。

桌面 HTTP / GPU 验证不能替代真实 OSS 的鉴权、CORS、CDN 缓存及 APK 真机网络、存储和帧率验收。
