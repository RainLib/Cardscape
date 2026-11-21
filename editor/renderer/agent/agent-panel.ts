import { element as $ } from '../core/dom.ts';
import type {
  AgentUIBindings,
  AgentInfo,
  AgentChoice,
  AgentJob,
  Workflow,
  QuestionDraft,
  AgentModel,
  SetupReport,
  SetupLaunch,
} from '../../shared/agent-ui';
import type {
  ChatSession,
  ChatSummary,
  ChatMessage,
  EditorBinding,
  QuestionAnswer,
} from '../../shared/agent';
import type { AgentConfiguration } from '../../electron/agent-options';
import type { AgentContextExtras } from '../../shared/editor-services';
import importedAgentDiagnostics from './agent-diagnostics.ts';
import importedCardSpatial from '../rendering/spatial-model.ts';
import i18n from '../localization/ui-i18n.ts';
export const moduleApi = (() => {
  'use strict';
  const bindings = window as unknown as AgentUIBindings;
  const host = bindings.cardAIHost;
  const ui = (label: string) => i18n.text(label, i18n.language(document.documentElement.lang));
  const errorText = (error: unknown) =>
    error instanceof Error ? error.message : String(error);
  const labels: Record<string, string> = {
      none: '无',
      minimal: '最少',
      low: '低',
      medium: '中',
      high: '高',
      xhigh: '更高',
      max: '最高',
      ultra: 'Ultra',
    },
    states: Record<string, string> = {
      idle: '就绪',
      running: '回复中',
      failed: '失败',
      canceled: '已停止',
      interrupted: '已中断',
      preparing: '准备中',
      waiting: '等待产出',
      validating: '校验中',
      ready: '候选就绪',
    };
  let info: AgentInfo | null = null,
    refreshing: Promise<AgentInfo> | null = null,
    session: ChatSession | null = null,
    poll: ReturnType<typeof setTimeout> | undefined = undefined,
    sending = false,
    chatGeneration = 0,
    draft: AgentConfiguration | null = null,
    profileId = '',
    managerPage = 'sessions',
    lastJobs: AgentJob[] = [],
    lastSessions: ChatSummary[] = [],
    autoCommandId: string | null | undefined = null,
    commandBusy = false,
    defaulting = false,
    setupBusy = false,
    setupStatus: SetupReport | null = null,
    renderedMessages = '',
    scrollPending = false;
  const workflowLimit = 24;
  let workflow: Workflow | null = null;
  let workflowTimer: ReturnType<typeof setTimeout> | undefined;
  const questionDrafts = new Map<string, QuestionDraft>();
  function pendingQuestion() {
    return [...(session?.messages || [])]
      .reverse()
      .find(
        (m) =>
          m.role === 'assistant' &&
          m.state === 'complete' &&
          m.questions &&
          !m.questionResult,
      );
  }
  function stopWorkflow(message?: string) {
    clearTimeout(workflowTimer);
    workflowTimer = undefined;
    workflow = null;
    if (message) notify(message);
    controls();
  }
  const sameBinding = (
    a: EditorBinding | undefined,
    b: EditorBinding | undefined,
  ) =>
    a && b && a.documentToken === b.documentToken && a.revision === b.revision;
  async function continueWorkflow(result: { jobId?: string | null } = {}) {
    if (!workflow) return;
    const w = workflow;
    if (!sameBinding(w.binding, host.binding())) {
      stopWorkflow('连续制作已暂停：卡片或工程内容变化，请重新发送要求');
      return;
    }
    if (w.steps >= workflowLimit) {
      $('chat-input').value = '继续完成当前卡片的剩余步骤：' + w.goal;
      stopWorkflow(
        '已达到 ' +
          workflowLimit +
          ' 个制作阶段；结果保留，剩余要求已放入输入框',
      );
      return;
    }
    if (result.jobId) {
      w.jobId = result.jobId;
      notify('连续制作 · 等待真实图片候选就绪…');
      workflowTimer = setTimeout(async () => {
        try {
          if (workflow !== w) return;
          const j = await host.invoke('agent-status', { id: w.jobId });
          if (workflow !== w) return;
          if (['failed', 'canceled', 'interrupted'].includes(j.state)) {
            stopWorkflow('图片任务未就绪：' + j.message);
            return;
          }
          if (j.state !== 'ready') {
            await continueWorkflow({ jobId: w.jobId });
            return;
          }
          w.jobId = null;
          await continueWorkflow();
        } catch (e) {
          stopWorkflow(errorText(e));
        }
      }, 1500);
      controls();
      return;
    }
    w.steps++;
    await send(
      '继续当前制作流程。原始要求：' +
        w.goal +
        '。上一阶段编辑结果已由客户端记录，请检查当前 context 与实际就绪素材，完成剩余要求。不要重复已完成的新增卡片或已应用操作。需要分阶段执行时只提交下一批；全部完成后简要说明并且不输出指令。剩余阶段 ' +
        (workflowLimit - w.steps) +
        '。',
      true,
    );
  }
  function record(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
  let saved: Partial<AgentChoice> = {};
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem('atelier-agent-selection') || '{}',
    );
    if (record(value)) {
      for (const key of ['adapter', 'model', 'reasoning'] as const)
        if (typeof value[key] === 'string') saved[key] = value[key];
      if (typeof value.inheritDefaults === 'boolean')
        saved.inheritDefaults = value.inheritDefaults;
    }
  } catch {}
  function notify(text: string) {
    $('chat-state').hidden = !text;
    $('chat-state').textContent = text;
    if ($('agent-settings').open) $('agent-config-error').textContent = text;
    host.say(text);
  }
  function values(area = 'chat') {
    const inheritDefaults =
      $<HTMLSelectElement>(area + '-defaults-mode').value === 'cli';
    return {
      adapter: $(area === 'ai' ? 'ai-adapter' : 'chat-agent').value,
      model: inheritDefaults
        ? ''
        : $<HTMLInputElement>(area + '-model').value.trim(),
      reasoning: inheritDefaults
        ? ''
        : $<HTMLSelectElement>(area + '-reasoning').value,
      inheritDefaults,
    };
  }
  function agent(id: string) {
    return info?.adapters.find((a) => a.id === id);
  }
  function availableModels(adapter: string): AgentModel[] {
    return adapter === 'codex'
      ? info?.models || []
      : (agent(adapter)?.models || []).map((id) => ({ id, name: id }));
  }
  function quickChoices(area: string) {
    const picker = document.querySelector<HTMLSelectElement>(
      '#' + area + '-model-picker',
    );
    if (!picker) return;
    const o = values(area),
      a = agent(o.adapter),
      defaults = a?.id === 'codex' ? info?.defaults : a,
      models = availableModels(o.adapter);
    const options = [
      ['inherit', '跟随 CLI' + (defaults?.model ? ' · ' + defaults.model : '')],
      ...models.map((m) => ['model:' + m.id, m.name || m.id]),
    ];
    if (!o.inheritDefaults && !o.model)
      options.push(['current', '默认模型 · 自定推理']);
    if (o.model && !models.some((m) => m.id === o.model))
      options.push(['model:' + o.model, o.model]);
    options.push(['settings', '自定义模型…']);
    const signature = JSON.stringify(options);
    if (picker.dataset.modelOptionsSignature !== signature) {
      picker.replaceChildren(
        ...options.map(([id, name]) => new Option(name, id)),
      );
      picker.dataset.modelOptionsSignature = signature;
    }
    picker.value = o.inheritDefaults
      ? 'inherit'
      : o.model
        ? 'model:' + o.model
        : 'current';
    picker.title = picker.selectedOptions[0]?.textContent || '模型';
    picker.disabled = $(area === 'ai' ? 'ai-adapter' : 'chat-agent').disabled;
    picker.onchange = async () => {
      if (picker.value === 'settings') {
        quickChoices(area);
        await manager('preferences');
        const fold = $<HTMLInputElement>(area + '-model').closest('details');
        if (fold) fold.open = true;
        $(
          area +
            ($<HTMLInputElement>(area + '-model').disabled
              ? '-defaults-mode'
              : '-model'),
        ).focus();
        return;
      }
      if (picker.value === 'current') {
        quickChoices(area);
        return;
      }
      const inherit = picker.value === 'inherit';
      $<HTMLSelectElement>(area + '-defaults-mode').value = inherit
        ? 'cli'
        : 'custom';
      $<HTMLInputElement>(area + '-model').value = inherit
        ? ''
        : picker.value.slice(6);
      if (inherit) $<HTMLSelectElement>(area + '-reasoning').value = '';
      modelOptions(area);
      remember(area);
    };
  }
  function syncQuickChoices() {
    for (const area of ['chat', 'ai'] as const) quickChoices(area);
  }
  function efforts(el: HTMLSelectElement, list: readonly string[], value = '') {
    el.replaceChildren(new Option('沿用默认', ''));
    for (const e of list) el.add(new Option(labels[e] || e, e));
    el.value = [...el.options].some((o) => o.value === value) ? value : '';
  }
  function modelOptions(area: string) {
    const o = values(area),
      a = agent(o.adapter),
      models = availableModels(o.adapter);
    const dl = $<HTMLDataListElement>(area + '-models');
    dl.replaceChildren();
    for (const m of models) dl.append(new Option(m.name, m.id));
    const effective =
        o.inheritDefaults && a?.id === 'codex' ? info?.defaults || {} : a,
      inherited = o.model || effective?.model || '',
      known = models.find((m) => m.id === inherited);
    $<HTMLInputElement>(area + '-model').placeholder =
      (o.inheritDefaults ? 'CLI：' : '默认：') +
      (effective?.model || 'Agent 内置默认');
    efforts(
      $<HTMLSelectElement>(area + '-reasoning'),
      known?.efforts || info?.efforts || ['low', 'medium', 'high', 'xhigh'],
      o.reasoning,
    );
    $<HTMLSelectElement>(area + '-reasoning').options[0].textContent =
      '默认：' +
      (labels[effective?.reasoning || ''] ||
        effective?.reasoning ||
        'Agent 默认');
    quickChoices(area);
  }
  function set(o: AgentChoice, area = 'chat') {
    const select = $(area === 'ai' ? 'ai-adapter' : 'chat-agent');
    if (![...select.options].some((x) => x.value === o.adapter))
      select.add(new Option(o.adapter + ' · 未配置', o.adapter));
    select.value = o.adapter || 'codex';
    $<HTMLSelectElement>(area + '-defaults-mode').value =
      o.inheritDefaults === false ? 'custom' : 'cli';
    $<HTMLInputElement>(area + '-model').value = o.model || '';
    $<HTMLSelectElement>(area + '-reasoning').value = o.reasoning || '';
    modelOptions(area);
    $<HTMLSelectElement>(area + '-reasoning').value = o.reasoning || '';
    defaultControls(area);
  }
  function defaultControls(area: string) {
    const inherited =
        $<HTMLSelectElement>(area + '-defaults-mode').value === 'cli',
      a = agent($(area === 'ai' ? 'ai-adapter' : 'chat-agent').value),
      d = inherited && a?.id === 'codex' ? info?.defaults : a;
    $(area + '-effective-defaults').textContent = inherited
      ? '当前 ' +
        (a?.name || 'Agent') +
        '：' +
        (d?.model || '内置模型') +
        ' / ' +
        (labels[d?.reasoning || ''] || d?.reasoning || '默认推理') +
        ' · 提交时读取'
      : '仅本次选择覆盖默认配置';
  }
  function remember(area: string) {
    saved = values(area);
    if (saved.inheritDefaults) {
      $<HTMLInputElement>(area + '-model').value = '';
      $<HTMLSelectElement>(area + '-reasoning').value = '';
    }
    defaultControls(area);
    localStorage.setItem('atelier-agent-selection', JSON.stringify(saved));
    const other = area === 'ai' ? 'chat' : 'ai';
    if (!$(other === 'ai' ? 'ai-adapter' : 'chat-agent').disabled)
      set({ ...saved, adapter: saved.adapter || 'codex' }, other);
    capability();
  }
  function capability() {
    const a = agent(values().adapter);
    $('chat-capability').textContent = !a?.available
      ? 'Agent 未配置，请在管理中设置。'
      : !a.chat
        ? '此 Agent 仅支持图片任务；配置聊天参数后可在右侧聊天。'
        : a.id === 'codex'
          ? 'CLI 默认：' +
            (info?.defaults.model || '内置默认') +
            ' / ' +
            (info?.defaults.reasoning || '默认推理') +
            ' · ' +
            (info?.codex.version || '')
          : '外部 Agent 聊天 · 模型与推理通过任务参数传入';
    $('chat-cli-status').textContent = a?.auth?.message || '正在检测 CLI…';
    $('chat-auth-notice').hidden =
      !info || !!(a?.available && a?.chat && a?.auth?.ready);
    $('chat-auth-message').textContent = !a?.chat
      ? '此 Agent 未配置聊天能力'
      : a?.auth?.message || '请先设置 Agent';
    controls();
  }
  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const initial = !info;
      info = await host.invoke('agent-info');
      for (const area of ['chat', 'ai'] as const) {
        const current = values(area),
          select = $(area === 'ai' ? 'ai-adapter' : 'chat-agent');
        select.replaceChildren();
        for (const a of info.adapters)
          select.add(
            new Option(a.name + (a.available ? '' : ' · 未配置'), a.id),
          );
        const defaultChoice = {
          adapter: saved.adapter || 'codex',
          model: saved.inheritDefaults === false ? saved.model || '' : '',
          reasoning:
            saved.inheritDefaults === false ? saved.reasoning || '' : '',
          inheritDefaults: saved.inheritDefaults !== false,
        };
        const o = initial
          ? defaultChoice
          : current.adapter
            ? current
            : defaultChoice;
        set(o, area);
      }
      capability();
      return info;
    })();
    try {
      return await refreshing;
    } finally {
      refreshing = null;
    }
  }
  function controls() {
    const busy =
      sending ||
      defaulting ||
      commandBusy ||
      session?.state === 'running' ||
      !!workflow;
    $('chat-cli-defaults').disabled = busy;
    for (const id of ['chat-agent', 'chat-defaults-mode'] as const)
      $(id).disabled = busy;
    for (const id of ['chat-model', 'chat-reasoning'] as const)
      $(id).disabled = busy || values().inheritDefaults;
    $('chat-send').disabled =
      busy ||
      !!pendingQuestion() ||
      !agent(values().adapter)?.chat ||
      !agent(values().adapter)?.available ||
      !agent(values().adapter)?.auth?.ready;
    $('chat-stop').hidden =
      session?.state !== 'running' && !commandBusy && !workflow;
    $('chat-new').disabled = sending || commandBusy || !!workflow;
    $('chat-session').disabled = sending || commandBusy || !!workflow;
    $('chat-image').disabled = sending || commandBusy;
    for (const id of [
      'chat-workshop-new',
      'chat-workshop-variant',
      'chat-workshop-edit',
    ] as const)
      $(id).disabled = busy;
    for (const b of document.querySelectorAll<HTMLButtonElement>(
      '[data-question-submit]',
    ))
      b.disabled = sending || session?.state === 'running' || commandBusy;
    bindings.atelierAI?.updateControls();
    syncQuickChoices();
  }
  function publicText(m: ChatMessage) {
    let value = m.text || '正在回复…';
    if (m.state === 'failed') {
      try {
        const data: unknown = JSON.parse(value);
        if (record(data)) {
          const error = record(data.error) ? data.error : {};
          const message = error.message || data.message;
          if (typeof message === 'string') value = message;
        }
      } catch {}
      if (
        (m.diagnostic || importedAgentDiagnostics.classify(value)).kind ===
        'model'
      )
        value = importedAgentDiagnostics.classify(
          m.diagnostic?.detail || value,
        ).message;
    }
    return value.split('<atelier-actions>')[0].split('<atelier-question>')[0];
  }
  function messageCard(m: ChatMessage) {
    const article = node('article', undefined, 'chat-message ' + m.role);
    article.dataset.messageId = m.id;
    article.setAttribute(
      'aria-label',
      m.role === 'user' ? '你的要求' : 'AI 回复',
    );
    article.title = new Date(m.at).toLocaleString();
    const actions = node('div', undefined, 'chat-message-actions');
    const copy = button('复制', async () => {
      await navigator.clipboard.writeText(publicText(m));
      copy.textContent = '已复制';
    });
    copy.setAttribute(
      'aria-label',
      '复制' + (m.role === 'user' ? '要求' : '回复'),
    );
    actions.append(copy);
    if (m.role === 'user') {
      const edit = button('编辑', () => {
        $('chat-input').value = m.questionAnswer
          ? Object.entries(m.questionAnswer.answers)
              .map(([key, value]) => key + '：' + value)
              .join('；')
          : m.text;
        $('chat-input').focus();
      });
      edit.title = '编辑后作为新要求发送';
      actions.append(edit);
    }
    let content = publicText(m);
    const continuing = m.role === 'user' &&
      (m.context?.productionWorkflow?.stage || 0) > 1;
    if (m.questionAnswer)
      content = Object.values(m.questionAnswer.answers).join('；');
    else if (continuing)
      content =
        '继续制作 · 第 ' + m.context?.productionWorkflow?.stage + ' 阶段';
    const metadata = [
      new Date(m.at).toLocaleString(),
      m.invocation?.version,
      m.invocation?.model || m.model,
      m.invocation?.reasoning || m.reasoning,
      m.context?.layer?.name,
      m.imageAttached ? '附当前图层' : '',
      m.compositionAttached ? '附整卡预览' : '',
      m.skill ? 'Skill · $' + m.skill.name : '',
    ].filter(Boolean);
    if (metadata.length) {
      const detail = node('details', undefined, 'chat-message-detail');
      detail.append(node('summary', '详情'), node('p', metadata.join(' · ')));
      if (m.role === 'user' && content !== m.text)
        detail.append(node('pre', m.text, 'chat-command-preview'));
      if (m.invocation?.executable)
        detail.append(
          node('pre', m.invocation.executable, 'chat-command-preview'),
        );
      article.append(detail);
    }
    const text = node('div', content, 'chat-text');
    if (!continuing && m.state !== 'failed') text.dataset.uiContent = '';
    article.append(text);
    if (m.state && m.state !== 'complete') {
      article.dataset.state = m.state;
      article.append(node('small', states[m.state] || m.state));
      if (m.state === 'failed') {
        const diagnostic: { kind: string; message?: string; detail?: string } =
          m.productionDraft
            ? { kind: 'production', detail: m.diagnostic?.detail || m.text }
            : m.diagnostic || importedAgentDiagnostics.classify(m.text);
        if (diagnostic.detail) {
          const detail = node('details', undefined, 'chat-diagnostic');
          detail.append(
            node(
              'summary',
              diagnostic.kind === 'production'
                ? '制作参数错误'
                : '查看错误详情',
            ),
            node('pre', diagnostic.detail, 'chat-command-preview'),
          );
          article.append(detail);
        }
        const previous = session?.messages
          .slice(0, session!.messages.indexOf(m))
          .reverse()
          .find((p) => p.role === 'user');
        if (previous) article.append(button('重试', () => send(previous.text)));
        if (diagnostic.kind === 'model')
          article.append(
            button('切换模型', () => {
              $('chat-model-picker').focus();
            }),
          );
        if (diagnostic.kind !== 'production')
          article.append(
            button(
              diagnostic.kind === 'login' ? '登录 / 检测' : '检查 CLI',
              async () => {
                await manager('agents');
                setupChoice(session?.adapter || 'codex');
                await setupAction(
                  diagnostic.kind === 'login' ? 'status' : 'check-update',
                );
              },
            ),
          );
      }
    }
    if (m.questions && m.questionResult) article.append(questionForm(m));
    if (m.commands) {
      const result = node('div', undefined, 'chat-result-card');
      result.dataset.state = m.commandResult?.state || 'pending';
      const state =
        (
          {
            applied: '已应用',
            failed: '应用失败',
            stale: '工程已变化',
          } as Record<string, string>
        )[m.commandResult?.state || 'pending'] || '待应用';
      result.append(
        node('strong', state + ' · ' + m.commands.length + ' 项编辑'),
      );
      if (m.commandResult && m.commandResult.state !== 'applied')
        result.append(node('p', m.commandResult.message));
      else if (!m.commandResult)
        result.append(button('应用到当前画面', () => applyCommands(m.id)));
      const imageJob = m.commandResult?.message?.match(
        /图片任务已提交：([a-f0-9-]{36})/,
      );
      if (imageJob)
        result.append(button('查看图片任务', () => showJob(imageJob[1])));
      const details = node('details', undefined, 'chat-command-details');
      details.append(node('summary', '查看操作'));
      if (m.commandResult) details.append(node('p', m.commandResult.message));
      details.append(
        node(
          'pre',
          JSON.stringify(m.commands, null, 2),
          'chat-command-preview',
        ),
      );
      result.append(details);
      article.append(result);
    }
    article.append(actions);
    return article;
  }
  function renderSession() {
    const list = $('chat-messages'),
      nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 50,
      signature = JSON.stringify([session?.id, session?.messages]);
    if (renderedMessages !== signature) {
      const expanded = new Set<string>(
        [...list.querySelectorAll('details[open]')].map(
          (d) =>
            d.closest<HTMLElement>('[data-message-id]')?.dataset.messageId +
            ':' +
            d.className,
        ),
      );
      renderedMessages = signature;
      const previousScroll = list.scrollTop;
      list.replaceChildren();
      if (!session?.messages.length) {
        const empty = node('div', undefined, 'chat-empty');
        empty.append(
          node('span', '✧', 'chat-empty-symbol'),
          node('strong', '开始制作你的下一张卡片'),
          node('p', '描述角色、风格或要调整的图层。'),
        );
        list.append(empty);
      }
      for (const m of session?.messages || []) list.append(messageCard(m));
      for (const d of list.querySelectorAll('details'))
        d.open = expanded.has(
          d.closest<HTMLElement>('[data-message-id]')?.dataset.messageId +
            ':' +
            d.className,
        );
      const pending = pendingQuestion(),
        area = $('chat-question-area');
      area.replaceChildren();
      area.hidden = !pending;
      if (pending) area.append(questionForm(pending));
      document.querySelector<HTMLElement>('.chat-composer')!.hidden = !!pending;
      list.scrollTop = nearBottom ? list.scrollHeight : previousScroll;
      scrollPending = nearBottom && !list.clientHeight;
    }
    const status =
      workflow || session?.state === 'running'
        ? (workflow
            ? '连续制作 ' + workflow.steps + '/' + workflowLimit + ' · '
            : '') + (session?.activity || '处理中')
        : ['failed', 'canceled', 'interrupted'].includes(session?.state || '')
          ? states[session?.state || '']
          : '';
    $('chat-state').textContent = status;
    $('chat-state').hidden = !status;
    $('chat-session').value = session?.id || '';
    controls();
  }
  new MutationObserver(() => {
    if (scrollPending && document.body.classList.contains('ai-chat-active'))
      requestAnimationFrame(() => {
        const list = $('chat-messages');
        if (list.clientHeight) {
          list.scrollTop = list.scrollHeight;
          scrollPending = false;
        }
      });
  }).observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'data-app-mode'],
  });
  async function sessions() {
    lastSessions = await host.invoke('agent-chat-list');
    const select = $('chat-session');
    select.replaceChildren(new Option('新会话', ''));
    for (const s of lastSessions)
      select.add(
        new Option(s.title + (s.state === 'running' ? ' · 回复中' : ''), s.id),
      );
    select.value = session?.id || '';
  }
  function schedule() {
    clearTimeout(poll);
    if (session?.state !== 'running') return;
    const id = session.id;
    poll = setTimeout(async () => {
      try {
        const next = await host.invoke('agent-chat-status', { id });
        if (session?.id === id) {
          session = next;
          renderSession();
          if (next.state !== 'running') {
            await sessions();
            if (autoCommandId) {
              const m = next.messages.find((m) => m.id === autoCommandId);
              if (m?.questions) {
                autoCommandId = null;
                stopWorkflow('等待你的回答，已完成素材保留');
              } else if (m?.commands) await applyCommands(autoCommandId, true);
              else {
                autoCommandId = null;
                if (
                  workflow &&
                  m?.state === 'failed' &&
                  m.productionDraft &&
                  workflow.repairs++ < 1
                )
                  await continueWorkflow();
                else if (workflow)
                  stopWorkflow(
                    m?.state === 'complete'
                      ? '本轮回复完成；结果可保存、撤销和导出'
                      : '连续制作暂停，请查看本次错误',
                  );
              }
            }
          }
          schedule();
        }
      } catch (e) {
        notify(errorText(e));
      }
    }, 700);
  }
  async function openSession(id: string, show = true) {
    const generation = ++chatGeneration;
    const next = await host.invoke('agent-chat-status', { id });
    if (generation !== chatGeneration) return;
    session = next;
    localStorage.setItem('atelier-chat-active', id);
    set(
      saved.inheritDefaults !== false
        ? { adapter: saved.adapter || next.adapter, inheritDefaults: true }
        : { ...next, inheritDefaults: false },
    );
    await sessions();
    renderSession();
    schedule();
    if (show) bindings.atelierAgentDock.open();
  }
  async function send(
    retryText: string | null = null,
    continuation = false,
    questionAnswer: QuestionAnswer | null = null,
  ) {
    if (pendingQuestion() && !questionAnswer) {
      notify('请在问题面板回答后继续');
      return;
    }
    if (sending || session?.state === 'running') return;
    if (!agent(values().adapter)?.auth?.ready) {
      await manager('agents');
      setupChoice(values().adapter);
      notify('请先完成所选 CLI 的安装与登录检测');
      return;
    }
    const text =
      typeof retryText === 'string' ? retryText : $('chat-input').value.trim();
    if (!text) {
      notify('请填写消息');
      return;
    }
    if (!continuation) stopWorkflow();
    if (
      !continuation &&
      $('chat-workflow').checked &&
      $('chat-context').checked &&
      $('chat-editor-control').checked
    )
      workflow = { goal: text, steps: 1, repairs: 0, binding: host.binding() };
    sending = true;
    controls();
    const generation = chatGeneration;
    try {
      const o = values(),
        context: ReturnType<typeof host.context> = $('chat-context').checked
          ? host.context()
          : null;
      if (context) {
        if (workflow)
          context.productionWorkflow = {
            goal: workflow.goal,
            stage: workflow.steps,
            remaining: workflowLimit - workflow.steps,
          };
        context.editorControl = $('chat-editor-control').checked;
        const rejected = [...(session?.messages || [])]
          .reverse()
          .find((m) => m.state === 'failed' && m.productionDraft);
        if (rejected?.productionDraft)
          context.rejectedProduction = {
            reply: rejected.productionDraft.reply,
            error: rejected.text,
          };
        const assetJobs = await host.invoke('agent-list');
        context.failedAssets = assetJobs
          .filter(
            (j) =>
              j.documentToken === context.binding.documentToken &&
              ['failed', 'interrupted', 'waiting'].includes(j.state),
          )
          .map((j) => ({
            jobId: j.id,
            mode: j.mode,
            message: j.message,
            width: j.outputWidth,
            height: j.outputHeight,
          }));
        context.assets = assetJobs
          .filter((j) => j.state === 'ready')
          .map((j) => ({
            jobId: j.id,
            sameProject: j.documentToken === context.binding.documentToken,
            name: j.layerName,
            prompt: j.prompt.slice(0, 1000),
            width: j.outputWidth,
            height: j.outputHeight,
            applied: j.applied,
          }));
      }
      const source = context ? host.captureChatSource() : null;
      if (generation !== chatGeneration) return;
      if (!session) session = await host.invoke('agent-chat-create', o);
      session = await host.invoke('agent-chat-send', {
        id: session.id,
        ...o,
        text,
        context,
        source,
        ...(context?.editorControl
          ? {
              composition: host.captureChatComposition(),
              characterMaster: host.captureCharacterMaster(),
            }
          : {}),
        ...(questionAnswer ? { questionAnswer } : {}),
        ...(source &&
        context?.editorControl &&
        importedCardSpatial.characterContextLayer(context)
          ? {
              maskImages: Object.fromEntries(
                Object.entries(host.maskImages() || {}).filter(
                  ([name]) =>
                    context.document.maskStats[name]?.activePixels !== 0,
                ),
              ),
            }
          : {}),
      });
      localStorage.setItem('atelier-chat-active', session.id);
      autoCommandId = session.messages.at(-1)?.id;
      if (typeof retryText !== 'string') $('chat-input').value = '';
      renderSession();
      await sessions();
      schedule();
    } catch (e) {
      stopWorkflow(errorText(e));
      await refresh().catch(() => {});
    } finally {
      sending = false;
      controls();
    }
  }
  function node<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text?: string,
    className?: string,
  ) {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (className) e.className = className;
    return e;
  }
  function button(text: string, fn: () => unknown) {
    const b = node('button', text);
    b.onclick = () =>
      Promise.resolve()
        .then(fn)
        .catch((e) => notify(errorText(e)));
    return b;
  }
  function questionForm(m: ChatMessage) {
    const form = node('div', undefined, 'chat-question');
    form.setAttribute('role', 'group');
    form.setAttribute('aria-label', '制作问题');
    if (m.questionResult) {
      for (const q of m.questions || []) {
        const answer = node('p', q.title + '：' + m.questionResult.answers[q.id]);
        answer.dataset.uiContent = '';
        form.append(answer);
      }
      form.append(node('small', '已回答 · 后续按最新工程续作'));
      return form;
    }
    const drafts = questionDrafts.get(m.id) || {};
    questionDrafts.set(m.id, drafts);
    form.append(node('small', '等待回答 · 已完成的制作保留'));
    for (const q of m.questions || []) {
      const field = node('fieldset'),
        legend = node('legend', q.title),
        d = drafts[q.id] || (drafts[q.id] = { option: '', text: '' });
      legend.dataset.uiContent = '';
      field.append(legend);
      for (const option of q.options || []) {
        const label = node('label', undefined, 'chat-question-option'),
          input = node('input');
        input.type = 'radio';
        input.name = m.id + '-' + q.id;
        input.value = option;
        input.checked = d.option === option;
        input.onchange = () => {
          d.option = option;
        };
        const caption = node('span', option);
        caption.dataset.uiContent = '';
        label.append(input, caption);
        field.append(label);
      }
      const custom = node('textarea');
      custom.rows = 2;
      custom.maxLength = 2000;
      custom.value = d.text;
      custom.placeholder = q.options ? '或输入自己的要求…' : '请输入回答…';
      custom.setAttribute('aria-label', '补充回答：' + q.title);
      custom.oninput = () => {
        d.text = custom.value;
      };
      field.append(custom);
      form.append(field);
    }
    const submit = button('回答并继续', () => answerQuestion(m.id));
    submit.dataset.questionSubmit = m.id;
    form.append(submit);
    return form;
  }
  async function answerQuestion(messageId: string) {
    const m = pendingQuestion();
    if (!m || m.id !== messageId || sending) return;
    if (
      m.questionBinding &&
      m.questionBinding.documentToken !== host.binding().documentToken
    ) {
      notify('请回到提出问题的卡片后回答，问题与成果保留');
      return;
    }
    const answers: Record<string, string> = {};
    for (const q of m.questions || []) {
      const d = questionDrafts.get(m.id)?.[q.id];
      answers[q.id] = d?.text?.trim() || d?.option || '';
      if (!answers[q.id]) {
        notify('请回答“' + q.title + '”');
        return;
      }
    }
    if (
      m.questionWorkflow &&
      $('chat-context').checked &&
      $('chat-editor-control').checked
    )
      workflow = {
        goal: m.questionWorkflow.goal,
        steps: Math.min(workflowLimit, m.questionWorkflow.stage + 1),
        repairs: 0,
        binding: host.binding(),
      };
    await send('回答制作问题并继续', true, { messageId: m.id, answers });
  }

  async function showJob(id: string) {
    $('agent-settings').close();
    await bindings.atelierAI.loadJob(id);
  }
  function taskList(target: HTMLElement, jobs: AgentJob[]) {
    target.replaceChildren();
    if (!jobs.length) target.append(node('p', '暂无图片任务', 'panel-note'));
    for (const j of jobs) {
      const row = node('div', undefined, 'agent-task-row'),
        title = node(
          'span',
          j.layerName + ' · ' + (states[j.state] || j.state),
        );
      row.append(
        title,
        button('查看', () => showJob(j.id)),
      );
      if (['preparing', 'running', 'validating', 'waiting'].includes(j.state))
        row.append(
          button('停止', async () => {
            await host.invoke('agent-cancel', { id: j.id });
            await tasks();
          }),
        );
      target.append(row);
    }
  }
  async function tasks() {
    const checkpoint = await host.checkpointInfo();
    $('chat-recover').hidden = !checkpoint;
    if (checkpoint)
      $('chat-recover').title =
        checkpoint.name +
        ' · r' +
        checkpoint.revision +
        ' · ' +
        new Date(checkpoint.at).toLocaleString();
    lastJobs = await host.invoke('agent-list');
    $('chat-task-count').textContent = String(lastJobs.length);
    document.querySelector<HTMLElement>('.chat-tasks')!.hidden =
      !lastJobs.length;
    taskList($('chat-task-list'), lastJobs);
    filterTasks();
  }
  function filterTasks() {
    const q = $('task-search').value.toLowerCase();
    taskList(
      $('manager-task-list'),
      lastJobs.filter((j) =>
        [j.layerName, j.prompt, j.model, j.adapter]
          .join(' ')
          .toLowerCase()
          .includes(q),
      ),
    );
  }
  async function sessionManager() {
    const list = await host.invoke('agent-chat-list', {
        archived: $('chat-archived').checked,
      }),
      q = $('chat-search').value.toLowerCase(),
      target = $('chat-session-list');
    target.replaceChildren();
    for (const s of list.filter((s) => s.title.toLowerCase().includes(q))) {
      const row = node('div', undefined, 'manager-session'),
        name = node('input');
      name.type = 'text';
      name.value = s.title;
      name.maxLength = 100;
      name.setAttribute('aria-label', '会话名称 ' + s.title);
      row.append(
        name,
        node(
          'small',
          (states[s.state] || s.state) +
            ' · ' +
            s.messageCount +
            ' 条消息 · ' +
            (agent(s.adapter)?.name || '已移除的 Agent') +
            ' · ' +
            (s.model || '默认模型'),
        ),
      );
      const actions = node('div', undefined, 'button-row');
      actions.append(
        button('重命名', async () => {
          await host.invoke('agent-chat-rename', {
            id: s.id,
            title: name.value,
          });
          await sessions();
          await sessionManager();
        }),
      );
      if (!s.archived)
        actions.append(
          button('继续', async () => {
            $('agent-settings').close();
            await openSession(s.id);
          }),
        );
      actions.append(
        button(s.archived ? '恢复' : '归档', async () => {
          await host.invoke('agent-chat-archive', {
            id: s.id,
            archived: !s.archived,
          });
          if (session?.id === s.id && !s.archived) {
            session = null;
            localStorage.removeItem('atelier-chat-active');
            chatGeneration++;
            renderSession();
          }
          await sessions();
          await sessionManager();
        }),
      );
      if (s.state === 'running')
        actions.append(
          button('停止', async () => {
            await host.invoke('agent-chat-cancel', { id: s.id });
            await sessionManager();
          }),
        );
      row.append(actions);
      target.append(row);
    }
    if (!target.children.length)
      target.append(node('p', '暂无匹配会话', 'panel-note'));
  }
  function profileFields() {
    const p = draft?.profiles.find((p) => p.id === profileId);
    $('agent-profile-fields').hidden = !p;
    $('agent-profile-remove').disabled = !p;
    if (!p) return;
    for (const [id, key] of [
      ['agent-custom-name', 'name'],
      ['agent-custom-path', 'executable'],
      ['agent-profile-model', 'model'],
    ] as const)
      $(id).value = p[key] || '';
    $('agent-custom-args').value = JSON.stringify(p.args || ['{contract}']);
    $('agent-chat-args').value = p.chatArgs ? JSON.stringify(p.chatArgs) : '';
    $('agent-profile-models').value = (p.models || []).join(', ');
    efforts($('agent-profile-reasoning'), info?.efforts || [], p.reasoning);
    $('agent-requires-login').checked = p.requiresLogin !== false;
    for (const key of ['status', 'login', 'update'] as const)
      $<HTMLTextAreaElement>('agent-' + key + '-args').value = p[`${key}Args`]
        ? JSON.stringify(p[`${key}Args`])
        : '';
    $('agent-status-success').value = p.statusSuccessText || '';
  }
  function argumentList(raw: string): string[] {
    const value: unknown = JSON.parse(raw);
    if (
      !Array.isArray(value) ||
      value.length > 64 ||
      !value.every(
        (entry: unknown): entry is string =>
          typeof entry === 'string' && entry.length <= 2000,
      )
    )
      throw Error('Agent 参数需要最多 64 项的字符串数组');
    return value;
  }
  function jsonArgs(key: 'status' | 'login' | 'update') {
    const text = $<HTMLTextAreaElement>('agent-' + key + '-args').value.trim();
    return text ? argumentList(text) : null;
  }
  function storeProfile() {
    const p = draft?.profiles.find((p) => p.id === profileId);
    if (!p) return;
    Object.assign(p, {
      name: $('agent-custom-name').value.trim(),
      executable: $('agent-custom-path').value.trim(),
      args: argumentList($('agent-custom-args').value || '[]'),
      chatArgs: $('agent-chat-args').value.trim()
        ? argumentList($('agent-chat-args').value)
        : null,
      model: $('agent-profile-model').value.trim(),
      reasoning: $('agent-profile-reasoning').value,
      requiresLogin: $('agent-requires-login').checked,
      statusArgs: jsonArgs('status'),
      loginArgs: jsonArgs('login'),
      updateArgs: jsonArgs('update'),
      statusSuccessText: $('agent-status-success').value.trim(),
      models: $('agent-profile-models')
        .value.split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }
  function profiles() {
    const el = $('agent-profile');
    el.replaceChildren(new Option('选择外部 Agent…', ''));
    for (const p of draft?.profiles || [])
      el.add(new Option(p.name || '新 Agent', p.id));
    el.value = profileId;
    profileFields();
  }
  async function manager(page = 'sessions') {
    if (!info) await refresh();
    const currentInfo = info;
    if (!currentInfo) return;
    managerPage = page;
    $('agent-manager-title').textContent = ['agents', 'preferences'].includes(
      page,
    )
      ? 'AI 设置'
      : '会话与任务管理';
    for (const b of document.querySelectorAll<HTMLButtonElement>(
      '[data-agent-page]',
    )) {
      b.classList.toggle('active', b.dataset.agentPage === page);
      b.setAttribute('aria-selected', String(b.dataset.agentPage === page));
    }
    for (const s of document.querySelectorAll<HTMLButtonElement>(
      '[data-agent-page-content]',
    ))
      s.hidden = s.dataset.agentPageContent !== page;
    $('agent-config-error').textContent = '';
    if (page === 'sessions') await sessionManager();
    if (page === 'tasks') await tasks();
    if (page === 'agents' && !draft) {
      draft = structuredClone(currentInfo.config);
      $('agent-codex-path').value = draft.codexExecutable;
      $('agent-codex-model').value = draft.codexModel;
      efforts(
        $('agent-codex-reasoning'),
        currentInfo.efforts || [],
        draft.codexReasoning,
      );
      $('agent-version').textContent =
        (currentInfo.codex.version || '未检测到 Codex CLI') +
        ' · CLI 默认 ' +
        (currentInfo.defaults.model || '内置') +
        ' / ' +
        (currentInfo.defaults.reasoning || '默认');
      profileId = draft.profiles[0]?.id || '';
      profiles();
      setupChoices();
    }
    if (!$('agent-settings').open) $('agent-settings').showModal();
  }
  for (const area of ['chat', 'ai'] as const) {
    const select = $(area === 'ai' ? 'ai-adapter' : 'chat-agent');
    $<HTMLSelectElement>(area + '-defaults-mode').onchange = () => {
      const inherited =
        $<HTMLSelectElement>(area + '-defaults-mode').value === 'cli';
      if (inherited) {
        $<HTMLInputElement>(area + '-model').value = '';
        $<HTMLSelectElement>(area + '-reasoning').value = '';
      }
      modelOptions(area);
      remember(area);
      bindings.atelierAI?.updateControls();
    };
    select.onchange = () => {
      const a = agent(select.value);
      $<HTMLInputElement>(area + '-model').value =
        a?.id === 'codex' ? '' : a?.model || '';
      efforts(
        $<HTMLSelectElement>(area + '-reasoning'),
        info?.efforts || [],
        a?.id === 'codex' ? '' : a?.reasoning,
      );
      modelOptions(area);
      remember(area);
    };
    $<HTMLInputElement>(area + '-model').onchange = () => {
      $<HTMLSelectElement>(area + '-defaults-mode').value = 'custom';
      modelOptions(area);
      remember(area);
    };
    $<HTMLSelectElement>(area + '-reasoning').onchange = () => {
      $<HTMLSelectElement>(area + '-defaults-mode').value = 'custom';
      remember(area);
    };
  }
  for (const [id, prompt] of [
    ['new', '在当前工坊新增一张名为“新卡片”的空白卡片，保留其他卡片。'],
    [
      'variant',
      '复制当前卡片为独立新变体，保留背景图层、卡背组件和已有 Mask。新卡名称：',
    ],
    ['edit', '编辑当前卡片，保留连续人物与现有共享资源。需要调整：'],
  ] as const)
    $('chat-workshop-' + id).onclick = () => {
      $('chat-input').value = ui(prompt);
      $('chat-input').focus();
    };
  $('chat-recover').onclick = async () => {
    try {
      if (workflow || sending || commandBusy || session?.state === 'running') {
        notify('请先停止当前制作再恢复检查点');
        return;
      }
      const c = await host.recoverCheckpoint();
      notify('已恢复制作检查点 · ' + c.name + ' · 可撤销；发送剩余要求继续');
    } catch (e) {
      notify(errorText(e));
    }
  };
  $('chat-skill').onclick = () => {
    $('chat-input').value = ui(
      '$card-atelier 根据我的要求从零制作一张新的卡片，完成生图、抠图、注册图层、Mask、双语图片字标和动效；关键设计不确定时先问我，回答后继续。\n我的卡片要求：',
    );
    $('chat-input').focus();
  };
  $('chat-send').onclick = () => send();
  $('chat-input').onkeydown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      send();
    }
  };
  $('chat-stop').onclick = async () => {
    try {
      const jobId = workflow?.jobId;
      chatGeneration++;
      stopWorkflow('已停止连续制作，已完成的编辑保留');
      if (jobId) await host.invoke('agent-cancel', { id: jobId });
      if (commandBusy) {
        await host.cancelProduction();
        notify('已请求取消制作处理，原工程保留');
        return;
      }
      if (session?.state === 'running')
        session = await host.invoke('agent-chat-cancel', { id: session.id });
      renderSession();
      await sessions();
    } catch (e) {
      notify(errorText(e));
    }
  };
  $('chat-new').onclick = () => {
    stopWorkflow();
    chatGeneration++;
    autoCommandId = null;
    session = null;
    localStorage.removeItem('atelier-chat-active');
    $('chat-input').value = '';
    renderSession();
    schedule();
  };
  $('chat-session').onchange = () => {
    if ($('chat-session').value)
      openSession($('chat-session').value).catch((e) => notify(errorText(e)));
    else $('chat-new').click();
  };
  $('chat-image').onclick = async () => {
    const text =
      $('chat-input').value.trim() ||
      [...(session?.messages || [])].reverse().find((m) => m.role === 'user')
        ?.text ||
      '';
    await bindings.atelierAI.open('edit');
    if (!$('ai-dialog').dataset.jobId) $('ai-prompt').value = text;
  };
  function show() {
    bindings.atelierAgentDock.open();
    contextName();
    sessions().catch((e) => notify(errorText(e)));
    tasks().catch((e) => notify(errorText(e)));
  }
  function contextName() {
    const state = bindings.cardEditorHost.state();
    const attached = $('chat-context').checked;
    const editing = state.document && state.mode === 'editor';
    const name = attached && editing ? state.layer?.name : undefined;
    const caption = $('chat-context-name');
    caption.toggleAttribute('data-ui-content', !!name);
    caption.textContent = name || (attached ? (editing ? '未选图层' : '未载入卡片') : '未附图层');
  }
  function toggle() {
    const s = bindings.atelierAgentDock.state();
    if (
      s.open &&
      !s.collapsed &&
      !document.body.classList.contains('panels-hidden')
    )
      bindings.atelierAgentDock.close();
    else show();
  }
  $('agent-preferences').onclick = () =>
    manager('preferences').catch((e) => notify(errorText(e)));
  $('chat-auth-settings').onclick = () =>
    manager('agents').catch((e) => notify(errorText(e)));
  $('agent-open').onclick = toggle;
  document
    .querySelectorAll<HTMLButtonElement>('[data-agent-toggle]')
    .forEach((b) => (b.onclick = toggle));
  $('agent-manage').onclick = () =>
    manager('sessions').catch((e) => notify(errorText(e)));
  $('agent-settings-close').onclick = () => {
    $('agent-settings').close();
    draft = null;
  };
  $('agent-settings').addEventListener('close', () => {
    draft = null;
  });
  document
    .querySelectorAll<HTMLButtonElement>('[data-agent-page]')
    .forEach(
      (b) =>
        (b.onclick = () =>
          manager(b.dataset.agentPage).catch((e) => notify(errorText(e)))),
    );
  $('chat-search').oninput = () =>
    sessionManager().catch((e) => notify(errorText(e)));
  $('chat-archived').onchange = $('chat-search').oninput;
  $('task-search').oninput = filterTasks;
  $('agent-profile').onchange = () => {
    try {
      storeProfile();
      profileId = $('agent-profile').value;
      profileFields();
    } catch (e) {
      $('agent-profile').value = profileId;
      $('agent-config-error').textContent = errorText(e);
    }
  };
  $('agent-profile-new').onclick = () => {
    try {
      storeProfile();
      profileId = 'external-' + crypto.randomUUID();
      if (!draft) return;
      draft.profiles.push({
        id: profileId,
        name: '新 Agent',
        executable: '',
        args: ['{contract}'],
        chatArgs: null,
        requiresLogin: true,
        statusSuccessText: '',
        statusArgs: null,
        loginArgs: null,
        updateArgs: null,
        models: [],
        model: '',
        reasoning: '',
      });
      profiles();
    } catch (e) {
      $('agent-config-error').textContent = errorText(e);
    }
  };
  $('agent-profile-remove').onclick = () => {
    if (!draft) return;
    draft.profiles = draft.profiles.filter((p) => p.id !== profileId);
    profileId = draft.profiles[0]?.id || '';
    profiles();
  };
  $('agent-settings-save').onclick = async () => {
    try {
      storeProfile();
      await host.invoke('agent-config', {
        ...draft,
        custom: null,
        codexExecutable: $('agent-codex-path').value.trim(),
        codexModel: $('agent-codex-model').value.trim(),
        codexReasoning: $('agent-codex-reasoning').value,
      });
      draft = null;
      await refresh();
      await manager('agents');
      notify('Agent 配置已保存，可以检测、登录或更新');
    } catch (e) {
      $('agent-config-error').textContent = errorText(e);
    }
  };

  async function applyCommands(messageId: string, automatic = false) {
    const m = session?.messages.find((m) => m.id === messageId);
    if (!m?.commands || m.commandResult || commandBusy) {
      if (automatic) autoCommandId = null;
      return;
    }
    commandBusy = true;
    autoCommandId = null;
    const id = session!.id;
    let state: 'applied' | 'failed' | 'stale' = 'applied',
      message,
      result,
      checkpointError;
    try {
      result = await host.applyCommands(m.commands, m.commandBinding);
      message = result.message;
      try {
        await host.checkpoint();
      } catch (e) {
        checkpointError = errorText(e);
        message = (message + '；检查点保存失败：' + errorText(e)).slice(0, 500);
      }
    } catch (e) {
      state = /已变化/.test(errorText(e)) ? 'stale' : 'failed';
      message = errorText(e);
    }
    m.commandResult = { state, message };
    renderSession();
    try {
      const next = await host.invoke('agent-chat-command-result', {
        id,
        messageId,
        state,
        message,
      });
      if (session?.id === id) {
        session = next;
        renderSession();
      }
    } catch (e) {
      notify('编辑结果已显示；记录保存失败：' + errorText(e));
    } finally {
      commandBusy = false;
      controls();
    }
    if (checkpointError) {
      stopWorkflow(
        '编辑已应用，自动检查点未保存：' +
          checkpointError +
          '；请先保存工程再继续',
      );
      return;
    }
    if (workflow && session?.id === id) {
      if (state === 'applied') {
        workflow.binding = host.binding();
        await continueWorkflow(result);
      } else if (state === 'failed' && workflow.repairs++ < 1)
        await continueWorkflow();
      else stopWorkflow('连续制作暂停：' + message);
    }
  }
  $('chat-cli-defaults').onclick = async () => {
    if (defaulting) return;
    defaulting = true;
    controls();
    try {
      const adapter = values().adapter;
      set({ adapter, inheritDefaults: true });
      remember('chat');
      await refresh();
      notify('新聊天与图片任务沿用当前 Agent CLI 默认；提交时重新读取');
    } catch (e) {
      notify(errorText(e));
    } finally {
      defaulting = false;
      controls();
    }
  };
  const preferenceIds = [
    'chat-context',
    'chat-editor-control',
    'chat-workflow',
  ] as const;
  try {
    const preferences: unknown = JSON.parse(
      localStorage.getItem('atelier-agent-preferences') || '{}',
    );
    if (record(preferences))
      for (const id of preferenceIds)
        if (typeof preferences[id] === 'boolean')
          $(id).checked = preferences[id];
  } catch {}
  $('chat-editor-control').disabled = !$('chat-context').checked;
  for (const id of preferenceIds)
    $(id).addEventListener('change', () =>
      localStorage.setItem(
        'atelier-agent-preferences',
        JSON.stringify(
          Object.fromEntries(preferenceIds.map((key) => [key, $(key).checked])),
        ),
      ),
    );
  $('chat-context').onchange = () => {
    $('chat-editor-control').disabled = !$('chat-context').checked;
    contextName();
  };
  $('chat-workflow').onchange = () => {
    if (!$('chat-workflow').checked && workflow) {
      $('chat-input').value = '继续完成当前卡片的剩余步骤：' + workflow.goal;
      stopWorkflow('已暂停连续续作；当前回复或图片任务会完成，结果保留');
    }
  };

  function setupChoices() {
    const select = $('setup-agent');
    select.replaceChildren();
    for (const a of (info?.adapters || []).filter((a) => a.id !== 'handoff'))
      select.add(new Option(a.name, a.id));
    setupChoice(values().adapter);
  }
  function setupChoice(id: string) {
    $('setup-agent').value = agent(id) && id !== 'handoff' ? id : 'codex';
    setupStatus = agent($('setup-agent').value)?.auth || null;
    $('setup-command').hidden = true;
    $('setup-update-status').textContent = '';
    renderSetup();
  }
  function renderSetup() {
    const current: Partial<SetupReport> = setupStatus || {},
      id = $('setup-agent').value,
      exists = !!agent(id);
    $('setup-status').textContent =
      current.message || '请先保存配置，再重新检测。';
    $('setup-path').textContent = [current.version, current.executable]
      .filter(Boolean)
      .join(' · ');
    $('setup-detect').disabled = setupBusy || !exists;
    $('setup-check-update').disabled = setupBusy || !exists;
    $('setup-install').disabled =
      setupBusy || !!current.installed || id !== 'codex';
    $('setup-login').disabled =
      setupBusy || !current.installed || !!current.ready;
    $('setup-update').disabled =
      setupBusy || !current.installed || current.update?.available === false;
  }
  function setupConfigurationChanged() {
    if (!draft) return false;
    storeProfile();
    return (
      JSON.stringify({
        ...draft,
        codexExecutable: $('agent-codex-path').value.trim(),
        codexModel: $('agent-codex-model').value.trim(),
        codexReasoning: $('agent-codex-reasoning').value,
      }) !== JSON.stringify(info?.config)
    );
  }
  async function setupAction(
    action: 'status' | 'check-update' | 'install' | 'login' | 'update',
  ) {
    if (setupBusy) return;
    try {
      if (setupConfigurationChanged()) {
        notify('配置有修改，请先保存 Agent 配置再检测、登录或更新');
        return;
      }
      setupBusy = true;
      renderSetup();
      const id = $('setup-agent').value,
        result =
          action === 'status' || action === 'check-update'
            ? await host.invoke(
                action === 'status'
                  ? 'agent-setup-status'
                  : 'agent-setup-check-update',
                { adapter: id },
              )
            : await host.invoke(
                action === 'login'
                  ? 'agent-setup-login'
                  : action === 'install'
                    ? 'agent-setup-install'
                    : 'agent-setup-update',
                { adapter: id },
              );
      if ('installed' in result) {
        setupStatus = result;
        const a = agent(id);
        if (a) {
          a.auth = result;
          a.available = result.installed;
        }
        if (id === 'codex' && info) {
          info.codex = {
            ...info.codex,
            version: result.version,
            executable: result.executable,
            auth: result,
          };
          $('agent-version').textContent =
            (result.version || '版本未知') +
            ' · CLI 默认 ' +
            (info?.defaults.model || '内置') +
            ' / ' +
            (info?.defaults.reasoning || '默认');
        }
        capability();
        $('setup-update-status').textContent = result.update?.message || '';
      } else {
        $('setup-guidance').textContent = result.message;
        $('setup-command').hidden = !result.command;
        $('setup-command').textContent = result.command || '';
      }
      notify(
        action === 'status'
          ? '检测完成：' + result.message
          : result.update?.message || result.message,
      );
    } catch (e) {
      notify(errorText(e));
    } finally {
      setupBusy = false;
      renderSetup();
    }
  }
  $('chat-cli-setup').onclick = async () => {
    await manager('agents');
    setupChoice(values().adapter);
  };
  $('setup-agent').onchange = () => setupChoice($('setup-agent').value);
  for (const [id, action] of [
    ['setup-detect', 'status'],
    ['setup-check-update', 'check-update'],
    ['setup-install', 'install'],
    ['setup-login', 'login'],
    ['setup-update', 'update'],
  ] as const)
    $(id).onclick = () => setupAction(action);
  const exposedatelierAgents = {
    refresh,
    selection: values,
    set,
    syncQuickChoices,
    defaults(area = 'chat') {
      set(
        {
          adapter: saved.adapter || 'codex',
          model: saved.inheritDefaults === false ? saved.model || '' : '',
          reasoning:
            saved.inheritDefaults === false ? saved.reasoning || '' : '',
          inheritDefaults: saved.inheritDefaults !== false,
        },
        area,
      );
    },
    manage: manager,
    ready: (id: string) => !!agent(id)?.auth?.ready,
  };
  bindings.atelierAgents = exposedatelierAgents;
  const exposedatelierAgentChat = {
    refreshTasks: tasks,
    sessionId: () => session?.id || null,
  };
  bindings.atelierAgentChat = exposedatelierAgentChat;
  refresh()
    .then(sessions)
    .then(async () => {
      const id = localStorage.getItem('atelier-chat-active');
      if (lastSessions.some((s) => s.id === id))
        await openSession(id || '', false);
    })
    .catch((e) => notify(errorText(e)));
  renderSession();
  setInterval(() => {
    if (document.body.classList.contains('ai-chat-active')) {
      contextName();
      if (!sending) tasks().catch(() => {});
    }
    if ($('agent-settings').open && managerPage === 'tasks')
      tasks().catch(() => {});
  }, 3000);
  return {
    atelierAgents: exposedatelierAgents,
    atelierAgentChat: exposedatelierAgentChat,
  };
})();
