import S from './spine-import-model.ts';
import type { CardDocument } from '../../shared/document';
import type { SpineSource, SpineOptions } from '../../shared/spine';
import type {
  CharacterArchive,
  CharacterImportAdapter,
  DocumentValidator,
} from '../../shared/character-import';

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const array = (value: unknown, check: (value: unknown) => boolean): boolean =>
  Array.isArray(value) && value.every(check);
const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value);
const string = (value: unknown): value is string => typeof value === 'string';
const boolean = (value: unknown) => typeof value === 'boolean';
function fields(
  value: unknown,
  required: Record<string, (v: unknown) => boolean>,
  optional: Record<string, (v: unknown) => boolean> = {},
): boolean {
  return (
    record(value) &&
    Object.entries(required).every(([k, check]) => check(value[k])) &&
    Object.entries(optional).every(
      ([k, check]) => value[k] === undefined || check(value[k]),
    )
  );
}
const numbers = (value: unknown) => array(value, number),
  strings = (value: unknown) => array(value, string);
const entries = (check: (value: unknown) => boolean) => (value: unknown) =>
  record(value) && Object.values(value).every(check);
const numeric = (keys: string[]) =>
  Object.fromEntries(keys.map((key) => [key, number]));
const frame = (value: unknown) =>
  fields(
    value,
    {},
    {
      ...numeric([
        'time',
        'x',
        'y',
        'angle',
        'value',
        'mix',
        'softness',
        'offset',
      ]),
      name: (v) => v === null || string(v),
      bendPositive: boolean,
      stretch: boolean,
      compress: boolean,
      vertices: numbers,
      curve: (v) => numbers(v) || v === 'stepped' || v === 'linear',
    },
  );
const frames = (value: unknown) => array(value, frame);
const attachment = (value: unknown) =>
  fields(
    value,
    {},
    {
      ...numeric(['x', 'y', 'rotation', 'scaleX', 'scaleY', 'width', 'height']),
      path: string,
      name: string,
      type: string,
      color: string,
      parent: string,
      uvs: numbers,
      vertices: numbers,
      triangles: numbers,
    },
  );
const attachments = entries(entries(attachment));
const skin = (value: unknown) =>
  fields(value, { name: string }, { attachments });
const animation = (value: unknown) =>
  fields(
    value,
    {},
    {
      bones: entries(entries(frames)),
      ik: entries(frames),
      slots: entries(entries(frames)),
      deform: entries(entries(entries(frames))),
      attachments: entries(entries(entries(entries(frames)))),
    },
  );

/** Structural decoding precedes the converter's version, feature and geometry checks. */
function decodeSpine(value: unknown): SpineSource {
  const bone = (v: unknown) =>
    fields(
      v,
      { name: string },
      {
        ...numeric([
          'x',
          'y',
          'rotation',
          'scaleX',
          'scaleY',
          'shearX',
          'shearY',
          'length',
        ]),
        parent: string,
        transform: string,
        inherit: string,
        skin: boolean,
      },
    );
  const slot = (v: unknown) =>
    fields(
      v,
      { name: string, bone: string },
      {
        attachment: string,
        visible: boolean,
        color: string,
        dark: string,
        blend: string,
      },
    );
  const ik = (v: unknown) =>
    fields(
      v,
      { name: string, bones: strings, target: string },
      {
        ...numeric(['mix', 'order', 'softness']),
        stretch: boolean,
        compress: boolean,
        skin: boolean,
        bendPositive: boolean,
      },
    );
  function source(v: unknown): v is SpineSource {
    return fields(
      v,
      {
        skeleton: (s) =>
          fields(s, { spine: string }, numeric(['x', 'y', 'width', 'height'])),
        bones: (b) => array(b, bone),
      },
      {
        slots: (s) => array(s, slot),
        ik: (i) => array(i, ik),
        skins: (s) =>
          Array.isArray(s) ? array(s, skin) : entries(attachments)(s),
        animations: entries(animation),
        transform: Array.isArray,
        path: Array.isArray,
        physics: Array.isArray,
      },
    );
  }
  if (!source(value)) throw Error('Spine 骨骼、Slot、Skin 或动画数据格式无效');
  if (
    value.bones.length > 64 ||
    (value.slots?.length || 0) > 32 ||
    Object.keys(value.skins || {}).length > 128
  )
    throw Error('Spine 骨骼、Slot 或 Skin 格式无效或超限');
  return value;
}

const schema = 'card-character-animation-import/1';
const trackFields = [
  'boneTracks',
  'ikTracks',
  'expressionTracks',
  'deformTracks',
  'layerTracks',
] as const;
function pack(doc: CardDocument): CharacterArchive {
  return {
    schema,
    characterRig: structuredClone(doc.characterRig),
    actions: structuredClone(
      (doc.actions || []).filter((a) =>
        trackFields.some((k) => a[k] && Object.keys(a[k]).length),
      ),
    ),
  };
}
type Identified = Record<string, unknown> & { id: string };
const identified = (v: unknown): v is Identified =>
  record(v) && typeof v.id === 'string';
