import fs from 'node:fs/promises';
import path from 'node:path';
import type { ExportDocument, ImageWorker } from '../shared/export';
import { ROOT } from './paths';
import {
  runtimeModel as runtime,
  frameModel as runtimeFrame,
} from './export-models';
export async function exportRuntime(
  directory: string,
  doc: ExportDocument,
  worker: ImageWorker,
) {
  await fs.cp(path.join(ROOT, 'licenses'), path.join(directory, 'licenses'), {
    recursive: true,
  });
  const shader = doc.shader || runtime.defaults.shader;
  const frameStyle = runtimeFrame.resolve(doc),
    frameContour = runtimeFrame.contourUniforms(frameStyle),
    frameField = runtimeFrame.distanceField(frameStyle);
  await fs.mkdir(path.join(directory, 'shaders'));
  await fs.writeFile(
    path.join(directory, 'shaders/card.vert.glsl'),
    runtime.vertex(shader.geometryBody),
  );
  await fs.writeFile(
    path.join(directory, 'shaders/card.frag.glsl'),
    runtime.fragmentSource(shader.fragmentBody, false, shader.fragmentPrelude),
  );
  await fs.writeFile(
    path.join(directory, 'actions.json'),
    JSON.stringify(doc.actions || runtime.defaults.actions, null, 2),
  );
  await fs.writeFile(
    path.join(directory, 'slots.json'),
    JSON.stringify(doc.slots || [], null, 2),
  );
  await fs.writeFile(
    path.join(directory, 'uniforms.json'),
    JSON.stringify(
      {
        schema: 'card-atelier-glsl/1',
        language: 'GLSL ES 1.00',
        coordinateSystem:
          'card x [-0.5,0.5], y [-0.75,0.75], z toward viewer; UV top-left',
        fragmentHelpers: {
          sampleSource:
            'vec4 sampleSource(vec2 uv): raw source RGBA in surfaceEffect UV space, preserving sourceRect, shift and back mirror; no adjustments/masks/effects, one additional source texture sample per call; no automatic tiling; fragment-only; shaderTransparent enables output outside original alpha',
        },
        attributes: {
          join: 'float 0..1 distance from internal cloth seam; parent placement at 0, bounded child placement at 1; rigid anatomical parts use constant 1 and a shared two-triangle plane',
          guard:
            'float 0..1, max rigid weight over each touching triangle; protects motion and custom geometry; foreground geometry also requires motion weight',
          p: 'vec3 position',
          uv: 'vec2 normalized registered UV',
          fx: 'vec4 (motion protected across full triangle support, inset, emission, phase)',
        },
        uniforms: {
          componentMaterial:
            'vec4 strength,speed,frequency,scope; 0=front/back backgrounds,1=background,2=back,3=whole front,4=front art without rim,5=component whole surface',
          materialReplace:
            'float 0=overlay,1=procedural replacement on background surfaces; source texture stays intact',
          materialStyle:
            '0=iridescent,1=holographic,2=foil,3=prism,4=gold,5=ink,6=copper,7=steel,8=goldprism,9=blackprism,10=cosmic,11=glass,12=fire,13=water,14=rays',
          attachmentParams: 'vec2 enabled,parent rotation radians',
          attachmentTransform: 'vec4 parent x,y,scale,z; per-vertex join blend',
          cardEye:
            'vec3 camera in card space, inverse of root scale/translation and yaw/pitch; aperture clipping follows projected frame even during entry',
          foregroundPass:
            '1=full alpha inside projected aperture, 2=inset-masked outside; draw same mesh before/after rim',
          popOutSides: 'vec4 top,right,bottom,left booleans; bottom defaults 0',
          armorSweep:
            'vec4 strength,duration,period,width; foilTex bounds local reflection',
          armorColor: 'vec3 reflection color',
          foilTex: 'linear armor material region',
          titleSweep:
            'vec4 strength,duration,period,width; shared across language variants',
          titleBounds:
            'vec2 horizontal visible glyph extent; normalizes sweep duration across languages',
          titleColor: 'vec3 sweep color',
          angle: 'vec2 yaw/pitch radians',
          transform: 'vec4 x,y,scale,z',
          rootTransform:
            'vec4 x/1024,-y/1024,z,scale; whole-card after rotation',
          rootOpacity: '0..1 whole-card opacity; all surfaces',
          layerRotation: 'radians',
          aspect: 'viewport width/height',
          t: 'elapsed seconds',
          depth: '0..1.5',
          bend: 'base bend + action envelope',
          moving: 'cape enabled * wind * action.motion',
          windSpeed: '0..5',
          flow: 'flow enabled * action.emission',
          flowSpeed:
            '0..5, phase stream playback multiplier; 0 holds flow without pausing armor/cloth',
          tex: 'RGBA source texture',
          emissionTex: 'linear grayscale mask',
          phaseTex: 'linear grayscale mask',
          insetTex:
            'linear per-pixel rim occlusion; never warps character/weapon depth',
          sourceRect: 'vec4 normalized sourceWindow',
          shift: 'background parallax UV offset',
          adjustment:
            'vec4 brightness/100, 1+contrast/100, saturation/100, gamma',
          slotEffect: 'vec3 kind (0:none 1:pulse 2:flow), strength, speed',
          clip: '1: restrict attachment to card aperture',
          customEffect: '1: target layer uses surfaceEffect',
          surfaceChannel:
            '0..255 explicit layer shaderChannel; stable when layers reorder',
          surfaceEye:
            'vec3 camera in card space for portable view-dependent surface hooks',
          surfaceTransparent:
            '1: shader may generate alpha outside source coverage; defaults off',
          customStrength: '0..3, mask-weighted mix clamped to 0..1',
          customMasked: '1: use selected grayscale mask',
          customMaskTex: 'chosen registered grayscale mask',
          fg: '1: character with shared vertex masks',
          bg: '1: background aperture',
          frame: '0: image 1: rim 2: sides',
          frameColor: 'vec3 RGB main color',
          frameAccent: 'vec3 RGB highlight',
          frameMetrics:
            'vec4 width/1024, corner cut/1024, thickness/1024, bevel/1024; planar clipped-corner aperture',
          contourCounts:
            'vec2 outer edge count,custom marker/edge count; zero preserves the legacy aperture',
          contourTexture:
            'float: complex/empty shapes use the shared packed distance texture on unit 7',
          contourField:
            'opaque RGB12 pair of signed source-pixel distances; decode before bilinear filtering',
          contourEdges:
            'vec4[64] card-space edge endpoints x0,y0,x1,y1; bind frameContour.edges when enabled',
          frameFinish: '0:flat 1:metal 2:glow',
          rigidSurface:
            '1: rigid anatomical parts, rim, sides, back and background bypass user geometry and wind; shared card rotation still applies',
          back: '1: mirror back UV',
          opacity: '0..1',
        },
        composition: { ...runtime.compositionDefaults, ...doc.composition },
        locale: doc.locale || 'zh-CN',
        armor: { ...runtime.armorDefaults, ...doc.armor },
        frameStyle,
        frameContour: {
          counts: frameContour.counts,
          edges: frameContour.counts[1] ? Array.from(frameContour.edges) : [],
          texture: frameField ? 1 : 0,
          fieldAsset: frameField ? 'contour-field.png' : null,
          fieldSize: frameField ? [frameField.width, frameField.height] : null,
          fieldInfo: frameField
            ? [
                frameField.width,
                frameField.height,
                frameField.step,
                frameField.padding,
              ]
            : null,
          fieldFormat: 'card-contour-field-atlas/2',
        },
        deformation: doc.deformation || runtime.defaults.deformation,
        colorSpace:
          'display-referred RGB matching editor; masks linear data, no sRGB conversion',
        actionEnvelope:
          'loop=1, otherwise sin(pi * clamp(elapsed/duration,0,1)); flip interpolates 0..pi',
        slotParent: 'card; image/text layers bind by slotId',
        blendModes: ['normal', 'add'],
      },
      null,
      2,
    ),
  );
  for (const name of [
    'character-deform-model.js',
    'character-ik-model.js',
    'character-advanced-model.js',
    'character-animation-model.js',
    'mask-edit-model.js',
    'spatial-model.js',
    'component-model.js',
    'laser-foil.js',
    'cosmetics-model.js',
    'particle-batch.js',
    'particle-world-model.js',
    'particle-physics-model.js',
    'source-alpha-bounds.js',
    'action-audio-model.js',
    'action-audio-runtime.js',
    'back-asset-model.js',
    'preview-update-model.js',
    'back-asset-renderer.js',
    'title-model.js',
    'contour-bevel-engine.js',
    'contour-bevel-model.js',
    'frame-model.js',
    'contour-path-model.js',
    'contour-geometry.js',
    'contour-distance-transform.js',
    'contour-coordinate-model.js',
    'contour-field-model.js',
    'contour-field-renderer.js',
    'card-stats.js',
    'shader-graph-model.js',
    'export-profile.js',
    'adaptive-textures.js',
    'contour-material-glsl.js',
    'laser-foil-glsl.js',
    'runtime-core.js',
    'runtime-validation.js',
    'runtime-model.js',
    'mesh-rigidity.js',
    'inspection-model.js',
    'card-capture.js',
    'card-showcase.js',
    'card-showcase.css',
    'shader-variants.js',
    'lazy-preview.js',
    'author-preview.js',
    'player-bridge.js',
    'remote-assets.js',
    'player-model.js',
    'player-textures.js',
    'player.js',
    'player.css',
  ] as const)
    await fs.copyFile(
      path.join(__dirname, '../renderer', name),
      path.join(directory, name),
    );
  await fs.copyFile(
    path.join(__dirname, '../renderer/player.html'),
    path.join(directory, 'index.html'),
  );
  // Source assets feed GLSL; baked copies are available for static engine imports.
  const adjusted = doc.layers.filter((l) => l.src && l.adjustments);
  if (adjusted.length) {
    await fs.mkdir(path.join(directory, 'baked-layers'));
    for (const l of adjusted) {
      const result = await worker.call('adjust_image', {
        image: l.src,
        adjustments: l.adjustments,
      });
      await fs.writeFile(
        path.join(directory, 'baked-layers', l.id + '.png'),
        Buffer.from(result.image.split(',')[1], 'base64'),
      );
    }
  }
  await fs.writeFile(
    path.join(directory, 'README.txt'),
    '运行预览：在此目录启动静态 HTTP 服务并打开 index.html（浏览器不允许 file:// fetch）。播放器编译 shaders/card.vert.glsl 与 card.frag.glsl，并读取 manifest.json、actions.json、slots.json。\nPNG / Mask / 字体可导入 Godot。front.png 为当前 2D 合成，layers/ 为 Shader 源纹理，baked-layers/ 为可选静态调色副本；不要将副本再次套用 adjustments。card.cardproj 保留可编辑源文件。\n人物几何由连续网格驱动，披风运动受 rigid Mask 保护；区域网格仍为编辑引导。矩形框体、背景承载平面和卡背跳过局部几何形变，仍跟随整张卡旋转。GLSL ES 1.00 不能直接作为 Godot Shader；godot/ 目录包含单卡或整套的动态 SDK，使用独立适配的 spatial Shader。\n',
  );
}
