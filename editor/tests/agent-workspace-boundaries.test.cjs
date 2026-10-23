const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  sessionData,
  chatArguments,
  streamError,
} = require('../dist/electron/chat-model.cjs');
const layout = require('../dist/renderer/workspace-layout.js');
test('stream failures keep CLI diagnostics without trusting malformed fields', () => {
  assert.equal(
    streamError({ type: 'turn.failed', message: 'Model unavailable' }),
    'Model unavailable',
  );
  assert.equal(
    streamError({ type: 'error', error: { message: 'Login required' } }),
    'Login required',
  );
  assert.equal(
    streamError({
      type: 'error',
      error: { message: { invalid: true } },
      message: 'Fallback',
    }),
    'Fallback',
  );
  assert.equal(streamError({ type: 'error', message: 42 }), 'Agent 调用失败');
});
const id = '11111111-1111-4111-8111-111111111111';
const binding = { documentToken: 'card', revision: 7, viewKey: 'front' };
const message = () => ({
  id: 'reply',
  role: 'assistant',
  text: 'Ready',
  at: '2026-01-01',
  state: 'complete',
});
const session = () => ({
  id,
  title: 'Saved',
  adapter: 'codex',
  state: 'idle',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  messages: [message()],
});

test('persisted conversations retain public metadata and exclude live process state', () => {
  const raw = {
    ...session(),
    archived: true,
    usage: { providerField: [1, 2] },
    child: { pid: 123 },
    writes: {},
    activeTurn: 'forged',
  };
  Object.assign(raw.messages[0], {
    commands: [{ op: 'rename', layerId: 'body', name: 'Renamed' }],
    commandBinding: binding,
    commandResult: { state: 'applied', message: 'Done', at: '2026-01-01' },
  });
  const restored = sessionData(raw, id);
  assert.equal(restored.archived, true);
  assert.deepEqual(restored.usage, raw.usage);
  assert.deepEqual(restored.messages, raw.messages);
  for (const field of ['child', 'writes', 'activeTurn'])
    assert.equal(Object.hasOwn(restored, field), false);
  const legacy = session();
  assert.equal(sessionData(legacy, id).model, '');
  assert.equal(sessionData(legacy, id).reasoning, '');
});

test('invalid persisted messages, bindings, commands and questions fail at the disk boundary', () => {
  for (const value of [
    null,
    [],
    { ...session(), id: 'other' },
    { ...session(), state: 'ready' },
    { ...session(), messages: {} },
    { ...session(), messages: [{ ...message(), text: 3 }] },
  ])
    assert.throws(() => sessionData(value, id));
  const invalid = [
    { commandBinding: { ...binding, revision: '7' } },
    { commands: [{ op: 'move', layerId: 'body', dx: '1', dy: 0 }] },
    { questions: [{ id: 'style', title: 'Style?', options: ['one'] }] },
    {
      questionAnswer: {
        messageId: 'reply',
        answers: { style: { text: 'invalid' } },
      },
    },
    { productionDraft: { reply: 5 } },
    { diagnostic: { kind: 'other', message: { text: 'invalid' } } },
    {
      context: {
        productionWorkflow: { goal: 'Card', stage: '2', remaining: 20 },
      },
    },
  ];
  for (const patch of invalid)
    assert.throws(() =>
      sessionData({ ...session(), messages: [{ ...message(), ...patch }] }, id),
    );
});

test('interrupted production drafts and human question replies remain recoverable', () => {
  const draft = {
    reply:
      '<atelier-actions>invalid draft retained for repair</atelier-actions>',
    binding,
  };
  const raw = session();
  raw.state = 'interrupted';
  raw.messages = [
    { ...message(), state: 'failed', productionDraft: draft },
    {
      ...message(),
      id: 'question',
      questions: [{ id: 'style', title: 'Style?', options: ['Gold', 'Blue'] }],
      questionBinding: binding,
      questionWorkflow: { goal: 'New card', stage: 2, remaining: 22 },
      questionResult: {
        messageId: 'question',
        answers: { style: 'Ink' },
        at: '2026-01-01',
      },
    },
  ];
  const result = sessionData(raw, id);
  assert.deepEqual(result.messages[0].productionDraft, draft);
  assert.deepEqual(result.messages[1].questionResult.answers, { style: 'Ink' });
});

test('chat IPC checks consumed fields while preserving provider context extensions', () => {
  const ctx = {
    editorControl: true,
    binding,
    document: { providerMetadata: { extension: true } },
  };
  assert.equal(chatArguments({ id, text: 'Hello', context: ctx }).context, ctx);
  for (const value of [
    [],
    null,
    { text: 42 },
    { id: 4 },
    { context: { editorControl: true, binding: { ...binding, viewKey: 7 } } },
    { source: {} },
    { maskImages: [] },
  ])
    assert.throws(() => chatArguments(value));
});

test('workspace preferences handle malformed storage and keep valid layouts', () => {
  const defaults = layout.normalize();
  for (const value of [
    null,
    5,
    'split',
    [],
    { view: ['edit'], ratio: '60', lastPreview: ['preview'] },
  ])
    assert.deepEqual(layout.normalize(value), defaults);
  assert.deepEqual(
    layout.normalize({
      view: 'space',
      lastPreview: 'preview',
      axis: 'columns',
      ratio: 90,
      effectsEnabled: false,
    }),
    {
      view: 'space',
      lastPreview: 'preview',
      axis: 'columns',
      ratio: 75,
      effectsEnabled: false,
    },
  );
  assert.equal(
    layout.ratioFromPointer(
      'rows',
      { left: 0, top: 0, width: 200, height: 400 },
      0,
      200,
    ),
    50,
  );
  assert.equal(
    layout.ratioFromPointer(
      'columns',
      { left: 10, top: 0, width: 200, height: 400 },
      60,
      0,
    ),
    25,
  );
});
