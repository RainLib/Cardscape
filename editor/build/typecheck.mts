import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { generateEditorElements } from './editor-elements.mts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await generateEditorElements(root);
const require = createRequire(import.meta.url),
  compiler = require.resolve('typescript/bin/tsc');
for (const args of [['--noEmit'], ['-p', 'tsconfig.strict.json', '--noEmit']]) {
  const result = spawnSync(process.execPath, [compiler, ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

// Strict modules also forbid explicit `any`; TypeScript's strict flag alone
// would allow a migrated interface to silently fall back to dynamic typing.
const strictConfig = ts.readConfigFile(
  resolve(root, 'tsconfig.strict.json'),
  ts.sys.readFile,
);
if (strictConfig.error)
  throw Error('Cannot read strict TypeScript configuration');
const strictFiles = ts.parseJsonConfigFileContent(
  strictConfig.config,
  ts.sys,
  root,
);
if (strictFiles.errors.length)
  throw Error('Cannot resolve strict TypeScript files');
const explicitAny: string[] = [];
for (const file of strictFiles.fileNames) {
  const source = ts.sys.readFile(file);
  if (source === undefined) throw Error('Cannot read strict module: ' + file);
  const syntax = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  function visit(node: ts.Node): void {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const at = syntax.getLineAndCharacterOfPosition(node.getStart(syntax));
      explicitAny.push(`${file}:${at.line + 1}:${at.character + 1}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(syntax);
}
if (explicitAny.length) {
  process.stderr.write(
    'Explicit any is not allowed in strict modules:\n' +
      explicitAny.join('\n') +
      '\n',
  );
  process.exit(1);
}
