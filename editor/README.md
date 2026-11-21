<img align="right" src="../docs/branding/cardscape-mark.svg" width="64" alt="Cardscape logo">

# Cardscape editor

The Cardscape desktop workspace combines an editable 2D source with a live WebGL card. Use it to compose a card face, author depth and motion, and package the result for the web or Godot. [Project overview](../README.md)

## Run the editor

Install Node.js 22.18 or newer and a stable Rust toolchain with Rust 2024 edition support before running these commands from the `editor` directory.

```sh
npm ci
npm run native:build
npm start
```

`npm start` builds the Electron app before launching it. The default artwork and icons ship with the source tree. On macOS, `启动卡牌工坊.command` is also available after dependencies are installed.

## Find your way around

![The editor in split view with Moonlit Traveler on the 2D canvas and in the live 3D preview](../docs/media/editor-workspace.webp)

| Workspace control                   | What it does                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **2D**                              | Arrange source images and text, work with selections, and paint masks.                                                    |
| **Split view** (分屏)               | Keep the 2D canvas and 3D preview visible together. Change the split direction or drag the divider to resize either pane. |
| **Effect preview** (效果预览)       | Rotate, zoom, and flip the finished card. Pause the preview to inspect a particular angle.                                |
| **Spatial layers** (空间层级)       | Inspect Z depth, draw order, frame clipping, and foreground pieces that break the frame.                                  |
| **Appearance** (外观与等级)         | Apply material, border, and particle presets. Edit the foil layers and how they respond to light.                         |
| **Animation timeline** (动画时间轴) | Scrub an action, edit its tracks, and synchronize particles and audio.                                                    |

## Make a holographic card

1. From Home, choose **Open project** (打开工程) and open the [Moonlit Traveler workshop](examples/production-card/moonlit-traveler/moonlit-traveler.cardworkshop). For your own art, start a card and use **Import image** (导入图像) to add a background.
2. Open **Appearance → Effect Library → Holographic Foil** (效果组件库 → 镭射). Click a recipe to preview it, then apply it to the card. In the material inspector, **Match Artwork** (自动匹配原图) analyzes the artwork and selects a pattern, metal tone, and highlight position.
3. Choose **Mark Subject** (标注主体). Paint white where the color should be protected and black where the material should show through, or write a selection to the mask. The white sweep can still light the marked subject.
4. Under **Layer Patterns** (叠加纹样), pick a base material and add up to three patterns with independent strengths. Adjust the rainbow, foil, glare, and glitter controls while dragging the live preview. The card face can also be cropped and mounted in five layouts.
5. Open **Showcase & Capture** (展示与录制) in the 3D preview. Choose a viewing mode or record a 48-frame GIF loop or a 60 fps MP4. MP4 recording uses the host browser's H.264 encoder.

[Foil materials and subject masks](docs/laser-foil.md)

## Build a frame-breaking character

1. Open the [Neris Vale workshop](examples/production-card/neris-vale/neris-vale.cardworkshop) and drag the live preview. Watch the near hand move across the rim while the torso and distant scenery stay inside the window.
2. In **Spatial layers** (空间层级), inspect the rear cape, continuous portrait, rigid forearm, and pinned silk sash. The **Inset** mask controls which parts cross the rim. The portrait layer retains painted sleeve and coat support for angles that expose the joins.
3. Hold the card at one angle and play **Sea Breeze**. The **Motion** mask keeps the silk anchored at the belt. **Emission** limits the glow to the engravings, and **Phase** sets the light's direction around them.
4. Use **Card display language** (卡片显示语言) in the preview toolbar to switch between English and Chinese. In **Appearance → Hero wordmark** (外观与等级 → 英雄字标), select the wordmark to move or resize it. The sash renders in front of the name and changes how much it covers as it moves.

## Animate a card entrance

![Moonveil Stag in the Cardscape editor with the Aurora Reveal action and its movement keyframes visible](../docs/media/animation-timeline.webp)

