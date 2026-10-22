// Public compatibility entry: the runtime implementation and its own validation are strict.
import core from './runtime-core.ts';
import { createRuntimeValidator } from './runtime-validation.ts';
import spatial from './spatial-model.ts';
import back from '../workshop/back-asset-model.ts';
import cosmetics from '../editing/cosmetics-model.ts';
import components from '../workshop/component-model.ts';
import graph from '../shaders/shader-graph-model.ts';
import frame from '../editing/frame-model.ts';
import stats from '../editing/card-stats.ts';
const validate = createRuntimeValidator({
  back: (value) => back.validate(value),
  cosmetics: (value) => cosmetics.validate(value),
  spatial: (document) => spatial.validate(document),
  frame: (document) => frame.validate(document),
  stats: (document) => stats.validate(document),
  components: (document) => components.validate(document),
  attachment: (value) => spatial.validateAttachment(value),
  graph(value, stage) {
    graph.validate(value, stage);
    graph.compile(value);
  },
});
const api = { ...core, validate };
export default api;
