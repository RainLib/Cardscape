const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const compiler = () => import('../build/classic-renderer.mts');

test('portable async entry points preserve completion, property names and shadowed locals', async () => {
  const { classicRenderer } = await compiler();
  const source = `import runtime from './rendering/runtime-model.ts';
    (async()=>{await Promise.resolve();
      const value={runtime:{name:runtime.name},copy:runtime};
      function local(runtime){return runtime.name;}
      return [value.runtime.name,value.copy.name,local({name:'local'})];
    })();`;
  const result = vm.runInNewContext(await classicRenderer(root, 'app.ts', source), { window: { CardRuntime: { name: 'imported' } } });
  assert.equal(typeof result.then, 'function');
  assert.deepEqual(Array.from(await result), ['imported', 'imported', 'local']);
});

test('Node adapters read cyclic dependencies lazily and preserve shorthand exports', async () => {
  const { classicRenderer } = await compiler();
  const source = `import frame from '../editing/frame-model.ts';
    const api={read:()=>frame.width,object:()=>({frame})};export default api;`;
  const module = { exports: {} };
  let calls = 0, dependency = { width: 24 };
  vm.runInNewContext(await classicRenderer(root, 'rendering/runtime-model.ts', source), {
    module, require(name) { assert.equal(name, './frame-model.js'); calls++; return dependency; }
  });
  assert.equal(calls, 0);
  assert.equal(module.exports.read(), 24);
  dependency = { width: 48 };
  assert.equal(module.exports.read(), 48);
  assert.equal(module.exports.object().frame, dependency);
});

test('named core exports retain both the Node and classic browser contract', async () => {
  const { classicRenderer } = await compiler();
  const code = await classicRenderer(root, 'session-model.ts', 'export function encoder(){return 7;}');
  const module = { exports: {} }, window = {};
  vm.runInNewContext(code, { module });
  vm.runInNewContext(code, { window });
  assert.equal(module.exports.encoder(), 7);
  assert.equal(window.CardSession.encoder(), 7);
});
