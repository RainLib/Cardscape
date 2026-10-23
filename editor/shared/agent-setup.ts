import type { AgentConfiguration } from '../electron/agent-options';
export interface CaptureResult {
  timeout?: boolean;
  code: number | null;
  output: string;
}
export interface AuthResult {
  state:
    | 'error'
    | 'logged_out'
    | 'logged_in'
    | 'unsupported'
    | 'not_required'
    | 'missing'
    | 'unconfigured';
  ready: boolean;
  message: string;
}
export interface SetupStatus extends AuthResult {
  adapter: string;
  installed: boolean;
  executable?: string;
  version?: string;
  checkedAt?: string;
}
export type SetupPlan =
  | { available: false; message: string; command?: string }
  | { available: true; binary: string; args: string[]; command?: string }
  | {
      available: true;
      officialInstaller: true;
      command: string;
      binary?: never;
      args?: never;
    };
export interface SetupOptions {
  runtimeDir: string;
  configuration(): Promise<AgentConfiguration>;
  executable(value?: string): Promise<string | null | undefined>;
  dialogs?: { openSetup?(file: string): Promise<string | void> };
  invalidate?(): void;
  latest?(): Promise<string>;
}
