import type { CardDocument } from '../shared/document';
import type { PreviewAPI } from '../shared/preview';
import type { SurfaceBindings } from '../shared/surface-preview';
import type Cosmetics from '../renderer/editing/cosmetics-model.ts';
import type AdaptiveTextures from '../renderer/rendering/adaptive-textures.ts';
import type ExportProfile from '../renderer/rendering/export-profile.ts';
import type PlayerTextures from '../renderer/rendering/player-textures.ts';
import type {
  ExportProfile as TextureProfile,
  TextureVariants,
} from '../shared/export';
import type { TextureTier } from '../shared/export-policy';

export interface PerformanceAssets {
  profile: TextureProfile;
  layers: Record<string, string>;
  back?: string;
}

export interface PerformanceScene {
  doc: CardDocument;
  textAssets: Record<string, string>;
  count: number;
  quality: string;
  seconds: number;
  large: boolean;
  cycles: number;
  stress?: boolean;
  viewport?: [number, number];
  textureAssets?: PerformanceAssets;
  textureMode?: 'source' | 'large' | 'small' | 'adaptive';
  retainSmallEffects?: boolean;
  transitionCycles?: number;
  action?: string;
  audio?: boolean;
  traceTag?: string;
  gpuDrawProfile?: boolean;
}

/** Serialized into Chromium. Uses the real surface renderer and original art;
 * no simplified cards, mocked samplers or forced GPU synchronization. */
