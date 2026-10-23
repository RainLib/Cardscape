/** Native Material Maker graph data is extensible; unknown plugin fields stay opaque. */
export interface MaterialMakerExport extends Record<string, unknown> {
  files: Array<Record<string, unknown> & { type: string }>;
}
export interface MaterialMakerNode extends Record<string, unknown> {
  name: string;
  type?: string;
  parameters?: Record<string, unknown>;
  shader_model?: Record<string, unknown> & {
    exports?: Record<string, MaterialMakerExport>;
  };
}
export interface MaterialMakerProject extends Record<string, unknown> {
  type: 'graph';
  nodes: MaterialMakerNode[];
  connections: Array<Record<string, unknown> & { from: string; to: string }>;
}
export interface MaterialMakerShader {
  fragmentPrelude: string;
  fragmentBody: string;
  functions: string[];
  bytes: number;
}
export interface MaterialMakerJob extends Record<string, unknown> {
  id: string;
  documentToken: string;
  documentId?: string;
  layerId: string;
  layerName?: string;
  revision: number;
  createdAt?: number;
  exportHash: string | null;
}
export interface MaterialMakerNativeState extends Record<string, unknown> {
  pid?: number;
  at?: number;
  phase?: string;
  request?: string;
  error?: string;
}
export interface MaterialMakerOpen {
  documentToken: string;
  documentId?: string;
  layerId: string;
  layerName?: string;
  revision: number;
  source?: string | null;
  masks?: Record<string, string> | null;
  project?: MaterialMakerProject | null;
}
export interface MaterialMakerOptions {
  runtimeDir: string;
  dialogs?: {
    importMaterialMaker?(): Promise<string | null | undefined>;
    reveal?(directory: string): unknown;
  };
  write(file: string, data: string): Promise<void>;
  processImage(
    op: 'resize',
    args: { image: string; width: number; height: number },
  ): Promise<{ image: string }>;
}