Open the [Moonveil Stag workshop](examples/production-card/moonveil-stag/moonveil-stag.cardworkshop), then choose **Motion → Whole Card** (动画动作 → 整卡动画). Select **Aurora Reveal** and choose **Whole-card motion** (整卡动作) in the timeline's track filter to see the position, scale, and opacity keys. Scrub the playhead to watch the card rise into view and the foil change as it turns.

### More authoring tools

- The **Character** tools let you edit bones, meshes, weights, poses, and IK. Supported Spine JSON and atlas assets can be imported into the Cardscape animation model. [Character workflow and compatibility](docs/native-character-animation.md)
- Action particle tracks support bursts, trails, and card- or world-space placement. The audio tracks support asset selection, trimming, volume, pitch, and looping. [Particles](docs/action-particles.md) · [Audio](docs/action-audio.md)
- The contour editor lets you draw card outlines and openings, import SVG curves, and edit bevels and rim effects. [Contour editing](docs/contour-authoring.md) · [Contour materials](docs/contour-materials.md)

### Common shortcuts

| Shortcut        | Action                                                     |
| --------------- | ---------------------------------------------------------- |
| `V` / `B` / `T` | Move, paint a mask, or edit text                           |
| `M` / `L` / `W` | Rectangular selection, polygon lasso, or color selection   |
| `X`             | Switch the mask brush between black and white              |
| `Space` + drag  | Pan the 2D canvas                                          |
| `Cmd/Ctrl+T`    | Enter free transform. Use Enter to apply or Esc to cancel. |
| `Cmd/Ctrl+Z`    | Undo                                                       |

## Save and export

| Output            | Use it for                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `.cardproj`       | One editable card with its source assets and settings.                                                                     |
| `.cardworkshop`   | One or more cards with a shared library of frames, materials, particles, and backs.                                        |
| **GIF or MP4**    | A recording of the card's tilt and effects for sharing.                                                                    |
| **PNG and masks** | Baked previews and reusable image assets.                                                                                  |
| **WebGL export**  | A portable browser player with GLSL, textures, animation data, and controls. Serve it over HTTP and open its `index.html`. |
| **Godot export**  | A project with the Cardscape SDK and assets for instantiating cards in Godot.                                              |

Export presets control texture sizes and which effects stay active at different detail levels. Content can also be packaged for remote loading and shared caching. [Export presets](docs/export-presets.md) · [Remote delivery](docs/remote-delivery.md) · [Godot integration](../sdk/godot/README.md)

## Development

Run these commands from the `editor` directory.

| Command                                            | Purpose                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run dev`                                      | Start the Electron app with Vite hot reload.                                  |
| `npm run dev:web`                                  | Build the portable runtime and serve the local browser editor.                |
| `npm run check`                                    | Run TypeScript checks, the production build, and compatibility syntax checks. |
| `npm test`                                         | Run the Node test suite. Build the native worker first.                       |
| `npm run native:test`                              | Run the Rust worker tests.                                                    |
| `npm run test:electron` / `npm run test:player`    | Exercise the desktop app or portable WebGL export.                            |
| `npm run selection:setup` / `npm run cutout:setup` | Install optional local selection or cutout models.                            |

The Electron main process handles files and worker jobs. The TypeScript renderer owns editing state, the canvas, and the WebGL preview. The Rust worker handles image decoding, mask processing, and geometry. Build output goes to `dist/`. Local projects and exports use `runtime/`. Override the local data directory with `ATELIER_RUNTIME` when testing.

Older projects retain the `card-atelier/*` schema identifiers and `ATELIER_*` environment variable names. The optional Agent integration uses your own provider setup. [TypeScript architecture](docs/typescript-architecture.md) · [Agent protocol](AGENT_PROTOCOL.md) · [Capability audit](CAPABILITY_AUDIT.md) · [Chinese guide and development history](README.zh-CN.md)
