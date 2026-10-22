import path from 'node:path';

/** Source resources and generated runtime files deliberately have distinct roots. */
export const ROOT = path.resolve(__dirname, '../..');
export const RENDERER = path.resolve(__dirname, '../renderer');
export const SDK = path.resolve(ROOT, '../sdk/godot');
export const nativeBinary = path.join(ROOT, 'native/target/release', process.platform === 'win32' ? 'card-worker.exe' : 'card-worker');
