export type ExportPreset =
  | 'source'
  | 'mobile-list'
  | 'mobile-detail'
  | 'desktop';
export type TextureTier = 'small' | 'large';
export type ExportLayerRule = 'always' | 'detail' | 'omit';
export interface ExportSettings {
  schema: 'card-export-settings/1';
  preset: ExportPreset;
  adaptive: boolean;
  threshold: number;
  smallParticles: boolean;
  smallMaterials: boolean;
  smallDecorations: boolean;
  remoteDelivery: boolean;
  includeSource: boolean;
  layers: Record<string, ExportLayerRule>;
}
