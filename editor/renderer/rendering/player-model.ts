/** Decode portable export data before it reaches GPU or playback state. */
import type { CardDocument, CardLayer } from '../../shared/document';
import type { MeshGeometry } from '../../shared/native-protocol';
import type {
  ExportProfile,
  TextureAsset,
  TextureVariants,
} from '../../shared/export';
import runtime from './runtime-model.ts';
import profile from './export-profile.ts';
import back from '../workshop/back-asset-model.ts';
import components from '../workshop/component-model.ts';
function fail(): never {
  throw Error('播放器资源结构无效');
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string') return fail();
  return value;
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail();
  return value;
}
function optional(value: unknown, kind: 'string' | 'number' | 'boolean') {
  if (
    value !== undefined &&
    (typeof value !== kind || (kind === 'number' && !Number.isFinite(value)))
  )
    fail();
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return fail();
  return value.map(text);
}
function numbers(value: unknown): number[] {
  if (!Array.isArray(value)) return fail();
  return value.map(number);
}
function stringMap(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record(value)).map(([k, v]) => [k, text(v)]),
  );
}
function mesh(value: unknown): MeshGeometry {
  const v = record(value),
    positions = numbers(v.positions),
    uv = numbers(v.uv),
    indices = numbers(v.indices);
  if (
    positions.length % 3 ||
    uv.length !== (positions.length / 3) * 2 ||
    indices.length % 3 ||
    indices.some(
      (i) => !Number.isSafeInteger(i) || i < 0 || i >= positions.length / 3,
    )
  )
    fail();
  if (
    v.weights !== undefined &&
    numbers(v.weights).length !== (positions.length / 3) * 4
  )
    fail();
  return { ...v, positions, uv, indices };
}
function texture(value: unknown): TextureAsset {
  const v = record(value);
  for (const k of ['width', 'height']) optional(v[k], 'number');
  return { ...v, asset: text(v.asset) };
}
function exportProfile(value: unknown): ExportProfile {
  const v = record(value);
  if (v.schema !== 'card-export-profile/1') fail();
  const textures: Record<string, TextureVariants> = {};
  for (const [key, raw] of Object.entries(record(v.textures))) {
    const t = record(raw);
    const sourceSize =
      t.sourceSize === undefined ? undefined : numbers(t.sourceSize);
    if (
      sourceSize &&
      (sourceSize.length !== 2 || sourceSize.some((n) => n <= 0))
    )
      fail();
    textures[key] = {
      large: texture(t.large),
      small: texture(t.small),
      ...(sourceSize ? { sourceSize } : {}),
    };
  }
  return {
    schema: 'card-export-profile/1',
    settings: profile.validate(v.settings),
    textures,
  };
}
function layer(value: unknown): CardLayer {
  const v = record(value);
  if (
    !['image', 'text', 'foreground', 'background', 'frame'].includes(
      text(v.kind),
    )
  )
    fail();
  text(v.id);
  text(v.name);
  for (const k of ['x', 'y', 'scale', 'opacity']) number(v[k]);
  for (const k of [
    'asset',
    'src',
    'master',
    'role',
    'slotId',
    'splitSourceId',
    'ownershipMask',
    'blend',
    'componentStyle',
  ])
    optional(v[k], 'string');
  for (const k of [
    'visible',
    'locked',
    'previewReference',
    'shaderTransparent',
  ])
    optional(v[k], 'boolean');
  for (const k of ['rotation', 'shaderChannel']) optional(v[k], 'number');
  for (const k of ['adjustments', 'componentAdjustments'])
    if (v[k] !== undefined)
      for (const field of ['brightness', 'contrast', 'saturation', 'gamma'])
        optional(record(v[k])[field], 'number');
  if (v.sourceWindow)
    for (const field of ['x', 'y', 'width', 'height'])
      number(record(v.sourceWindow)[field]);
  // Spatial, text, animation and connection fields are checked by runtime.validate below.
  return v as unknown as CardLayer;
}
const placeholder = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
function particles(value: unknown) {
  const v = record(value);
  if (v.sprite !== undefined) text(v.sprite);
  components.validateParticles({
    ...v,
    ...(v.sprite ? { sprite: 'sprite.png' } : {}),
  });
}
function scene(value: unknown, depth: number): Record<string, unknown> {
  if (depth > 12) fail();
  const v = record(value);
  for (const key of ['src', 'sprite']) if (v[key] != null) text(v[key]);
  for (const key of ['layerRasters'])
    if (v[key] !== undefined) stringMap(v[key]);
  if (v.titleRasters !== undefined)
    for (const nested of Object.values(record(v.titleRasters)))
      stringMap(nested);
  if (v.document !== undefined)
    documentData(v.document, undefined, undefined, undefined, depth + 1);
  return v;
}
function documentData(
  value: unknown,
  actions?: unknown,
  slots?: unknown,
  geometry?: unknown,
  depth = 0,
) {
  const v = record(value);
  if (!Array.isArray(v.layers)) return fail();
  const layers = v.layers.map(layer);
  const effects = v.effects === undefined ? {} : record(v.effects);
  for (const k of ['depth', 'background', 'flowSpeed'])
    optional(effects[k], 'number');
  for (const k of ['cape', 'flow', 'paused']) optional(effects[k], 'boolean');
  for (const k of ['id', 'name', 'locale', 'back']) optional(v[k], 'string');
  const candidate = {
    ...v,
    schema: 'card-atelier/1',
    name: typeof v.name === 'string' ? v.name : 'GLSL 卡片',
    width: number(v.width ?? 1024),
    height: number(v.height ?? 1536),
    layers,
    masks: Array.isArray(v.masks)
      ? Object.fromEntries(strings(v.masks).map((id) => [id, '']))
      : v.masks === undefined
        ? {}
        : stringMap(v.masks),
    effects: { depth: 1, background: 1, cape: true, flow: true, ...effects },
    actions: actions ?? v.actions,
    slots: slots ?? v.slots,
    foregroundMesh:
      geometry === undefined
        ? v.foregroundMesh && typeof v.foregroundMesh !== 'string'
          ? mesh(v.foregroundMesh)
          : undefined
        : mesh(geometry),
  };
  if (candidate.actions !== undefined && !Array.isArray(candidate.actions))
    fail();
  if (candidate.slots !== undefined && !Array.isArray(candidate.slots)) fail();
  if (Array.isArray(candidate.slots))
    for (const slot of candidate.slots) record(slot);
  if (Array.isArray(candidate.actions))
    for (const action of candidate.actions) record(action);
  if (v.exportProfile !== undefined) exportProfile(v.exportProfile);
  if (v.particles !== undefined) particles(v.particles);
  if (v.material !== undefined) {
    components.validateMaterial(v.material);
    scene(v.material, depth);
  }
  if (v.backScene !== undefined) {
    const b = scene(v.backScene, depth);
    if (!Array.isArray(b.layers)) fail();
    back.validate({
      ...b,
      src: placeholder,
      layers: b.layers.map((raw) => {
        const l = record(raw);
        text(l.src);
        return { ...l, src: placeholder };
      }),
    });
  }
  if (v.componentScenes !== undefined)
    for (const child of Object.values(record(v.componentScenes)))
      scene(child, depth);
  // Export URLs are checked as strings above; authoring's inline PNG checks apply only to source files.
  runtime.validate({
    ...candidate,
    backScene: undefined,
    particles: undefined,
    componentScenes: undefined,
  });
  // Consumed layer, render, animation and component fields have passed their decoders.
  return runtime.ensure(candidate as unknown as CardDocument);
}
export interface PlayerManifest extends Record<string, unknown> {
  name: string;
  width: number;
  height: number;
  layers: CardLayer[];
  masks: string[];
  maskAssets?: Record<string, string>;
  backAsset?: string | null;
  foregroundMesh?: string | null;
  shaderAssets?: { vertex: string; fragment: string };
  exportProfile?: ExportProfile;
}
function manifest(value: unknown): PlayerManifest {
  const v = record(value);
  if (v.schema !== 'card-atelier-assets/1' || !Array.isArray(v.layers)) fail();
  const out = {
    ...v,
    name: text(v.name),
    width: number(v.width),
    height: number(v.height),
    layers: v.layers.map(layer),
    masks: strings(v.masks ?? []),
  };
  for (const k of ['backAsset', 'foregroundMesh']) if (v[k] != null) text(v[k]);
  if (v.maskAssets !== undefined) stringMap(v.maskAssets);
  if (v.shaderAssets !== undefined) {
    const s = record(v.shaderAssets);
    text(s.vertex);
    text(s.fragment);
  }
  if (v.exportProfile !== undefined) exportProfile(v.exportProfile);
  return out as PlayerManifest;
}
function reveals(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = record(value);
  return p.enabled === true && !!p.reveal && record(p.reveal).enabled === true;
}
const api = { manifest, document: documentData, mesh, text, reveals };
export default api;
