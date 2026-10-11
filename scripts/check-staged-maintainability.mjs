import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkSource,
  checkCycles,
  runtimeImports,
} from "./check-maintainability.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const managed = /^(?:src\/|test\/|scripts\/|release\/|generated\/|site\/)/;
const code = /\.(?:ts|js|mjs|cjs|html|css)$/;

export function checkStaged(repo = repository) {
  const git = (...args) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" });
  const changed = git(
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACMR",
    "-z",
  )
    .split("\0")
    .filter((file) => managed.test(file) && code.test(file));
  if (!changed.length) return { checkedFiles: 0, findings: [] };
  const findings = changed.flatMap((file) =>
    checkSource(git("show", ":" + file), file, {
      checkFunctions: file.startsWith("src/"),
    }),
  );
  const graph = new Map();
  for (const file of git("ls-files", "-z", "--", "src")
    .split("\0")
    .filter((file) => file.endsWith(".ts"))) {
    const absolute = resolve(repo, file);
    graph.set(absolute, runtimeImports(git("show", ":" + file), absolute));
  }
  findings.push(...checkCycles(graph));
  return { checkedFiles: changed.length, findings };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = checkStaged();
  if (result.findings.length) {
    process.stderr.write(JSON.stringify(result, null, 2) + "\n");
    process.exitCode = 1;
  }
}
