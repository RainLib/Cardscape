import type {
  CharacterAction,
  ParticleWorldSampler,
  ActionAudioState,
} from './character';
import type { RuntimeShader } from './runtime';
import type {
  ExternalView,
  SurfaceResult,
  PreviewRegion,
  PixelRect,
  PixelImage,
} from './surface-preview';
import type { InspectionOptions } from '../renderer/rendering/inspection-model';
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
export interface PreviewCaptureFrame {
  yaw: number;
  pitch: number;
  x: number;
  y: number;
  time: number;
  action?: { id: string; seconds: number };
}
export interface PreviewCapture {
  frame(pose: PreviewCaptureFrame): void;
  dispose(): void;
}
export interface PreviewAPI {
  setDocument(document: CardDocument): void;
  setTexture(
    group: string,
    image:
      | HTMLImageElement
      | HTMLCanvasElement
      | ImageBitmap
      | OffscreenCanvas
      | ImageData,
  ): void;
  addImage(
    layer: CardLayer,
    image:
      | HTMLImageElement
      | HTMLCanvasElement
      | ImageBitmap
      | OffscreenCanvas
      | ImageData,
  ): void;
  setText(
    layer: CardLayer,
    image: HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas,
  ): void;
  updateMask(
    id: string,
    image: PixelImage,
    rect?: PixelRect,
    source?: { canvas: HTMLCanvasElement; version: number },
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
  setRegion(value: PreviewRegion | null): void;
  compileSources(vertex: string, fragment: string): ShaderResult;
  compileShader(
    config: Partial<RuntimeShader>,
    document?: CardDocument,
  ): ShaderResult;
  compileGeometry(body: string): ShaderResult;
  playAction(
    id: string,
    seconds?: number,
    paused?: boolean,
    draft?: CharacterAction | null,
  ): void;
  stopAction(): void;
  setAudioEnabled(value: boolean): Promise<boolean>;
  getAudioState(): ActionAudioState;
  setParticleWorldSampler(sampler: ParticleWorldSampler | null): void;
  transitionPose(yaw: number, pitch?: number, duration?: number): void;
  inspect(
    value?: InspectionOptions,
    seconds?: number,
    paused?: boolean,
  ): boolean;
  pauseInspection(): void;
  stopInspection(): void;
  replayParticles(): void;
  setPreviewLevel(value: string | null): void;
  getPreviewLevel(): string;
  getCharacterGeometry(): Record<string, { positions: number[] }>;
  setRenderOverrides(value: Partial<CardDocument>): void;
  setEmitterContext(value: CardDocument | null): void;
  drawExternal(options: ExternalView): SurfaceResult;
  createCapture(canvas: HTMLCanvasElement): PreviewCapture;
  dispose(): void;
}

export interface ShaderEditors {
  set(id: string, value: string, options?: { reset?: boolean }): void;
  clearDiagnostics(): void;
  error(error: { stage?: string; message: string }): void;
  readonly(value: boolean): void;
  textCommand(command: string): boolean;
}
