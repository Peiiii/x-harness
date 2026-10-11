#!/usr/bin/env node
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  cpSync,
  mkdtempSync,
  openSync,
  closeSync,
  unlinkSync,
  readdirSync,
} from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
const readJSON = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const output = (value: unknown) =>
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
class XHarnessCLI {
  #packageRoot!: string;
  #release!: { name: string; version: string };
  #args!: string[];
  #command!: string;
  #flags!: Map<string, string>;
  #customHome!: string | undefined;
  #home!: string;
  constructor(argv: string[] = process.argv.slice(2)) {
    this.#packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    this.#release = JSON.parse(
      readFileSync(join(this.#packageRoot, "package.json"), "utf8"),
    ) as {
      name: string;
      version: string;
    };
    this.#args = argv.slice();
    this.#command = this.#args.shift() ?? "help";
    this.#flags = new Map<string, string>();
    for (let i = 0; i < this.#args.length; i += 2) {
      const key = this.#args[i],
        value = this.#args[i + 1];
      if (
        !["--target", "--home", "--directory", "--account"].includes(key) ||
        !value ||
        value.startsWith("--") ||
        this.#flags.has(key)
      )
        throw Error(`Invalid argument: ${key}`);
      this.#flags.set(key, value);
    }
    this.#customHome = this.#flags.get("--home");
    this.#home = resolve(this.#customHome ?? join(homedir(), ".x-harness"));
  }
  private marker(path: string, file: string) {
    return (
      existsSync(join(path, file)) &&
      [this.#release.name, "@peiiii/x-harness"].includes(
        readJSON(join(path, file)).managedBy,
      )
    );
  }
  private guard(path: string, file: string) {
    if (
      existsSync(path) &&
      (lstatSync(path).isSymbolicLink() || !this.marker(path, file))
    )
      throw Error(`Refusing to overwrite unmanaged directory: ${path}`);
  }
  private skillPath(target: string): string {
    if (!["codex", "claude"].includes(target))
      throw Error("Target must be codex or claude");
    return this.#customHome
      ? join(this.#home, "skills", target, "x-harness")
      : join(homedir(), `.${target}`, "skills", "x-harness");
  }
  private location() {
    return {
      version: this.#release.version,
      moduleURL: pathToFileURL(join(this.#packageRoot, "dist", "index.js"))
        .href,
      cliPath: fileURLToPath(import.meta.url),
      home: this.#home,
    };
  }
  private stageRuntime(stage: string, runtime: string) {
    const stagedRuntime = join(stage, "runtime");
    const suffix = join(
      "versions",
      this.#release.version,
      "node_modules",
      ...this.#release.name.split("/"),
    );
    const installedRoot = join(stagedRuntime, suffix);
    cpSync(this.#packageRoot, installedRoot, { recursive: true });
    if (
      readJSON(join(installedRoot, "package.json")).version !==
      this.#release.version
    )
      throw Error("Installed version mismatch");
    const finalRoot = join(runtime, suffix);
    const stableRoot = join(
      stagedRuntime,
      "node_modules",
      ...this.#release.name.split("/"),
    );
    const stableCLI = join(
      runtime,
      "node_modules",
      ...this.#release.name.split("/"),
      "cli",
      "main.js",
    );
    mkdirSync(join(stableRoot, "cli"), { recursive: true });
    writeFileSync(
      join(stableRoot, "package.json"),
      JSON.stringify({ type: "module" }),
    );
    const entry = relative(
      dirname(stableCLI),
      join(finalRoot, "cli", "main.js"),
    )
      .split("\\")
      .join("/");
    writeFileSync(
      join(stableRoot, "cli", "main.js"),
      `#!/usr/bin/env node\nawait import(new URL(${JSON.stringify(entry)}, import.meta.url));\n`,
    );
    return { stagedRuntime, installedRoot, finalRoot, stableCLI };
  }
  private setup() {
    const target = this.#flags.get("--target") ?? "codex";
    const stateFile = join(this.#home, "installation.json");
    if (
      !existsSync(stateFile) &&
      readdirSync(this.#home).some((name) => name !== ".installation.lock")
    )
      throw Error(`Unmanaged installation home: ${this.#home}`);
    const previous = existsSync(stateFile)
      ? readJSON(stateFile)
      : { managedBy: this.#release.name, targets: [] };
    if (![this.#release.name, "@peiiii/x-harness"].includes(previous.managedBy))
      throw Error("Unmanaged installation state");
    const targets: string[] = [
      ...new Set<string>([...previous.targets, target]),
    ];
    const runtime = join(this.#home, "runtime");
    this.guard(runtime, ".x-harness-managed.json");
    for (const t of targets)
      this.guard(this.skillPath(t), ".x-harness-managed.json");
    mkdirSync(this.#home, { recursive: true, mode: 0o700 });
    const stage = mkdtempSync(join(this.#home, ".setup-"));
    const backup = join(this.#home, "backups", `${Date.now()}-${randomUUID()}`);
    const changes: {
      dest: string;
      backup: string;
      hadOld: boolean;
    }[] = [];
    let completed = false;
    try {
      // Persist npx's already fetched runtime once; versioned URLs invalidate the whole module graph.
      const { stagedRuntime, installedRoot, finalRoot, stableCLI } =
        this.stageRuntime(stage, runtime);
      const metadata = {
        managedBy: this.#release.name,
        version: this.#release.version,
      };
      writeFileSync(
        join(stagedRuntime, ".x-harness-managed.json"),
        JSON.stringify(metadata),
      );
      const installs = [{ src: stagedRuntime, dest: runtime, key: "runtime" }];
      for (const t of targets) {
        const stagedSkill = join(stage, `skill-${t}`);
        cpSync(join(installedRoot, "skill"), stagedSkill, { recursive: true });
        const content = readFileSync(join(stagedSkill, "SKILL.md"), "utf8")
          .replaceAll(
            "{{MODULE_URL}}",
            pathToFileURL(join(finalRoot, "dist", "index.js")).href,
          )
          .replaceAll("{{CLI_PATH}}", stableCLI);
        writeFileSync(join(stagedSkill, "SKILL.md"), content);
        writeFileSync(
          join(stagedSkill, ".x-harness-managed.json"),
          JSON.stringify(metadata),
        );
        installs.push({
          src: stagedSkill,
          dest: this.skillPath(t),
          key: `skill-${t}`,
        });
      }
      // Install/download succeeds before replacing either managed artifact.
      for (const item of installs) {
        const saved = join(backup, item.key),
          hadOld = existsSync(item.dest);
        mkdirSync(dirname(item.dest), { recursive: true });
        if (hadOld) {
          mkdirSync(backup, { recursive: true });
          renameSync(item.dest, saved);
        }
        changes.push({ dest: item.dest, backup: saved, hadOld });
        renameSync(item.src, item.dest);
      }
      const state = {
        ...metadata,
        targets,
        updatedAt: new Date().toISOString(),
      };
      const nextState = join(stage, "installation.json");
      writeFileSync(nextState, JSON.stringify(state, null, 2));
      renameSync(nextState, stateFile);
      completed = true;
      output({
        status: "installed",
        ...state,
        moduleURL: pathToFileURL(join(finalRoot, "dist", "index.js")).href,
        cliPath: stableCLI,
        skillPaths: targets.map(this.skillPath.bind(this)),
        backup: changes.some((c) => c.hadOld) ? backup : null,
        next: "Start a fresh module binding using the installed x-harness Skill.",
      });
    } finally {
      if (!completed)
        for (const change of changes.reverse()) {
          rmSync(change.dest, { recursive: true, force: true });
          if (change.hadOld) renameSync(change.backup, change.dest);
        }
      rmSync(stage, { recursive: true, force: true });
    }
  }
  private init() {
    const directory = resolve(
      this.#flags.get("--directory") ?? "./x-workspace",
    );
    const account = (this.#flags.get("--account") ?? "").replace(/^@/, "");
    if (!/^[a-zA-Z0-9_]{1,15}$/.test(account))
      throw Error("Provide your own X handle with --account");
    const configPath = join(directory, "x-harness.json");
    if (existsSync(configPath)) {
      const config = readJSON(configPath);
      if (config.accountHandle !== account)
        throw Error("Existing workspace belongs to a different account");
      output({ status: "existing", configPath, ...config });
      return;
    }
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const ledgerPath = join(directory, "round.md"),
      proofDirectory = join(directory, "proofs");
    if (existsSync(ledgerPath))
      throw Error(
        "Existing ledger is unmanaged; use its configuration instead of overwriting",
      );
    const taskId = `x-${randomUUID()}`;
    const state = {
      batchId: taskId,
      status: "RUNNING",
      updatedAt: new Date().toISOString(),
      accountHandle: account,
      items: ["follow", "original", "reply"].map((kind) => ({
        kind,
        planned: 0,
        verified: 0,
        unknown: 0,
        actionable: true,
      })),
      execution: { owner: "harness", exclusive: true },
      attempts: [],
      actions: [],
    };
    mkdirSync(proofDirectory);
    writeFileSync(
      ledgerPath,
      `# @${account} · Your X workspace\n\n\`\`\`x-round-state\n${JSON.stringify(state, null, 2)}\n\`\`\`\n`,
      { flag: "wx", mode: 0o600 },
    );
    const config = {
      accountHandle: account,
      taskId,
      ledgerPath,
      proofDirectory,
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
    output({ status: "initialized", configPath, ...config });
  }
  public run() {
    try {
      if (["setup", "update"].includes(this.#command)) {
        mkdirSync(this.#home, { recursive: true, mode: 0o700 });
        const lockPath = join(this.#home, ".installation.lock");
        const lock = openSync(lockPath, "wx", 0o600);
        try {
          this.setup();
        } finally {
          closeSync(lock);
          unlinkSync(lockPath);
        }
      } else if (this.#command === "init") this.init();
      else if (this.#command === "location") output(this.location());
      else if (this.#command === "help")
        output({
          setup: "npx @nextclaw/x-harness@latest setup --target codex",
          update: "npx @nextclaw/x-harness@latest update --target codex",
          init: "node <cliPath> init --directory ./x-workspace --account YOUR_HANDLE",
          targets: ["codex", "claude"],
          requires:
            "Node 22+; compatible CUA browser host and your own X login",
        });
      else throw Error(`Unknown command: ${this.#command}`);
    } catch (error) {
      process.stderr.write(
        JSON.stringify({
          status: "failed",
          reason: error instanceof Error ? error.message : String(error),
        }) + "\n",
      );
      process.exitCode = 1;
    }
  }
}
new XHarnessCLI().run();
