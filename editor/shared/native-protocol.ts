export interface MeshGeometry {
  positions: number[];
  uv: number[];
  indices: number[];
  triangles?: number;
  separate_render_surface?: boolean;
  role?: string;
}
export interface NativeImage {
  image: string;
}
export interface SizedImage extends NativeImage {
  width: number;
  height: number;
}
export interface NativeResults {
  ping: {
    engine: string;
    version: string;
    operations: string[];
    parallel_threads?: number;
  };
  mesh: MeshGeometry;
  texture_variant: SizedImage & { sourceWidth: number; sourceHeight: number };
  mask_stats: {
    width: number;
    height: number;
    mean: number;
    active_pixels: number;
    bytes: number;
  };
  bake_mask: SizedImage;
  feather: SizedImage;
  resize: SizedImage;
  selection: NativeImage & { points: number[][]; algorithm: string };
  mask_combine: NativeImage;
  alpha: NativeImage & { cleared_transparent_pixels: number };
  clean_alpha: NativeImage & { cleared_pixels: number; threshold: number };
  underpaint: NativeImage & { addedMask: string; filled_pixels: number };
  repair_split: NativeImage & {
    parent: string;
    mask: string;
    changed_pixels: number;
  };
  image_channel: SizedImage;
  agent_image: SizedImage;
  refine_selection: SizedImage;
  adjust_image: NativeImage;
  wand_selection: SizedImage;
  title_raster: SizedImage;
}
export type Timed<T> = T & { elapsedMs: number };
