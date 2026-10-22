import runtime from '../../renderer/rendering/runtime-core';
import authoring from '../../renderer/animation/animation-authoring-model';
import type { CharacterAction } from '../../shared/character';
import type { RuntimeSample, RuntimeValidators } from '../../shared/runtime';
import type { CharacterPanelBindings } from '../../shared/character-panels';

function contracts(
  action: CharacterAction,
  bindings: CharacterPanelBindings,
  validators: RuntimeValidators,
) {
  const sample: RuntimeSample = runtime.action(
    { actions: [action] },
    action.id,
    0.5,
    { seek: true },
  );
  authoring.draft(action, 'motion', 0.5, 1.2, 'smooth');
  // @ts-expect-error Sampler time is numeric.
  runtime.action({ actions: [action] }, action.id, '0.5');
  // @ts-expect-error Camera coordinates contain numeric values.
  runtime.cameraInCard(0, 0, ['0', 0, 0, 1]);
  // @ts-expect-error Stored keyframes have an explicit easing vocabulary.
  authoring.draft(action, 'motion', 0.5, 1.2, 'bezier');
  // @ts-expect-error Sampled progress cannot be a string.
  sample.progress = '0.5';
  // @ts-expect-error The removed layer-controller interface was never implemented.
  bindings.atelierAnimation.selectBone('art', 'layer');
  // @ts-expect-error Extension validation receives opaque inputs that must be checked.
  validators.back = (value) => value.layers;
}
void contracts;
