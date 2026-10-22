import registry from '../../renderer/character/character-import-registry';
import type {
  CharacterPanelBindings,
  CharacterAnimationContext,
} from '../../shared/character-panels';
import type { CharacterPanelElements } from '../../shared/character-elements';
import type { CardDocument } from '../../shared/document';
import type { DocumentValidator } from '../../shared/character-import';

function panelContracts(
  bindings: CharacterPanelBindings,
  doc: CardDocument,
  validate: DocumentValidator,
  input: unknown,
  controls: CharacterPanelElements,
  context: CharacterAnimationContext,
) {
  const imports = registry.createRegistry(validate);
  const converted: CardDocument = imports.convert('spine-json', input, doc, {
    scale: 1,
    layerMap: { body: { layerId: 'foreground', uvRect: [0, 0, 1024, 1536] } },
  });
  imports.register({
    id: 'extension',
    convert(value) {
      // @ts-expect-error Third-party adapter input must be narrowed before use.
      return value.characterRig;
    },
  });
  // @ts-expect-error Registries require an actual document validator.
  registry.createRegistry();
  // @ts-expect-error Spine scale is numeric.
  imports.convert('spine-json', input, doc, { scale: '1' });
  const source = registry.decodeSpine(input);
  const x: number | undefined = source.skeleton.x;
  // @ts-expect-error Rig controls are input elements with string values.
  controls['rig-x'].value = 512;
  // @ts-expect-error Buttons do not expose checkbox state.
  controls['skin-reduce'].checked;
  // @ts-expect-error A preview draft is an action, rather than an arbitrary payload.
  bindings.cardEditorHost.previewCharacterPose('idle', 0, { rotation: 90 });
  // @ts-expect-error Selection uses numeric vertex indices.
  bindings.atelierCharacterAdvanced.selectVertex('0');
  // @ts-expect-error Timeline controller kinds are explicit.
  bindings.atelierAnimation.selectBone('root', 'mesh');
  if (context.action) {
    const duration: number = context.action.duration;
    void duration;
  }
  void converted;
  void x;
}
void panelContracts;
