const { test } = require('node:test');
const assert = require('node:assert/strict');
const options = require('../dist/electron/agent-options.cjs');

test('agent configuration validates unknown input and preserves legacy custom profiles', () => {
  const cfg = options.normalize({
    custom: {
      name: ' 自定义 ',
      executable: 'agent',
      args: [],
      chatArgs: ['{prompt}'],
      models: ['test-model'],
    },
  });
  assert.equal(cfg.profiles.length, 1);
  assert.equal(cfg.custom, cfg.profiles[0]);
  assert.equal(cfg.custom.name, '自定义');
  assert.deepEqual(cfg.custom.args, []);
  for (const value of [
    null,
    [],
    { profiles: [null] },
    { profiles: [{ id: 'x', name: 'x', executable: 'agent', args: [123] }] },
  ])
    assert.throws(() => options.normalize(value));
  const profile = { id: 'x', name: 'x', executable: 'agent' };
  assert.throws(
    () => options.normalize({ profiles: [profile, profile] }),
    /重复/,
  );
  assert.throws(
    () => options.normalize({ codexReasoning: 'unlimited' }),
    /推理/,
  );
});

test('CLI default parsing merges only selected profile model scalars', () => {
  const toml = `model = "root-model"
model_reasoning_effort = 'medium'
profile = "work"
api_key = "private-value"
[profiles."work"]
model = "profile-model"
model_reasoning_effort = "high"
[profiles.other]
model = "other-model"
[providers.private]
api_key = "private-value"`;
  assert.deepEqual(options.parseDefaults(toml), {
    model: 'profile-model',
    reasoning: 'high',
    profile: 'work',
  });
  const cfg = {
    ...options.normalize({ codexModel: 'app-model', codexReasoning: 'low' }),
    cliDefaults: options.parseDefaults(toml),
  };
  assert.deepEqual(
    options.options(cfg, { inheritDefaults: true, model: 'old-history' }),
    { adapter: 'codex', model: 'profile-model', reasoning: 'high' },
  );
  assert.deepEqual(
    options.customArgs(['{contract}', '{model}', '{sessionId}', 'literal'], {
      contract: 'path with spaces/合同.json',
      model: 'profile-model',
    }),
    ['path with spaces/合同.json', 'profile-model', '', 'literal'],
  );
});
