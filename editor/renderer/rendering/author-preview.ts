import SourceAlphaBounds from './source-alpha-bounds.ts';
import AudioRuntime from './action-audio-runtime.ts';
import type { CardDocument, CardLayer } from '../../shared/document';
import type {
  CharacterAction,
  CharacterPose,
  ActionParticleEvent,
  ParticleWorldPose,
  ParticleWorldSampler,
} from '../../shared/character';
import type { SceneMetadata } from '../../shared/visual-components';
import type { RuntimeSample } from '../../shared/runtime';
import contourFields from './contour-field-renderer.ts';
import laserFoil from '../workshop/laser-foil.ts';
import particleWorld from './particle-world-model.ts';
import characterEffects from './character-effects.ts';
import type {
  ExternalView,
  SurfaceOptions,
  SurfaceBindings,
  PixelImage,
  PixelRect,
  SurfaceImage,
  SurfaceGeometry,
  GPUMesh,
  JoinBuffers,
  SharedTexture,
  PlaybackState,
  InspectionState,
  PoseTween,
  PreviewRegion,
  SurfaceBase,
  AdapterKeys,
  BackRenderer,
} from '../../shared/surface-preview';
import type { PreviewView } from '../../shared/preview';
import type { InspectionOptions } from './inspection-model';
type RenderDocument = ReturnType<
  typeof importedCardRuntime.ensure<CardDocument>
