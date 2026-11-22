import type { AgentResults } from './agent-ui';
import type { CardDocument } from './document';
import type { NativeResults } from './native-protocol';

export interface FileResult {
  canceled?: boolean;
  file?: string;
}
export interface ImportedFile extends FileResult {
  src?: string;
  name?: string;
}
export interface ProcessResult {
  image?: string;
  engine?: string;
  elapsedMs?: number;
  embeddingCached?: boolean;
  activePixels?: number;
  points?: number[][];
  positions?: number[];
  uv?: number[];
  indices?: number[];
}
export interface PreparedAuthoring {
  document: CardDocument;
  selected: string;
  usedJobs: string[];
  reports: string[];
  preview: {
    mode?: string;
    yaw?: number;
    pitch?: number;
    seconds?: number;
    paused?: boolean;
    actionId?: string;
  };
}
export interface HomeResult {
  canceled?: boolean;
  ticket?: string;
  document?: CardDocument;
  workshop?: unknown;
  recovery?: { revision: number; savedRevision: number; view?: unknown };
  recoveryError?: string;
}
export interface HomeDemo {
  id: string;
  name: string;
  description: string;
  actionId: string;
}
export interface EditorResults extends AgentResults {
  'editor-session-start': { sessionToken: string };
  'editor-session-save': { stale?: boolean };
  'home-activate': { sessionToken: string };
  'home-open-demo': HomeResult;
  'home-bootstrap': {
    desktop: boolean;
    appVersion: string;
    engine: NativeResults['ping'];
    entries: unknown[];
    demos: HomeDemo[];
  };
  'smart-info': { available: boolean };
  process: ProcessResult;
  import: ImportedFile;
  'import-font': ImportedFile;
  template: { template: CardDocument };
  save: FileResult;
  'save-workshop': FileResult;
  export: FileResult & { directory: string };
  'export-workshop': FileResult & {
    directory: string;
    cards: number;
    sharedFiles: number;
  };
  'agent-recover-candidate': { message: string; id: string };
  'agent-start': { id: string };
  'authoring-prepare': PreparedAuthoring;
  'production-checkpoint-open': {
    workshop?: unknown;
    document?: CardDocument;
    checkpoint: { revision?: number; [key: string]: unknown };
  };
  'production-checkpoint-info': {
    name: string;
    revision: number;
    at: string;
  } | null;
}

export interface AgentContextExtras {
  productionWorkflow?: { goal: string; stage: number; remaining: number };
  editorControl?: boolean;
  rejectedProduction?: { reply: string; error: string };
  failedAssets?: Array<{
    jobId: string;
    mode: string;
    message: string;
    width: number;
    height: number;
  }>;
  assets?: Array<{
    jobId: string;
    sameProject: boolean;
    name: string;
    prompt: string;
    width: number;
    height: number;
    applied: boolean;
  }>;
}
