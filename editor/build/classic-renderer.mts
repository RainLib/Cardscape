import ts from 'typescript';
import { readFile } from 'node:fs/promises';
import { resolve, relative, dirname, basename } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

interface ModuleContract {
  global: string;
  default?: boolean;
  exports?: string[];
  exportsAlias?: Record<string, string>;
}
type ModuleManifest = Record<string, ModuleContract>;
const manifests = new Map<string, Promise<ModuleManifest>>();

/** The only place where portable players/Node/old workers receive global/CJS APIs. */
export async function classicRenderer(
  root: string,
  name: string,
  source: string,
): Promise<string | undefined> {
  if (!manifests.has(root))
    manifests.set(
      root,
      readFile(resolve(root, 'build/renderer-modules.json'), 'utf8').then(
        (value) => JSON.parse(value) as ModuleManifest,
      ),
    );
  const manifest = await manifests.get(root)!;
  const file = 'renderer/' + name.replaceAll('\\', '/');
  const contract = manifest[file];
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const program = ts.createProgram(
    [file],
    { noLib: true, noResolve: true },
    {
      getSourceFile: (requested) => (requested === file ? ast : undefined),
      getDefaultLibFileName: () => '',
      writeFile() {},
      getCurrentDirectory: () => root,
      getDirectories: () => [],
      fileExists: (requested) => requested === file,
      readFile: (requested) => (requested === file ? source : undefined),
      getCanonicalFileName: (name) => name,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
    },
  );
  const checker = program.getTypeChecker();
  const edits: Array<[number, number, string]> = [];
  const bindings = new Map<ts.Symbol, string>();
  const loaders: string[] = [];
  let defaultExport: string | undefined;
  let hasValues = false;
  for (const statement of ast.statements) {
    if (ts.isImportDeclaration(statement)) {
      edits.push([statement.getStart(ast), statement.end, '']);
      const clause = statement.importClause;
      if (!clause || clause.isTypeOnly) continue;
      hasValues = true;
      const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
      const dependency = relative(
        root,
        resolve(root, dirname(file), specifier),
      ).replaceAll('\\', '/');
      const imported = manifest[dependency];
      if (!imported)
        throw Error(`Missing classic module contract: ${file} -> ${specifier}`);
      const target = dependency.startsWith('renderer/core/')
        ? './core/' + basename(dependency, '.ts') + '.js'
        : './' + basename(dependency, '.ts') + '.js';
      const current = file.startsWith('renderer/core/')
        ? '../' + target.slice(2)
        : target;
      function bind(local: ts.Identifier, property?: string) {
        const symbol = checker.getSymbolAtLocation(local);
        if (!symbol) throw Error('Unbound module import: ' + local.text);
        if (!contract) {
          bindings.set(
            symbol,
            `window.${imported.global}${property ? '.' + (Object.entries(imported.exportsAlias || {}).find(([, value]) => value === property)?.[0] || property) : ''}`,
          );
          return;
        }
        const loader = '__classicDependency' + loaders.length;
        const member = property ? `[${JSON.stringify(property)}]` : '';
        loaders.push(
          `const ${loader}=()=>((typeof module==='object'&&module.exports)?require(${JSON.stringify(current)}):root[${JSON.stringify(imported.global)}])${member};`,
        );
        bindings.set(symbol, `(${loader}())`);
      }
      if (clause.name) bind(clause.name);
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings))
        for (const binding of clause.namedBindings.elements) {
          if (!binding.isTypeOnly)
            bind(binding.name, binding.propertyName?.text || binding.name.text);
        }
    } else if (ts.isExportAssignment(statement)) {
      defaultExport = statement.expression.getText(ast);
      edits.push([statement.getStart(ast), statement.end, '']);
    } else if (ts.isExportDeclaration(statement)) {
      edits.push([statement.getStart(ast), statement.end, '']);
    } else if (ts.canHaveModifiers(statement)) {
      for (const modifier of ts.getModifiers(statement) || [])
        if (modifier.kind === ts.SyntaxKind.ExportKeyword)
          edits.push([modifier.getStart(ast), modifier.end, '']);
    }
  }
  if (!contract && !hasValues && !/^export\s/m.test(source)) return undefined;
  function references(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node) ||
      ts.isExportAssignment(node) ||
      ts.isExportDeclaration(node) ||
      ts.isTypeNode(node)
    )
      return;
    const symbol = ts.isIdentifier(node)
      ? ts.isShorthandPropertyAssignment(node.parent)
        ? checker.getShorthandAssignmentValueSymbol(node.parent)
        : checker.getSymbolAtLocation(node)
      : undefined;
    if (ts.isIdentifier(node) && symbol && bindings.has(symbol)) {
      if (
        ts.isPropertyAccessExpression(node.parent) &&
        node.parent.name === node
      )
        return;
      if (
        (ts.isPropertyAssignment(node.parent) ||
          ts.isMethodDeclaration(node.parent) ||
          ts.isPropertyDeclaration(node.parent)) &&
        node.parent.name === node
      )
        return;
      const value = bindings.get(symbol)!;
      edits.push([
        node.getStart(ast),
        node.end,
        ts.isShorthandPropertyAssignment(node.parent)
          ? node.text + ':' + value
          : value,
      ]);
      return;
    }
    ts.forEachChild(node, references);
  }
  references(ast);
  // Preserve a player's async script completion so embedders can await startup.
  const last = ast.statements.at(-1);
  if (!contract && last && ts.isExpressionStatement(last)) {
    edits.push([last.getStart(ast), last.getStart(ast), 'return ']);
  }
  let body = source;
  for (const [start, end, value] of edits.sort((a, b) => b[0] - a[0]))
    body = body.slice(0, start) + value + body.slice(end);
  let publish = '';
  if (contract) {
    const value = contract.default
      ? defaultExport
      : '{' +
        contract.exports!.join(',') +
        (contract.exportsAlias
          ? ',' +
            Object.entries(contract.exportsAlias)
              .map(([key, value]) => key + ':' + value)
              .join(',')
          : '') +
        '}';
    if (!value) throw Error('Missing export: ' + file);
    publish = `\nconst __classicAPI=${value};if(typeof module==='object'&&module.exports)module.exports=__classicAPI;else root[${JSON.stringify(contract.global)}]=__classicAPI;`;
  }
  return stripTypeScriptTypes(
    '(function(root){\n' +
    loaders.join('\n') +
    '\n' +
    body +
    publish +
    "\n})(typeof window==='object'?window:globalThis);\n",
    { mode: 'strip' },
  );
}
