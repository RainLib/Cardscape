declare module 'gifenc' {
  export function quantize(
    pixels: Uint8ClampedArray,
    colors: number,
    options: { format: 'rgb565' },
  ): number[][];
  export function applyPalette(
    pixels: Uint8ClampedArray,
    palette: number[][],
    format: 'rgb565',
  ): Uint8Array;
  export function GIFEncoder(): {
    writeFrame(
      indexes: Uint8Array,
      width: number,
      height: number,
      options: {
        palette: number[][];
        delay: number;
        repeat: number;
      },
    ): void;
    finish(): void;
    bytes(): Uint8Array<ArrayBuffer>;
  };
}
