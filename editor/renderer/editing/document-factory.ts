import type { CardDocument, TextStyle } from '../../shared/document';
import type { ProcessResult } from '../../shared/editor-services';
import { canvasFor } from '../core/image-assets.ts';
import { requiredMaskIds } from '../core/mask-assets.ts';
import runtime from '../rendering/runtime-model.ts';
import cosmetics from './cosmetics-model.ts';
import spatial from '../rendering/spatial-model.ts';
import frame from './frame-model.ts';
import i18n from '../localization/ui-i18n.ts';
import type { UiLanguage } from '../../shared/contracts';

export async function createBlankDocument(
  name: string,
  services: { mesh(): Promise<ProcessResult>; textStyle(): Partial<TextStyle>; language?: UiLanguage },
): Promise<CardDocument> {
  const label = (text: string) => i18n.text(text, services.language || 'en');
  const canvas = canvasFor(),
    ctx = canvas.getContext('2d')!,
    clear = canvas.toDataURL('image/png');
  const masks: Record<string, string> = {};
  const colors = new Map<string, string>();
  for (const id of requiredMaskIds) {
    const color = id === 'coverage' ? 'white' : 'black';
    let encoded = colors.get(color);
    if (!encoded) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1024, 1536);
      encoded = canvas.toDataURL('image/png');
      colors.set(color, encoded);
    }
    masks[id] = encoded;
  }
  ctx.fillStyle = '#1c2934';
  ctx.fillRect(0, 0, 1024, 1536);
  const mesh = await services.mesh();
  if (!mesh.positions || !mesh.uv || !mesh.indices)
    throw Error('原生网格响应缺少几何数据');
  const document: CardDocument = {
    schema: 'card-atelier/1',
    cosmetics: { ...cosmetics.defaults, level: 'common' },
    name: name.trim() || label('未命名卡片'),
    width: 1024,
    height: 1536,
    previewMode: 'authored',
    spatial: { ...spatial.defaults },
    foregroundMesh: {
      ...mesh,
      positions: mesh.positions,
      uv: mesh.uv,
      indices: mesh.indices,
    },
    masks,
    back: canvas.toDataURL('image/png'),
    meshGuides: [],
    effects: {
      depth: 1,
      background: 1,
      cape: true,
      flow: true,
      frame: true,
      paused: false,
    },
    layers: [
      {
        id: 'title',
        name: label('可编辑文字'),
        kind: 'text',
        text: '',
        textStyle: services.textStyle(),
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        visible: true,
        locked: false,
      },
      {
        id: 'frame',
        name: label('立体边框'),
        kind: 'frame',
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        visible: true,
        locked: true,
      },
      {
        id: 'foreground',
        name: label('待导入人物'),
        kind: 'foreground',
        src: clear,
        master: clear,
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        visible: false,
        locked: false,
      },
      {
        id: 'background',
        name: label('待导入背景'),
        kind: 'background',
        src: clear,
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        visible: true,
        locked: false,
      },
    ],
  };
  runtime.ensure(document);
  document.frameStyle = { ...frame.defaults };
  return document;
}
