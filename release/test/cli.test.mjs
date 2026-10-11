import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  cpSync,
  rmSync,
  existsSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

const artifact = resolve(".local/release/package");
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "x-release-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = join(dir, "home");
  const run = (command, extra = [], env = {}) => {
    let source = artifact;
    if (env.FAIL_STAGING) {
      source = join(dir, "broken-package");
      cpSync(artifact, source, { recursive: true });
      rmSync(join(source, "skill"), { recursive: true });
    }
    return spawnSync(
      process.execPath,
      [join(source, "cli/main.js"), command, "--home", home, ...extra],
      { encoding: "utf8" },
    );
  };
  return { dir, home, run };
}
test("isolated setup/update installs matching Skill/runtime, retains user data and backs up prior versions", (t) => {
  const f = fixture(t),
    workspace = join(f.dir, "workspace");
  let result = f.run("setup");
  assert.equal(result.status, 0, result.stderr);
  const setup = JSON.parse(result.stdout);
  assert.match(
    readFileSync(join(setup.skillPaths[0], "SKILL.md"), "utf8"),
    /file:\/\//,
  );
  assert.equal(existsSync(setup.cliPath), true);
  result = f.run("init", ["--directory", workspace, "--account", "OwnAccount"]);
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout),
    original = readFileSync(config.ledgerPath, "utf8");
  result = f.run("update", ["--target", "claude"]);
  assert.equal(result.status, 0, result.stderr);
  const updated = JSON.parse(result.stdout);
  assert.equal(updated.targets.length, 2);
  assert.equal(existsSync(updated.backup), true);
  assert.equal(readFileSync(config.ledgerPath, "utf8"), original);
  assert.equal(
    f.run("init", ["--directory", workspace, "--account", "Other"]).status,
    1,
  );
  assert.equal(
    f.run("init", ["--directory", workspace, "--account", "OwnAccount"]).status,
    0,
  );
});
test("package staging failure retains prior runtime and Skill; unmanaged directory is never overwritten", (t) => {
  const f = fixture(t);
  assert.equal(f.run("setup").status, 0);
  const skill = join(f.home, "skills/codex/x-harness/SKILL.md"),
    before = readFileSync(skill, "utf8");
  assert.equal(f.run("update", [], { FAIL_STAGING: "1" }).status, 1);
  assert.equal(readFileSync(skill, "utf8"), before);
  assert.ok(!readdirSync(f.home).some((name) => name.startsWith(".setup-")));
  rmSync(join(f.home, "skills/codex/x-harness/.x-harness-managed.json"));
  const result = f.run("update");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unmanaged/);
  assert.equal(readFileSync(skill, "utf8"), before);
});
test("runtime closure loads and archive contains no source, context or private account paths", async () => {
  const root = await import(join(artifact, "dist/index.js"));
  assert.deepEqual(Object.keys(root), ["createXGrowthHarness"]);
  for (const file of readdirSync(join(artifact, "dist"))) {
    assert.ok(!file.endsWith(".ts") || file.endsWith(".d.ts"));
    assert.ok(!file.startsWith("context"));
    assert.ok(
      !readFileSync(join(artifact, "dist", file), "utf8").includes("/Users/"),
    );
  }
});

test("updating versions refreshes cached root and child modules in the same process", async (t) => {
  const f = fixture(t),
    oldPackage = join(f.dir, "old-package");
  cpSync(artifact, oldPackage, { recursive: true });
  const manifestPath = join(oldPackage, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.version = "0.0.0-fixture";
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const installed = spawnSync(
    process.execPath,
    [join(oldPackage, "cli/main.js"), "setup", "--home", f.home],
    { encoding: "utf8" },
  );
  assert.equal(installed.status, 0, installed.stderr);
  const before = JSON.parse(installed.stdout);
  const oldRoot = await import(before.moduleURL);
  const oldChild = await import(new URL("growth.js", before.moduleURL).href);
  const updated = f.run("update");
  assert.equal(updated.status, 0, updated.stderr);
  const after = JSON.parse(updated.stdout);
  assert.notEqual(before.moduleURL, after.moduleURL);
  const newRoot = await import(after.moduleURL);
  const newChild = await import(new URL("growth.js", after.moduleURL).href);
  assert.notEqual(newRoot.createXGrowthHarness, oldRoot.createXGrowthHarness);
  assert.notEqual(newChild, oldChild);
  assert.equal(before.cliPath, after.cliPath);
  const location = spawnSync(process.execPath, [after.cliPath, "location"], {
    encoding: "utf8",
  });
  assert.equal(location.status, 0, location.stderr);
  assert.equal(
    realpathSync(fileURLToPath(JSON.parse(location.stdout).moduleURL)),
    realpathSync(fileURLToPath(after.moduleURL)),
  );
  assert.ok(pathToFileURL(after.cliPath).href.startsWith("file:"));
});
