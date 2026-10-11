import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(root, "node_modules/@nextclaw/qingtian/bin/qingtian.mjs");
const command = existsSync(
  resolve(root, ".agents/ai-development-system.lock.json"),
)
  ? "upgrade"
  : "install";
execFileSync(process.execPath, [cli, command, "--target", root, "--dry-run"], {
  stdio: "inherit",
});
execFileSync(process.execPath, [cli, command, "--target", root], {
  stdio: "inherit",
});
execFileSync(process.execPath, [cli, "check", "--target", root], {
  stdio: "inherit",
});
execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"], {
  cwd: root,
});
console.log(
  "AI development system checked; staged maintainability hook enabled.",
);
