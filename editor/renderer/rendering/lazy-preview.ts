import type { PreviewAPI, PreviewView } from '../../shared/preview';

/** Keep home/layout setup cheap; instantiate GPU resources on the first document operation. */
export function createLazyPreview(factory: () => PreviewAPI): PreviewAPI {
  let current: PreviewAPI | null = null,
    active = false,
    effects = true,
    zoom = 1,
    disposed = false;
  const instance = () => {
    if (disposed) throw Error('Preview is disposed');
    if (!current) {
      current = factory();
      current.setActive(active);
      current.setEffectsEnabled(effects);
      current.setZoom(zoom);
    }
    return current;
  };
  const deferred = {
    getView: (): PreviewView =>
      current?.getView() || { yaw: 0, pitch: 0, time: 0, paused: false },
    getZoom: () => current?.getZoom() ?? zoom,
    getAudioState: () =>
      current?.getAudioState() || {
        enabled: false,
        context: 'uninitialized',
        voices: 0,
        sources: 0,
        decodedBytes: 0,
        starts: 0,
        error: '',
        level: 0,
      },
    getPreviewLevel: () => current?.getPreviewLevel() || 'authored',
    getCharacterGeometry: () => current?.getCharacterGeometry() || {},
    setActive(value: boolean) {
      active = value;
      current?.setActive(value);
    },
    setEffectsEnabled(value: boolean) {
      effects = value;
      current?.setEffectsEnabled(value);
    },
    setZoom(value: number) {
      zoom = Number.isFinite(value) ? Math.max(0.25, Math.min(3, value)) : 1;
      return current?.setZoom(zoom) ?? zoom;
    },
    dispose() {
      if (!disposed) current?.dispose();
      disposed = true;
    },
  } satisfies Partial<PreviewAPI>;
  const methods = new Set([
    'setDocument',
    'setTexture',
    'addImage',
    'setText',
    'updateMask',
    'pose',
    'setTime',
    'showWire',
    'burst',
    'setPaused',
    'setTextureDetail',
    'beginUpdate',
    'endUpdate',
    'removeTexture',
    'removeMask',
    'resetAssets',
    'setRegion',
    'compileSources',
    'compileShader',
    'compileGeometry',
    'playAction',
    'stopAction',
    'setParticleWorldSampler',
    'setAudioEnabled',
    'getAudioState',
    'transitionPose',
    'inspect',
    'pauseInspection',
    'stopInspection',
    'replayParticles',
    'setPreviewLevel',
    'setRenderOverrides',
    'setEmitterContext',
    'drawExternal',
    'createCapture',
  ]);
  return new Proxy({} as PreviewAPI, {
    get(target, key) {
      // Preserve normal method replacement (diagnostics and host adapters).
      if (Object.hasOwn(target, key)) return Reflect.get(target, key);
      if (key in deferred) return deferred[key as keyof typeof deferred];
      if (typeof key !== 'string' || !methods.has(key)) return undefined;
      return (...args: unknown[]) => {
        const api = instance();
        return Reflect.apply(api[key as keyof PreviewAPI], api, args);
      };
    },
  });
}
