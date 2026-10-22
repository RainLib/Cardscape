// Narrow ports for legacy renderer models. Keep the exporter contracts typed
// while the remaining renderer implementation is migrated independently.
import type { CardDocument } from '../shared/document';
import type { CharacterAction } from '../shared/character';
import type {
  ExportWorkshopModel,
  ExportDocument,
  ShaderSettings,
} from '../shared/export';
interface RuntimeModel {
  defaults: {
    shader: ShaderSettings;
    actions: CharacterAction[];
    deformation: Record<string, unknown>;
    effects: Record<string, unknown>;
  };
  compositionDefaults: Record<string, unknown>;
  armorDefaults: Record<string, unknown>;
  vertex(body: string): string;
  fragmentSource(body: string, back: boolean, prelude?: string): string;
  grid(): unknown;
}
interface FrameModel {
  resolve(
    doc: Partial<Pick<CardDocument, 'frameStyle'>>,
  ): Record<string, unknown>;
  geometry(style: unknown): unknown;
}
export const runtimeModel: RuntimeModel = require('../renderer/runtime-model.js');
export const frameModel: FrameModel = require('../renderer/frame-model.js');
export const workshopModel: ExportWorkshopModel = require('../renderer/workshop-model.js');
export const cosmeticsModel: {
  resolve(doc: ExportDocument): ExportDocument;
} = require('../renderer/cosmetics-model.js');
