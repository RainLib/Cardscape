import components from '../../renderer/workshop/component-model';
import cosmetics from '../../renderer/editing/cosmetics-model';
import back from '../../renderer/workshop/back-asset-model';
import workshop from '../../renderer/workshop/workshop-model';
import assets from '../../renderer/workshop/asset-workspace-model';
import drop from '../../renderer/workshop/asset-drop-model';
import runtime from '../../renderer/rendering/runtime-model';
import type { CardDocument } from '../../shared/document';
import type { WorkshopDocument } from '../../shared/projects';
import type { AssetOutput, DropState } from '../../shared/workshop';
import type { Particles, Material } from '../../shared/visual-components';
async function contracts(
  doc: CardDocument,
  project: WorkshopDocument,
  state: DropState,
  output: AssetOutput,
) {
  const material: Material = components.material({
    enabled: true,
    strength: 0.4,
  });
  const particles: Particles = components.particles({
    emitter: { target: 'frame' },
    reveal: { enabled: true },
  });
  const resolved = components.resolveEmitter(particles, doc);
  if (resolved.ok) resolved.geometry.u.toFixed(2);
  else resolved.reason.toUpperCase();
  // @ts-expect-error Emission geometry is absent on a failed binding.
  resolved.geometry.u.toFixed(2);
  const render = cosmetics.resolve(doc, { level: 'epic', visibleCards: 3 });
  render.cosmeticPreview.motion.valueOf();
  const reverse = back.create('data:image/png;base64,AA==');
  reverse.layers[0]?.depth.toFixed(2);
  const frame = workshop.capture(doc, 'frame');
  workshop.apply(doc, 'frame', frame);
  const captured = drop.capture(state, 'frame', 1);
  drop.plan(state, captured);
  const draft = assets.start(project, { blank: doc, kind: 'back' });
  assets.pack(doc, output, 'back');
  const encoded = await workshop.encode(draft);
  // @ts-expect-error Serialized graphs remain opaque until decoded.
  encoded.project.cards;
  // @ts-expect-error Particle settings store numeric speeds.
  particles.speed = '1';
  // @ts-expect-error A frame has geometric style data, not an image payload.
  workshop.apply(doc, 'frame', { src: 'image' });
  // @ts-expect-error Legacy backgrounds can be migrated but cannot be newly bound.
  workshop.bind(project, 'background', 'image', 1, ['card']);
  // @ts-expect-error The referenced version is a number.
  workshop.version(project, { resourceId: 'frame', version: '1' });
  // @ts-expect-error Frame widths cannot contain text.
  frame.style.width = '24';
  // @ts-expect-error Render output pixels are image strings.
  output.front = 7;
  // @ts-expect-error Sampling requires a numeric destination buffer.
  components.sampleInto(particles, 0, doc, 0, ['pixel']);
  runtime.validate(doc);
  void material;
}
void contracts;
