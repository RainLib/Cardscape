import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { errorCode, isRecord } from './validation';

export const EFFORTS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
] as const;
export type ReasoningEffort = '' | (typeof EFFORTS)[number];
interface ModelChoice {
  model: string;
  reasoning: ReasoningEffort;
}
export interface AgentProfile extends ModelChoice {
  id: string;
  name: string;
  executable: string;
  args: string[];
  chatArgs: string[] | null;
  requiresLogin: boolean;
  statusArgs: string[] | null;
  loginArgs: string[] | null;
  updateArgs: string[] | null;
  statusSuccessText: string;
  models: string[];
}
export interface AgentConfiguration {
  codexExecutable: string;
  codexModel: string;
  codexReasoning: ReasoningEffort;
  profiles: AgentProfile[];
  custom: AgentProfile | null;
  cliDefaults?: Partial<ModelChoice>;
}
interface AgentSummary extends ModelChoice {
  id: string;
  name: string;
  available: boolean;
  chat: boolean;
  models?: string[];
}
interface CatalogModel {
  id: string;
  name: string;
  defaultReasoning: ReasoningEffort;
  efforts: ReasoningEffort[];
}
function isEffort(value: unknown): value is (typeof EFFORTS)[number] {
  return typeof value === 'string' && EFFORTS.some((e) => e === value);
}
function model(value: unknown = ''): string {
  if (
    typeof value !== 'string' ||
    (value && !/^[a-zA-Z0-9_./:-]{1,100}$/.test(value))
  )
    throw Error('模型名称无效');
  return value;
}
function effort(value: unknown = ''): ReasoningEffort {
  if (value !== '' && !isEffort(value)) throw Error('推理程度无效');
  return value;
}
function argv(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 64 ||
    !value.every(
      (a: unknown): a is string => typeof a === 'string' && a.length <= 2000,
    )
  )
    throw Error('Agent 参数无效：必须为 JSON 字符串数组');
  return value;
}
function profile(c: unknown, id: unknown): AgentProfile {
  if (
    !isRecord(c) ||
    typeof c.name !== 'string' ||
    !c.name.trim() ||
    c.name.length > 100 ||
    typeof c.executable !== 'string' ||
    !c.executable ||
    c.executable.length > 1000
  )
    throw Error('外部 Agent 配置无效');
  if (
    typeof id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(id) ||
    ['codex', 'handoff'].includes(id)
  )
    throw Error('Agent ID 无效');
  return {
    id,
    name: c.name.trim(),
    executable: c.executable,
    args: argv(c.args || ['{contract}']),
    chatArgs: c.chatArgs ? argv(c.chatArgs) : null,
    model: model(c.model || ''),
    reasoning: effort(c.reasoning || ''),
    requiresLogin: c.requiresLogin !== false,
    statusArgs: c.statusArgs ? argv(c.statusArgs) : null,
    loginArgs: c.loginArgs ? argv(c.loginArgs) : null,
    updateArgs: c.updateArgs ? argv(c.updateArgs) : null,
    statusSuccessText:
      typeof c.statusSuccessText === 'string'
        ? c.statusSuccessText.slice(0, 200)
        : '',
    models: (Array.isArray(c.models) ? c.models : [])
      .slice(0, 50)
      .map((m: unknown) => model(m)),
  };
}
export function normalize(c: unknown = {}): AgentConfiguration {
  if (
    !isRecord(c) ||
    typeof (c.codexExecutable || 'codex') !== 'string' ||
    String(c.codexExecutable || 'codex').length > 1000
  )
    throw Error('Codex 路径无效');
  if (c.profiles && !Array.isArray(c.profiles)) throw Error('Agent 列表无效');
  const profiles = (Array.isArray(c.profiles) ? c.profiles : []).map(
    (p: unknown) => profile(p, isRecord(p) ? p.id : undefined),
  );
  if (c.custom && !profiles.some((p) => p.id === 'custom'))
    profiles.unshift(profile(c.custom, 'custom'));
  if (
    profiles.length > 20 ||
    new Set(profiles.map((p) => p.id)).size !== profiles.length
  )
    throw Error('最多 20 个外部 Agent，ID 不能重复');
  return {
    codexExecutable: String(c.codexExecutable || 'codex'),
    codexModel: model(c.codexModel || ''),
    codexReasoning: effort(c.codexReasoning || ''),
    profiles,
    custom: profiles.find((p) => p.id === 'custom') || null,
  };
}
export async function catalog(
  extra: readonly string[] = [],
): Promise<CatalogModel[]> {
  try {
    const file = path.join(
      process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
      'models_cache.json',
    );
    if ((await fs.stat(file)).size > 8 * 1024 * 1024) return [];
    const data: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!isRecord(data) || !Array.isArray(data.models)) return [];
    return data.models
      .filter(isRecord)
      .filter(
        (m) =>
          m.visibility === 'list' ||
          (typeof m.slug === 'string' && extra.includes(m.slug)),
      )
      .map((m) => ({
        id: model(m.slug),
        name: String(m.display_name || m.slug).slice(0, 100),
        defaultReasoning: isEffort(m.default_reasoning_level)
          ? m.default_reasoning_level
          : '',
        efforts: (Array.isArray(m.supported_reasoning_levels)
          ? m.supported_reasoning_levels
          : []
        )
          .filter(isRecord)
          .map((x) => x.effort)
          .filter(isEffort),
      }));
  } catch {
    return [];
  }
}
// Read only the CLI's model/effort/profile scalars. Never return provider keys,
// URLs, credentials or the full config to the renderer.
export function parseDefaults(toml: string): ModelChoice & { profile: string } {
  const sections = new Map<string, Record<string, string>>([['', {}]]);
  let section = '';
  for (const line of toml.split(/\r?\n/)) {
    const h = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
    if (h) {
      section = h[1].replace(
        /"([^"\\]+)"|'([^']+)'/g,
        (_: string, a: string | undefined, b: string | undefined) =>
          a || b || '',
      );
      if (!sections.has(section)) sections.set(section, {});
      continue;
    }
    const m = line.match(
      /^\s*(model|model_reasoning_effort|profile)\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*')\s*(?:#.*)?$/,
    );
    if (m)
      try {
        const value: unknown =
          m[2][0] === '"' ? JSON.parse(m[2]) : m[2].slice(1, -1);
        const values = sections.get(section);
        if (values && typeof value === 'string') values[m[1]] = value;
      } catch {}
  }
  const root = sections.get('') || {},
    selected = {
      ...root,
      ...(root.profile ? sections.get('profiles.' + root.profile) : {}),
    };
  return {
    model: model(selected.model || ''),
    reasoning: effort(selected.model_reasoning_effort || ''),
    profile: root.profile || '',
  };
}
export async function cliDefaults() {
  const file = path.join(
    process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
    'config.toml',
  );
  try {
    if ((await fs.stat(file)).size > 1024 * 1024) throw Error('CLI 配置过大');
    const values = parseDefaults(await fs.readFile(file, 'utf8'));
    if (!values.reasoning && values.model)
      values.reasoning =
        (await catalog([values.model])).find((m) => m.id === values.model)
          ?.defaultReasoning || '';
    return { ...values, source: 'Codex CLI config.toml' };
  } catch (error) {
    return {
      model: '',
      reasoning: '' as ReasoningEffort,
      profile: '',
      source:
        errorCode(error) === 'ENOENT' ? 'CLI 内置默认' : '无法读取 CLI 默认',
    };
  }
}
export function agents(
  cfg: AgentConfiguration,
  available = true,
): AgentSummary[] {
  return [
    {
      id: 'codex',
      name: 'Codex CLI',
      available,
      chat: true,
      model: cfg.codexModel,
      reasoning: cfg.codexReasoning,
    },
    ...cfg.profiles.map((p) => ({
      id: p.id,
      name: p.name,
      available: true,
      chat: !!p.chatArgs,
      model: p.model,
      reasoning: p.reasoning,
      models: p.models,
    })),
    {
      id: 'handoff',
      name: '文件交接 · 任意外部 Agent',
      available: true,
      chat: false,
      model: '',
      reasoning: '',
    },
  ];
}
export function options(
  cfg: AgentConfiguration,
  args: unknown = {},
): ModelChoice & { adapter: string } {
  if (!isRecord(args)) throw Error('Agent 选项无效');
  const adapter = args.adapter || 'codex',
    a = agents(cfg).find((p) => p.id === adapter);
  if (!a) throw Error('不支持的 Agent');
  const inherit = args.inheritDefaults === true,
    defaults = inherit && adapter === 'codex' ? cfg.cliDefaults || {} : a;
  return {
    adapter: a.id,
    model: model(inherit ? defaults.model || '' : args.model || a.model),
    reasoning: effort(
      inherit ? defaults.reasoning || '' : args.reasoning || a.reasoning,
    ),
  };
}
export function codexArgs(o: { model: string; reasoning: string }): string[] {
  return [
    ...(o.model ? ['--model', o.model] : []),
    ...(o.reasoning
      ? ['-c', 'model_reasoning_effort=' + JSON.stringify(o.reasoning)]
      : []),
  ];
}
type Placeholder =
  | 'jobDir'
  | 'contract'
  | 'prompt'
  | 'result'
  | 'model'
  | 'reasoning'
  | 'sessionId';
export function customArgs(
  args: readonly string[],
  values: Partial<Record<Placeholder, string>>,
): string[] {
  return args.map((arg) =>
    arg.replace(
      /\{(jobDir|contract|prompt|result|model|reasoning|sessionId)\}/g,
      (_: string, key: Placeholder) => values[key] || '',
    ),
  );
}
