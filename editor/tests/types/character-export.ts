import type { CardDocument } from '../../shared/document';
import type { SpineSource, SpineOptions } from '../../shared/spine';
import type {
  AssetManifest,
  ImageWorker,
  CardOutput,
} from '../../shared/export';
import character from '../../renderer/character/character-animation-model';
import spine from '../../renderer/character/spine-import-model';
import atlas from '../../renderer/character/spine-atlas-model';

function characterContract(
  doc: CardDocument,
  source: SpineSource,
  options: SpineOptions,
  manifest: AssetManifest,
) {
  const pose = character.sample(doc, doc.actions?.[0]);
  if (pose) {
    const rotation: number = pose.bones.get('root')!.rotation;
    // @ts-expect-error Bone matrices contain numbers.
    const coordinate: string = pose.bones.get('root')!.world[0];
    void rotation;
    void coordinate;
  }
  const plan = spine.convert(source, options);
  const weight: number = plan.characterRig.meshes![0].weights[0][0].weight;
  // @ts-expect-error Skin weights retain their structured interface.
  plan.characterRig.meshes![0].weights[0][0].weight = 'one';
  // @ts-expect-error Spine coordinates reject string coercion at compile time.
  source.bones[0].x = '1';
  // @ts-expect-error Layer mappings use a layer ID or a registered mapping object.
  options.layerMap = { slot: 123 };
  const parsed = atlas.parse('');
  // @ts-expect-error Atlas dimensions are numeric.
  const width: string = parsed.regions[0].originalWidth;
  // @ts-expect-error Runtime texture references are strings.
  manifest.exportProfile!.textures.front.small.asset = 123;
  void weight;
  void width;
}
async function imageContract(worker: ImageWorker, output: CardOutput) {
  const resized = await worker.call('resize');
  const width: number = resized.width;
  // @ts-expect-error Export workers only accept declared native image operations.
  await worker.call('missing-operation');
  // @ts-expect-error Raster payloads are encoded strings.
  output.layerRasters = { art: 123 };
  void width;
}
void characterContract;
void imageContract;
