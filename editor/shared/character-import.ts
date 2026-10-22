import type { CardDocument } from './document';
import type { CharacterRig, CharacterAction } from './character';
import type { SpineOptions } from './spine';
export type DocumentValidator = (
  value: unknown,
) => asserts value is CardDocument;
export interface CharacterArchive {
  schema: 'card-character-animation-import/1';
  characterRig: CharacterRig | undefined;
  actions: CharacterAction[];
}
export interface CharacterImportAdapter {
  id: string;
  convert(value: unknown, options: SpineOptions): unknown;
}