function identifiedList(v: unknown): v is Identified[] {
  return Array.isArray(v) && v.every(identified);
}
function createRegistry(validateDocument: DocumentValidator) {
  const adapters = new Map<string, CharacterImportAdapter>();
  function register(adapter: CharacterImportAdapter) {
    if (
      !adapter ||
      !/^[-a-z0-9]{1,64}$/.test(adapter.id) ||
      typeof adapter.convert !== 'function' ||
      adapters.has(adapter.id)
    )
      throw Error('人物动画导入适配器无效或重复');
    adapters.set(adapter.id, adapter);
  }
  register({
    id: 'spine-json',
    convert: (value, options) => S.convert(decodeSpine(value), options),
  });
  register({
    id: 'cardscape',
    convert(value) {
      if (!record(value) || value.schema !== schema)
        throw Error('人物动画交换格式无效');
      return value;
    },
  });
  function convert(
    format: string,
    payload: unknown,
    doc: CardDocument,
    options: SpineOptions = {},
  ): CardDocument {
    const adapter = adapters.get(format);
    if (!adapter) throw Error('尚未安装 ' + format + ' 人物动画导入适配器');
    const input: unknown =
      typeof payload === 'string'
        ? JSON.parse(payload)
        : structuredClone(payload);
    const result = adapter.convert(input, {
      ...options,
      document: structuredClone(doc),
      layerMap: { ...options.layerMap },
    });
    if (
      !record(result) ||
      result.schema !== schema ||
      !record(result.characterRig) ||
      !identifiedList(result.actions) ||
      Object.keys(result).some(
        (k) =>
          ![
            'schema',
            'characterRig',
            'actions',
            'unsupported',
            'layerOrder',
            'newLayers',
          ].includes(k),
      )
    )
      throw Error('人物动画适配结果无效');
    if (
      result.unsupported !== undefined &&
      (!Array.isArray(result.unsupported) || !result.unsupported.every(string))
    )
      throw Error('人物动画适配结果无效');
    if (Array.isArray(result.unsupported) && result.unsupported.length)
      throw Error('导入包含不支持的能力：' + result.unsupported.join('、'));
    if (
      result.actions.length > 24 ||
      new Set(result.actions.map((a) => a.id)).size !== result.actions.length
    )
      throw Error('导入动作数量或 ID 无效');
    const rig = structuredClone(result.characterRig),
      layers: Identified[] = structuredClone(doc.layers);
    if (result.newLayers !== undefined && !identifiedList(result.newLayers))
      throw Error('图集新增图层无效或重复');
    if (identifiedList(result.newLayers) && result.newLayers.length) {
      if (
        format !== 'spine-json' ||
        result.newLayers.length > 32 ||
        result.newLayers.some((l) => layers.some((old) => old.id === l.id))
      )
        throw Error('图集新增图层无效或重复');
      layers.unshift(...structuredClone(result.newLayers));
    }
    let nextLayers = layers;
    if (result.layerOrder !== undefined) {
      const order = result.layerOrder;
      if (
        rig.meshes !== undefined &&
        (!Array.isArray(rig.meshes) ||
          !rig.meshes.every((m) => record(m) && typeof m.layerId === 'string'))
      )
        throw Error('导入图层顺序无效');
      const meshes: unknown[] = Array.isArray(rig.meshes) ? rig.meshes : [],
        ids = new Set(meshes.map((m) => (record(m) ? m.layerId : undefined)));
      if (
        !Array.isArray(order) ||
        !order.every(string) ||
        order.length !== ids.size ||
        new Set(order).size !== order.length ||
        order.some((id) => !ids.has(id))
      )
        throw Error('导入图层顺序无效');
      const mapped = new Map(layers.map((l) => [l.id, l]));
      let i = 0;
      nextLayers = layers.map((l) => {
        if (!ids.has(l.id)) return l;
        const found = mapped.get(String(order[i++]));
        if (!found) throw Error('导入图层顺序无效');
        return found;
      });
    }
    let actions: Identified[] = structuredClone(doc.actions || []);
    if (format === 'spine-json')
      actions = actions.filter(
        (a) =>
          !trackFields.some((k) => record(a[k]) && Object.keys(a[k]).length),
      );
    for (const action of actions)
      for (const key of trackFields) delete action[key];
    for (const action of result.actions) {
      const i = actions.findIndex((old) => old.id === action.id);
      if (i < 0) actions.push(structuredClone(action));
      else actions[i] = structuredClone(action);
    }
    const next: unknown = {
      ...structuredClone(doc),
      characterRig: rig,
      layers: nextLayers,
      actions,
    };
    validateDocument(next);
    return next;
  }
  return { register, convert, formats: () => [...adapters.keys()] };
}
export default { schema, pack, createRegistry, decodeSpine };
