# 动作音效

在动画时间轴展开「动作音效事件」，导入 WAV、MP3 或 Ogg Vorbis 创建事件。制作器会实际解码并转换为 48 kHz PCM16 WAV；不支持的编码会报错。支持事件名称、触发秒数、持续时间、素材裁剪起点、音量、播放速度、素材循环及单独启停。修改使用现有撤销、保存与工坊素材去重。素材须为 0.02–30 秒、单声道或双声道，输入文件最多 8 MiB；导入后工程体积可能比压缩源文件大。

制作器默认静音，点击「启用音效试听」后随动作播放；独立播放器使用「启用音效」按钮，Godot 本地／远端示例也有独立开关。浏览器需要用户交互才能允许音频，未允许时不能把自动动作播放当作声音已启动的证据。[浏览器自动播放规则](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)

事件区间为 `[开始, 结束)`，不能超出动作结束时间。非循环素材在素材播完或事件结束时停止；勾选素材循环后，在裁剪起点至素材结束之间循环，到事件结束硬截止。播放速度同时改变时长与音高。动作循环每轮重新触发，声音不会跨轮或跨动作保留；动作切入过渡只混合姿态，旧动作声音立即停止。

暂停、隐藏预览、关闭效果、停用或销毁卡牌会停止声音。恢复或定位到事件中间时，从对应的源音频偏移继续，不补播已经错过的短音效，也不在暂停拖动时反复发声。异步解码完成后只检查最新动作时间，暂停／销毁后的迟到结果不能启动声音。首次解码可能晚于事件开始，声画并非离线采样精确同步；交互定位受渲染更新、音频混音和设备延迟影响。

`CharacterAction.audioEvents` 是可选数组，每动作最多 16 项。完整事件如下：

```json
{
  "id": "charge",
  "name": "掌心聚能",
  "src": "data:audio/wav;base64,...",
  "sourceDuration": 1.6,
  "at": 0.05,
  "duration": 1.6,
  "offset": 0,
  "volume": 0.55,
  "playbackRate": 1,
  "loop": false,
  "enabled": true
}
```

`at` 为动作相对时间 0–1；其余时间单位为秒。`duration/sourceDuration` 为 0.02–30，`offset` 最多为素材时长减 0.01，`volume` 为 0–1，`playbackRate` 为 0.25–4。ID 唯一、1–80 字符，名称最多 120 字符。字段完整校验，未知字段被拒绝。内嵌素材须为规范的 PCM16 WAV，头部长度、采样率、通道及源时长一致；导出时还会校验实际字节。原工程不含该字段时继续静音，行为保持不变。

新导出需配套本次 WebGL／Godot SDK。普通卡片导出按音频字节摘要去重，`src` 变为 `audio/*.wav`，工坊跨卡共享文件；`actions.json` 与清单保持一致。Godot 使用共享 `AudioStream` 资源引用，PCK 会随资源引用包含 WAV；远端版本将音频加入基础依赖、摘要校验及离线缓存。浏览器和原生使用同一份规范 WAV，采样率转换及最终声卡输出不承诺逐位一致。Godot 远端 WAV 字节载入使用 `AudioStreamWAV.load_from_buffer`，需要 4.4 或更新；实际验收版本为 4.7.1。[Godot WAV 接口](https://docs.godotengine.org/en/stable/classes/class_audiostreamwav.html)

WebGL 卡牌 API：

```typescript
await preview.setAudioEnabled(true); // 从用户点击中调用
preview.playAction('cast');
preview.setPaused(true);
preview.playAction('cast', 0.5, false); // 从动作 0.5 秒继续
preview.getAudioState(); // 声部、素材引用、解码字节、错误及信号峰值
await preview.setAudioEnabled(false);
```

同一页面的渲染器共享一个按需创建的 AudioContext、最多 32 个音频素材及 64 MiB 解码缓冲记账；解码前先预留预算，取消或失败归还，防止并发解码同时占用同一份余额。`decodedBytes` 包含尚在解码的预留量。每卡最多八个声部、页面最多 32 个，按事件数组顺序选择；被预算排除的事件以后仍在播放窗口内时，可以从对应位置加入。切换动作释放无关素材引用，静音／重建／销毁释放所属节点及素材，最后一个使用者释放上下文。记账不等于浏览器进程实际内存，也不包含其他 iframe 的音频。每次播放重新创建单次使用的源节点，音量端点使用短渐变减少点击声。[Web Audio 播放偏移](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start)

`drawExternal` 不会自己推进宿主时间；宿主停止绘制时仍须调用 `setPaused(true)`，不能将“不再提交 GPU 帧”等同于暂停音频。自动性能基准默认静音；验收页面可勾选「播放动作音效」，记录暂停前、暂停后与释放后的音频状态。

Godot：设置 `card.audio_enabled = true`，使用原有 `play_action`、`seek_action`、`pause_action`；`audio_state()` 返回声部与错误。每卡最多八个 AudioStreamPlayer，SDK 实例共最多 32 个。节点归卡牌，静音／重建／离开场景树时释放；WAV 资源仍由共享库持有，释放一个卡牌不会卸载整个库。音效是非空间化输出，支持源立体声；没有距离衰减、三维声源、音效跨淡入、混音轨道编排或多动作音频层。这些不能由已有事件支持推定为完成。

真实样卡保留原创合成的风切、聚能与冲击 WAV、生成脚本和摘要，分别与横斩、施法、世界空间及碰撞动作同步。`npm run test:production-card` 实际导入、编辑、试听、暂停、保存重开及导出，并检查编辑器／HTTP 播放器的 Web Audio 信号；`npm run test:production-godot` 对照 96 个事件采样点，并检查实际混音 PCM、暂停静音、定位／切换、声部预算和释放。此证据覆盖音频图与引擎混音，不证明任意扬声器、手机或蓝牙设备的听感和延迟。

远端专项复现：设置 `GODOT_BIN` 后运行 `node scripts/verify-action-audio-delivery.mts`，使用当前真实样卡及实际导出的文字／边框资源，分别启动真实 HTTP 浏览器与 Godot 瘦客户端检查声音信号。索引为 `qa/action-audio-delivery/last-run.json`；完整阶段证据为 `qa/action-audio/last-run.json`。
