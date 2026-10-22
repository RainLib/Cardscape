/* Backward-compatible entry for Node tests and classic consumers. Strict panels
 * inject the host validator directly into character-import-registry. */
import runtime from '../rendering/runtime-model.ts';
import registry from './character-import-registry.ts';
import type { CardDocument } from '../../shared/document';
function validateDocument(value: unknown): asserts value is CardDocument {
  runtime.validate(value);
}
const api = {
  schema: registry.schema,
  pack: registry.pack,
  createRegistry: () => registry.createRegistry(validateDocument),
};
export default api;
