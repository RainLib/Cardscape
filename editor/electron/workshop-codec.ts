import type { DocumentValidator, WorkshopDocument } from '../shared/projects';

/** The legacy model validates the complete graph before returning a trusted workshop. */
interface WorkshopCodec {
  migrate(value: unknown, validate?: DocumentValidator): unknown;
  validate(value: unknown, validate?: DocumentValidator): WorkshopDocument;
}
export const workshopCodec: WorkshopCodec = require('../renderer/workshop-model.js');
