/** Native preload and third-party asset module boundaries. */
interface Window {
  atelier?: import('../shared/contracts').EditorBridge;
}

declare function importScripts(...urls: string[]): void;
declare module '*.css';
declare module 'litegraph.js/build/litegraph.core.js';

declare module '*.mjs';
// Lazy plugin entry points are checked in the main migration project.
declare module '@cardscape/shader-editor';
declare module '@cardscape/shader-nodes';
