import ts from './compiler-api.mjs';

export function importSpecifiers(source, fileName) {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  if (sourceFile.parseDiagnostics.length) {
    throw new Error(fileName + ': ' + sourceFile.parseDiagnostics.map(
      d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join(' | '));
  }
  const specs = [];
  let hasDynamicNonliteral = false;

  const addLiteral = (node) => {
    if (node && ts.isStringLiteralLike(node)) specs.push(node.text);
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addLiteral(node.moduleSpecifier);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteralLike(arg)) specs.push(arg.text);
        else hasDynamicNonliteral = true;
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteralLike(arg)) specs.push(arg.text);
        else hasDynamicNonliteral = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { specs, hasDynamicNonliteral };
}

