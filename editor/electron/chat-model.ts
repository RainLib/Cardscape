import { isRecord } from './validation';
import type {
  ActiveChat,
  ChatArguments,
  ChatContext,
  ChatMessage,
  EditorBinding,
  EditorCommandAPI,
} from '../shared/agent';
import { parseReply } from './agent-questions';
const commands: EditorCommandAPI = require('../renderer/editor-commands.js');
export function streamError(value: Record<string, unknown>): string {
  const nested = isRecord(value.error) ? value.error.message : undefined;
  return (
    (typeof nested === 'string' && nested) ||
    (typeof value.message === 'string' && value.message) ||
    'Agent 调用失败'
  );
}
function text(value: unknown): value is string {
  return typeof value === 'string';
}
export function binding(value: unknown): value is EditorBinding {
  return (
    isRecord(value) &&
    text(value.documentToken) &&
    Number.isInteger(value.revision) &&
    text(value.viewKey)
  );
}
export function context(
  value: unknown,
): asserts value is ChatContext | null | undefined {
  if (value == null) return;
  if (
    !isRecord(value) ||
    (value.binding !== undefined && !binding(value.binding)) ||
    (value.editorControl && !binding(value.binding))
  )
    throw Error('编辑指令缺少工程与视图绑定');
  if (
    value.layer != null &&
    (!isRecord(value.layer) ||
      (value.layer.name !== undefined && !text(value.layer.name)))
  )
    throw Error('编辑器图层上下文无效');
  if (
    value.productionWorkflow != null &&
    (!isRecord(value.productionWorkflow) ||
      !text(value.productionWorkflow.goal) ||
      !Number.isInteger(value.productionWorkflow.stage) ||
      !Number.isInteger(value.productionWorkflow.remaining))
  )
    throw Error('制作流程上下文无效');
}
export function chatArguments(input: unknown): ChatArguments {
  if (!isRecord(input)) throw Error('聊天参数无效');
  for (const key of [
    'id',
    'adapter',
    'model',
    'reasoning',
    'text',
    'title',
    'messageId',
    'state',
    'message',
  ])
    if (input[key] !== undefined && !text(input[key]))
      throw Error('聊天参数无效：' + key);
  for (const key of ['source', 'composition', 'characterMaster'])
    if (input[key] != null && !text(input[key]))
      throw Error('聊天附图参数无效');
  context(input.context);
  if (input.maskImages != null && !isRecord(input.maskImages))
    throw Error('Mask 附图需要人物制作上下文');
  // Boolean options historically accept truthy/falsy IPC values.
  return {
    ...input,
    archived: input.archived === undefined ? undefined : !!input.archived,
    inheritDefaults:
      input.inheritDefaults === undefined
        ? undefined
        : input.inheritDefaults === true,
  } as ChatArguments;
}
function message(value: unknown): asserts value is ChatMessage {
  if (
    !isRecord(value) ||
    !text(value.id) ||
    !['user', 'assistant'].includes(String(value.role)) ||
    !text(value.text) ||
    !text(value.at)
  )
    throw Error('会话消息无效');
  if (
    value.state !== undefined &&
    !['running', 'failed', 'canceled', 'interrupted', 'complete'].includes(
      String(value.state),
    )
  )
    throw Error('会话消息状态无效');
  for (const key of ['adapter', 'model', 'reasoning', 'agentName'])
    if (value[key] !== undefined && !text(value[key]))
      throw Error('会话消息元数据无效');
  context(value.context);
  for (const key of ['commandBinding', 'questionBinding'])
    if (value[key] != null && !binding(value[key]))
      throw Error('会话工程绑定无效');
  if (
    value.productionDraft != null &&
    (!isRecord(value.productionDraft) ||
      !text(value.productionDraft.reply) ||
      (value.productionDraft.binding != null &&
        !binding(value.productionDraft.binding)))
  )
    throw Error('制作草稿无效');
  if (value.commands !== undefined) commands.validate(value.commands);
  if (value.questions !== undefined)
    parseReply(
      '<atelier-question>' +
        JSON.stringify({ questions: value.questions }) +
        '</atelier-question>',
    );
  for (const key of ['questionAnswer', 'questionResult']) {
    const answer = value[key];
    if (
      answer != null &&
      (!isRecord(answer) ||
        !text(answer.messageId) ||
        !isRecord(answer.answers) ||
        !Object.values(answer.answers).every(text))
    )
      throw Error('会话问题回答无效');
  }
  if (
    value.commandResult != null &&
    (!isRecord(value.commandResult) ||
      !['applied', 'failed', 'stale'].includes(
        String(value.commandResult.state),
      ) ||
      !text(value.commandResult.message) ||
      !text(value.commandResult.at))
  )
    throw Error('会话操作结果无效');
  if (
    value.diagnostic != null &&
    (!isRecord(value.diagnostic) ||
      !text(value.diagnostic.kind) ||
      !text(value.diagnostic.message) ||
      (value.diagnostic.detail !== undefined && !text(value.diagnostic.detail)))
  )
    throw Error('会话诊断无效');
  if (
    value.skill != null &&
    (!isRecord(value.skill) ||
      !text(value.skill.name) ||
      !text(value.skill.entry) ||
      !text(value.skill.sha256))
  )
    throw Error('会话 Skill 无效');
  if (value.invocation != null) {
    if (!isRecord(value.invocation)) throw Error('会话调用信息无效');
    for (const key of [
      'executable',
      'version',
      'model',
      'reasoning',
      'checkedAt',
    ])
      if (value.invocation[key] != null && !text(value.invocation[key]))
        throw Error('会话调用信息无效');
  }
  if (value.questionWorkflow != null)
    context({ productionWorkflow: value.questionWorkflow });
}
export function sessionData(value: unknown, id: string): ActiveChat {
  if (
    !isRecord(value) ||
    value.id !== id ||
    !text(value.title) ||
    !text(value.adapter) ||
    !text(value.createdAt) ||
    !text(value.updatedAt) ||
    !['idle', 'running', 'failed', 'canceled', 'interrupted'].includes(
      String(value.state),
    ) ||
    !Array.isArray(value.messages) ||
    value.messages.length > 200
  )
    throw Error('会话记录无效');
  for (const key of ['model', 'reasoning', 'activity'])
    if (value[key] !== undefined && !text(value[key]))
      throw Error('会话元数据无效');
  const messages: unknown[] = value.messages;
  messages.forEach(message);
  // Reconstruct only persisted fields; disk data cannot supply live child/writes/turn state.
  return {
    id,
    title: value.title,
    archived: !!value.archived,
    state: value.state as ActiveChat['state'],
    adapter: value.adapter,
    model: text(value.model) ? value.model : '',
    reasoning: text(value.reasoning) ? value.reasoning : '',
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    messages: messages as ChatMessage[],
    activity: text(value.activity) ? value.activity : '',
    usage: value.usage ?? null,
  };
}