>;
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
function required<T>(value: T | null | undefined): T {
  if (value == null) throw Error('无法创建预览资源');
  return value;
}
import type { TextureTier } from '../../shared/export-policy';
import type { PreviewAPI } from '../../shared/preview';
import importedCardExportProfile from './export-profile.ts';
import importedCardRuntime from './runtime-model.ts';
import importedCardFrame from '../editing/frame-model.ts';
import importedCardMaskEdit from '../editing/mask-edit-model.ts';
import importedCardCharacterAnimation from '../character/character-animation-model.ts';
import importedMeshRigidity from './mesh-rigidity.ts';
import importedCardSpatial from './spatial-model.ts';
import importedCardPreviewRegion from './preview-region.ts';
import importedCardStats from '../editing/card-stats.ts';
import importedCardComponents from '../workshop/component-model.ts';
import importedCardTitle from '../editing/title-model.ts';
import importedCardParticleBatch from './particle-batch.ts';
import importedCardCosmetics from '../editing/cosmetics-model.ts';
import importedCardInspection from './inspection-model.ts';
import importedCardPreviewUpdate from './preview-update-model.ts';
import shaderVariants from './shader-variants.ts';
import { createLazyPreview } from './lazy-preview.ts';
/* Registered artwork uses shared rigid planes or continuous cloth grids. */
export const moduleApi = (() => {
  'use strict';
  const bindings = window as unknown as SurfaceBindings;
  // Shared decoded artwork can be used by multiple cards/components on one
  // context. Writable images and Masks still own independent physical storage.
  const texturePools = new WeakMap<
    WebGLRenderingContext,
    {
      refs: Map<WebGLTexture, number>;
      images: WeakMap<HTMLImageElement, SharedTexture>;
      shares: Map<WebGLTexture, SharedTexture>;
    }
  >();
  function create({
    canvas,
    gl,
    legacy = {},
    old = { hidden: false },
    info = { textContent: '' },
    embedded = false,
  }: SurfaceOptions): PreviewAPI {
    const actionAudio = AudioRuntime.create();
    const sourceBounds = new Map<
      string,
      readonly [number, number, number, number]
    >();
    let textureDetail: TextureTier | null = null,
      requestedDetail: TextureTier | null = null;
    let viewZoom = 1,
      detail: {
        level: TextureTier;
        particles: boolean;
        materials: boolean;
        decorations: boolean;
      } = {
        level: 'large',
        particles: true,
        materials: true,
        decorations: true,
      };
    const exportPolicy = () =>
      doc?.exportProfile?.settings || doc?.exportSettings;
    function updateDetail(zoom: number, scale: number, z: number) {
      const viewDocument = doc;
      if (!viewDocument) return;

      const P = importedCardExportProfile;
      if (!P) return;
      if (external?.detail) {
        detail = external.detail;
        return;
      }
      const settings = exportPolicy(),
        pixels = P.projectedWidth(
          canvas.clientWidth,
          canvas.clientHeight,
          zoom,
          scale,
          cameraDistance() - z,
          window.devicePixelRatio || 1,
        ),
        target = P.tier(settings, pixels, requestedDetail),
        changed = target !== requestedDetail;
      requestedDetail = target;
      const level =
        viewDocument.exportProfile && textureDetail ? textureDetail : target;
      detail = { level, ...P.effects(settings, level) };
      canvas.dataset.detailRequested = target;
      canvas.dataset.detailLevel = level;
      canvas.dataset.detailPixels = String(Math.round(pixels));
      canvas.dataset.detailMaterials = String(detail.materials);
      canvas.dataset.detailParticles = String(detail.particles);
      if (changed) emit('atelier-detail-change', { level: target, pixels });
    }
    function samplingSize(layer: CardLayer | null | undefined, id: string) {
      return (
        (layer?.asset
          ? doc?.exportProfile?.textures?.[layer.asset]?.sourceSize
          : undefined) || textureSizes.get(id)
      );
    }
    let external: ExternalView | null = null,
      emitterContext: CardDocument | null = null,
      capturing = false,
      disposed = false,
      updateDepth = 0,
      weightsPending = false;
    const stats = { resets: 0, compiles: 0, meshes: 0, textures: 0 };
    const count = (k: keyof typeof stats) => {
      stats[k]++;
      canvas.dataset['resource' + k[0].toUpperCase() + k.slice(1)] = String(
        stats[k],
      );
    };
    const emit = (name: string, detail?: unknown) => {
      if (!embedded && !capturing)
        window.dispatchEvent(new CustomEvent(name, { detail }));
    };

    let sourceDoc: CardDocument | null = null,
      previewLevel: string | null = null,
      doc: RenderDocument | null = null,
      generic = false,
      yaw = 0,
      pitch = 0,
      time = 0,
      particleRevealStart = 0,
      wire = false,
      raf = 0,
      drag: null | {
        x: number;
        y: number;
        yaw: number;
        pitch: number;
        free: boolean;
        action: boolean;
      } = null,
      trianglesDrawn = 0,
      active = false,
      effectsEnabled = true,
      inspection: InspectionState | null = null,
      inspectionTime = 0,
      lastView: PreviewView | null = null,
      poseTween: PoseTween | null = null;
    const maxAttributes = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    const textureImages = new Map<
        string,
        { image: SurfaceImage; source: string }
      >(),
      maskTextureSizes = new Map<string, [number, number, number]>(),
      textureSizes = new Map<string, [number, number]>(),
      titleBounds = new Map<string, [number, number]>();
    function textureDiagnostics() {
      canvas.dataset.textureSizes = JSON.stringify(
        Object.fromEntries(textureSizes),
      );
    }
    const textures = new Map<string, WebGLTexture>(),
      maskData = new Map<string, PixelImage>(),
      meshes = new Map<string, GPUMesh>(),
      ownershipData = new Map<
        string,
        { source: string; image: PixelImage | null }
      >(),
      joinBuffers = new Map<string, JoinBuffers>();
    let texturePool = texturePools.get(gl);
    if (!texturePool) {
      texturePool = {
        refs: new Map(),
        images: new WeakMap(),
        shares: new Map(),
      };
      texturePools.set(gl, texturePool);
    }
    const textureRefs = texturePool.refs,
      imageTextures = texturePool.images,
      textureShares = texturePool.shares;
    const runtime = importedCardRuntime,
      frames = importedCardFrame;
    let frameGeometryKey = '',
      frameAuraKey = '',
      frameGeometry: ReturnType<typeof frames.geometry> | null = null;
    let contourData = frames.contourUniforms(frames.defaults);
    const contourFieldRenderer = contourFields.create(gl);
    let actionTransition: {
      from: CharacterAction;
      duration: number;
      seconds: number;
    } | null = null;
    let renderedAction: {
      clip: CharacterAction;
      seconds: number;
      seek: boolean;
    } | null = null;
    let characterMaskVersion = 0;
    let program: WebGLProgram | null = null,
      a: Record<string, number> = {},
      u: Record<string, WebGLUniformLocation | null> = {},
      compiledKey: string | null = null,
      customMaskImage: PixelImage | null = null,
      playing: PlaybackState | null = null,
      characterPose: CharacterPose | null = null,
      region: PreviewRegion = { mode: 'none' },
      regionImage: SurfaceImage | null = null,
      regionVersion: number | null = null;
    const programs = new Map<
      string,
      {
        program: WebGLProgram;
        attributes: Record<string, number>;
        uniforms: Record<string, WebGLUniformLocation | null>;
      }
    >();
    function releaseUncachedProgram() {
      if (
        program &&
        ![...programs.values()].some((entry) => entry.program === program)
      )
        gl.deleteProgram(program);
    }
    function shader(type: number, source: string) {
      const s = required(gl.createShader(type));
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        const failure = Object.assign(Error(error || 'Shader 编译失败'), {
          stage: type === gl.VERTEX_SHADER ? 'geometry' : 'fragment',
        });
        failure.stage = type === gl.VERTEX_SHADER ? 'geometry' : 'fragment';
        throw failure;
      }
      return s;
    }
    function shaderKey(
      s: {
        geometryBody: string;
        fragmentBody: string;
        fragmentPrelude?: string;
      },
      finish = frames.resolve(doc).finish,
    ) {
      return (
        s.geometryBody +
        '\0' +
        s.fragmentBody +
        '\0' +
        (s.fragmentPrelude || '') +
        '\0' +
        finish
      );
    }
    function compile(
      config: ReturnType<typeof runtime.ensure<CardDocument>>['shader'],
      vertexSource = runtime.vertex(config.geometryBody, true),
      fragmentSource = runtime.fragmentSource(
        config.fragmentBody,
        true,
        config.fragmentPrelude,
      ),
      finish = frames.resolve(doc).finish,
      specialize = true,
    ) {
      if (disposed) throw Error('Preview is disposed');
      const key = shaderKey(config, finish),
        cached = specialize ? programs.get(key) : undefined;
      if (cached) {
        releaseUncachedProgram();
        program = cached.program;
        a = { ...cached.attributes };
        u = { ...cached.uniforms };
        compiledKey = key;
        programs.delete(key);
        programs.set(key, cached);
        canvas.dataset.shaderState = 'compiled';
        return { ok: true, cached: true };
      }
      let next = required(gl.createProgram()),
        v = null,
        f = null;
      try {
        v = shader(gl.VERTEX_SHADER, vertexSource);
        f = shader(
          gl.FRAGMENT_SHADER,
          specialize
            ? shaderVariants.frameFragment(
                fragmentSource,
                frames.finishes.indexOf(finish),
              )
            : fragmentSource,
        );
        gl.attachShader(next, v);
        gl.attachShader(next, f);
        gl.linkProgram(next);
        if (!gl.getProgramParameter(next, gl.LINK_STATUS))
          throw Error(gl.getProgramInfoLog(next) || 'Program 链接失败');
        releaseUncachedProgram();
        program = next;
        compiledKey = shaderKey(config, finish);
        for (const k of ['p', 'uv', 'fx', 'guard', 'join'] as const)
          a[k] = gl.getAttribLocation(program, k);
        for (const k of [
          'angle',
          'transform',
          'rootTransform',
          'rootOpacity',
          'aspect',
          'depth',
          't',
          'moving',
          'fg',
          'bg',
          'back',
          'tex',
          'opacity',
          'frame',
          'contourCounts',
          'contourTexture',
          'contourField',
          'contourFieldInfo',
          'contourEdges[0]',
          'flow',
          'flowSpeed',
          'flowColor',
          'characterFlutter',
          'shift',
          'emissionTex',
          'phaseTex',
          'insetTex',
          'sourceRect',
          '_cardscapeSourceAlphaBounds',
          'bend',
          'windSpeed',
          'layerRotation',
          'adjustment',
          'slotEffect',
          'clip',
          'customEffect',
          'surfaceChannel',
          'surfaceEye',
          'surfaceTransparent',
          'customStrength',
          'customMasked',
          'customMaskTex',
          'frameColor',
          'frameAccent',
          'frameMetrics',
          'frameFinish',
          'frameAnimation',
          'rigidSurface',
          'skinRelief',
          'cardEye',
          'foregroundPass',
          'popOutSides',
          'popOutBounds',
          'foilTex',
          'armorSweep',
          'armorColor',
          'titleSweep',
          'titleColor',
          'titleBounds',
          'componentMaterial',
          'materialColor',
          'materialAccent',
          'materialStyle',
          'materialReplace',
          'laserControls',
          'laserModes',
          'laserOverlays',
          'laserOverlayGains',
          'laserSignatureAnchor',
          'laserSurfaceRole',
          'spatialParams',
          'backgroundExtent',
          'attachmentParams',
          'attachmentTransform',
          'regionMode',
          'regionTex',
        ] as const)
          u[k] = gl.getUniformLocation(program, k);
        count('compiles');
        if (specialize) {
          programs.set(key, {
            program,
            attributes: { ...a },
            uniforms: { ...u },
          });
          while (programs.size > 4) {
            const oldest = programs.entries().next().value;
            if (!oldest) break;
            gl.deleteProgram(oldest[1].program);
            programs.delete(oldest[0]);
          }
        }
        canvas.dataset.shaderState = 'compiled';
        return { ok: true };
      } catch (error) {
        gl.deleteProgram(next);
        throw error;
      } finally {
        if (v) gl.deleteShader(v);
        if (f) gl.deleteShader(f);
      }
    }
    // The home screen does not need a surface program. Compile the requested
    // document/finish on first use, preserving validation before replacement.
    // Share only the same immutable decode, never mutable canvases, pixels or Masks.
    function forgetSharedTexture(tex: WebGLTexture) {
      const shared = textureShares.get(tex);
      if (shared && imageTextures.get(shared.image) === shared)
        imageTextures.delete(shared.image);
      textureShares.delete(tex);
    }
    function releaseTexture(id: string) {
      sourceBounds.delete(id);
      const tex = textures.get(id) ?? null;
      if (!tex) return;
      textures.delete(id);
      const refs = (textureRefs.get(tex) || 1) - 1;
      if (refs) {
        textureRefs.set(tex, refs);
        return;
      }
      textureRefs.delete(tex);
      forgetSharedTexture(tex);
      gl.deleteTexture(tex);
    }
    function upload(
      id: string,
      image: SurfaceImage,
      rect?: PixelRect,
      alpha?: PixelImage,
    ) {
      if (disposed) return false;
      const w =
          ('naturalWidth' in image ? image.naturalWidth : 0) || image.width,
        h =
          ('naturalHeight' in image ? image.naturalHeight : 0) || image.height,
        source =
          ('currentSrc' in image ? image.currentSrc : '') ||
          ('src' in image ? image.src : '') ||
          '',
        mask =
          id.startsWith('mask-') ||
          id === 'custom-mask' ||
          id === 'region-mask';
      sourceBounds.set(
        id,
        mask ? SourceAlphaBounds.full : SourceAlphaBounds.image(image),
      );
      const immutable =
        !mask &&
        !rect &&
        typeof HTMLImageElement !== 'undefined' &&
        image instanceof HTMLImageElement &&
        !!source;
      const cached = textureImages.get(id),
        shared = immutable ? imageTextures.get(image) : null;
      if (
        immutable &&
        cached?.image === image &&
        cached.source === source &&
        textureSizes.get(id)?.[0] === w &&
        textureSizes.get(id)?.[1] === h
      )
        return false;
      if (
        shared &&
        shared.source === source &&
        shared.width === w &&
        shared.height === h
      ) {
        releaseTexture(id);
        textures.set(id, shared.texture);
        sourceBounds.set(id, SourceAlphaBounds.image(image));
        textureRefs.set(
          shared.texture,
          (textureRefs.get(shared.texture) || 0) + 1,
        );
        textureImages.set(id, { image, source });
        textureSizes.set(id, [w, h]);
        textureDiagnostics();
        maskTextureSizes.delete(id);
        return;
      }
      let tex = textures.get(id);
      // A write to one alias must not replace the pixels of its other owners.
      if (tex && (textureRefs.get(tex) || 1) > 1) {
        releaseTexture(id);
        tex = undefined;
      }
      if (tex) forgetSharedTexture(tex);
      else {
        tex = required(gl.createTexture());
        textures.set(id, tex);
        textureRefs.set(tex, 1);
      }
      textureImages.set(id, { image, source });
      sourceBounds.set(
        id,
        mask ? SourceAlphaBounds.full : SourceAlphaBounds.image(image),
      );
      textureSizes.set(id, [w, h]);
      textureDiagnostics();
      count('textures');
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if ('data' in image && mask) {
        const patch = importedCardMaskEdit.grayPatch(image, rect, alpha);
        const format = alpha ? gl.LUMINANCE_ALPHA : gl.LUMINANCE;
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        if (
          rect &&
          maskTextureSizes.get(id)?.[0] === w &&
          maskTextureSizes.get(id)?.[1] === h &&
          maskTextureSizes.get(id)?.[2] === format
        )
          gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            patch.x,
            patch.y,
            patch.width,
            patch.height,
            format,
            gl.UNSIGNED_BYTE,
            patch.data,
          );
        else
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            format,
            w,
            h,
            0,
            format,
            gl.UNSIGNED_BYTE,
            rect
              ? importedCardMaskEdit.grayPatch(image, undefined, alpha).data
              : patch.data,
          );
        maskTextureSizes.set(id, [w, h, format]);
        canvas.dataset.maskUploadBytes = String(
          rect ? patch.data.length : w * h * (alpha ? 2 : 1),
        );
        canvas.dataset.maskUploadMode = rect ? 'patch' : 'full';
        canvas.dataset.maskTextureFormat = alpha
          ? 'LUMINANCE_ALPHA8'
          : 'LUMINANCE8';
      } else {
        maskTextureSizes.delete(id);
        if ('data' in image)
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            w,
            h,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            image.data,
          );
        else
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            image,
          );
      }
      if (immutable) {
        const entry = { image, source, width: w, height: h, texture: tex };
        imageTextures.set(image, entry);
        textureShares.set(tex, entry);
      }
    }
    const black = document.createElement('canvas');
    black.width = black.height = 1;
    required(black.getContext('2d')).fillRect(0, 0, 1, 1);
    upload('mask-default', black);
    function updateFoilTexture(rect?: PixelRect) {
      const foil = maskData.get('foil');
      const subject = maskData.get('subject');
      // Preserve the eight-sampler WebGL 1 budget. Armor reads luminance and
      // the card-level subject reads alpha of the same control texture.
      if (foil) upload('mask-foil', foil, rect, subject);
      else if (subject) {
        const { width, height } = subject;
        upload(
          'mask-foil',
          { width, height, data: new Uint8Array(width * height * 4) },
          rect,
          subject,
        );
      } else releaseTexture('mask-foil');
    }
    function refreshCustomMask() {
      if (!doc || doc.shader.fragmentBody === runtime.surfaceBody) return;
      const im = maskData.get(doc.shader.fragmentMask);
      if (im && im !== customMaskImage) {
        upload('custom-mask', im);
        customMaskImage = im;
      }
    }
    function buffer(data: Float32Array | Uint16Array, type: number) {
      const b = required(gl.createBuffer());
      gl.bindBuffer(type, b);
      gl.bufferData(type, data, gl.DYNAMIC_DRAW);
      return b;
    }
    function mesh(id: string, geometry: SurfaceGeometry): GPUMesh {
      count('meshes');
      const previous = meshes.get(id);
      const lines = [];
      for (let i = 0; i < geometry.indices.length; i += 3) {
        const [x, y, z] = geometry.indices.slice(i, i + 3);
        lines.push(x, y, y, z, z, x);
      }
      const allocated: WebGLBuffer[] = [];
      const meshBuffer = (data: Float32Array | Uint16Array, target: number) => {
        const resource = required(gl.createBuffer());
        allocated.push(resource);
        gl.bindBuffer(target, resource);
        gl.bufferData(target, data, gl.DYNAMIC_DRAW);
        return resource;
      };
      let m: GPUMesh;
      try {
        m = {
          geometry,
          p: meshBuffer(new Float32Array(geometry.positions), gl.ARRAY_BUFFER),
          uv: meshBuffer(new Float32Array(geometry.uv), gl.ARRAY_BUFFER),
          fx: meshBuffer(
            geometry.weights
              ? new Float32Array(geometry.weights)
              : new Float32Array(geometry.uv.length * 2),
            gl.ARRAY_BUFFER,
          ),
          guard: meshBuffer(
            new Float32Array(geometry.uv.length / 2),
            gl.ARRAY_BUFFER,
          ),
          join: meshBuffer(
            new Float32Array(geometry.uv.length / 2).fill(1),
            gl.ARRAY_BUFFER,
          ),
          idx: meshBuffer(
            new Uint16Array(geometry.indices),
            gl.ELEMENT_ARRAY_BUFFER,
          ),
          lines: meshBuffer(new Uint16Array(lines), gl.ELEMENT_ARRAY_BUFFER),
          lineCount: lines.length,
        };
      } catch (error) {
        for (const resource of allocated) gl.deleteBuffer(resource);
        throw error;
      }
      if (previous) {
        for (const b of [
          previous.p,
          previous.uv,
          previous.fx,
          previous.guard,
          previous.join,
          previous.idx,
          previous.lines,
        ] as const)
          gl.deleteBuffer(b);
      }
      meshes.set(id, m);
      return m;
    }
    let characterSample: { key: unknown[]; pose: CharacterPose | null } | null =
      null;
    const particleBirthCache = new Map<
      string,
      Pick<import('../../shared/character').BonePose, 'matrix' | 'opacity'>
    >();
    const particleWorldHistory = particleWorld.history();
    let particlePhysicsCache:
      | ReturnType<typeof importedCardComponents.createPhysicsCache>
      | undefined;
    let particleWorldSource = '';
    let particleWorldTimeOffset = 0;
    let particleWorldSampler: ParticleWorldSampler | null = null;
    let sampleParticleWorld: (seconds: number) => ParticleWorldPose = () => ({
      angle: [0, 0],
      root: [0, 0, 0, 1, 1],
    });
    let particleBirthSource = '',
      particleBirthAction: CharacterAction | undefined;
    function sampleParticleBirth(seconds: number, boneId: string) {
      if (!doc || !particleBirthAction) return undefined;
      if (doc.cosmeticPreview?.motion === false)
        return importedCardCharacterAnimation.rest(doc)?.bones.get(boneId);
      const key = `${boneId}:${seconds}`;
      if (!particleBirthCache.has(key)) {
        const bone = runtime
          .sampleCharacter(
            doc,
            {
              id: particleBirthAction.id,
              name: particleBirthAction.name,
              duration: particleBirthAction.duration,
              boneTracks: particleBirthAction.boneTracks,
              ikTracks: particleBirthAction.ikTracks,
            },
            seconds,
            { seek: true },
          )
          ?.bones.get(boneId);
        if (!bone) return undefined;
        if (particleBirthCache.size >= 512)
          particleBirthCache.delete(particleBirthCache.keys().next().value!);
        particleBirthCache.set(key, {
          matrix: bone.matrix,
          opacity: bone.opacity,
        });
      }
      return particleBirthCache.get(key);
    }
    function sampleCharacterCached(
      action: CharacterAction | undefined,
      seconds: number,
      seek: boolean,
    ) {
      const viewDocument = doc;
      if (!viewDocument) return null;

      const key = [viewDocument.characterRig, action, seconds, seek];
      if (!characterSample || key.some((v, i) => v !== characterSample?.key[i]))
        characterSample = {
          key,
          pose: runtime.sampleCharacter(viewDocument, action, seconds, {
            seek,
          }),
        };
      return characterSample.pose;
    }
    function clearSkinMeshes() {
      for (const [id, m] of meshes)
        if (id.startsWith('character-skin:')) {
          for (const k of [
            'p',
            'uv',
            'fx',
            'guard',
            'join',
            'idx',
            'lines',
          ] as const)
            gl.deleteBuffer(m[k]);
          meshes.delete(id);
        }
    }
    function grid(n: number) {
      const g = {
        positions: [] as number[],
        uv: [] as number[],
        indices: [] as number[],
      };
      for (let y = 0; y <= n; y++)
        for (let x = 0; x <= n; x++) {
          g.positions.push(x / n - 0.5, 0.75 - (y / n) * 1.5, 0);
          g.uv.push(x / n, y / n);
        }
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const i = y * (n + 1) + x;
          g.indices.push(i, i + n + 1, i + 1, i + 1, i + n + 1, i + n + 2);
        }
      return g;
    }
    mesh('quad', grid(24));
    mesh('rigid-quad', grid(1));
    function skinned(layer: CardLayer | null | undefined) {
      const viewDocument = doc;
      if (!viewDocument) return null;

      const spec = viewDocument.characterRig?.meshes?.find(
        (m) => m.layerId === layer?.id,
      );
      if (!layer || !spec || viewDocument.cosmeticPreview?.motion === false)
        return null;
      const pose =
        characterPose || importedCardCharacterAnimation.rest(viewDocument);
      const key = 'character-skin:' + layer.id;
      let m = meshes.get(key);
      if (m?.skinSource !== spec) {
        const geometry = importedCardCharacterAnimation.geometry(
          viewDocument,
          layer,
          pose,
          runtime.placement(viewDocument, layer),
        );
        m = mesh(key, required(geometry));
        m.skinSource = spec;
        m.skinPose = pose;
      } else if (m.skinPose !== pose) {
        const geometry = importedCardCharacterAnimation.geometry(
          viewDocument,
          layer,
          pose,
          runtime.placement(viewDocument, layer),
        );
        gl.bindBuffer(gl.ARRAY_BUFFER, m.p);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, required(geometry).positions);
        m.geometry.positions = required(geometry).positions;
        m.skinPose = pose;
      }
      if (m.skinMasks !== characterMaskVersion) {
        const data = new Float32Array(m.geometry.uv.length * 2);
        for (let i = 0; i < m.geometry.uv.length / 2; i++) {
          const x = Math.round(m.geometry.uv[i * 2] * 1023),
            y = Math.round(m.geometry.uv[i * 2 + 1] * 1535),
            p = (y * 1024 + x) * 4;
          for (const [id, k] of [
            ['motion', 0],
            ['inset', 1],
            ['emission', 2],
            ['phase', 3],
          ] as const)
            data[i * 4 + k] = (maskData.get(id)?.data[p] || 0) / 255;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, m.fx);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
        m.skinMasks = characterMaskVersion;
      }
      return m;
    }
    // Build only when structural parameters change; colors stay cheap uniforms.
    function refreshFrame() {
      const viewDocument = doc;
      if (!viewDocument) return;

      const style = frames.resolve(viewDocument),
        key = JSON.stringify([
          style.shape,
          style.width,
          style.corner,
          style.depth,
          style.bevel,
          style.contour,
        ]),
        auraKey = JSON.stringify([
          key,
          frames.auraPadding(style),
          frames.auraInset(style),
        ]);
      if (key === frameGeometryKey && auraKey === frameAuraKey) return;
      frameGeometry = frames.geometry(style);
      contourData = frames.contourUniforms(style);
      if (key !== frameGeometryKey) {
        mesh('frame-rim', frameGeometry.rim);
        mesh('frame-rear', frameGeometry.rear);
        mesh('sides', frameGeometry.sides);
        frameGeometryKey = key;
      }
      if (auraKey !== frameAuraKey) {
        mesh('frame-aura', frameGeometry.aura);
        frameAuraKey = auraKey;
      }
    }
    let rigidityCache: {
      geometry: SurfaceGeometry;
      image: PixelImage | undefined;
      locks: Float32Array;
    } | null = null;
    function updateWeights() {
      if (updateDepth) {
        weightsPending = true;
        return;
      }
      weightsPending = false;
      const m = meshes.get('foreground');
      if (!m) return;
      const rigidImage = maskData.get('rigid');
      if (
        !rigidityCache ||
        rigidityCache.geometry !== m.geometry ||
        rigidityCache.image !== rigidImage
      )
        rigidityCache = {
          geometry: m.geometry,
          image: rigidImage,
          locks: importedMeshRigidity.locks(m.geometry, rigidImage),
        };
      const data = new Float32Array(m.geometry.uv.length * 2);
      let changed = 0;
      for (let i = 0; i < m.geometry.uv.length / 2; i++) {
        const x = Math.round(m.geometry.uv[i * 2] * 1023),
          y = Math.round(m.geometry.uv[i * 2 + 1] * 1535),
          p = (y * 1024 + x) * 4;
        for (const [id, c] of [
          ['motion', 0],
          ['inset', 1],
          ['emission', 2],
          ['phase', 3],
        ] as const) {
          let v = (maskData.get(id)?.data[p] || 0) / 255;
          if (id === 'motion') v *= 1 - rigidityCache.locks[i];
          data[i * 4 + c] = v;
          if (v > 0) changed++;
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, m.fx);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.guard);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, rigidityCache.locks);
      m.weightData = data;
      canvas.dataset.rigidVertices = String(
        rigidityCache.locks.filter((v) => v > 0.99).length,
      );
      canvas.dataset.activeWeights = String(changed);
    }
    function attributes(m: GPUMesh) {
      for (let i = 0; i < maxAttributes; i++) gl.disableVertexAttribArray(i);
      for (const [key, size] of [
        ['p', 3],
        ['uv', 2],
        ['fx', 4],
        ['guard', 1],
        ['join', 1],
      ] as const) {
        gl.bindBuffer(gl.ARRAY_BUFFER, m[key]);
        if (a[key] >= 0) {
          gl.enableVertexAttribArray(a[key]);
          gl.vertexAttribPointer(a[key], size, gl.FLOAT, false, 0, 0);
        }
      }
    }
    function ensureOwnership(layer: CardLayer | null | undefined) {
      if (
        !layer?.ownershipMask ||
        ownershipData.get(layer.id)?.source === layer.ownershipMask
      )
        return;
      const source = layer.ownershipMask,
        entry: { source: string; image: PixelImage | null } = {
          source,
          image: null,
        };
      ownershipData.set(layer.id, entry);
      const image = new Image();
      image.onload = () => {
        if (ownershipData.get(layer.id) !== entry) return;
        const c = document.createElement('canvas');
        c.width = image.width;
        c.height = image.height;
        const ctx = required(c.getContext('2d', { willReadFrequently: true }));
        ctx.drawImage(image, 0, 0);
        entry.image = ctx.getImageData(0, 0, c.width, c.height);
        draw();
      };
      image.src = source;
    }
    function bindConnection(
      layer: CardLayer | null | undefined,
      m: GPUMesh,
      pl: ReturnType<typeof runtime.placement>,
    ) {
      const viewDocument = doc;
      if (!viewDocument) return;

      const link = layer ? spatial.connection(viewDocument, layer) : null;
      gl.uniform2f(
        u.attachmentParams,
        link ? 1 : 0,
        link
          ? -runtime.placement(viewDocument, link.parent, characterPose)
              .rotation
          : 0,
      );
      if (!link || !layer) {
        gl.uniform4f(u.attachmentTransform, 0, 0, 1, 0);
        return;
      }
      ensureOwnership(layer);
      const parent = runtime.placement(
        viewDocument,
        link.parent,
        characterPose,
      );
      gl.uniform4f(
        u.attachmentTransform,
        parent.x / 1024,
        -parent.y / 1024,
        parent.scale,
        link.parentZ + (parent.z ?? 0),
      );
      const ownership = ownershipData.get(layer.id)?.image,
        coverage = maskData.get('coverage'),
        anchorKey = JSON.stringify(link.anchor);
      let cached = joinBuffers.get(layer.id);
      if (
        !cached ||
        cached.geometry !== m.geometry ||
        cached.ownership !== ownership ||
        cached.coverage !== coverage ||
        cached.width !== link.blendWidth ||
        cached.anchor !== anchorKey ||
        cached.motion !== link.motion ||
        cached.mode !== link.mode ||
        cached.effects !== m.weightData
      ) {
        if (cached)
          for (const key of ['buffer', 'fx', 'guard'] as const)
            if (cached[key]) gl.deleteBuffer(cached[key]);
        const weights = spatial.attachmentWeights(
          m.geometry.uv,
          ownership,
          coverage,
          link.blendWidth,
          link.anchor,
          link.mode,
        );
        cached = {
          geometry: m.geometry,
          ownership,
          coverage,
          width: link.blendWidth,
          anchor: anchorKey,
          motion: link.motion,
          mode: link.mode,
          effects: m.weightData,
          buffer: buffer(weights, gl.ARRAY_BUFFER),
        };
        // Cloth uses root wind independently of parent underpaint; rigid parts keep
        // zero wind and constant attachment weights across their shared plane.
        if (link.motion !== undefined) {
          const effects = m.weightData
            ? new Float32Array(m.weightData)
            : new Float32Array(m.geometry.uv.length * 2);
          for (let i = 0; i < weights.length; i++)
            effects[i * 4] = weights[i] * link.motion;
          cached.fx = buffer(effects, gl.ARRAY_BUFFER);
          cached.guard = buffer(
            new Float32Array(weights.length).fill(
              link.mode === 'rigid' ? 1 : 0,
            ),
            gl.ARRAY_BUFFER,
          );
        }
        joinBuffers.set(layer.id, cached);
      }
      for (const [key, size] of [
        ['join', 1],
        ['fx', 4],
        ['guard', 1],
      ] as const)
        if (a[key] >= 0 && (key === 'join' || cached[key])) {
          gl.bindBuffer(
            gl.ARRAY_BUFFER,
            key === 'join' ? cached.buffer : (cached[key] ?? null),
          );
          gl.vertexAttribPointer(a[key], size, gl.FLOAT, false, 0, 0);
        }
    }
    const cameraDistance = () =>
      external?.camera ?? (doc ? importedCardSpatial.camera(doc) : 2.7);
    const spatial = importedCardSpatial,
      backgroundLayer = (l: CardLayer | null | undefined) =>
        spatial.background(l),
      characterLayer = (l: CardLayer | null | undefined) =>
        spatial.character(l);
    function part(
      layer: CardLayer | null,
      id: string,
      z: number,
      frame = 0,
      foregroundPass = 0,
      motionGain = 1,
    ) {
      const viewDocument = doc;
      if (!viewDocument) return;

      if (viewDocument.material?.style === laserFoil.style)
        gl.uniform3f(
          u.laserSurfaceRole,
          +(
            characterLayer(layer) ||
            layer?.kind === 'text' ||
            importedCardStats.isStat(layer)
          ),
          +maskData.has('subject'),
          +(frame > 0 || layer?.role === 'frame-artwork'),
        );
      gl.uniform1f(
        u.regionMode,
        importedCardPreviewRegion?.pass(viewDocument, layer, region) || 0,
      );
      const rigid =
        frame > 0 ||
        layer?.role === 'frame-artwork' ||
        id === 'back' ||
        (layer &&
          (backgroundLayer(layer) ||
            importedCardStats.isStat(layer) ||
            layer.titleArt));
      const skin = skinned(layer);
      const m =
        skin ||
        (characterLayer(layer)
          ? meshes.get(spatial.rigid(layer) ? 'rigid-quad' : 'foreground')
          : meshes.get(
              frame > 0
                ? frame === 3
                  ? 'frame-aura'
                  : frame === 1
                    ? id === 'frame-back'
                      ? 'frame-rear'
                      : 'frame-rim'
                    : 'sides'
                : rigid
                  ? 'rigid-quad'
                  : 'quad',
            ));
      if (!m) return;
      const texture = textures.get(id) || (textures.get('background') ?? null);
      if (!texture && frame === 0) return;
      attributes(m);
      gl.uniform4f(
        u._cardscapeSourceAlphaBounds,
        ...(sourceBounds.get(textures.has(id) ? id : 'background') ||
          SourceAlphaBounds.full),
      );
      const pl = skin
          ? {
              ...runtime.placement(viewDocument, layer),
              opacity: characterPose?.layers.get(layer?.id || '')?.opacity ?? 1,
            }
          : runtime.placement(viewDocument, layer, characterPose),
        adj = importedCardComponents.adjustments(
          layer?.componentAdjustments ||
            (id === 'back' ? viewDocument.backAdjustments : {}),
          layer?.adjustments,
        );
      if (skin) {
        gl.uniform2f(u.attachmentParams, 2, 0);
        gl.uniform4f(u.attachmentTransform, 0, 0, 1, 0);
      } else bindConnection(layer, m, pl);
      const sp = spatial.resolve(viewDocument, layer || {}),
        isSpatial = spatial.enabled(viewDocument) && !!layer && frame === 0;
      const extent =
        spatial.enabled(viewDocument) && backgroundLayer(layer)
          ? spatial.extent(layer || {}, samplingSize(layer, id))
          : [1.18, 1.18];
      gl.uniform2fv(u.backgroundExtent, extent);
      gl.uniform4f(
        u.spatialParams,
        +isSpatial,
        sp.z,
        isSpatial
          ? (cameraDistance() - sp.z - (pl.z ?? 0)) / (cameraDistance() - 0.045)
          : 1,
        cameraDistance(),
      );
      gl.uniform4f(
        u.transform,
        pl.x / 1024,
        (-pl.y / 1536) * 1.5,
        pl.scale,
        isSpatial ? sp.z + (pl.z ?? 0) : (pl.z ?? z),
      );
      gl.uniform1f(u.layerRotation, -pl.rotation);
      gl.uniform1f(u.clip, pl.clip || (isSpatial && sp.clip) ? 1 : 0);
      gl.uniform1f(
        u.customEffect,
        effectsEnabled &&
          detail.materials &&
          viewDocument.cosmeticPreview?.motion !== false &&
          !importedCardStats.isStat(layer) &&
          (viewDocument.shader.fragmentTarget === 'all' ||
            viewDocument.shader.fragmentTarget === layer?.id)
          ? 1
          : 0,
      );
      gl.uniform1f(u.surfaceChannel, layer?.shaderChannel || 0);
      gl.uniform1f(u.surfaceTransparent, layer?.shaderTransparent ? 1 : 0);
      gl.uniform1f(u.customStrength, viewDocument.shader.fragmentStrength);
      gl.uniform1f(
        u.customMasked,
        viewDocument.shader.fragmentMask === 'none' ? 0 : 1,
      );
      gl.uniform4f(
        u.adjustment,
        (adj.brightness || 0) / 100,
        1 + (adj.contrast || 0) / 100,
        (adj.saturation ?? 100) / 100,
        adj.gamma ?? 1,
      );
      gl.uniform3f(
        u.slotEffect,
        pl.effect === 'pulse' ? 1 : pl.effect === 'flow' ? 2 : 0,
        effectsEnabled &&
          detail.materials &&
          viewDocument.cosmeticPreview?.motion !== false
          ? (pl.strength ?? 0)
          : 0,
        pl.speed ?? 1,
      );
      gl.blendFuncSeparate(
        gl.SRC_ALPHA,
        layer?.blend === 'add' ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA,
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA,
      );
      gl.uniform1f(u.opacity, (layer?.opacity ?? 1) * (pl.opacity ?? 1));
      gl.uniform1f(u.fg, characterLayer(layer) ? 1 : 0);
      gl.uniform1f(u.skinRelief, skin?.skinSource?.depths ? 1 : 0);
      gl.uniform1f(u.foregroundPass, foregroundPass);
      const flutter = layer && foregroundPass
        ? viewDocument.characterEffects?.[characterEffects.motionType(layer, viewDocument.characterEffects)]
        : undefined;
      gl.uniform2f(
        u.characterFlutter,
        effectsEnabled && flutter?.enabled ? flutter.strength * motionGain : 0,
        (flutter?.speed ?? 1) * (2 * Math.PI / 3.6),
      );
      const sweep = importedCardTitle.resolve(
          layer || {},
          viewDocument.locale,
        ).sweep,
        bounds = titleBounds.get(id) || [0, 1];
      gl.uniform4f(
        u.titleSweep,
        effectsEnabled &&
          detail.materials &&
          viewDocument.cosmeticPreview?.title !== false &&
          layer?.titleArt &&
          sweep.enabled
          ? sweep.strength
          : 0,
        sweep.duration,
        sweep.period,
        sweep.width,
      );
      gl.uniform3fv(u.titleColor, frames.rgb(sweep.color));
      gl.uniform2fv(u.titleBounds, bounds);
      gl.uniform1f(u.bg, layer && backgroundLayer(layer) ? 1 : 0);
      gl.uniform1f(u.back, id === 'back' ? 1 : 0);
      gl.uniform1f(u.frame, frame);
      gl.uniform1f(
        u.rigidSurface,
        !!skin ||
          spatial.rigid(layer) ||
          layer?.role === 'frame-artwork' ||
          frame > 0 ||
          id === 'back' ||
          (layer &&
            (backgroundLayer(layer) ||
              importedCardStats.isStat(layer) ||
              layer.titleArt))
          ? 1
          : 0,
      );
      const r = layer && backgroundLayer(layer) ? layer.sourceWindow : null,
        im = samplingSize(layer, id);
      gl.uniform4f(
        u.sourceRect,
        r && im ? r.x / im[0] : 0,
        r && im ? r.y / im[1] : 0,
        r && im ? r.width / im[0] : 1,
        r && im ? r.height / im[1] : 1,
      );
      gl.uniform2f(
        u.shift,
        !spatial.enabled(viewDocument) &&
          layer &&
          backgroundLayer(layer) &&
          layer.role !== 'baseplate'
          ? Math.sin(lastView ? (lastView.yaw * Math.PI) / 180 : yaw) *
              0.045 *
              (viewDocument.effects.background || 0)
          : 0,
        !spatial.enabled(viewDocument) &&
          layer &&
          backgroundLayer(layer) &&
          layer.role !== 'baseplate'
          ? Math.sin(lastView ? (lastView.pitch * Math.PI) / 180 : pitch) *
              0.035 *
              (viewDocument.effects.background || 0)
          : 0,
      );
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(
        gl.TEXTURE_2D,
        textures.get('mask-emission') || (textures.get('mask-default') ?? null),
      );
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(
        gl.TEXTURE_2D,
        textures.get('mask-phase') || (textures.get('mask-default') ?? null),
      );
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(
        gl.TEXTURE_2D,
        textures.get('custom-mask') || (textures.get('mask-default') ?? null),
      );
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(
        gl.TEXTURE_2D,
        textures.get('mask-inset') || (textures.get('mask-default') ?? null),
      );
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(
        gl.TEXTURE_2D,
        textures.get('mask-foil') || (textures.get('mask-default') ?? null),
      );
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(
        gl.TEXTURE_2D,
        textures.get('region-mask') || (textures.get('mask-default') ?? null),
      );
      gl.activeTexture(gl.TEXTURE0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
      gl.drawElements(
        gl.TRIANGLES,
        m.geometry.indices.length,
        gl.UNSIGNED_SHORT,
        0,
      );
      trianglesDrawn += m.geometry.indices.length / 3;
      if (wire && layer?.kind === 'foreground') {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.lines);
        gl.drawElements(gl.LINES, m.lineCount, gl.UNSIGNED_SHORT, 0);
      }
    }

    const componentRenderers = new Map<string, BackRenderer>(),
      materialScenes = new WeakMap<
        SceneMetadata,
        { material: CardDocument['material']; value: SceneMetadata }
      >(),
      frameScenes = new WeakMap<
        SceneMetadata,
        { material: CardDocument['material']; value: SceneMetadata }
      >();
    function scene(
      kind: string,
      value: SceneMetadata,
      facing: number,
      tilt: number,
      act: RuntimeSample,
      w: number,
      h: number,
      layer?: CardLayer | null,
      reverse = false,
      cosmicFront = false,
    ) {
      const viewDocument = doc;
      if (!viewDocument) return;

      if (kind === 'particles' && !detail.particles) {
        canvas.dataset.particleCount = '0';
        return;
      }
      if (['effect', 'material'].includes(kind) && !detail.materials) return;
      if (
        kind === 'material' &&
        !importedCardComponents.hasMaterialImages(value)
      ) {
        canvas.dataset.componentMaterialReady = 'true';
        return;
      }
      const depthEnabled = gl.isEnabled(gl.DEPTH_TEST),
        writeDepth = gl.getParameter(gl.DEPTH_WRITEMASK);
      let renderer = componentRenderers.get(kind);
      if (!renderer) {
        renderer = bindings.CardBackRenderer.create(
          gl,
          draw,
          (message) => (info.textContent = message),
        );
        componentRenderers.set(kind, renderer);
      }
      const pl = layer
        ? runtime.placement(viewDocument, layer, characterPose)
        : { x: 0, y: 0, scale: 1 };
      if (kind === 'material' && value.document) {
        let cached = materialScenes.get(value);
        if (!cached || cached.material !== viewDocument.material) {
          const target = importedCardComponents.material(viewDocument.material);
          cached = {
            material: viewDocument.material,
            value: {
              ...value,
              document: {
                ...value.document,
                material: { ...target, target: 'artwork' },
                spatial: { ...value.document.spatial, enabled: true },
                layers: (value.document.layers || []).map((l) => ({
                  ...l,
                  spatial: {
                    ...l.spatial,
                    clip: true,
                    z: importedCardComponents.materialDepth(l),
                  },
                })),
              },
            },
          };
          materialScenes.set(value, cached);
        }
        value = cached.value;
      }
      if (
        kind === 'frame' &&
        value.document &&
        viewDocument.material?.enabled &&
        viewDocument.material.target === 'front'
      ) {
        let cached = frameScenes.get(value);
        if (!cached || cached.material !== viewDocument.material) {
          cached = {
            material: viewDocument.material,
            value: {
              ...value,
              document: {
                ...value.document,
                material: importedCardComponents.material(
                  viewDocument.material,
                ),
              },
            },
          };
          frameScenes.set(value, cached);
        }
        value = cached.value;
      }
      const result = renderer.draw(value, {
        reverse,
        plane: reverse ? required(frameGeometry).back : 0,
        angle: [facing, tilt],
        root: [
          act.x / 1024 + (pl.x / 1024) * act.scale,
          -act.y / 1024 - (pl.y / 1024) * act.scale,
          act.z,
          act.scale * pl.scale,
          act.opacity * (layer?.opacity ?? 1),
        ],
        aspect: w / h,
        viewportZoom: external?.viewportZoom ?? viewZoom,
        camera: cameraDistance(),
        time,
        particleRevealTime: time - particleRevealStart,
        effects: effectsEnabled,
        emitterContext: emitterContext || viewDocument,
        particleConfig:
          kind === 'particles' ? viewDocument.particles : undefined,
        cosmicFront,
        detail,
      });
      if (kind === 'particles') {
        ambientParticleCount = result.particles || 0;
        canvas.dataset.particleCount = String(result.particles || 0);
        canvas.dataset.emitterState = result.emitterState || '';
        Object.assign(canvas.dataset, result.particleStats || {});
      }
      trianglesDrawn += result.triangles;
      canvas.dataset[
        'component' + kind[0].toUpperCase() + kind.slice(1) + 'Ready'
      ] = String(result.loaded);
      for (const [key, value] of Object.entries({
        instances: result.instances,
        updates: result.updates,
        pending: result.pending,
        error: result.error,
      }))
        if (value !== undefined)
          canvas.dataset[
            'component' +
              kind[0].toUpperCase() +
              kind.slice(1) +
              key[0].toUpperCase() +
              key.slice(1)
          ] = String(value);
      gl.useProgram(program);
      if (!depthEnabled) gl.disable(gl.DEPTH_TEST);
      gl.depthMask(writeDepth);
    }
    const backRenderer = embedded
      ? null
      : bindings.CardBackRenderer.create(gl, draw, (message) => {
          info.textContent = message;
        });
    const B = importedCardParticleBatch,
      particleProgram = required(gl.createProgram()),
      particleBuffer = required(gl.createBuffer()),
      particleSamples = new Float32Array(256 * 7),
      particleKinds = new Float32Array(256),
      particleWorldFrames = new Float64Array(256 * 6),
      particleVertices = new Float32Array(256 * 6 * B.stride);
    const pv = shader(gl.VERTEX_SHADER, B.vertex),
      pf = shader(gl.FRAGMENT_SHADER, B.fragment);
    gl.attachShader(particleProgram, pv);
    gl.attachShader(particleProgram, pf);
    gl.linkProgram(particleProgram);
    gl.deleteShader(pv);
    gl.deleteShader(pf);
    if (!gl.getProgramParameter(particleProgram, gl.LINK_STATUS))
      throw Error(
        gl.getProgramInfoLog(particleProgram) || '粒子 Program 链接失败',
      );
    const pa = gl.getAttribLocation(particleProgram, 'point'),
      ps = gl.getAttribLocation(particleProgram, 'style'),
      pc = gl.getAttribLocation(particleProgram, 'corner'),
      pu = Object.fromEntries(
        [
          'angle',
          'rootTransform',
          'aspect',
          'color',
          'rootOpacity',
          'cameraDistance',
          'visual',
          'rainbow',
          'stretch',
          'spriteTex',
          'spriteTint',
          'particleTime',
          'particleSpeed',
          'revealStretch',
          'cosmicPass',
          'layerOffset',
        ].map((n) => [n, gl.getUniformLocation(particleProgram, n)]),
      );
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      particleVertices.byteLength,
      gl.DYNAMIC_DRAW,
    );
    type ParticleSprite = {
      src: string;
      texture: WebGLTexture | null;
      state: string;
    };
    let particleSprite: ParticleSprite = {
      src: '',
      texture: null,
      state: 'empty',
    };
    const particleSprites = new Map<string, ParticleSprite>();
    function spriteTexture(
      config: ReturnType<typeof importedCardComponents.particles>,
    ) {
      if (config.visual !== 'sprite') return true;
      const cached = particleSprites.get(config.sprite);
      if (cached) {
        particleSprite = cached;
        return cached.state === 'ready';
      }
      const entry: ParticleSprite = {
        src: config.sprite,
        texture: null,
        state: 'loading',
      };
      particleSprite = entry;
      particleSprites.set(config.sprite, entry);
      if (particleSprites.size > 64) {
        const [key, old] = required(particleSprites.entries().next().value);
        if (old.texture) gl.deleteTexture(old.texture);
        particleSprites.delete(key);
      }
      const im = new Image();
      im.onload = () => {
        if (disposed || particleSprites.get(config.sprite) !== entry) return;
        if (im.width > 512 || im.height > 512) {
          entry.state = 'error';
          draw();
          return;
        }
        const activeUnit = gl.getParameter(gl.ACTIVE_TEXTURE);
        gl.activeTexture(gl.TEXTURE0);
        const binding = gl.getParameter(gl.TEXTURE_BINDING_2D);
        entry.texture = required(gl.createTexture());
        gl.bindTexture(gl.TEXTURE_2D, entry.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
        gl.bindTexture(gl.TEXTURE_2D, binding);
        gl.activeTexture(activeUnit);
        entry.state = 'ready';
        draw();
      };
      im.onerror = () => {
        if (disposed || particleSprites.get(config.sprite) !== entry) return;
        entry.state = 'error';
        draw();
      };
      im.src = config.sprite;
      return false;
    }
    let particleCachedCount = 0;
    let ambientParticleCount = 0;
    let actionParticleGroups: Array<{
      event: ActionParticleEvent;
      age: number;
    }> = [];
    function drawParticles(
      facing: number,
      tilt: number,
      act: RuntimeSample,
      w: number,
      h: number,
      cosmicFront = false,
      group?: { event: ActionParticleEvent; age: number },
    ) {
      const viewDocument = doc;
      if (!viewDocument) return;

      if (!detail.particles) {
        canvas.dataset.particleCount = '0';
        canvas.dataset.particleDrawCalls = '0';
        return;
      }
      if (viewDocument.componentScenes?.particles && !group) return;
      const started = performance.now(),
        config = importedCardComponents.particles(
          (group?.event.trail
            ? { ...group.event.particles, visual: 'streak', palette: 'solid' }
            : group?.event.particles) ||
            external?.particleConfig ||
            viewDocument.particles,
        ),
        context = external?.emitterContext || emitterContext || viewDocument,
        resolved = importedCardComponents.resolveEmitter(config, context),
        limit = Math.floor(
          importedCardCosmetics.budget(
            viewDocument.cosmetics?.quality,
            external?.visibleCards,
          ).particles /
            (1 + actionParticleGroups.length),
        ),
        count = group
          ? effectsEnabled && spriteTexture(config)
            ? importedCardComponents.sampleEventInto(
                group.event,
                group.age,
                viewDocument,
                facing,
                characterPose ||
                  (group.event.boneId
                    ? importedCardCharacterAnimation.rest(viewDocument)
                    : null),
                particleSamples,
                particleKinds,
                limit,
                (birth, boneId) =>
                  sampleParticleBirth(
                    group.event.at * (particleBirthAction?.duration || 1) +
                      birth,
                    boneId,
                  ),
                (birth) =>
                  sampleParticleWorld(
                    group.event.at * (particleBirthAction?.duration || 1) +
                      birth,
                  ),
                cosmicFront && group.event.simulationSpace === 'world'
                  ? resolved.reverse
                    ? -0.2
                    : 0.2
                  : 0,
                cameraDistance(),
                particleWorldFrames,
                group.event.physics
                  ? (particlePhysicsCache ||=
                      importedCardComponents.createPhysicsCache())
                  : undefined,
              )
            : 0
          : cosmicFront
            ? particleCachedCount
            : effectsEnabled && spriteTexture(config)
              ? importedCardComponents.sampleCompositionInto(
                  config,
                  time,
                  context,
                  facing,
                  particleSamples,
                  particleKinds,
                  limit,
                  external?.particleRevealTime ?? time - particleRevealStart,
                )
              : 0;
      const ribbon = !!group?.event.trail,
        quads = ribbon ? Math.max(0, count - 1) : count;
      if (!cosmicFront && !group) particleCachedCount = count;
      if (!cosmicFront && !group) ambientParticleCount = count;
      let revealCount = 0;
      for (let i = 0; i < count; i++) if (particleKinds[i] >= 0) revealCount++;
      Object.assign(canvas.dataset, {
        emitterState: resolved.ok ? 'ready' : resolved.reason,
        particleCount: String(quads),
        particleRevealTime: String(
          external?.particleRevealTime ?? time - particleRevealStart,
        ),
        particleRevealCount: String(revealCount),
        particleVisual: config.visual,
        particlePalette: config.palette,
        particleDrawCalls: count ? (cosmicFront ? '2' : '1') : '0',
        particleUploadBytes: String(quads * 6 * B.stride * 4),
        particleBufferBytes: String(particleVertices.byteLength),
        particleBudget: String(limit),
        particleSpriteState:
          config.visual === 'sprite' ? particleSprite.state : 'unused',
        particleBlend: config.blend,
        particlePlacement: config.placement,
        particleSource: resolved.target || '',
        particleSourceReverse: String(!!resolved.reverse),
        particleDepthMode: 'source-depth',
        particleTrajectory: config.trajectory,
        particleRadius: String(config.radius),
        particleOpacity: String(config.opacity),
      });
      if (group && !cosmicFront)
        canvas.dataset.particleEventParticles = String(
          Number(canvas.dataset.particleEventParticles || 0) + quads,
        );
      if (
        group &&
        !cosmicFront &&
        canvas.dataset.particleDiagnostics === 'true'
      ) {
        const samples = JSON.parse(
          canvas.dataset.particleEventSamples || '{}',
        ) as Record<string, number[]>;
        samples[group.event.id] = Array.from(
          particleSamples.subarray(0, count * 7),
        );
        canvas.dataset.particleEventSamples = JSON.stringify(samples);
      }
      if (!count) return;
      const length =
        cosmicFront && !group
          ? count * 6 * B.stride
          : ribbon
            ? B.packTrail(
                particleSamples,
                count,
                particleVertices,
                group?.event.simulationSpace === 'world'
                  ? particleWorldFrames
                  : undefined,
              )
            : B.pack(particleSamples, count, particleVertices, particleKinds);
      if (ribbon && canvas.dataset.particleDiagnostics === 'true') {
        const meshes = JSON.parse(
          canvas.dataset.particleTrailVertices || '{}',
        ) as Record<string, number[]>;
        meshes[group!.event.id] = Array.from(
          particleVertices.subarray(0, length),
        );
        canvas.dataset.particleTrailVertices = JSON.stringify(meshes);
      }
      for (let i = 0; i < maxAttributes; i++) gl.disableVertexAttribArray(i);
      gl.useProgram(particleProgram);
      gl.depthMask(false);
      gl.blendFuncSeparate(
        gl.SRC_ALPHA,
        config.blend === 'normal' ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE,
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA,
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
      if (!cosmicFront || group)
        gl.bufferSubData(
          gl.ARRAY_BUFFER,
          0,
          particleVertices.subarray(0, length),
        );
      for (const [loc, size, offset] of [
        [pa, 4, 0],
        [ps, 4, 16],
        [pc, 2, 32],
      ] as const) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(
          loc,
          size,
          gl.FLOAT,
          false,
          B.stride * 4,
          offset,
        );
      }
      const world = group?.event.simulationSpace === 'world';
      gl.uniform2f(pu.angle, world ? 0 : facing, world ? 0 : tilt);
      gl.uniform4f(
        pu.rootTransform,
        world ? 0 : act.x / 1024,
        world ? 0 : -act.y / 1024,
        world ? 0 : act.z,
        world ? 1 : act.scale,
      );
      gl.uniform1f(pu.cameraDistance, cameraDistance());
      gl.uniform1f(pu.aspect, w / h);
      gl.uniform3fv(pu.color, frames.rgb(config.color));
      gl.uniform1f(pu.rootOpacity, world ? 1 : act.opacity);
      gl.uniform1f(pu.visual, B.visuals.indexOf(config.visual));
      gl.uniform1f(pu.rainbow, config.palette === 'rainbow' ? 1 : 0);
      gl.uniform1f(pu.stretch, config.stretch);
      gl.uniform1f(pu.particleTime, group?.age ?? time);
      gl.uniform1f(pu.particleSpeed, config.speed);
      gl.uniform1f(
        pu.layerOffset,
        cosmicFront && !world ? (resolved.reverse ? -0.2 : 0.2) : 0,
      );
      gl.uniform1f(
        pu.cosmicPass,
        config.visual === 'cosmic' && config.placement === 'behind'
          ? cosmicFront
            ? 1
            : -1
          : 0,
      );
      gl.uniform1f(pu.revealStretch, config.reveal.stretch);
      gl.uniform1f(pu.spriteTint, config.spriteTint ? 1 : 0);
      gl.uniform1i(pu.spriteTex, 0);
      if (config.visual === 'sprite') {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, particleSprite.texture);
      }
      gl.drawArrays(gl.TRIANGLES, 0, quads * 6);
      trianglesDrawn += quads * 2;
      for (const loc of [pa, ps, pc] as const) gl.disableVertexAttribArray(loc);
      gl.depthMask(true);
      gl.blendFuncSeparate(
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA,
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA,
      );
      gl.useProgram(program);
      canvas.dataset.particleCpuMs = (performance.now() - started).toFixed(3);
    }

    function draw() {
      const viewDocument = doc;
      if (!viewDocument) return;

      if (
        updateDepth ||
        disposed ||
        (embedded && !external) ||
        !generic ||
        !viewDocument ||
        !active
      )
        return;
      const renderStarted = performance.now();
      trianglesDrawn = 0;
      const w =
          external?.width ||
          Math.round(
            canvas.clientWidth *
              Math.min(
                devicePixelRatio,
                importedCardCosmetics.budget(viewDocument.cosmetics?.quality)
                  .dpr,
              ),
          ),
        h =
          external?.height ||
          Math.round(
            canvas.clientHeight *
              Math.min(
                devicePixelRatio,
                importedCardCosmetics.budget(viewDocument.cosmetics?.quality)
                  .dpr,
              ),
          );
      if (!w || !h) return;
      if (
        !embedded &&
        !capturing &&
        (canvas.width !== w || canvas.height !== h)
      ) {
        canvas.width = w;
        canvas.height = h;
      }
      const zoom = external?.viewportZoom ?? viewZoom;
      gl.viewport(
        Math.round((w * (1 - zoom)) / 2),
        Math.round((h * (1 - zoom)) / 2),
        Math.round(w * zoom),
        Math.round(h * zoom),
      );
      canvas.dataset.viewZoom = String(zoom);
      if (!embedded) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      }
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA,
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA,
      );
      gl.useProgram(program);
      const elapsed = playing ? Math.max(0, time - playing.start) : time,
        targetSample = runtime.action(
          playing?.draft
            ? {
                ...viewDocument,
                actions: viewDocument.actions.map((a) =>
                  a.id === playing?.id ? playing.draft || a : a,
                ),
              }
            : viewDocument,
          playing?.id || 'idle',
          elapsed,
          { seek: !!playing?.paused },
        ),
        targetAction =
          playing?.draft ||
          viewDocument.actions.find((a) => a.id === targetSample.id),
        fade = actionTransition
          ? Math.min(1, actionTransition.seconds / actionTransition.duration)
          : 1,
        effectiveAction =
          actionTransition && targetAction
            ? runtime.blendActions(
                actionTransition.from,
                runtime.snapshotAction(
                  viewDocument,
                  targetAction,
                  elapsed,
                  !!playing?.paused,
                ),
                fade * fade * (3 - 2 * fade),
              )
            : targetAction,
        effectiveSeconds = actionTransition ? 0 : elapsed,
        sampled =
          actionTransition && effectiveAction
            ? {
                ...runtime.action(
                  { actions: [effectiveAction] },
                  effectiveAction.id,
                  0,
                ),
                id: targetSample.id,
                event: targetSample.event,
                progress: targetSample.progress,
                done: targetSample.done,
              }
            : targetSample,
        scan = inspection
          ? importedCardInspection.sample(inspection, inspectionTime)
          : null,
        act = scan
          ? {
              ...sampled,
              x: scan.x,
              y: scan.y,
              z: 0,
              scale: 1,
              opacity: 1,
              rotation: 0,
              pitch: 0,
              bend: 0,
            }
          : sampled;
      characterPose =
        effectsEnabled && viewDocument.cosmeticPreview?.motion !== false
          ? sampleCharacterCached(
              playing?.draft || effectiveAction,
              effectiveSeconds,
              !!playing?.paused,
            )
          : null;
      if (!capturing)
        actionAudio.sync(
          playing ? targetAction || null : null,
          elapsed,
          !!playing && !playing.paused && effectsEnabled && !document.hidden,
        );
      renderedAction = effectiveAction
        ? {
            clip: effectiveAction,
            seconds: effectiveSeconds,
            seek: !!playing?.paused,
          }
        : null;
      canvas.dataset.actionTransition = String(actionTransition ? fade : 1);
      if (fade >= 1) actionTransition = null;
      canvas.dataset.characterPose = JSON.stringify(
        characterPose
          ? [...characterPose.bones].map(([id, p]) => ({
              id,
              matrix: p.matrix,
              opacity: p.opacity,
            }))
          : [],
      );
      if (playing && act.done && !playing.paused && fade >= 1) {
        if (act.event === 'enter') playing.completed = true;
        else {
          playing.paused = true;
        }
      }
      const tween = poseTween
        ? importedCardInspection.poseTransition(
            poseTween.from,
            poseTween.to,
            poseTween.seconds,
            poseTween.duration,
          )
        : null;
      if (tween?.done) {
        yaw = (required(poseTween).to.yaw * Math.PI) / 180;
        pitch = (required(poseTween).to.pitch * Math.PI) / 180;
        poseTween = null;
      }
      let facing = tween
          ? (tween.yaw * Math.PI) / 180
          : scan
            ? required(inspection).yaw + (scan.yaw * Math.PI) / 180
            : playing
              ? playing.yaw + act.rotation
              : yaw,
        tilt = tween
          ? (tween.pitch * Math.PI) / 180
          : scan
            ? required(inspection).pitch + (scan.pitch * Math.PI) / 180
            : playing
              ? playing.pitch + act.pitch
              : pitch;
      if (external) {
        facing = external.angle[0] + act.rotation;
        tilt = external.angle[1] + act.pitch;
        const r = external.root;
        act.x = act.x * r[3] + r[0] * 1024;
        act.y = act.y * r[3] - r[1] * 1024;
        act.z = act.z * r[3] + r[2];
        act.scale *= r[3];
        act.opacity *= r[4] ?? 1;
      }
      lastView = {
        yaw: (facing * 180) / Math.PI,
        pitch: (tilt * 180) / Math.PI,
        root: [act.x / 1024, -act.y / 1024, act.z, act.scale],
      };
      updateDetail(zoom, act.scale, act.z);
      actionParticleGroups = importedCardComponents.actionParticleEvents(
        targetAction,
        targetSample.progress,
      );
      particleBirthAction = targetAction;
      if (targetAction?.particleEvents?.some((e) => e.simulationSpace === 'world')) {
        const r = external?.root || [0, 0, 0, 1, 1];
        const base: ParticleWorldPose = {
          angle: [facing - act.rotation, tilt - act.pitch],
          root: scan
            ? [act.x / 1024, -act.y / 1024, act.z, act.scale, act.opacity]
            : [r[0], r[1], r[2], r[3], r[4] ?? 1],
        };
        if (!capturing) {
          const source = JSON.stringify([
            viewDocument.id,
            targetAction.id,
            targetAction.duration,
            targetAction.tracks,
          ]);
          if (source !== particleWorldSource) {
            particleWorldSource = source;
            particleWorldHistory.clear();
          }
          particleWorldHistory.record(elapsed + particleWorldTimeOffset, base);
        }
        const offset = capturing ? 0 : particleWorldTimeOffset;
        const cycle =
          elapsed + offset - targetSample.progress * targetAction.duration;
        const sampler = capturing ? null : external?.sampleParticleWorld || particleWorldSampler;
        sampleParticleWorld = (seconds) => {
          const at = cycle + seconds;
          const placement = capturing ? base : particleWorldHistory.sample(at) || base;
          const sample = scan
            ? { x: 0, y: 0, z: 0, scale: 1, opacity: 1, rotation: 0, pitch: 0 }
            : runtime.action(
                { actions: [targetAction] },
                targetAction.id,
                seconds,
                { seek: true },
              );
          const fallback: ParticleWorldPose = {
            angle: [
              placement.angle[0] + sample.rotation,
              placement.angle[1] + sample.pitch,
            ],
            root: [
              placement.root[0] + (sample.x / 1024) * placement.root[3],
              placement.root[1] - (sample.y / 1024) * placement.root[3],
              placement.root[2] + sample.z * placement.root[3],
              placement.root[3] * sample.scale,
              placement.root[4] * sample.opacity,
            ],
          };
          return sampler ? sampler(targetAction.id, at, fallback) : fallback;
        };
        canvas.dataset.particleWorldHistory = String(particleWorldHistory.size);
      }
      if (
        actionParticleGroups.some(
          (g) =>
            g.event.simulationSpace === 'card' ||
            g.event.simulationSpace === 'world' ||
            g.event.trail,
        )
      ) {
        const source = JSON.stringify([
          targetAction?.duration,
          targetAction?.boneTracks,
          targetAction?.ikTracks,
          viewDocument.characterRig?.bones,
          viewDocument.characterRig?.constraints,
        ]);
        if (source !== particleBirthSource) {
          particleBirthSource = source;
          particleBirthCache.clear();
        }
      }
      ambientParticleCount = 0;
      canvas.dataset.particleEventCount = String(actionParticleGroups.length);
      canvas.dataset.particleEventParticles = '0';
      if (canvas.dataset.particleDiagnostics === 'true') {
        canvas.dataset.particleEventSamples = '{}';
        canvas.dataset.particleTrailVertices = '{}';
      }
      canvas.dataset.particleEvents = JSON.stringify(
        actionParticleGroups.map((g) => ({ id: g.event.id, age: g.age })),
      );
      const eventInFront = (group: { event: ActionParticleEvent }) =>
        ['front', 'surface'].includes(group.event.particles.placement);
      for (const group of actionParticleGroups.filter((g) => !eventInFront(g)))
        drawParticles(facing, tilt, act, w, h, false, group);
      if (external?.cosmicFront) {
        drawParticles(facing, tilt, act, w, h, true);
        return;
      }
      const particleConfig = importedCardComponents.particles(
          external?.particleConfig || viewDocument.particles,
        ),
        cosmicParticles =
          particleConfig.visual === 'cosmic' &&
          particleConfig.placement === 'behind',
        frontParticles =
          ['front', 'surface'].includes(particleConfig.placement) &&
          importedCardComponents.emitter(particleConfig.emitter).target !==
            'back',
        backParticles =
          !embedded &&
          importedCardComponents.emitter(viewDocument.particles?.emitter)
            .target === 'back' &&
          Math.cos(facing) * Math.cos(tilt) < 0;
      if (!backParticles && !frontParticles) {
        if (!embedded && viewDocument.componentScenes?.particles)
          scene(
            'particles',
            viewDocument.componentScenes.particles,
            facing,
            tilt,
            act,
            w,
            h,
          );
        drawParticles(facing, tilt, act, w, h);
      }
      const material = {
        ...importedCardComponents.material(viewDocument.material),
      };
      if (!detail.materials) {
        material.enabled = false;
        material.backgroundMode = 'overlay';
      }
      gl.uniform4f(
        u.componentMaterial,
        effectsEnabled && material.enabled ? material.strength : 0,
        material.speed,
        material.frequency,
        viewDocument.assetKind === 'back' ||
          viewDocument.assetKind === 'material'
          ? 5
          : material.target === 'background'
            ? 1
            : material.target === 'back'
              ? 2
              : material.target === 'front'
                ? 3
                : material.target === 'artwork'
                  ? 4
                  : 0,
      );
      gl.uniform1f(
        u.materialReplace,
        material.backgroundMode === 'replace' ? 1 : 0,
      );
      canvas.dataset.materialTarget = material.target;
      canvas.dataset.materialBackgroundMode = material.backgroundMode;
      gl.uniform1f(
        u.materialStyle,
        Math.max(
          0,
          importedCardComponents.materialStyles.indexOf(material.style),
        ),
      );
      gl.uniform3fv(u.materialColor, frames.rgb(material.color));
      gl.uniform3fv(u.materialAccent, frames.rgb(material.accent));
      if (material.style === laserFoil.style) {
        const laser = laserFoil.uniforms(material);
        gl.uniform4f(u.laserControls, ...laser.controls);
        gl.uniform4f(u.laserModes, ...laser.mode);
        gl.uniform3f(u.laserOverlays, ...laser.overlays);
        gl.uniform3f(u.laserOverlayGains, ...laser.overlayGains);
        gl.uniform2f(u.laserSignatureAnchor, ...laser.anchor);
        canvas.dataset.laserPattern = material.laser?.pattern || '';
      } else delete canvas.dataset.laserPattern;
      canvas.dataset.materialStyle = material.enabled ? material.style : 'none';
      gl.uniform2f(u.angle, facing, tilt);
      gl.uniform4f(
        u.rootTransform,
        act.x / 1024,
        -act.y / 1024,
        act.z,
        act.scale,
      );
      const surfaceEye = runtime.cameraInCard(
        facing,
        tilt,
        [act.x / 1024, -act.y / 1024, act.z, act.scale],
        cameraDistance(),
      );
      gl.uniform3fv(u.cardEye, surfaceEye);
      gl.uniform3fv(u.surfaceEye, surfaceEye);
      const pop = viewDocument.composition;
      gl.uniform4f(u.popOutSides, +pop.top, +pop.right, +pop.bottom, +pop.left);
      const armor = viewDocument.armor;
      gl.uniform4f(
        u.armorSweep,
        effectsEnabled && detail.materials && armor.enabled
          ? armor.strength
          : 0,
        armor.duration,
        armor.period,
        armor.width,
      );
      gl.uniform3fv(u.armorColor, frames.rgb(armor.color));
      gl.uniform1f(u.rootOpacity, act.opacity);
      gl.uniform1f(u.aspect, w / h);
      gl.uniform1f(u.depth, viewDocument.effects.depth ?? 0);
      gl.uniform1f(u.t, effectsEnabled ? time : 0);
      gl.uniform1f(
        u.moving,
        effectsEnabled && !viewDocument.characterEffects
          ? (viewDocument.effects.cape ? 1 : 0) *
              viewDocument.deformation.wind *
              act.motion
          : 0,
      );
      const glow = viewDocument.characterEffects?.glow;
      gl.uniform3fv(u.flowColor, glow ? frames.rgb(glow.color) : [.45, .77, 1]);
      gl.uniform1f(u.flowSpeed, glow ? glow.speed * (2 * Math.PI / 3.6 / 3.1) : viewDocument.effects.flowSpeed ?? 1);
      gl.uniform1f(
        u.flow,
        effectsEnabled && detail.materials
          ? (glow ? (glow.enabled ? glow.strength : 0) : +!!viewDocument.effects.flow) * act.emission
          : 0,
      );
      gl.uniform1f(
        u.bend,
        viewDocument.deformation.bend +
          (viewDocument.cosmeticPreview?.motion === false ? 0 : act.bend),
      );
      const style = frames.resolve(viewDocument);
      gl.uniform4fv(u.popOutBounds, runtime.popOutBounds(style));
      gl.uniform2fv(u.contourCounts, contourData.counts);
      contourFieldRenderer.bind(style, u);
      if (style.contour) gl.uniform4fv(u['contourEdges[0]'], contourData.edges);
      gl.uniform3fv(u.frameColor, frames.rgb(style.color));
      gl.uniform3fv(u.frameAccent, frames.rgb(style.accent));
      gl.uniform1f(
        u.frameFinish,
        frames.finishes.indexOf(
          detail.materials
            ? style.finish
            : style.finish === 'flat'
              ? 'flat'
              : 'metal',
        ),
      );
      gl.uniform2f(
        u.frameAnimation,
        effectsEnabled && detail.materials
          ? frames.animations.indexOf(style.animation)
          : 0,
        style.animationSpeed,
      );
      canvas.dataset.frameAnimation = style.animation;
      canvas.dataset.previewLevel =
        viewDocument.cosmeticPreview?.level || 'authored';
      canvas.dataset.renderQuality =
        viewDocument.cosmetics?.quality || 'balanced';
      gl.uniform4f(
        u.frameMetrics,
        style.width / 1024,
        style.corner / 1024,
        style.depth / 1024,
        frames.bevel(style) / 1024,
      );
      gl.uniform1f(u.windSpeed, viewDocument.deformation.speed);
      gl.uniform1i(u.tex, 0);
      gl.uniform1i(u.emissionTex, 1);
      gl.uniform1i(u.phaseTex, 2);
      gl.uniform1i(u.insetTex, 4);
      gl.uniform1i(u.foilTex, 5);
      gl.uniform1i(u.customMaskTex, 3);
      gl.uniform1i(u.regionTex, 6);
      const front = Math.cos(facing) * Math.cos(tilt) > 0.03;
      const baseLayers = importedCardStats.paintOrder(viewDocument.layers);
      const ordered = characterEffects.order(
        runtime.orderedLayers(baseLayers, effectiveAction, sampled.progress),
        viewDocument.characterEffects?.wordmark,
      );
      canvas.dataset.drawOrder = JSON.stringify(ordered.map((l) => l.id));
      const layers = ordered.filter(
          (l) =>
            l.visible &&
            (!importedCardExportProfile ||
              importedCardExportProfile.visible(
                exportPolicy(),
                l.id,
                detail.level,
              )),
        ),
        frameLayer = layers.find((l) => l.kind === 'frame');
      if (!front) {
        if (viewDocument.backScene && backRenderer) {
          const reverse = backRenderer.draw(viewDocument.backScene, {
            angle: [facing, tilt],
            root: [act.x / 1024, -act.y / 1024, act.z, act.scale, act.opacity],
            aspect: w / h,
            viewportZoom: external?.viewportZoom ?? viewZoom,
            camera: cameraDistance(),
            eye: runtime.cameraInCard(
              facing,
              tilt,
              [act.x / 1024, -act.y / 1024, act.z, act.scale],
              cameraDistance(),
            ),
            plane: required(frameGeometry).back,
            style,
            time,
            effects: effectsEnabled,
            detail,
          });
          trianglesDrawn += reverse.triangles;
          Object.assign(canvas.dataset, {
            backLayers: String(reverse.count),
            backReady: String(reverse.loaded),
            backInstances: String(reverse.instances || 0),
            backUpdates: String(reverse.updates || 0),
            backPending: String(!!reverse.pending),
            backParallax: String(viewDocument.backScene.parallax),
            backMaterial: viewDocument.backScene.material?.enabled
              ? viewDocument.backScene.material?.style
              : 'none',
            backIsolated: 'true',
            backAuthored: String(!!viewDocument.backScene.document),
            backEffectTime: String(reverse.time ?? time),
            backMotionGain: String(reverse.motion ?? 0),
            backEmissionGain: String(reverse.emission ?? 0),
            backShader: reverse.shader || 'legacy',
          });
          gl.useProgram(program);
        } else {
          part(null, 'back', required(frameGeometry).back + 0.002);
          Object.assign(canvas.dataset, {
            backLayers: '1',
            backParallax: '0',
            backMaterial: 'legacy',
            backIsolated: 'true',
          });
        }
        if (frameLayer) {
          if (!viewDocument.backScene?.document)
            part(frameLayer, 'frame-back', 0, 1);
          part(frameLayer, 'sides', 0, 2);
        }
        if (
          !embedded &&
          viewDocument.componentScenes?.material &&
          material.enabled &&
          ['back', 'both'].includes(material.target)
        )
          scene(
            'material',
            viewDocument.componentScenes.material,
            facing,
            tilt,
            act,
            w,
            h,
            null,
            true,
          );
      } else {
        let backgroundOrder = 0;
        const replacementOwner = spatial.replacementBackground(
          viewDocument,
          effectsEnabled ? material : null,
        );
        canvas.dataset.backgroundReplacementOwner = replacementOwner || '';
        canvas.dataset.backgroundSurfaceCount = String(
          layers
            .filter(backgroundLayer)
            .filter(
              (l) =>
                !replacementOwner ||
                l.id === replacementOwner ||
                l.role === 'baseplate',
            ).length,
        );
        for (const layer of layers
          .filter(backgroundLayer)
          .filter(
            (l) =>
              !replacementOwner ||
              l.id === replacementOwner ||
              l.role === 'baseplate',
          )
          .sort((a, b) =>
            spatial.enabled(viewDocument)
              ? spatial.resolve(viewDocument, a).z -
                spatial.resolve(viewDocument, b).z
              : 0,
          )) {
          const kind =
            layer.kind === 'background'
              ? 'background'
              : layer.role === 'baseplate'
                ? 'base'
                : null;
          if (!embedded && kind && viewDocument.componentScenes?.[kind])
            scene(
              kind,
              viewDocument.componentScenes[kind],
              facing,
              tilt,
              act,
              w,
              h,
              layer,
            );
          else
            part(
              layer,
              layer.kind === 'background' ? 'background' : layer.id,
              frames.depths(style).background + backgroundOrder++ * 0.00001,
            );
        }
        if (
          !embedded &&
          material.enabled &&
          viewDocument.componentScenes?.material &&
          material.target !== 'back'
        ) {
          gl.disable(gl.DEPTH_TEST);
          gl.depthMask(false);
          scene(
            'material',
            viewDocument.componentScenes.material,
            facing,
            tilt,
            act,
            w,
            h,
          );
          gl.enable(gl.DEPTH_TEST);
          gl.depthMask(true);
        }
        for (const layer of layers.filter((l) => l.kind === 'frame')) {
          if (!embedded && viewDocument.componentScenes?.frame)
            scene(
              'frame',
              viewDocument.componentScenes.frame,
              facing,
              tilt,
              act,
              w,
              h,
              layer,
            );
          else {
            if (detail.materials && frames.hasAura(style))
              part(layer, 'frame-aura', 0, 3);
            part(layer, 'frame', 0, 1);
            part(layer, 'sides', 0, 2);
          }
        }
        // The frame is already present. The two disjoint aperture masks keep inner
        // artwork behind its rim and let breakout artwork cross it. Painter order
        // controls all content overlaps; physical Z still controls camera parallax.
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        let order = 0;
        for (const layer of layers.filter(
          (l) => l.kind !== 'frame' && !backgroundLayer(l),
        )) {
          if (characterLayer(layer)) {
            const id = layer.kind === 'foreground' ? 'foreground' : layer.id;
            part(layer, id, 0, 0, 1, act.motion);
            if (viewDocument.characterEffects?.breakout.enabled !== false)
              part(layer, id, 0, 0, 2, act.motion);
          } else if (
            !embedded &&
            layer.role === 'baseplate' &&
            viewDocument.componentScenes?.base
          )
            scene(
              'base',
              viewDocument.componentScenes.base,
              facing,
              tilt,
              act,
              w,
              h,
              layer,
            );
          else part(layer, layer.id, 0.13 + order++ * 0.002);
        }
        if (!embedded)
          for (const kind of ['effect'] as const)
            if (viewDocument.componentScenes?.[kind])
              scene(
                kind,
                viewDocument.componentScenes[kind],
                facing,
                tilt,
                act,
                w,
                h,
              );
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
      }
      // Back-bound particles emerge from the reverse surface after it is drawn; the front keeps physical card occlusion.
      if (backParticles || frontParticles) {
        if (!embedded && viewDocument.componentScenes?.particles)
          scene(
            'particles',
            viewDocument.componentScenes.particles,
            facing,
            tilt,
            act,
            w,
            h,
          );
        else drawParticles(facing, tilt, act, w, h);
      }
      if (cosmicParticles) {
        if (!embedded && viewDocument.componentScenes?.particles)
          scene(
            'particles',
            viewDocument.componentScenes.particles,
            facing,
            tilt,
            act,
            w,
            h,
            undefined,
            false,
            true,
          );
        else drawParticles(facing, tilt, act, w, h, true);
      }
      for (const group of actionParticleGroups) {
        if (eventInFront(group))
          drawParticles(facing, tilt, act, w, h, false, group);
        else if (
          !group.event.trail &&
          group.event.particles.visual === 'cosmic'
        )
          drawParticles(facing, tilt, act, w, h, true, group);
      }
      canvas.dataset.particleTotalCount = String(
        ambientParticleCount +
          Number(canvas.dataset.particleEventParticles || 0),
      );
      if (actionParticleGroups.length)
        canvas.dataset.particleCount = canvas.dataset.particleTotalCount;
      // Diagnostic serialization and GPU error queries need not run at animation frequency.
      if (!canAnimate() || performance.now() - lastDiagnosticsAt >= 250) {
        lastDiagnosticsAt = performance.now();
        canvas.dataset.contentRenderOrder = JSON.stringify(
          layers
            .filter((l) => l.kind !== 'frame' && !backgroundLayer(l))
            .map((l) => l.id),
        );
        canvas.dataset.characterGeometry = JSON.stringify(
          (viewDocument.characterRig?.meshes || []).flatMap((spec) => {
            const m = meshes.get('character-skin:' + spec.layerId);
            return m?.skinPose === characterPose
              ? [
                  {
                    id: spec.layerId,
                    vertices: m.geometry.positions.length / 3,
                    checksum: importedCardCharacterAnimation.advanced.checksum(
                      m.geometry.positions instanceof Float32Array
                        ? m.geometry.positions
                        : new Float32Array(m.geometry.positions),
                    ),
                  },
                ]
              : [];
          }),
        );
        canvas.dataset.characterIK = JSON.stringify(
          characterPose ? [...characterPose.ik] : [],
        );
        canvas.dataset.characterExpressions = JSON.stringify(
          characterPose ? [...characterPose.expressions] : [],
        );
        canvas.dataset.statRenderOrder = JSON.stringify(
          layers.filter(importedCardStats.isStat).map((l) => l.id),
        );
        canvas.dataset.attachedLayers = String(
          viewDocument.layers.filter((l) => spatial.connection(viewDocument, l))
            .length,
        );
        canvas.dataset.renderCpuMs = (
          performance.now() - renderStarted
        ).toFixed(3);
        const triangles = trianglesDrawn;
        info.textContent = `${triangles} 三角面 / 同网格内外遮挡`;
        Object.assign(canvas.dataset, {
          regionMode: region.mode,
          regionLayer: region.layerId || '',
          regionMask: region.maskId || '',
          angle: String(Math.round((facing * 180) / Math.PI)),
          inspection: inspection?.mode || '',
          inspectionPaused: String(!!inspection?.paused),
          inspectionSeconds: inspectionTime.toFixed(3),
          inspectionProgress: String(scan?.progress || 0),
          triangles: String(triangles),
          mode: 'authored-grid',
          parallax: spatial.enabled(viewDocument) ? 'camera' : 'legacy',
          cameraDistance: String(cameraDistance()),
          effectTime: time.toFixed(3),
          foregroundSource: 'document-registered-art',
          maskSource: 'document',
          surfaceCount: String(
            viewDocument.layers.filter((l) => l.visible && characterLayer(l))
              .length,
          ),
          geometrySourceCount: String(
            new Set<string>(
              viewDocument.layers
                .filter((l) => l.visible && characterLayer(l))
                .map((l) => (spatial.rigid(l) ? 'rigid-quad' : 'foreground')),
            ).size,
          ),
          wire: String(wire),
          shellRigid: 'true',
          frameBend: '0',
          foregroundZ: String(
            spatial.enabled(viewDocument)
              ? spatial.resolve(
                  viewDocument,
                  viewDocument.layers.find((l) => l.kind === 'foreground') ||
                    {},
                ).z
              : 0.045 + 0.045 * (viewDocument.effects.depth ?? 0),
          ),
          backgroundZ: String(
            spatial.enabled(viewDocument)
              ? spatial.resolve(
                  viewDocument,
                  viewDocument.layers.find(
                    (l) => l.kind === 'background' || l.spatial?.role === 'far',
                  ) ||
                    viewDocument.layers.find(backgroundLayer) ||
                    {},
                ).z
              : frames.depths(style).background,
          ),
          spatialLayers: JSON.stringify(
            viewDocument.layers
              .filter((l) => l.visible && l.kind !== 'frame')
              .map((l) => ({
                id: l.id,
                role: spatial.role(l),
                z: spatial.enabled(viewDocument)
                  ? spatial.resolve(viewDocument, l).z
                  : undefined,
                attachment: l.attachment,
              })),
          ),
          frameCorner: String(style.corner),
          statCount: String(
            viewDocument.layers.filter(importedCardStats.isStat).length,
          ),
          frameShape: style.shape,
          frameWidth: String(style.width),
          frameDepth: String(style.depth),
          frameColor: style.color,
          frameFinish: style.finish,
          fontSource: 'shared-text-raster',
          rigidSampling: 'triangle-support',
          foregroundDepthMode: 'planar',
          insetSampling: 'projected-aperture',
          foregroundPasses: String(
            (viewDocument.characterEffects?.breakout.enabled === false ? 1 : 2) *
              viewDocument.layers.filter((l) => l.visible && characterLayer(l))
                .length,
          ),
          bottomSealed: String(!viewDocument.composition.bottom),
          locale: viewDocument.locale,
          armorEnabled: String(viewDocument.armor.enabled),
          titleCount: String(
            viewDocument.layers.filter((l) => l.titleArt).length,
          ),
          emissionSampling: 'pixel-mask',
          phaseSampling: 'pixel-mask',
          bend: String(
            viewDocument.deformation.bend +
              (viewDocument.cosmeticPreview?.motion === false ? 0 : act.bend),
          ),
          rootX: String(act.x),
          rootY: String(act.y),
          rootZ: String(act.z),
          rootScale: String(act.scale),
          rootOpacity: String(act.opacity),
          actionEvent: act.event,
          action: act.id,
          actionProgress: act.progress.toFixed(3),
          slotCount: String(viewDocument.slots.length),
          // An embedded surface is driven by a shared scene, so canAnimate()
          // is always false. Querying after each card serializes CPU and GPU.
          // Scene hosts/QA can opt in; never label an unchecked draw as clean.
          glError:
            !embedded || canvas.dataset.gpuDiagnostics === 'true'
              ? String(gl.getError())
              : 'unchecked',
          effectsEnabled: String(effectsEnabled),
          viewportActive: String(active),
          actionSeconds: (playing
            ? act.progress *
              (viewDocument.actions.find((a) => a.id === playing?.id)
                ?.duration || 1)
            : 0
          ).toFixed(3),
          pitch: String((tilt * 180) / Math.PI),
          motionGain: String(
            effectsEnabled && viewDocument.effects.cape
              ? act.motion * viewDocument.deformation.wind
              : 0,
          ),
          emissionGain: String(
            effectsEnabled && viewDocument.effects.flow ? act.emission : 0,
          ),
          titleSweepEnabled: String(
            effectsEnabled &&
              viewDocument.cosmeticPreview?.title !== false &&
              viewDocument.layers.some(
                (l) =>
                  l.titleArt &&
                  importedCardTitle.resolve(l, viewDocument.locale).sweep
                    .enabled,
              ),
          ),
        });
      }
      emit('atelier-preview-frame', {
        id: act.id,
        effectSeconds: time,
        seconds: playing
          ? act.progress *
            (viewDocument.actions.find((a) => a.id === act.id)?.duration || 1)
          : 0,
        paused:
          (playing ? !!playing.paused : viewDocument.effects.paused) ||
          !!playing?.completed,
        duration:
          viewDocument.actions.find((a) => a.id === act.id)?.duration || 1,
        activeAction: !!playing,
        sample: act,
        draft: !!playing?.draft,
      });
      if (inspection)
        emit('atelier-inspection-frame', {
          mode: inspection.mode,
          seconds: inspectionTime,
          progress: scan?.progress ?? 0,
          paused: inspection.paused,
          period: inspection.period,
          yaw: lastView?.yaw ?? 0,
          pitch: lastView?.pitch ?? 0,
        });
      if (!capturing && canAnimate() && !raf) raf = requestAnimationFrame(tick);
    }
    function hasDynamics() {
      return importedCardCosmetics.dynamic(
        doc,
        Math.cos(yaw) * Math.cos(pitch) > 0.03,
      );
    }
    function setPlaybackPaused(value: boolean) {
      if (value) actionAudio.stop();
      const paused = !!value;
      if (doc) doc.effects.paused = paused;
      if (sourceDoc?.effects) sourceDoc.effects.paused = paused;
      if (playing) {
        if (paused && !playing.paused) {
          const action =
            playing.draft || doc?.actions.find((a) => a.id === playing?.id);
          if (action?.loop) {
            particleWorldTimeOffset +=
              Math.floor((time - playing.start) / action.duration) *
              action.duration;
            playing.start = time - ((time - playing.start) % action.duration);
          }
        }
        playing.paused = paused;
      }
      return paused;
    }
    function canAnimate() {
      return (
        !embedded &&
        generic &&
        active &&
        !document.hidden &&
        (poseTween ||
          (inspection && !inspection.paused) ||
          (effectsEnabled &&
            (playing || hasDynamics()) &&
            !(playing ? playing.paused : doc?.effects.paused))) &&
        canvas.clientWidth > 0 &&
        canvas.clientHeight > 0
      );
    }
    let lastDiagnosticsAt = -Infinity;
    let last = 0;
    function tick(now: number) {
      raf = 0;
      if (!canAnimate()) return;
      if (
        now - last >=
        1000 / importedCardCosmetics.budget(doc?.cosmetics?.quality).fps
      ) {
        const delta = last ? Math.min(0.1, (now - last) / 1000) : 0.033;
        if (poseTween) poseTween.seconds += delta;
        if (inspection && !inspection.paused) inspectionTime += delta;
        if (
          effectsEnabled &&
          (playing || hasDynamics()) &&
          !(playing ? playing.paused : doc?.effects.paused)
        ) {
          time += delta;
          if (actionTransition) actionTransition.seconds += delta;
        }
        last = now;
        draw();
      } else if (canAnimate()) raf = requestAnimationFrame(tick);
    }
    function clearInspection() {
      if (inspection) {
        yaw = inspection.yaw;
        pitch = inspection.pitch;
        inspection = null;
        lastView = {
          yaw: (yaw * 180) / Math.PI,
          pitch: (pitch * 180) / Math.PI,
          root: [0, 0, 0, 1],
        };
        emit('atelier-inspection-stop');
      }
    }
    let resizeObserver: ResizeObserver | null = null;
    const visibilityChanged = () => {
      if (document.hidden) actionAudio.stop();
      last = 0;
      draw();
    };
    if (!embedded) {
      canvas.onpointerdown = (e) => {
        if (e.button !== 0) return;
        poseTween = null;
        clearInspection();
        const preserve = !!playing;
        drag = {
          x: e.clientX,
          y: e.clientY,
          yaw: preserve ? (playing?.yaw ?? yaw) : yaw,
          pitch: preserve ? (playing?.pitch ?? pitch) : pitch,
          free: e.altKey,
          action: preserve,
        };
        if (!preserve) playing = null;
        canvas.dataset.dragMode = e.altKey ? 'orbit' : 'inspect';
        canvas.setPointerCapture(e.pointerId);
        draw();
      };
      canvas.onpointermove = (e) => {
        if (!drag) return;
        if (!(e.buttons & 1)) {
          drag = null;
          return;
        }
        const dx = (e.clientX - drag.x) * 0.004,
          dy = (e.clientY - drag.y) * 0.003;
        yaw =
          drag.yaw +
          (drag.free ? dx * 2.25 : Math.max(-0.49, Math.min(0.49, dx)));
        pitch = Math.max(
          -0.61,
          Math.min(
            0.61,
            drag.pitch +
              (drag.free ? dy * 2 : Math.max(-0.31, Math.min(0.31, dy))),
          ),
        );
        if (drag.action && playing) {
          playing.yaw = yaw;
          playing.pitch = pitch;
        }
        draw();
      };
      canvas.onpointerup = () => (drag = null);
      canvas.onpointercancel = () => (drag = null);
      resizeObserver = new ResizeObserver(() => draw());
      resizeObserver.observe(canvas);
      document.addEventListener('visibilitychange', visibilityChanged);
    }
    const base: SurfaceBase = {
      setTextureDetail(value) {
        textureDetail = value === 'small' ? 'small' : 'large';
        draw();
      },
      setZoom(value) {
        viewZoom = Number.isFinite(value)
          ? Math.max(0.25, Math.min(3, value))
          : 1;
        legacy.setZoom?.(viewZoom);
        draw();
        return viewZoom;
      },
      getZoom() {
        return viewZoom;
      },
      beginUpdate() {
        updateDepth++;
      },
      endUpdate() {
        if (updateDepth) updateDepth--;
        if (!updateDepth) {
          if (weightsPending) updateWeights();
          draw();
        }
      },
      removeTexture(id) {
        releaseTexture(id);
        textureImages.delete(id);
        textureSizes.delete(id);
        maskTextureSizes.delete(id);
        titleBounds.delete(id);
        ownershipData.delete(id);
        const join = joinBuffers.get(id);
        if (join) {
          for (const k of ['buffer', 'fx', 'guard'] as const)
            if (join[k]) gl.deleteBuffer(join[k]);
          joinBuffers.delete(id);
        }
      },
      removeMask(id) {
        maskData.delete(id);
        if (id === 'foil' || id === 'subject') updateFoilTexture();
        else this.removeTexture('mask-' + id);
        if (doc?.shader.fragmentMask === id) {
          customMaskImage = null;
          this.removeTexture('custom-mask');
        }
        if (id === 'rigid') rigidityCache = null;
        refreshCustomMask();
        if (['motion', 'inset', 'emission', 'phase', 'rigid'].includes(id))
          updateWeights();
      },
      getView() {
        return generic
          ? {
              ...(lastView || {
                yaw: (yaw * 180) / Math.PI,
                pitch: (pitch * 180) / Math.PI,
              }),
              time,
              actionId: playing?.id,
              actionSeconds: playing ? Math.max(0, time - playing.start) : 0,
              paused: playing ? !!playing.paused : doc?.effects.paused,
            }
          : legacy.getView?.() || { yaw: 0, pitch: 0, time: 0 };
      },
      setDocument(d) {
        if (doc?.id !== d.id) actionAudio.reset();
        if (disposed) throw Error('Preview is disposed');
        if (
          doc?.id !== d.id ||
          doc?.revision !== d.revision ||
          !importedCardPreviewUpdate.equal(doc?.actions, d.actions) ||
          !importedCardPreviewUpdate.equal(doc?.characterRig, d.characterRig)
        ) {
          actionTransition = null;
          renderedAction = null;
        }
        characterSample = null;
        for (const [id, m] of meshes)
          if (id.startsWith('character-skin:')) {
            if (
              !d.characterRig?.meshes?.some(
                (s) => id === 'character-skin:' + s.layerId,
              )
            ) {
              for (const k of [
                'p',
                'uv',
                'fx',
                'guard',
                'join',
                'idx',
                'lines',
              ] as const)
                gl.deleteBuffer(m[k]);
              meshes.delete(id);
            } else m.skinPose = null;
          }
        if (doc?.id !== d.id) {
          time = 0;
          particleRevealStart = 0;
          last = 0;
          playing = null;
          drag = null;
          poseTween = null;
          clearInspection();
          lastView = null;
        }
        if (sourceDoc?.id !== d.id) previewLevel = null;
        sourceDoc = d;
        doc = runtime.ensure(
          importedCardCosmetics.resolve(d, {
            level: previewLevel || undefined,
          }),
        );
        generic = d.previewMode === 'authored';
        if (generic && shaderKey(doc.shader) !== compiledKey) {
          try {
            compile(doc.shader);
          } catch (error) {
            canvas.dataset.shaderState = 'error';
            info.textContent = 'GLSL 编译失败：' + message(error);
          }
        }
        if (!embedded) {
          old.hidden = generic;
          canvas.hidden = !generic;
        }
        refreshCustomMask();
        if (generic) {
          refreshFrame();
          if (
            d.foregroundMesh &&
            !importedCardPreviewUpdate.equal(
              meshes.get('foreground')?.geometry,
              d.foregroundMesh,
            )
          ) {
            mesh('foreground', d.foregroundMesh);
            updateWeights();
          }
          draw();
        } else legacy.setDocument?.(d);
      },
      setTexture(group, image) {
        if (
          upload(
            {
              pop_foreground: 'foreground',
              snap_background: 'background',
              art_back: 'back',
            }[group] || group,
            image,
          ) === false
        )
          return;
        legacy.setTexture?.(group, image);
        draw();
      },
      addImage(layer, image) {
        if (disposed) return;
        ensureOwnership(layer);
        upload(layer.id, image);
        if (!generic) legacy.addImage?.(layer, image);
        draw();
      },
      setText(layer, image) {
        if (disposed) return;
        upload(layer.id, image);
        if (layer.titleArt) {
          const c = document.createElement('canvas');
          c.width = 1024;
          c.height = 1536;
          const cc = required(c.getContext('2d', { willReadFrequently: true }));
          cc.drawImage(image, 0, 0, 1024, 1536);
          const data = cc.getImageData(0, 0, 1024, 1536).data;
          let min = 1023,
            max = 0;
          for (let i = 0; i < data.length; i += 4)
            if (data[i + 3] > 10) {
              const x = (i / 4) % 1024;
              min = Math.min(min, x);
              max = Math.max(max, x);
            }
          titleBounds.set(
            layer.id,
            max > min ? [min / 1024, max / 1024] : [0, 1],
          );
        }
        if (!generic) {
          if (layer.id === 'title') legacy.setText?.(layer, image);
          else legacy.addImage?.(layer, image);
        }
        draw();
      },
      setRegion(value) {
        if (disposed) return;
        const next = value || { mode: 'none' },
          key = JSON.stringify([
            next.mode,
            next.layerId,
            next.maskId,
            next.version,
          ]);
        const previous = JSON.stringify([
          region.mode,
          region.layerId,
          region.maskId,
          region.version,
        ]);
        if (
          next.map &&
          (next.map !== regionImage || next.version !== regionVersion)
        ) {
          upload('region-mask', next.map);
          regionImage = next.map;
          regionVersion = next.version ?? null;
        }
        region = next;
        if (key !== previous) draw();
      },
      updateMask(id, image, rect, source) {
        if (disposed) return;
        characterMaskVersion++;
        maskData.set(id, image);
        if (region.mode === 'mask' && region.maskId === id) {
          upload('region-mask', image, rect);
          regionImage = source?.canvas || image;
          regionVersion = source?.version ?? regionVersion;
        }
        if (id === 'coverage') {
          for (const c of joinBuffers.values())
            for (const k of ['buffer', 'fx', 'guard'] as const)
              if (c[k]) gl.deleteBuffer(c[k]);
          joinBuffers.clear();
        }
        if (id === 'foil' || id === 'subject') updateFoilTexture(rect);
        else if (['emission', 'phase', 'inset'].includes(id))
          upload('mask-' + id, image, rect);
        if (
          doc?.shader.fragmentMask === id &&
          doc.shader.fragmentBody !== runtime.surfaceBody
        ) {
          upload('custom-mask', image, rect);
          customMaskImage = image;
        } else refreshCustomMask();
        if (id === 'rigid') rigidityCache = null;
        if (generic) {
          if (['motion', 'inset', 'emission', 'phase', 'rigid'].includes(id))
            updateWeights();
          canvas.dataset.lastMask = id;
          draw();
        } else legacy.updateMask?.(id, image);
      },
      resetAssets() {
        if (disposed) return;
        count('resets');
        actionAudio.reset();
        contourFieldRenderer.dispose();
        particleBirthCache.clear();
        particleWorldHistory.clear();
        particlePhysicsCache?.clear();
        clearSkinMeshes();
        backRenderer?.reset();
        for (const renderer of componentRenderers.values()) renderer.dispose();
        componentRenderers.clear();
        region = { mode: 'none' };
        regionImage = null;
        regionVersion = null;
        emit('atelier-preview-assets-reset');
        for (const id of textures.keys()) releaseTexture(id);
        sourceBounds.clear();
        textureImages.clear();
        textureSizes.clear();
        maskTextureSizes.clear();
        titleBounds.clear();
        maskData.clear();
        ownershipData.clear();
        for (const c of joinBuffers.values())
          for (const k of ['buffer', 'fx', 'guard'] as const)
            if (c[k]) gl.deleteBuffer(c[k]);
        joinBuffers.clear();
        customMaskImage = null;
        upload('mask-default', black);
      },
      compileSources(vertexSource, fragmentSource) {
        if (disposed) throw Error('Preview is disposed');
        const finish = frames.finishes.indexOf(frames.resolve(doc).finish);
        return compile(
          required(doc).shader,
          vertexSource,
          shaderVariants.frameFragment(fragmentSource, finish),
          undefined,
          false,
        );
      },
      compileShader(config, document) {
        if (disposed) throw Error('Preview is disposed');
        const next = { ...runtime.defaults.shader, ...config };
        const finish = document
          ? frames.resolve(
              importedCardCosmetics.resolve(document, {
                level:
                  document.id === sourceDoc?.id
                    ? previewLevel || undefined
                    : undefined,
              }),
            ).finish
          : frames.resolve(doc).finish;
        return shaderKey(next, finish) === compiledKey
          ? { ok: true, cached: true }
          : compile(next, undefined, undefined, finish);
      },
      compileGeometry(body) {
        if (disposed) throw Error('Preview is disposed');
        const result = compile({
          ...runtime.defaults.shader,
          ...doc?.shader,
          geometryBody: body,
        });
        draw();
        return result;
      },
      playAction(id, seconds = 0, paused = false, draft = null) {
        if (disposed) return;
        actionAudio.stop();
        particleWorldTimeOffset = 0;
        if (playing?.id !== id || (!paused && seconds === 0))
          particleWorldHistory.clear();
        const target = draft || doc?.actions.find((a) => a.id === id),
          duration = target?.transitionDuration || 0;
        actionTransition =
          doc &&
          renderedAction &&
          playing?.id !== id &&
          !paused &&
          !draft &&
          seconds === 0 &&
          duration > 0
            ? {
                from: runtime.snapshotAction(
                  doc,
                  renderedAction.clip,
                  renderedAction.seconds,
                  renderedAction.seek,
                ),
                duration,
                seconds: 0,
              }
            : null;
        poseTween = null;
        clearInspection();
        const base = playing?.id === id ? playing : { yaw, pitch };
        time = seconds;
        if ((draft || doc?.actions.find((a) => a.id === id))?.event === 'enter')
          particleRevealStart = 0;
        playing = {
          id,
          start: 0,
          yaw: base.yaw,
          pitch: base.pitch,
          paused,
          draft,
        };
        setPlaybackPaused(paused);
        last = 0;
        draw();
      },
      stopAction() {
        actionAudio.stop();
        actionTransition = null;
        if (playing) {
          yaw = playing.yaw;
          pitch = playing.pitch;
        }
        playing = null;
        draw();
      },
      async setAudioEnabled(value) {
        const enabled = await actionAudio.enable(value);
        draw();
        return enabled;
      },
      getAudioState() {
        return actionAudio.state();
      },
      setParticleWorldSampler(sampler) {
        if (disposed) return;
        particleWorldSampler = sampler;
        draw();
      },
      setActive(value) {
        if (!value) actionAudio.stop();
        active = !!value && document.body.dataset.appMode === 'editor';
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        last = 0;
        canvas.dataset.viewportActive = String(active);
        legacy.setActive?.(value);
        if (active) draw();
      },
      setEffectsEnabled(value) {
        if (!value) actionAudio.stop();
        effectsEnabled = !!value;
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        last = 0;
        legacy.setEffectsEnabled?.(value);
        draw();
      },
      pose(deg, p = 0) {
        poseTween = null;
        clearInspection();
        yaw = (deg * Math.PI) / 180;
        pitch = (p * Math.PI) / 180;
        if (playing) {
          playing.yaw = yaw;
          playing.pitch = pitch;
        }
        if (generic) draw();
        else legacy.pose?.(deg, p);
      },
      transitionPose(deg, p = 0, duration = 0.45) {
        if (!generic) {
          legacy.pose?.(deg, p);
          return;
        }
        const current = this.getView();
        clearInspection();
        playing = null;
        poseTween = {
          from: { yaw: current.yaw, pitch: current.pitch },
          to: { yaw: deg, pitch: p },
          seconds: 0,
          duration,
        };
        last = 0;
        draw();
      },
      inspect(value: InspectionOptions = {}, seconds = 0, paused = false) {
        poseTween = null;
        if (!generic) return false;
        const base = inspection || {
          yaw: playing?.yaw ?? yaw,
          pitch: playing?.pitch ?? pitch,
        };
        playing = null;
        inspection = {
          ...importedCardInspection.config(value),
          yaw: base.yaw,
          pitch: base.pitch,
          paused,
        };
        inspectionTime = Math.max(0, seconds);
        last = 0;
        draw();
        return true;
      },
      pauseInspection() {
        if (inspection) {
          inspection.paused = !inspection.paused;
          last = 0;
          draw();
        }
      },
      stopInspection() {
        clearInspection();
        draw();
      },
      setPaused(value) {
        const paused = setPlaybackPaused(value);
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        last = 0;
        if (generic) draw();
        else if (doc) legacy.setDocument?.(doc);
        return paused;
      },
      setTime(t) {
        actionTransition = null;
        time = Math.max(0, t);
        if (generic) draw();
        else legacy.setTime?.(t);
      },
      replayParticles() {
        particleRevealStart = 0;
        time = 0;
        playing = null;
        last = 0;
        draw();
      },
      showWire(value) {
        wire = value;
        if (generic) draw();
        else legacy.showWire?.(value);
      },
      burst() {
        legacy.burst?.();
        draw();
      },
    };

    // Read-only adapter diagnostics also support mesh picking and export QA.

    const api: PreviewAPI = Object.assign(base, {
      setPreviewLevel: (value) => {
        previewLevel = value || null;
        if (sourceDoc) api.setDocument(sourceDoc);
      },
      getPreviewLevel: () =>
        previewLevel || sourceDoc?.cosmetics?.level || 'authored',
      getCharacterGeometry: () =>
        Object.fromEntries(
          (doc?.characterRig?.meshes || []).flatMap((spec) => {
            const m = meshes.get('character-skin:' + spec.layerId);
            return m?.skinSource === spec
              ? [
                  [
                    spec.layerId,
                    { positions: Array.from(m.geometry.positions) },
                  ],
                ]
              : [];
          }),
        ),
      setRenderOverrides: (value) => {
        if (!doc) return;
        doc = runtime.ensure({ ...doc, ...value });
        if (generic && shaderKey(doc.shader) !== compiledKey)
          compile(doc.shader);
        if (generic) refreshFrame();
      },
      setEmitterContext: (value) => {
        if (disposed) return;
        emitterContext = value;
      },
      createCapture: (target) => {
        if (embedded || !generic || !doc || disposed || !active)
          throw Error('3D 预览尚未就绪');
        const { width, height } = target;
        const ctx = required(target.getContext('2d'));
        const pixels = ctx.createImageData(width, height);
        const raw = new Uint8Array(pixels.data.length);
        const framebuffer = gl.createFramebuffer();
        const depthBuffer = gl.createRenderbuffer();
        const release = () => {
          gl.deleteFramebuffer(framebuffer);
          gl.deleteRenderbuffer(depthBuffer);
        };
        let released = false;
        if (!framebuffer || !depthBuffer) {
          release();
          throw Error('无法创建导出缓冲区');
        }
        const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        const previousRenderbuffer = gl.getParameter(gl.RENDERBUFFER_BINDING);
        // WebGL 1 guarantees an RGBA8 renderable texture, while RGBA4 renderbuffers
        // would quantize the foil gradients before GIF/video encoding.
        const texture = gl.createTexture();
        const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        try {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            width,
            height,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null,
          );
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            texture,
            0,
          );
          gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
          gl.renderbufferStorage(
            gl.RENDERBUFFER,
            gl.DEPTH_COMPONENT16,
            width,
            height,
          );
          gl.framebufferRenderbuffer(
            gl.FRAMEBUFFER,
            gl.DEPTH_ATTACHMENT,
            gl.RENDERBUFFER,
            depthBuffer,
          );
          if (
            gl.checkFramebufferStatus(gl.FRAMEBUFFER) !==
            gl.FRAMEBUFFER_COMPLETE
          )
            throw Error('当前显卡不支持此导出尺寸');
        } catch (error) {
          release();
          gl.deleteTexture(texture);
          throw error;
        } finally {
          gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
          gl.bindRenderbuffer(gl.RENDERBUFFER, previousRenderbuffer);
          gl.bindTexture(gl.TEXTURE_2D, previousTexture);
        }
        return {
          frame(pose) {
            if (
              released ||
              disposed ||
              gl.isContextLost() ||
              !doc ||
              updateDepth
            )
              throw Error('3D 预览已退出或正在更新');
            if (pose.action && !doc.actions.some((action) => action.id === pose.action?.id))
              throw Error('录制动作已变化');
            const previous = {
              time,
              playing,
              inspection,
              actionTransition,
              external,
              detail,
              lastView,
              effectsEnabled,
              active,
              wire,
              region,
              poseTween,
              renderedAction,
              characterPose,
              sampleParticleWorld,
              particleRevealStart,
            };
            const currentFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
            capturing = true;
            time = pose.time;
            playing = pose.action
              ? {
                  id: pose.action.id,
                  start: pose.time - pose.action.seconds,
                  yaw: 0,
                  pitch: 0,
                  paused: true,
                  draft: null,
                }
              : null;
            inspection = actionTransition = poseTween = null;
            particleRevealStart = 0;
            effectsEnabled = active = true;
            wire = false;
            region = { mode: 'none' };
            external = {
              angle: [(pose.yaw * Math.PI) / 180, (pose.pitch * Math.PI) / 180],
              root: [pose.x / 1024, -pose.y / 1024, 0, 1, 1],
              width,
              height,
              // The projection fits narrow viewports by width. Compensate for
              // the extra vertical space so both capture ratios use it.
              viewportZoom: 0.86 * Math.max(1, (2 * height) / (3 * width)),
              detail: {
                level: 'large',
                materials: true,
                decorations: true,
                particles: true,
              },
            };
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            try {
              draw();
              gl.readPixels(
                0,
                0,
                width,
                height,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                raw,
              );
            } finally {
              gl.bindFramebuffer(gl.FRAMEBUFFER, currentFramebuffer);
              ({
                time,
                playing,
                inspection,
                actionTransition,
                external,
                detail,
                lastView,
                effectsEnabled,
                active,
                wire,
                region,
                poseTween,
                renderedAction,
                characterPose,
                sampleParticleWorld,
                particleRevealStart,
              } = previous);
              capturing = false;
            }
            for (let y = 0; y < height; y++) {
              const row = (height - 1 - y) * width * 4;
              for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4,
                  j = row + x * 4;
                const open = 1 - raw[j + 3]! / 255;
                pixels.data[i] = raw[j]! + 18 * open;
                pixels.data[i + 1] = raw[j + 1]! + 21 * open;
                pixels.data[i + 2] = raw[j + 2]! + 31 * open;
                pixels.data[i + 3] = 255;
              }
            }
            ctx.putImageData(pixels, 0, 0);
          },
          dispose() {
            if (released) return;
            released = true;
            release();
            gl.deleteTexture(texture);
            draw();
          },
        };
      },
      drawExternal: (options) => {
        external = options;
        active = true;
        generic = true;
        effectsEnabled = options.effects !== false;
        time = options.time || 0;
        try {
          draw();
          return {
            triangles: trianglesDrawn,
            motion: Number(canvas.dataset.motionGain),
            emission: Number(canvas.dataset.emissionGain),
            time,
            shader: canvas.dataset.shaderState,
            particles: Number(canvas.dataset.particleCount) || 0,
            emitterState: canvas.dataset.emitterState,
            particleStats: Object.fromEntries(
              [
                'particleRevealTime',
                'particleRevealCount',
                'particleVisual',
                'particlePalette',
                'particleDrawCalls',
                'particleUploadBytes',
                'particleBufferBytes',
                'particleBudget',
                'particleCpuMs',
                'particleBlend',
                'particleSpriteState',
                'particlePlacement',
                'particleTrajectory',
                'particleRadius',
                'particleOpacity',
              ].map((k) => [k, canvas.dataset[k] || '0']),
            ),
          };
        } finally {
          external = null;
          active = false;
        }
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        void actionAudio.dispose();
        particleWorldSampler = null;
        particlePhysicsCache?.clear();
        sampleParticleWorld = () => ({ angle: [0, 0], root: [0, 0, 0, 1, 1] });
        if (resizeObserver) {
          resizeObserver.disconnect?.();
          resizeObserver = null;
          document.removeEventListener?.('visibilitychange', visibilityChanged);
          canvas.onpointerdown =
            canvas.onpointermove =
            canvas.onpointerup =
            canvas.onpointercancel =
              null;
        }
        contourFieldRenderer.dispose();
        particleBirthCache.clear();
        particleWorldHistory.clear();
        for (const entry of particleSprites.values())
          if (entry.texture) gl.deleteTexture(entry.texture);
        particleSprites.clear();
        if (raf) cancelAnimationFrame(raf);
        backRenderer?.dispose();
        for (const renderer of componentRenderers.values()) renderer.dispose();
        componentRenderers.clear();
        for (const id of textures.keys()) releaseTexture(id);
        sourceBounds.clear();
        textureImages.clear();
        for (const m of meshes.values())
          for (const k of [
            'p',
            'uv',
            'fx',
            'guard',
            'join',
            'idx',
            'lines',
          ] as const)
            gl.deleteBuffer(m[k]);
        meshes.clear();
        for (const c of joinBuffers.values())
          for (const k of ['buffer', 'fx', 'guard'] as const)
            if (c[k]) gl.deleteBuffer(c[k]);
        joinBuffers.clear();
        maskData.clear();
        maskTextureSizes.clear();
        textureSizes.clear();
        ownershipData.clear();
        titleBounds.clear();
        rigidityCache = null;
        customMaskImage = null;
        regionImage = null;
        characterSample = null;
        frameGeometry = null;
        playing = null;
        actionTransition = null;
        renderedAction = null;
        doc = sourceDoc = null;
        emitterContext = null;
        for (const p of new Set([
          program,
          ...[...programs.values()].map((entry) => entry.program),
        ]))
          if (p) gl.deleteProgram(p);
        programs.clear();
        gl.deleteProgram(particleProgram);
        gl.deleteBuffer(particleBuffer);
      },
    } satisfies Pick<PreviewAPI, AdapterKeys>);
    return api;
  }
  const exposedCardSurfaceRenderer = { create };
  bindings.CardSurfaceRenderer = exposedCardSurfaceRenderer;
  const legacy = bindings.cardPreview,
    old = required(document.getElementById('model-canvas')),
    info = required(document.getElementById('model-info')),
    canvas = document.createElement('canvas');
  canvas.id = 'author-model-canvas';
  canvas.tabIndex = 0;
  canvas.hidden = true;
  canvas.setAttribute('aria-label', '新卡 3D 实时预览');
  old.after(canvas);
  bindings.cardPreview = createLazyPreview(() => {
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    return gl
      ? create({ canvas, gl, legacy, old, info })
      : (legacy as PreviewAPI);
  });
  return { CardSurfaceRenderer: exposedCardSurfaceRenderer };
})();
