import type { CardDocument, TextStyle } from '../../shared/document';
import type { ProcessResult } from '../../shared/editor-services';
import { canvasFor } from '../core/image-assets.ts';
import { maskNames } from '../core/mask-assets.ts';
import runtime from '../rendering/runtime-model.ts';
import cosmetics from './cosmetics-model.ts';
import spatial from '../rendering/spatial-model.ts';
import frame from './frame-model.ts';

export async function createBlankDocument(
  name: string,
  services: { mesh(): Promise<ProcessResult>; textStyle(): Partial<TextStyle> },
): Promise<CardDocument> {
  const canvas = canvasFor(),
    ctx = canvas.getContext('2d')!,
    clear = canvas.toDataURL('image/png');
  const masks: Record<string, string> = {};
  for (const id of Object.keys(maskNames)) {
    ctx.fillStyle = id === 'coverage' ? 'white' : 'black';
    ctx.fillRect(0, 0, 1024, 1536);
    masks[id] = canvas.toDataURL('image/png');
  }
  ctx.fillStyle = '#1c2934';
  ctx.fillRect(0, 0, 1024, 1536);
  const document: CardDocument = {
    schema: 'card-atelier/1',
    cosmetics: { ...cosmetics.defaults, level: 'common' },
    name: name.trim() || '未命名卡片',
    width: 1024,
    height: 1536,
    previewMode: 'authored',
    spatial: { ...spatial.defaults },
    foregroundMesh: await services.mesh(),
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
        name: '可编辑文字',
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
        name: '立体边框',
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
        name: '待导入人物',
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
        name: '待导入背景',
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
