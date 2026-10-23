import type { AgentConfiguration } from '../electron/agent-options';
import type {
  ChatContext,
  ChatMessage,
  ChatSession,
  ChatSummary,
  EditorBinding,
  EditorCommand,
} from './agent';
import type { RendererBridge } from './contracts';
import type { SetupStatus } from './agent-setup';
import type { CharacterPanelState } from './character-editor';
export interface AgentChoice {
  adapter: string;
  model?: string;
  reasoning?: string;
  inheritDefaults?: boolean;
}
export interface AgentModel {
  id: string;
  name: string;
  efforts?: readonly string[];
}
export interface AgentAdapter {
  id: string;
  name: string;
  available: boolean;
  chat: boolean;
  model: string;
  reasoning: string;
  models?: string[];
  auth: SetupStatus;
}
export interface AgentInfo {
  config: AgentConfiguration;
  defaults: { model?: string; reasoning?: string };
  codex: {
    available: boolean;
    version?: string;
    executable?: string;
    model: string;
    reasoning: string;
    auth: SetupStatus;
  };
  models: AgentModel[];
  efforts: readonly string[];
  adapters: AgentAdapter[];
  imageCapability: string;
}
export interface AgentJob {
  id: string;
  state: string;
  mode: string;
  message: string;
  documentToken: string;
  layerName: string;
  outputWidth: number;
  outputHeight: number;
  prompt: string;
  model: string;
  adapter: string;
  applied: boolean;
}
export type SetupReport = SetupStatus & {
  update?: { available: boolean; message?: string; state: string };
};
export interface SetupLaunch {
  opened: boolean;
  command?: string;
  message: string;
  update?: undefined;
}
export interface AgentResults {
  'agent-info': AgentInfo;
  'agent-config': unknown;
  'agent-list': AgentJob[];
  'agent-status': AgentJob;
  'agent-cancel': AgentJob;
  'agent-chat-list': ChatSummary[];
  'agent-chat-create': ChatSession;
  'agent-chat-status': ChatSession;
  'agent-chat-send': ChatSession;
  'agent-chat-cancel': ChatSession;
  'agent-chat-command-result': ChatSession;
  'agent-chat-rename': ChatSession;
  'agent-chat-archive': ChatSession;
  'agent-setup-status': SetupReport;
  'agent-setup-check-update': SetupReport;
  'agent-setup-install': SetupLaunch;
  'agent-setup-login': SetupLaunch;
  'agent-setup-update': SetupLaunch;
}
export interface AgentUIHost extends Pick<RendererBridge, 'invoke'> {
  binding(): EditorBinding;
  context():
    | (ChatContext & {
        binding: EditorBinding;
        document: { maskStats: Record<string, { activePixels?: number }> };
      })
    | null;
  captureChatSource(): string | null;
  captureChatComposition(): string | null;
  captureCharacterMaster(): string | null;
  maskImages(): Record<string, string> | null;
  applyCommands(
    commands: EditorCommand[],
    binding?: EditorBinding,
  ):
    | { message: string; jobId?: string }
    | Promise<{ message: string; jobId?: string }>;
  checkpoint(): Promise<unknown>;
  checkpointInfo(): Promise<{
    name: string;
    revision: number;
    at: string;
  } | null>;
  recoverCheckpoint(): Promise<{ revision?: number; name?: string }>;
  cancelProduction(): Promise<void>;
  say(message: string): void;
}
export interface AgentUIBindings {
  cardAIHost: AgentUIHost;
  cardEditorHost: { state(): CharacterPanelState & { mode?: string } };
  atelierAgentDock: {
    state(): { open: boolean; collapsed: boolean };
    open(): void;
    close(): void;
  };
  atelierAI: {
    updateControls(): void;
    loadJob(id: string): Promise<void>;
    open(mode: string): Promise<void>;
  };
  atelierAgents: {
    refresh(): Promise<AgentInfo>;
    selection(area?: string): AgentChoice;
    set(choice: AgentChoice, area?: string): void;
    syncQuickChoices(): void;
    defaults(area?: string): void;
  };
  atelierAgentChat: {
    refreshTasks(): Promise<void>;
    sessionId(): string | null;
  };
}
export type Workflow = {
  goal: string;
  steps: number;
  repairs: number;
  binding: EditorBinding;
  jobId?: string | null;
};
export type QuestionDraft = Record<string, { option: string; text: string }>;
