import type { CardLayer } from '../../shared/document';
import type { PreviewAPI } from '../../shared/preview';
import type {
  SurfaceOptions,
  PreviewRegion,
} from '../../shared/surface-preview';
import type {
  SetupOptions,
  CaptureResult,
  SetupPlan,
} from '../../shared/agent-setup';
import player from '../../renderer/rendering/player-model';
import { createAgentSetup, authResult } from '../../electron/agent-setup';

function contracts(
  preview: PreviewAPI,
  options: SurfaceOptions,
  setup: SetupOptions,
  layer: CardLayer,
) {
  preview.setTexture('foreground', new ImageData(1, 1));
  preview.addImage(layer, new ImageData(1, 1));
  preview.updateMask(
    'motion',
    { width: 1, height: 1, data: new Uint8ClampedArray(4) },
    { x: 0, y: 0, width: 1, height: 1 },
  );
  // @ts-expect-error A mask update requires pixels, not a DOM image still awaiting decode.
  preview.updateMask('motion', new Image());
  // @ts-expect-error GPU contexts are required for surface construction.
  const invalid: SurfaceOptions = { canvas: options.canvas };
  const region: PreviewRegion = {
    mode: 'mask',
    map: options.canvas,
    version: 1,
  };
  preview.setRegion(region);
  preview.setPreviewLevel(null);
  preview.compileShader({ fragmentBody: 'return color;' });
  // @ts-expect-error GLSL source text cannot be numeric.
  preview.compileShader({ fragmentBody: 12 });
  const frame = preview.drawExternal({
    angle: [0, 0],
    root: [0, 0, 0, 1],
    time: 1,
  });
  frame.triangles.toFixed();
  // @ts-expect-error Embedded render clocks use numeric seconds.
  preview.drawExternal({ angle: [0, 0], root: [0, 0, 0, 1], time: 'now' });
  const manifest = player.manifest({});
  manifest.layers[0].asset?.toUpperCase();
  const decoded = player.document(manifest);
  decoded.actions[0].duration.toFixed();
  const capture: CaptureResult = { code: 0, output: 'Logged in' };
  authResult('codex', capture).ready.valueOf();
  // @ts-expect-error CLI exit codes are numeric or null.
  authResult('codex', { code: '0', output: 'Logged in' });
  const plan: SetupPlan = { available: true, binary: 'cli', args: [] };
  // @ts-expect-error Executable plans include argv.
  const invalidPlan: SetupPlan = { available: true, binary: 'cli' };
  void createAgentSetup(setup);
  void invalid;
  void plan;
  void invalidPlan;
}
void contracts;
