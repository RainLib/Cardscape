import path from 'node:path';

/** Source resources and generated runtime files deliberately have distinct roots. */
export const ROOT = path.resolve(__dirname, '../..');
export const RENDERER = path.resolve(__dirname, '../renderer');
export const packagedResources = process.versions.electron && require('electron').app?.isPackaged
  ? process.resourcesPath
  : undefined;
export const SDK = packagedResources
  ? path.join(packagedResources, 'godot-sdk')
  : path.resolve(ROOT, '../sdk/godot');
export const nativeAiSource = path.join(ROOT, 'native-ai');
export const nativeBinary = path.join(
  packagedResources ? path.join(packagedResources, 'worker') : path.join(ROOT, 'native/target/release'),
  process.platform === 'win32' ? 'card-worker.exe' : 'card-worker',
);
