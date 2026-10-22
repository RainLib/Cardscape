const ts = require('typescript');

/** Inspect syntax nodes instead of depending on source whitespace or line breaks. */
function extractNode(source, predicate) {
  const file = ts.createSourceFile('renderer.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let found;
  function visit(node) {
    if (!found && predicate(node, file)) found = node;
    if (!found) ts.forEachChild(node, visit);
  }
  visit(file);
  if (!found) throw Error('Renderer source node was not found');
  return found.getText(file);
}
const extractFunction = (source, name) => extractNode(source, node => ts.isFunctionDeclaration(node) && node.name?.text === name);
const extractAssignment = (source, target) => extractNode(source, (node, file) => ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression) && node.expression.left.getText(file) === target);
module.exports = { extractFunction, extractAssignment };
