// Questions never apply an edit while waiting for a decision.
import { isRecord } from './validation';
export interface Question {
  id: string;
  title: string;
  options?: string[];
}
export interface QuestionMessage {
  id: string;
  role?: string;
  state?: string;
  questions?: Question[];
  questionResult?: unknown;
}
export interface QuestionReply {
  text: string;
  questions?: Question[];
}
function keys(
  value: unknown,
  allowed: string[],
): asserts value is Record<string, unknown> {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw Error('提问包含未知字段');
}
function short(value: unknown, max: number): value is string {
  return typeof value === 'string' && !!value.trim() && value.length <= max;
}
export function parseReply(reply: string): QuestionReply {
  const blocks = [
    ...reply.matchAll(/<atelier-question>([\s\S]*?)<\/atelier-question>/g),
  ];
  if (!blocks.length) {
    if (/<\/?atelier-question\b/.test(reply)) throw Error('提问块未闭合');
    return { text: reply };
  }
  if (
    blocks.length !== 1 ||
    /<\/?atelier-question\b/.test(reply.replace(blocks[0][0], ''))
  )
    throw Error('每阶段只能提交一组问题');
  if (/<atelier-actions>/.test(reply))
    throw Error('提问阶段不能同时提交编辑操作');
  let data: unknown;
  try {
    data = JSON.parse(blocks[0][1]);
  } catch {
    throw Error('提问 JSON 无效');
  }
  keys(data, ['questions']);
  if (
    !Array.isArray(data.questions) ||
    data.questions.length < 1 ||
    data.questions.length > 3
  )
    throw Error('每次提问需要 1–3 项');
  const ids = new Set<string>(),
    raw: unknown[] = data.questions;
  return {
    text: reply.replace(blocks[0][0], '').trim(),
    questions: raw.map((q: unknown): Question => {
      keys(q, ['id', 'title', 'options']);
      if (
        typeof q.id !== 'string' ||
        !/^[a-z][a-z0-9_]{0,39}$/.test(q.id) ||
        ids.has(q.id)
      )
        throw Error('问题 ID 无效或重复');
      ids.add(q.id);
      if (!short(q.title, 300)) throw Error('问题标题需要 1–300 字');
      let options: string[] | undefined;
      if (q.options !== undefined) {
        if (
          !Array.isArray(q.options) ||
          q.options.length < 2 ||
          q.options.length > 3
        )
          throw Error('选项需要 2–3 个不同的短文本');
        options = [];
        for (const value of q.options as unknown[]) {
          if (!short(value, 100)) throw Error('选项需要 2–3 个不同的短文本');
          options.push(value.trim());
        }
        if (new Set(options).size !== options.length)
          throw Error('选项需要 2–3 个不同的短文本');
      }
      return {
        id: q.id,
        title: q.title.trim(),
        ...(options ? { options } : {}),
      };
    }),
  };
}
export function pending<T extends QuestionMessage>(session: {
  messages?: T[];
}): (T & { questions: Question[] }) | undefined {
  return [...(session.messages || [])]
    .reverse()
    .find(
      (m): m is T & { questions: Question[] } =>
        m.role === 'assistant' &&
        m.state === 'complete' &&
        !!m.questions &&
        !m.questionResult,
    );
}
export function answer<T extends QuestionMessage>(
  session: { messages?: T[] },
  value: unknown,
) {
  const message = pending(session);
  if (!message || !isRecord(value) || value.messageId !== message.id)
    throw Error('问题已回答或已变化，请刷新会话');
  keys(value, ['messageId', 'answers']);
  const raw = value.answers;
  if (
    !isRecord(raw) ||
    Object.keys(raw).length !== message.questions.length ||
    Object.keys(raw).some((key) => !message.questions.some((q) => q.id === key))
  )
    throw Error('请回答当前全部问题');
  const answers: Record<string, string> = {};
  for (const q of message.questions) {
    const text = raw[q.id];
    if (!short(text, 2000)) throw Error('请回答“' + q.title + '”');
    answers[q.id] = text.trim();
  }
  return { message, result: { messageId: message.id, answers } };
}
const description =
  'When a consequential creative requirement is uncertain, return one <atelier-question>{"questions":[{"id":"short_snake_case","title":"Self-contained question","options":["Recommended choice","Alternative"]}]}</atelier-question>. Ask 1..3 questions; options are optional, 2..3 distinct strings when present. Free-text answers are always allowed. Do not include atelier-actions in that reply. The client pauses production and waits indefinitely for the human answer; never pick an answer yourself. Answers arrive in contract.questionAnswer and transcript questionResult; resume the original goal with fresh context and retain applied results.';

export { description };
