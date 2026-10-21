import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const limits = Object.freeze({ fileLines: 1000, functionLines: 150 });
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = packageRoot;
const extensions = /\.(?:ts|js|mjs|cjs|html|css)$/;
const ignored =
  /(?:^|\/)(?:node_modules|dist|\.release-cli|\.release-source)(?:\/|$)/;
export function codeFiles(path) {
  if (ignored.test(path)) return [];
  if (!statSync(path).isDirectory()) return extensions.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => codeFiles(resolve(path, name)));
}
export function checkSource(source, file, { checkFunctions = true } = {}) {
  const lines = source.split("\n").length - Number(source.endsWith("\n"));
  const findings = [];
  if (lines > limits.fileLines)
    findings.push({
      file,
      rule: "file-lines",
      actual: lines,
      limit: limits.fileLines,
    });
  if (!checkFunctions) return findings;
  const syntax = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const line = (position) =>
    syntax.getLineAndCharacterOfPosition(position).line;
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text.startsWith("create") &&
      node.name.text !== "createAXTree" &&
      node.body &&
      node.body.statements.some(
        (st) =>
          ts.isFunctionDeclaration(st) ||
          (ts.isVariableStatement(st) &&
            !(st.declarationList.flags & ts.NodeFlags.Const)),
      )
    )
      findings.push({
        file,
        rule: "stateful-owner-class",
        name: node.name.text,
      });
    if (ts.isFunctionLike(node) && node.body) {
      const excluded = new Set();
      function nested(child) {
        if (ts.isFunctionLike(child) && child.body) {
          for (
            let i = line(child.body.getStart()) + 1;
            i < line(child.body.end);
            i++
          )
            excluded.add(i);
          return;
        }
        ts.forEachChild(child, nested);
      }
      ts.forEachChild(node.body, nested);
      const own =
        line(node.body.end) - line(node.body.getStart()) + 1 - excluded.size;
      if (own > limits.functionLines)
        findings.push({
          file,
          rule: "function-lines",
          name: node.name?.getText(syntax) ?? "<closure>",
          line: line(node.getStart()) + 1,
          actual: own,
          limit: limits.functionLines,
        });
    }
    ts.forEachChild(node, visit);
  }
  visit(syntax);
  return findings;
}
export function runtimeImports(source, file) {
  const syntax = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  return syntax.statements.flatMap((node) => {
    if (
      !(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ||
      !node.moduleSpecifier ||
      node.isTypeOnly ||
      node.importClause?.isTypeOnly
    )
      return [];
    if (
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings) &&
      node.importClause.namedBindings.elements.every((e) => e.isTypeOnly)
    )
      return [];
    const target = node.moduleSpecifier.text;
    return target.startsWith(".")
      ? [resolve(dirname(file), target.replace(/\.js$/, ".ts"))]
      : [];
  });
}
export function checkCycles(graph) {
  const done = new Set(),
    active = [];
  const findings = [];
  function visit(file) {
    if (active.includes(file)) {
      findings.push({
        rule: "dependency-cycle",
        path: [...active.slice(active.indexOf(file)), file],
      });
      return;
    }
    if (done.has(file)) return;
    active.push(file);
    for (const next of graph.get(file) ?? []) if (graph.has(next)) visit(next);
    active.pop();
    done.add(file);
  }
  for (const file of graph.keys()) visit(file);
  return findings;
}
export function checkPackage() {
  const files = [
    "src",
    "test",
    "scripts",
    "release",
    "generated",
    "observation-extension",
  ].flatMap((name) => codeFiles(resolve(packageRoot, name)));
  files.push(
    ...codeFiles(resolve(packageRoot, "site/src")),
    ...["build.mjs", "deploy.mjs"].map((name) =>
      resolve(packageRoot, "site", name),
    ),
  );
  const graph = new Map(),
    findings = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const isSource = file.startsWith(resolve(packageRoot, "src") + "/");
    findings.push(
      ...checkSource(source, relative(repository, file), {
        checkFunctions: isSource,
      }),
    );
    if (isSource) graph.set(file, runtimeImports(source, file));
  }
  findings.push(
    ...checkCycles(graph).map((f) => ({
      ...f,
      path: f.path.map((p) => relative(packageRoot, p)),
    })),
  );
  return { checkedFiles: files.length, limits, findings };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = checkPackage();
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (result.findings.length) process.exitCode = 1;
}
