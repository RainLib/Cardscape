import type { CardDocument } from './document';
export interface AppearanceBindings {
  atelierCosmetics: { refresh(): void };
  cardEditorHost: {
    state(): { document: CardDocument | null; busy: unknown };
    mutate(label: string, edit: (document: CardDocument) => void): unknown;
    say(message: string): void;
  };
  cardPreview: {
    getPreviewLevel?(): string | null;
    setPreviewLevel(level: string | null): void;
  };
  atelierWorkspace: { panel(name: string): void; syncLayout(): void };
}
