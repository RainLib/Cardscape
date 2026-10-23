import type { FunctionNode } from '@shaderfrog/glsl-parser/ast/ast-types.js';
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
import { parse, generate } from '@shaderfrog/glsl-parser/index.js';
import {
  renameFunctions,
  renameBindings,
} from '@shaderfrog/glsl-parser/parser/utils.js';
function walk(value: unknown, fn: (node: Record<string, unknown>) => void) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, fn);
    return;
  }
  fn(value as Record<string, unknown>);
  for (const [key, item] of Object.entries(value))
    if (!['scopes', 'location'].includes(key))
      if (Array.isArray(item)) item.forEach((v) => walk(v, fn));
      else if (item && typeof item === 'object') walk(item, fn);
}
export function compileMaterialMaker(source: unknown) {
  if (typeof source !== 'string' || source.length > 262144)
    throw Error('Material Maker Shader 超过 256 KB');
  const ast = parse(source, {
      quiet: true,
      includeLocation: true,
      grammarSource: 'Material Maker',
    }),
    functions = new Map<string, FunctionNode[]>();
  for (const n of ast.program)
    if (n.type === 'function') {
      const name = n.prototype.header.name.identifier;
      const nodes = functions.get(name) || [];
      nodes.push(n);
      functions.set(name, nodes);
    }
  if (!functions.has('csMMEffect'))
    throw Error('缺少 Cardscape 动态效果输出，请保留 Cardscape Output 节点');
  const reachable = new Set<string>();
  function add(name: unknown) {
    if (typeof name !== 'string' || reachable.has(name) || !functions.has(name))
      return;
    reachable.add(name);
    for (const n of functions.get(name) || [])
      walk(n, (v) => {
        if (v.type === 'function_call') {
          const identifier = v.identifier;
          if (isRecord(identifier))
            add(
              identifier.identifier ||
                (isRecord(identifier.specifier)
                  ? identifier.specifier.identifier
                  : undefined),
            );
        }
      });
  }
  add('csMMEffect');
  ast.program = ast.program.filter((n) =>
    n.type === 'function'
      ? reachable.has(n.prototype.header.name.identifier)
      : true,
  );
  const scope = ast.scopes[0];
  renameFunctions(
    Object.fromEntries(
      Object.entries(scope.functions).filter(([name]) => functions.has(name)),
    ),
    (name) => 'csMM_' + name,
  );
  renameBindings(scope.bindings, (name) =>
    name === 'elapsed_time' ? name : 'csMM_' + name,
  );
  for (const local of ast.scopes.slice(1))
    renameBindings(local.bindings, (name) =>
      name === 'elapsed_time' ? name : 'csMML_' + name,
    );
  walk(ast.program, (v) => {
    if (v.type === 'identifier' && v.identifier === 'elapsed_time')
      v.identifier = 't';
  });
  const prelude = generate(ast).trim();
  if (prelude.length > 65536)
    throw Error('动态效果超过 64 KB，请简化节点或烘焙纹理');
  const clean = prelude
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  if (
    /\b(uniform|attribute|varying|sampler\w*|gl_\w*|discard|shader_type)\b|#|\btexture\w*\s*\(/.test(
      clean,
    )
  )
    throw Error(
      '此动态分支依赖外部纹理或引擎专用代码；请将其回传为图片 / Mask，或用程序节点制作动态效果',
    );
  return {
    fragmentPrelude: prelude,
    fragmentBody:
      'vec4 effect = csMM_csMMEffect(uv);\nreturn vec4(color.rgb + effect.rgb, color.a);',
    functions: [...reachable],
    bytes: prelude.length,
  };
}
