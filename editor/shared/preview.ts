import type { CardDocument, CardLayer } from './document';

export interface PreviewView {
  yaw: number;
  pitch: number;
  time?: number;
  paused?: boolean;
  actionId?: string;
  actionSeconds?: number;
  root?: number[];
}
export interface ShaderResult {
  ok?: boolean;
  cached?: boolean;
  stage?: string;
  message?: string;
}
export interface PreviewAPI {
  setDocument(document: CardDocument): void;
  setTexture(group: string, image: TexImageSource): void;
  addImage(layer: CardLayer, image: TexImageSource): void;
  setText(layer: CardLayer, image: TexImageSource): void;
  updateMask(
    id: string,
    image: ImageData | HTMLCanvasElement | HTMLImageElement,
    rect?: unknown,
    source?: unknown,
  ): void;
  pose(yaw: number, pitch?: number): void;
  setTime(seconds: number): void;
  showWire(value: boolean): void;
  burst(): void;
  getView(): PreviewView;
  setPaused(value: boolean): boolean;
  setActive(value: boolean): void;
  setEffectsEnabled(value: boolean): void;
  setZoom(value: number): number;
  getZoom(): number;
  setTextureDetail(value: string): void;
  beginUpdate(): void;
  endUpdate(): void;
  removeTexture(id: string): void;
  removeMask(id: string): void;
  resetAssets(): void;
  setRegion(value: unknown): void;
  compileSources(vertex: string, fragment: string): ShaderResult;
  compileShader(config: unknown): ShaderResult;
  compileGeometry(body: string): ShaderResult;
  playAction(
    id: string,
    seconds?: number,
    paused?: boolean,
    draft?: unknown,
  ): void;
  stopAction(): void;
  transitionPose(yaw: number, pitch?: number, duration?: number): void;
  inspect(value?: unknown, seconds?: number, paused?: boolean): boolean;
  pauseInspection(): void;
  stopInspection(): void;
  replayParticles(): void;
  setPreviewLevel(value: string): void;
  getPreviewLevel(): string;
  getCharacterGeometry(): Record<string, { positions: number[] }>;
  setRenderOverrides(value: Partial<CardDocument>): void;
  setEmitterContext(value: CardDocument | null): void;
  drawExternal(options: unknown): unknown;
  dispose(): void;
}

export interface ShaderEditors {
  set(id: string, value: string, options?: { reset?: boolean }): void;
  clearDiagnostics(): void;
  error(error: { stage?: string; message: string }): void;
  readonly(value: boolean): void;
  textCommand(command: string): boolean;
}