export async function measureScene(config: PerformanceScene) {
  const bindings = window as unknown as SurfaceBindings & {
    cardPreview: PreviewAPI;
    CardCosmetics: typeof Cosmetics;
    CardAdaptiveTextures: typeof AdaptiveTextures;
    CardExportProfile: typeof ExportProfile;
    CardPlayerTextures: typeof PlayerTextures;
  };
  const { doc, count, quality, seconds, large, cycles } = config;
  const actionIds =
    config.action && config.action !== 'alternating'
      ? [config.action]
      : ['cast', 'sweep'];
  const back = doc.back;
  if (!back || !actionIds.every((id) => doc.actions?.some((a) => a.id === id)))
    throw Error('Benchmark requires the complete real character project');
  const [width, height] = config.viewport || [1280, 900];
  const mode = config.textureMode || 'source';
  const assets = mode === 'source' ? undefined : config.textureAssets;
  if (mode !== 'source' && !assets)
    throw Error('Exported texture profile is required');
  if (large && assets)
    throw Error('Large source stress and exported tiers are separate cases');
  const profile = bindings.CardExportProfile;
  const aspect = width / height;
  const columns = config.viewport
    ? Math.min(
        count,
        Math.max(1, Math.round(Math.sqrt((count * aspect) / (1.15 / 1.7)))),
      )
    : Math.ceil(Math.sqrt(count * 1.5));
  const rows = Math.ceil(count / columns);
  const fit = Math.min(1, aspect / 0.85);
  const extentY = (2 * (2.7 - 0.15)) / (2.9 * fit);
  const scale = config.viewport
    ? Math.min(
        1,
        (extentY * 0.85) / (rows * 1.8),
        (extentY * aspect * 0.85) / (columns * 1.3),
      )
    : Math.min(1, 1.8 / (rows * 1.7), 2.4 / (columns * 1.2));
  const projectedPixels = profile.projectedWidth(
    width,
    height,
    1,
    scale,
    doc.spatial?.cameraDistance || 2.7,
    1,
  );
  const initialTier: TextureTier =
    mode === 'small'
      ? 'small'
      : mode === 'adaptive'
        ? profile.tier(assets?.profile.settings, projectedPixels)
        : 'large';
  const check = (ok: unknown, message: string) => {
    if (!ok) throw Error(message);
  };
  bindings.cardPreview.setActive(false);
  bindings.cardPreview.dispose();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = '100%';
  canvas.style.height = 'auto';
  document.querySelector('main')!.replaceChildren(canvas);
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  })!;
  check(gl, 'WebGL unavailable');
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  interface TimerExtension {
    TIME_ELAPSED_EXT: number;
    QUERY_RESULT_AVAILABLE_EXT: number;
    QUERY_RESULT_EXT: number;
    GPU_DISJOINT_EXT: number;
    createQueryEXT(): object | null;
    beginQueryEXT(target: number, query: object): void;
    endQueryEXT(target: number): void;
    deleteQueryEXT(query: object): void;
    getQueryObjectEXT(query: object, parameter: number): unknown;
  }
  const timer = gl.getExtension(
    'EXT_disjoint_timer_query',
  ) as TimerExtension | null;
  check(
    !config.gpuDrawProfile || timer,
    'Per-draw diagnosis requires EXT_disjoint_timer_query',
  );
  const queries: object[] = [],
    gpuTimes: number[] = [];
  let disjointSamples = 0;
  const collectGPU = () => {
    if (!timer) return;
    if (gl.getParameter(timer.GPU_DISJOINT_EXT)) {
      disjointSamples += queries.length;
      queries.splice(0).forEach((q) => timer.deleteQueryEXT(q));
      return;
    }
    while (
      queries.length &&
      timer.getQueryObjectEXT(queries[0], timer.QUERY_RESULT_AVAILABLE_EXT)
    ) {
      const q = queries.shift()!;
      gpuTimes.push(
        Number(timer.getQueryObjectEXT(q, timer.QUERY_RESULT_EXT)) / 1e6,
      );
      timer.deleteQueryEXT(q);
    }
  };
  const renderer = debug
    ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));
  const textureBytes = new Map<WebGLTexture, number>(),
    buffers = new Map<WebGLBuffer, number>(),
    programs = new Set<WebGLProgram>(),
    shaders = new Set<WebGLShader>(),
    boundBuffers = new Map<number, WebGLBuffer | null>();
  let boundTexture: WebGLTexture | null = null,
    uploads = 0,
    uploadedBytes = 0,
    allocations = 0,
    drawCalls = 0;
  // Allocation sizes are requested GL storage, not process/driver VRAM usage.
  const old = {
    createTexture: gl.createTexture.bind(gl),
    deleteTexture: gl.deleteTexture.bind(gl),
    bindTexture: gl.bindTexture.bind(gl),
    texImage2D: gl.texImage2D.bind(gl),
    createBuffer: gl.createBuffer.bind(gl),
    deleteBuffer: gl.deleteBuffer.bind(gl),
    bindBuffer: gl.bindBuffer.bind(gl),
    bufferData: gl.bufferData.bind(gl),
    createProgram: gl.createProgram.bind(gl),
    deleteProgram: gl.deleteProgram.bind(gl),
    createShader: gl.createShader.bind(gl),
    deleteShader: gl.deleteShader.bind(gl),
    drawArrays: gl.drawArrays.bind(gl),
    drawElements: gl.drawElements.bind(gl),
  };
  gl.createTexture = () => {
    const t = old.createTexture();
    if (t) {
      textureBytes.set(t, 0);
      allocations++;
    }
    return t;
  };
  gl.deleteTexture = (t) => {
    if (t) textureBytes.delete(t);
    old.deleteTexture(t);
  };
  gl.bindTexture = (target, t) => {
    boundTexture = t;
    old.bindTexture(target, t);
  };
  gl.texImage2D = (...args: unknown[]) => {
    Reflect.apply(old.texImage2D, gl, args);
    const image = args[5] as {
      width?: number;
      height?: number;
      naturalWidth?: number;
      naturalHeight?: number;
    };
    const width =
        args.length >= 9
          ? Number(args[3])
          : image.naturalWidth || image.width || 0,
      height =
        args.length >= 9
          ? Number(args[4])
          : image.naturalHeight || image.height || 0,
      format = Number(args.length >= 9 ? args[6] : args[3]),
      bytes =
        width *
        height *
        (format === gl.RGBA
          ? 4
          : format === gl.RGB
            ? 3
            : format === gl.LUMINANCE_ALPHA
              ? 2
              : 1);
    if (boundTexture) textureBytes.set(boundTexture, bytes);
    uploads++;
    uploadedBytes += bytes;
  };
  gl.createBuffer = () => {
    const b = old.createBuffer();
    if (b) {
      buffers.set(b, 0);
      allocations++;
    }
    return b;
  };
  gl.deleteBuffer = (b) => {
    if (b) buffers.delete(b);
    old.deleteBuffer(b);
  };
  gl.bindBuffer = (target, b) => {
    boundBuffers.set(target, b);
    old.bindBuffer(target, b);
  };
  gl.bufferData = (...args: unknown[]) => {
    Reflect.apply(old.bufferData, gl, args);
    const b = boundBuffers.get(Number(args[0])),
      data = args[1];
    if (b)
      buffers.set(
        b,
        typeof data === 'number'
          ? data
          : (data as ArrayBufferView | null)?.byteLength || 0,
      );
  };
  gl.createProgram = () => {
    const p = old.createProgram();
    if (p) programs.add(p);
    return p;
  };
  gl.deleteProgram = (p) => {
    if (p) programs.delete(p);
    old.deleteProgram(p);
  };
  gl.createShader = (type) => {
    const s = old.createShader(type);
    if (s) shaders.add(s);
    return s;
  };
  gl.deleteShader = (s) => {
    if (s) shaders.delete(s);
    old.deleteShader(s);
  };
  gl.drawArrays = (...args) => {
    drawCalls++;
    old.drawArrays(...args);
  };
  gl.drawElements = (...args) => {
    drawCalls++;
    old.drawElements(...args);
  };
  // Opt-in diagnosis runs before the steady window. Per-draw queries perturb
  // scheduling, so use these to locate work, never as normal frame timings.
  let profileActive = false;
  let profileDropped = false;
  const profileQueries: Array<{ query: object; label: string }> = [];
  const uniformNames = new WeakMap<
    WebGLUniformLocation,
    { program: WebGLProgram; name: string }
  >();
  const profilePrograms = new WeakMap<WebGLProgram, Record<string, number>>();
  let profileProgram: WebGLProgram | null = null;
  if (config.gpuDrawProfile && timer) {
    const getUniformLocation = gl.getUniformLocation.bind(gl),
      useProgram = gl.useProgram.bind(gl),
      uniform1f = gl.uniform1f.bind(gl),
      arrays = gl.drawArrays.bind(gl),
      elements = gl.drawElements.bind(gl);
    gl.getUniformLocation = (program, name) => {
      const location = getUniformLocation(program, name);
      if (location) uniformNames.set(location, { program, name });
      return location;
    };
    gl.useProgram = (program) => {
      profileProgram = program;
      useProgram(program);
    };
    gl.uniform1f = (location, value) => {
      const entry = location && uniformNames.get(location);
      if (entry && ['frame', 'fg', 'bg', 'back'].includes(entry.name)) {
        const values = profilePrograms.get(entry.program) || {};
        values[entry.name] = value;
        profilePrograms.set(entry.program, values);
      }
      uniform1f(location, value);
    };
    const timed = (draw: () => void) => {
      if (!profileActive) return draw();
      if (profileQueries.length >= 512) {
        profileDropped = true;
        return draw();
      }
      const query = timer.createQueryEXT();
      if (!query) {
        profileDropped = true;
        return draw();
      }
      const values = profileProgram && profilePrograms.get(profileProgram);
      const label = values
        ? ['frame', 'fg', 'bg', 'back']
            .map((name) => name + ':' + (values[name] || 0))
            .join(',')
        : 'particles/other';
      profileQueries.push({ query, label });
      timer.beginQueryEXT(timer.TIME_ELAPSED_EXT, query);
      try {
        draw();
      } finally {
        timer.endQueryEXT(timer.TIME_ELAPSED_EXT);
      }
    };
    gl.drawArrays = (...args) => timed(() => arrays(...args));
    gl.drawElements = (...args) => timed(() => elements(...args));
  }
  const resources = () => ({
    textures: textureBytes.size,
    textureBytes: [...textureBytes.values()].reduce((a, b) => a + b, 0),
    buffers: buffers.size,
    bufferBytes: [...buffers.values()].reduce((a, b) => a + b, 0),
    programs: programs.size,
    shaders: shaders.size,
    uploads,
    uploadedBytes,
    allocations,
    drawCalls,
  });
  const surfaces: PreviewAPI[] = [],
    owners = new Set<PreviewAPI>();
  const loaders = new Map<
    PreviewAPI,
    ReturnType<typeof AdaptiveTextures.create<TextureEntry, HTMLImageElement>>
  >();
  const levels = new Map<PreviewAPI, TextureTier>();
  interface TextureEntry {
    asset: string;
    variants?: TextureVariants;
    layerId?: string;
    back?: boolean;
  }
  let observer: PerformanceObserver | null = null;
  let backgrounded = document.hidden;
  const visibilityChanged = () => {
    if (document.hidden) backgrounded = true;
  };
  document.addEventListener('visibilitychange', visibilityChanged);
  try {
    const images = new Map<string, HTMLImageElement>();
    const pendingImages = new Map<string, Promise<HTMLImageElement>>();
    async function image(src: string) {
      const existing = images.get(src);
      if (existing) return existing;
      let task = pendingImages.get(src);
      if (!task) {
        task = (async () => {
          const value = new Image();
          value.src = src;
          await value.decode();
          images.set(src, value);
          return value;
        })();
        pendingImages.set(src, task);
      }
      try {
        return await task;
      } finally {
        if (pendingImages.get(src) === task) pendingImages.delete(src);
      }
    }
    for (const src of [
      ...(assets
        ? []
        : [
            back,
            ...doc.layers.map((l) => l.src),
            ...Object.values(config.textAssets),
          ]),
      ...Object.values(doc.masks),
    ])
      if (src) await image(src);
    let big: HTMLCanvasElement | null = null;
    if (large) {
      big = document.createElement('canvas');
      big.width = 3072;
      big.height = 4608;
      const background = doc.layers.find((l) => l.kind === 'background')!;
      big
        .getContext('2d')!
        .drawImage(await image(background.src!), 0, 0, big.width, big.height);
    }
    const masks = new Map<string, ImageData>();
    for (const [id, src] of Object.entries(doc.masks)) {
      const im = await image(src),
        c = document.createElement('canvas');
      c.width = 1024;
      c.height = 1536;
      c.getContext('2d')!.drawImage(im, 0, 0, 1024, 1536);
      masks.set(id, c.getContext('2d')!.getImageData(0, 0, 1024, 1536));
    }
    // Same registered pictures are reused throughout this board; mutable images
    // still follow the renderer's normal per-owner storage rules.
    const registeredImages = new Map<
      string,
      HTMLImageElement | HTMLCanvasElement
    >();
    const entryPicture = (entry: TextureEntry, im: HTMLImageElement) => {
      const layer = doc.layers.find((layer) => layer.id === entry.layerId);
      const key =
        entry.asset +
        ':' +
        im.src +
        ':' +
        JSON.stringify(layer?.sourceWindow || null);
      let picture = registeredImages.get(key);
      if (!picture) {
        picture = bindings.CardPlayerTextures.registered(
          layer,
          im,
          entry.variants?.sourceSize,
        );
        registeredImages.set(key, picture);
      }
      return picture;
    };
    const release = (surface: PreviewAPI) => {
      loaders.get(surface)?.dispose();
      loaders.delete(surface);
      levels.delete(surface);
      surface.dispose();
      owners.delete(surface);
    };
    const load = async (index: number) => {
      const surface = bindings.CardSurfaceRenderer.create({
        canvas,
        gl,
        embedded: true,
      });
      owners.add(surface);
      surface.beginUpdate();
      const actions = (doc.actions || []).map((action) => {
        if (!actionIds.includes(action.id)) return action;
        const events = action.particleEvents || [];
        const particleEvents =
          config.stress && events.length
            ? Array.from({ length: 16 }, (_, i) => {
                const event = {
                  ...events[i % events.length],
                  id: 'stress-' + i,
                  at: 0,
                  duration: action.duration,
                  particles: {
                    ...events[i % events.length].particles,
                    count: 256,
                  },
                };
                delete event.emissionDuration;
                return event;
              })
            : events;
        return { ...action, loop: true, particleEvents };
      });
      surface.setDocument({
        ...doc,
        id: doc.id + '-perf-' + index,
        actions,
        cosmetics: { ...doc.cosmetics, quality },
        ...(assets
          ? {
              exportProfile: assets.profile,
              layers: doc.layers.map((layer) => ({
                ...layer,
                asset: assets.layers[layer.id],
              })),
            }
          : {}),
      });
      if (assets) {
        const entries: TextureEntry[] = Object.entries(assets.layers).map(
          ([layerId, asset]) => ({
            layerId,
            asset,
            variants: assets.profile.textures[asset],
          }),
        );
        if (assets.back)
          entries.push({
            back: true,
            asset: assets.back,
            variants: assets.profile.textures[assets.back],
          });
        const loader = bindings.CardAdaptiveTextures.create<
          TextureEntry,
          HTMLImageElement
        >({
          entries: () => entries,
          load: image,
          apply(batch, level) {
            surface.beginUpdate();
            try {
              for (const { entry, image: im } of batch) {
                if (entry.back) {
                  surface.setTexture('art_back', im);
                  continue;
                }
                const layer = doc.layers.find(
                  (layer) => layer.id === entry.layerId,
                );
                if (!layer) continue;
                const picture = entryPicture(entry, im);
                if (layer.kind === 'foreground')
                  surface.setTexture('pop_foreground', picture);
                else if (layer.kind === 'background')
                  surface.setTexture('snap_background', picture);
                else if (layer.kind === 'image')
                  surface.addImage(layer, picture);
                else if (layer.kind === 'text') surface.setText(layer, picture);
              }
              surface.setTextureDetail(level);
              levels.set(surface, level === 'small' ? 'small' : 'large');
            } finally {
              surface.endUpdate();
            }
          },
        });
        loaders.set(surface, loader);
        await loader.set(initialTier);
        check(
          loader.current === initialTier,
          'initial published texture tier must load completely',
        );
      } else {
        surface.setTexture('art_back', await image(back));
        for (const layer of doc.layers) {
          if (layer.src) {
            const im =
              layer.kind === 'background' && big ? big : await image(layer.src);
            if (layer.kind === 'foreground')
              surface.setTexture('pop_foreground', im);
            else if (layer.kind === 'background')
              surface.setTexture('snap_background', im);
            else if (layer.kind === 'image') surface.addImage(layer, im);
          } else if (config.textAssets[layer.id])
            surface.setText(layer, await image(config.textAssets[layer.id]));
        }
      }
      for (const [id, pixels] of masks) surface.updateMask(id, pixels);
      surface.endUpdate();
      if (config.audio)
        check(
          await surface.setAudioEnabled(true),
          'enable action audio after user gesture',
        );
      surface.playAction(actionIds[index % actionIds.length], 0, false);
      return surface;
    };
    const started = performance.now();
    for (
      let i = 0;
      i < count && document.body.dataset.benchmarkCancel !== 'true';
      i++
    )
      surfaces.push(await load(i));
    const loadMs = performance.now() - started;
    const options = (i: number, time: number) => ({
      angle: [Math.sin(time * 0.7 + i) * 0.2, Math.cos(time * 0.5) * 0.08],
      root: [
        ((i % columns) - (columns - 1) / 2) * 1.15 * scale,
        ((rows - 1) / 2 - Math.floor(i / columns)) * 1.7 * scale,
        0,
        scale,
      ],
      time,
      visibleCards: count,
      width,
      height,
      detail: {
        level: levels.get(surfaces[i]) || initialTier,
        ...(assets && !config.retainSmallEffects
          ? profile.effects(
              assets.profile.settings,
              levels.get(surfaces[i]) || initialTier,
            )
          : { particles: true, materials: true, decorations: true }),
      },
    });
    let triangles = 0,
      particles = 0;
    const draw = (time: number) => {
      gl.viewport(0, 0, width, height);
      gl.clearColor(0.035, 0.045, 0.06, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      triangles = 0;
      particles = 0;
      surfaces.forEach((s, i) => {
        const result = s.drawExternal(options(i, time));
        triangles += result.triangles;
        particles += result.particles;
      });
    };
    draw(0.7);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    check(
      gl.getError() === gl.NO_ERROR,
      'GL error after first multi-card frame',
    );
    const gpuDrawProfile: Array<{
      label: string;
      draws: number;
      totalMs: number;
    }> = [];
    if (config.gpuDrawProfile && timer) {
      const totals = new Map<
        string,
        { label: string; draws: number; totalMs: number }
      >();
      try {
        profileActive = true;
        draw(0.7);
        profileActive = false;
        check(
          !profileDropped,
          'Incomplete per-draw diagnosis; discard this run',
        );
        const deadline = performance.now() + 5000;
        while (profileQueries.length && performance.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 16));
          if (gl.getParameter(timer.GPU_DISJOINT_EXT))
            throw Error('Disjoint per-draw GPU diagnosis; discard this run');
          while (
            profileQueries.length &&
            timer.getQueryObjectEXT(
              profileQueries[0].query,
              timer.QUERY_RESULT_AVAILABLE_EXT,
            )
          ) {
            const { query, label } = profileQueries.shift()!;
            const value =
              Number(timer.getQueryObjectEXT(query, timer.QUERY_RESULT_EXT)) /
              1e6;
            timer.deleteQueryEXT(query);
            const total = totals.get(label) || { label, draws: 0, totalMs: 0 };
            total.draws++;
            total.totalMs += value;
            totals.set(label, total);
          }
        }
        check(profileQueries.length === 0, 'GPU draw diagnosis timed out');
        gpuDrawProfile.push(...totals.values());
      } finally {
        profileActive = false;
        profileQueries
          .splice(0)
          .forEach(({ query }) => timer.deleteQueryEXT(query));
      }
    }
    const warm = resources(),
      submit: number[] = [],
      intervals: number[] = [],
      memory: Array<ReturnType<typeof resources> & { heapUsed?: number }> = [],
      longTasks: number[] = [];
    const longTaskSupported =
      typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes.includes('longtask');
    if (longTaskSupported) {
      observer = new PerformanceObserver((list) =>
        longTasks.push(...list.getEntries().map((e) => e.duration)),
      );
      observer.observe({ entryTypes: ['longtask'] });
    }
    const fps = bindings.CardCosmetics.budget(quality).fps;
    const begin = performance.now();
    if (config.traceTag) performance.mark(config.traceTag + ':start');
    let previous = 0,
      next = begin,
      frames = 0,
      lastMemory = begin;
    await new Promise<void>((resolve, reject) => {
      const frame = (now: number) => {
        try {
          if (
            now - begin >= seconds * 1000 ||
            document.body.dataset.benchmarkCancel === 'true'
          ) {
            resolve();
            return;
          }
          if (now >= next) {
            collectGPU();
            if (previous) intervals.push(now - previous);
            previous = now;
            next = Math.max(next + 1000 / fps, now);
            const q =
              timer && frames % 10 === 0 && queries.length < 4
                ? timer.createQueryEXT()
                : null;
            const at = performance.now();
            if (q) timer!.beginQueryEXT(timer!.TIME_ELAPSED_EXT, q);
            draw((now - begin) / 1000);
            if (q) {
              timer!.endQueryEXT(timer!.TIME_ELAPSED_EXT);
              queries.push(q);
            }
            submit.push(performance.now() - at);
            frames++;
            if (now - lastMemory >= 1000) {
              const heap = (
                performance as Performance & {
                  memory?: { usedJSHeapSize: number };
                }
              ).memory?.usedJSHeapSize;
              memory.push({ ...resources(), heapUsed: heap });
              lastMemory = now;
              window.dispatchEvent(
                new CustomEvent('cardscape-benchmark-progress', {
                  detail: {
                    seconds: (now - begin) / 1000,
                    frames,
                    count,
                    resources: memory[memory.length - 1],
                  },
                }),
              );
            }
          }
          requestAnimationFrame(frame);
        } catch (error) {
          reject(error);
        }
      };
      requestAnimationFrame(frame);
    });
    if (config.traceTag) performance.mark(config.traceTag + ':end');
    observer?.disconnect();
    const elapsedMs = performance.now() - begin,
      steady = resources();
    draw(0.7);
    const steadyParticles = particles,
      steadyTriangles = triangles;
    const decodedImageBytes = () =>
      [...images.values()].reduce(
        (n, image) => n + image.naturalWidth * image.naturalHeight * 4,
        0,
      );
    const steadyDecodedBytes = decodedImageBytes();
    const canvasPNG = canvas.toDataURL();
    const transitions: Array<{
      tier: TextureTier;
      resources: ReturnType<typeof resources>;
      particles: number;
    }> = [];
    if (
      assets &&
      config.transitionCycles &&
      document.body.dataset.benchmarkCancel !== 'true'
    ) {
      await Promise.all(
        [...loaders.values()].map((loader) => loader.set('large')),
      );
      check(
        [...loaders.values()].every((loader) => loader.current === 'large'),
        'large reference must use the complete requested tier',
      );
      draw(0.7);
      const largeReference = canvas.toDataURL();
      for (
        let cycle = 0;
        cycle < config.transitionCycles &&
        document.body.dataset.benchmarkCancel !== 'true';
        cycle++
      ) {
        for (const tier of ['small', 'large'] as const) {
          if (document.body.dataset.benchmarkCancel === 'true') break;
          const clocks = surfaces.map((surface) => surface.getView());
          await Promise.all(
            [...loaders.values()].map((loader) => loader.set(tier)),
          );
          check(
            [...loaders.values()].every((loader) => loader.current === tier),
            'failed tier downloads cannot count as successful transitions',
          );
          check(
            surfaces.every(
              (surface, index) =>
                JSON.stringify(surface.getView()) ===
                JSON.stringify(clocks[index]),
            ),
            'texture switches must preserve animation/view clocks',
          );
          draw(0.7);
          transitions.push({ tier, resources: resources(), particles });
          if (tier === 'large')
            check(
              canvas.toDataURL() === largeReference,
              'large tier round trip must reproduce the identical GPU frame',
            );
        }
      }
      for (const tier of ['small', 'large'] as const) {
        const samples = transitions.filter((sample) => sample.tier === tier);
        check(
          samples.every((sample) =>
            [
              'textures',
              'textureBytes',
              'buffers',
              'bufferBytes',
              'programs',
              'shaders',
            ].every(
              (key) =>
                sample.resources[key as keyof ReturnType<typeof resources>] ===
                samples[0].resources[key as keyof ReturnType<typeof resources>],
            ),
          ),
          'tier round trips must retain bounded live GPU resources',
        );
      }
    }
    const gpuDeadline = performance.now() + 2000;
    while (queries.length && performance.now() < gpuDeadline) {
      await new Promise((r) => setTimeout(r, 16));
      collectGPU();
    }
    const gpuPending = queries.length;
    queries.splice(0).forEach((q) => timer!.deleteQueryEXT(q));
    check(gl.getError() === gl.NO_ERROR, 'GL error during multi-card playback');
    // No automatic animation is scheduled by embedded surfaces. A static board
    // has no renderer work until its host calls drawExternal again.
    const audioBeforePause = config.audio
      ? surfaces.map((surface) => surface.getAudioState())
      : [];
    surfaces.forEach((surface) => surface.setPaused(true));
    const audioPaused = config.audio
      ? surfaces.map((surface) => surface.getAudioState())
      : [];
    check(
      audioPaused.every((state) => state.voices === 0),
      'paused audio must release voices',
    );
    const paused = resources();
    await new Promise((r) => setTimeout(r, 500));
    const pauseStable = JSON.stringify(paused) === JSON.stringify(resources());
    const audioSurfaces = config.audio ? [...surfaces] : [];
    surfaces.forEach(release);
    const audioReleased = audioSurfaces.map((surface) =>
      surface.getAudioState(),
    );
    check(
      audioReleased.every((state) => state.voices === 0 && state.sources === 0),
      'released audio has no voice or decoded source ownership',
    );
    surfaces.length = 0;
    const released = resources();
    const cycleResources: ReturnType<typeof resources>[] = [];
    for (
      let cycle = 0;
      cycle < cycles && document.body.dataset.benchmarkCancel !== 'true';
      cycle++
    ) {
      const s = await load(cycle);
      s.drawExternal(options(0, 0.7));
      release(s);
      cycleResources.push(resources());
    }
    const final = resources();
    const summary = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        count: values.length,
        p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
        p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
        max: sorted.at(-1) || 0,
      };
    };
    const result = {
      renderer,
      count,
      quality,
      action: config.action || 'alternating',
      audio: {
        enabled: !!config.audio,
        beforePause: audioBeforePause,
        paused: audioPaused,
        released: audioReleased,
      },
      textureMode: mode,
      initialTier,
      projectedPixels,
      smallEffects: !!config.retainSmallEffects,
      transitions,
      large,
      stress: !!config.stress,
      repeatingActions: true,
      viewport: [width, height],
      seconds,
      loadMs,
      elapsedMs,
      frames,
      submittedFps: (frames * 1000) / elapsedMs,
      submitMs: summary(submit),
      frameIntervalMs: summary(intervals),
      longTasks: summary(longTasks),
      triangles: steadyTriangles,
      particles: steadyParticles,
      warm,
      steady,
      memory,
      pauseStable,
      released,
      cycleResources,
      final,
      canvasPNG,
      gpuMs: timer ? summary(gpuTimes) : null,
      gpuDrawProfile: config.gpuDrawProfile ? gpuDrawProfile : undefined,
      disjointSamples,
      gpuPending,
      steadyWindow: [begin, begin + elapsedMs],
      longTaskSupported,
      backgrounded,
      cancelled: document.body.dataset.benchmarkCancel === 'true',
      decodedImageBytes: steadyDecodedBytes,
      decodedBytesAfterTransitions: decodedImageBytes(),
      largeImageBytes: big ? big.width * big.height * 4 : 0,
      contextLost: gl.isContextLost(),
    };
    check(pauseStable, 'paused board must not allocate or draw');
    check(
      final.textures === 0 &&
        final.buffers === 0 &&
        final.programs === 0 &&
        final.shaders === 0,
      'all owned GL resources must be released',
    );
    return result;
  } finally {
    observer?.disconnect();
    document.removeEventListener('visibilitychange', visibilityChanged);
    owners.forEach((s) => s.dispose());
    loaders.forEach((loader) => loader.dispose());
    queries.splice(0).forEach((q) => timer?.deleteQueryEXT(q));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.remove();
  }
}
