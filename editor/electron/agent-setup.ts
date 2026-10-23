/* CLI owns authentication. Only public status is returned; no credential files
 * are read. Login/install/update run interactively in the user's terminal. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { isRecord } from './validation';
import type { AgentConfiguration, AgentProfile } from './agent-options';
import type {
  CaptureResult,
  AuthResult,
  SetupStatus,
  SetupPlan,
  SetupOptions,
} from '../shared/agent-setup';
type SetupProfile = Partial<
  Pick<
    AgentProfile,
    | 'id'
    | 'executable'
    | 'requiresLogin'
    | 'statusArgs'
    | 'loginArgs'
    | 'updateArgs'
    | 'statusSuccessText'
  >
>;

export const quote = (value: unknown) =>
  "'" + String(value).replace(/'/g, "'\\''") + "'";
function environment(binary: string) {
  return {
    ...process.env,
    PATH: path.dirname(binary) + path.delimiter + (process.env.PATH || ''),
  };
}
export function capture(binary: string, args: string[], timeoutMs = 6000) {
  return new Promise<CaptureResult>((resolve) => {
    let output = '',
      done = false;
    const finish = (value: CaptureResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const child = spawn(binary, args, {
      shell: false,
      windowsHide: true,
      env: environment(binary),
    });
    const timer = setTimeout(() => {
      child.kill();
      finish({ timeout: true, code: null, output: '' });
    }, timeoutMs);
    child.stdout.on('data', (b) => (output = (output + b).slice(0, 8192)));
    child.stderr.on('data', (b) => (output = (output + b).slice(0, 8192)));
    child.on('error', () => finish({ code: null, output: '' }));
    child.on('close', (code) => finish({ code, output }));
  });
}
export function authResult(
  adapter: string,
  result: CaptureResult,
  successText = '',
): AuthResult {
  if (result.timeout)
    return {
      state: 'error',
      ready: false,
      message: '登录检测超时；请检查 CLI 后重试。',
    };
  const text = result.output || '';
  if (adapter === 'codex') {
    if (/not logged in|please (?:log|sign) in/i.test(text))
      return {
        state: 'logged_out',
        ready: false,
        message: '未登录；请先登录此 CLI。',
      };
    if (result.code === 0 && /logged in|authenticated/i.test(text))
      return {
        state: 'logged_in',
        ready: true,
        message:
          '已登录 · ' +
          (/chatgpt/i.test(text)
            ? 'ChatGPT'
            : /api key/i.test(text)
              ? 'API Key'
              : 'CLI 认证'),
      };
    if (
      /unexpected argument|unrecognized|unknown (?:command|argument|option)/i.test(
        text,
      )
    )
      return {
        state: 'unsupported',
        ready: false,
        message: 'CLI 不支持登录检测命令；请检查更新。',
      };
  } else if (result.code === 0 && (!successText || text.includes(successText)))
    return {
      state: 'logged_in',
      ready: true,
      message: '已通过此 Agent 的登录检测',
    };
  else if (result.code !== null)
    return {
      state: 'logged_out',
      ready: false,
      message: '此 Agent 的登录检测未通过；请登录或核对检测命令。',
    };
  return {
    state: 'error',
    ready: false,
    message: '无法确认 CLI 登录状态；请检查配置并重新检测。',
  };
}
export function compareVersions(a: unknown, b: unknown) {
  const parse = (v: unknown) =>
    String(v).match(/(?:^|\s)(\d+)\.(\d+)\.(\d+)(?:[-+][\w.-]+)?/);
  const x = parse(a),
    y = parse(b);
  if (!x || !y) return null;
  for (let i = 1; i < 4; i++)
    if (+x[i] !== +y[i]) return +x[i] > +y[i] ? 1 : -1;
  return 0;
}
function latestCodex() {
  return new Promise<string>((resolve, reject) => {
    const req = https.get(
      'https://registry.npmjs.org/@openai%2fcodex/latest',
      { headers: { Accept: 'application/json' } },
      (res) => {
        let body = '';
        res.on('data', (b) => {
          body += b;
          if (body.length > 262144) req.destroy(Error('更新信息过大'));
        });
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) throw Error('更新服务不可用');
            const data: unknown = JSON.parse(body);
            if (!isRecord(data) || typeof data.version !== 'string')
              throw Error('更新版本无效');
            const v = data.version;
            if (!/^\d+\.\d+\.\d+$/.test(v)) throw Error('更新版本无效');
            resolve(v);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.setTimeout(6000, () => req.destroy(Error('更新检查超时')));
    req.on('error', reject);
  });
}
export function createAgentSetup({
  runtimeDir,
  configuration,
  executable,
  dialogs,
  invalidate = () => {},
  latest = latestCodex,
}: SetupOptions) {
  function selected(cfg: AgentConfiguration, id: string): SetupProfile {
    if (id === 'codex')
      return {
        id,
        executable: cfg.codexExecutable,
        requiresLogin: true,
        statusArgs: ['login', 'status'],
        loginArgs: ['login'],
      };
    if (id === 'handoff') return { id, requiresLogin: false };
    const p = cfg.profiles.find((p) => p.id === id);
    if (!p) throw Error('Agent 未配置');
    return p;
  }
  async function status(
    cfg: AgentConfiguration,
    id: string,
  ): Promise<SetupStatus> {
    const p = selected(cfg, id);
    if (id === 'handoff')
      return {
        adapter: id,
        installed: true,
        state: 'not_required',
        ready: true,
        message: '文件交接，由外部 Agent 自行登录',
      };
    const binary = await executable(p.executable),
      base: {
        adapter: string;
        executable?: string;
        installed: boolean;
        checkedAt: string;
        version?: string;
      } = {
        adapter: id,
        executable: binary || p.executable || undefined,
        installed: !!binary,
        checkedAt: new Date().toISOString(),
      };
    if (!binary)
      return {
        ...base,
        state: 'missing',
        ready: false,
        message: '未安装 CLI 或路径无效；请先安装。',
      };
    const version = await capture(binary, ['--version']);
    base.version =
      version.code === 0
        ? version.output
            .trim()
            .split('\n')
            .find((line) => /\d+\.\d+/.test(line))
            ?.slice(0, 160) || '版本未知'
        : '版本未知';
    if (!p.requiresLogin)
      return {
        ...base,
        state: 'not_required',
        ready: true,
        message: '本地程序 · 配置为无需登录',
      };
    if (!p.statusArgs?.length)
      return {
        ...base,
        state: 'unconfigured',
        ready: false,
        message: '请先配置该 Agent 的登录检测参数。',
      };
    return {
      ...base,
      ...authResult(
        id,
        await capture(binary, p.statusArgs),
        p.statusSuccessText,
      ),
    };
  }
  async function requireReady(cfg: AgentConfiguration, id: string) {
    const current = await status(cfg, id);
    if (!current.ready)
      throw Error(current.message + ' 打开 AI 管理 → Agent 配置。');
    return current;
  }
  async function updatePlan(
    cfg: AgentConfiguration,
    id: string,
  ): Promise<SetupPlan> {
    const p = selected(cfg, id),
      binary = await executable(p.executable);
    if (id !== 'codex') {
      if (!binary || !p.updateArgs?.length)
        return {
          available: false,
          message: '请按该 Agent 官方说明更新，或配置更新参数。',
        };
      return { available: true, binary, args: p.updateArgs };
    }
    let real = '';
    if (binary)
      try {
        real = await fs.realpath(binary);
      } catch {}
    if (!binary || /node_modules[/\\]@openai[/\\]codex/.test(real)) {
      // Use npm from the same Node installation as the selected Codex binary.
      let npm = binary
        ? await executable(
            path.join(
              path.dirname(binary),
              process.platform === 'win32' ? 'npm.cmd' : 'npm',
            ),
          )
        : await executable('npm');
      if (!npm)
        return {
          available: false,
          message: '未找到 npm；请先安装 Node.js，或使用 Codex 官方安装方式。',
          command: 'npm install -g @openai/codex@latest',
        };
      return {
        available: true,
        binary: npm,
        args: ['install', '-g', '@openai/codex@latest'],
      };
    }
    if (/[/\\](?:Cellar|Caskroom)[/\\]/.test(real)) {
      const brew = await executable('brew'),
        args = /Caskroom/.test(real)
          ? ['upgrade', '--cask', 'codex']
          : ['upgrade', 'codex'];
      return brew
        ? { available: true, binary: brew, args }
        : {
            available: false,
            message: '此 CLI 由 Homebrew 管理；请通过 Homebrew 更新。',
            command: ['brew', ...args].join(' '),
          };
    }
    if (binary === path.join(os.homedir(), '.local/bin/codex'))
      return {
        available: true,
        officialInstaller: true,
        command: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
      };
    return {
      available: false,
      message: 'CLI 使用自定义安装路径；请从其官方安装渠道更新，并重新检测。',
    };
  }
  async function launch(plan: SetupPlan, adapter: string, action: string) {
    if (!plan.available) return { opened: false, ...plan };
    if (!plan.command && (!plan.binary || !plan.args))
      throw Error('CLI 启动参数无效');
    const command =
      plan.command ||
      (process.platform === 'win32'
        ? '& ' +
          [plan.binary || '', ...(plan.args || [])]
            .map((value) => "'" + String(value).replace(/'/g, "''") + "'")
            .join(' ')
        : [plan.binary || '', ...(plan.args || [])].map(quote).join(' '));
    if (!dialogs?.openSetup || process.platform !== 'darwin')
      return {
        opened: false,
        command,
        message: '请在终端执行此命令，完成后点击重新检测。',
      };
    const file = path.join(
      runtimeDir,
      'agent-setup',
      action + '-' + randomUUID() + '.command',
    );
    await fs.mkdir(path.dirname(file), { recursive: true });
    const binDir = plan.binary
      ? path.dirname(plan.binary)
      : path.join(os.homedir(), '.local/bin');
    const env = ['export PATH=' + quote(binDir) + ':"$PATH"'];
    if (adapter === 'codex')
      env.push(
        'export CODEX_HOME=' +
          quote(process.env.CODEX_HOME || path.join(os.homedir(), '.codex')),
      );
    await fs.writeFile(
      file,
      '#!/bin/zsh\n' +
        env.join('\n') +
        '\n' +
        command +
        '\natelier_setup_exit=$?\nprint "CLI 操作已退出（$atelier_setup_exit）。请返回卡牌工坊重新检测。"\nread "atelier_setup_done?按回车关闭…"\nexit "$atelier_setup_exit"\n',
      { mode: 0o700 },
    );
    const error = await dialogs.openSetup(file);
    if (error) throw Error('无法打开终端，请复制命令执行。');
    return {
      opened: true,
      command,
      message: '已打开所选 CLI 的终端。完成安装、更新或登录后，返回重新检测。',
    };
  }
  return {
    status,
    requireReady,
    async invoke(method: string, input: unknown = {}) {
      if (!isRecord(input)) throw Error('CLI 设置参数无效');
      const args = input;
      invalidate();
      const cfg = await configuration(),
        id = typeof args.adapter === 'string' ? args.adapter : 'codex',
        p = selected(cfg, id);
      if (method === 'agent-setup-status') return status(cfg, id);
      if (method === 'agent-setup-check-update') {
        const current = await status(cfg, id),
          plan = await updatePlan(cfg, id);
        if (id !== 'codex')
          return { ...current, update: { state: 'manual', ...plan } };
        try {
          const version = await latest(),
            comparison = compareVersions(current.version, version);
          return {
            ...current,
            update: {
              state: !current.installed
                ? 'install'
                : comparison === null
                  ? 'unknown'
                  : comparison < 0
                    ? 'available'
                    : 'current',
              latest: version,
              installed: current.version,
              ...plan,
              message: !current.installed
                ? '可安装 Codex CLI ' + version
                : comparison === null
                  ? '无法比较版本；可按官方渠道更新。'
                  : comparison < 0
                    ? '发现新版本 ' + version
                    : '当前 CLI 已达到此安装渠道的最新版本',
            },
          };
        } catch {
          return {
            ...current,
            update: {
              state: 'error',
              ...plan,
              message: '无法检查最新版本；可按官方渠道更新后重新检测。',
            },
          };
        }
      }
      if (method === 'agent-setup-login') {
        const current = await status(cfg, id);
        if (current.ready)
          return { opened: false, message: '该 CLI 已通过登录检测。' };
        if (!current.installed) throw Error('请先安装该 CLI。');
        if (!p.loginArgs?.length) throw Error('请先保存该 Agent 的登录参数。');
        if (!current.executable) throw Error('CLI 路径无效');
        return launch(
          { available: true, binary: current.executable, args: p.loginArgs },
          id,
          'login',
        );
      }
      if (method === 'agent-setup-install' || method === 'agent-setup-update')
        return launch(await updatePlan(cfg, id), id, 'update');
      throw Error('未知 CLI 设置操作');
    },
  };
}
