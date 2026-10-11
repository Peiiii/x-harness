import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(root, "node_modules/@nextclaw/qingtian/bin/qingtian.mjs");
const command = existsSync(
  resolve(root, ".agents/ai-development-system.lock.json"),
)
  ? "upgrade"
  : "install";
const agents = resolve(root, "AGENTS.md");
const original = readFileSync(agents, "utf8");
const start = "<!-- ai-development-system:start -->";
const end = "<!-- ai-development-system:end -->";
let adopting = false;
if (command === "install" && original.includes(start)) {
  const expected = `${start}\n${readFileSync(resolve(root, "node_modules/@nextclaw/qingtian/payload/AGENTS.shared.md"), "utf8").trimEnd()}\n${end}`;
  if (
    !original.includes(expected) ||
    original.split(start).length !== 2 ||
    original.split(end).length !== 2
  ) {
    throw Error(
      "Orphan managed block differs from Qingtian; preserve it and resolve before bootstrap",
    );
  }
  // Rehydrate the omitted local lock through the official installer. Only its
  // exact bundled block is temporarily removed; edited project rules are kept.
  writeFileSync(agents, original.replace(expected, "").trimEnd() + "\n");
  adopting = true;
}
try {
  execFileSync(
    process.execPath,
    [cli, command, "--target", root, "--dry-run"],
    {
      stdio: "inherit",
    },
  );
  execFileSync(process.execPath, [cli, command, "--target", root], {
    stdio: "inherit",
  });
  execFileSync(process.execPath, [cli, "check", "--target", root], {
    stdio: "inherit",
  });
} catch (error) {
  if (adopting) writeFileSync(agents, original);
  throw error;
}
execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"], {
  cwd: root,
});
console.log(
  "AI development system checked; staged maintainability hook enabled.",
);
