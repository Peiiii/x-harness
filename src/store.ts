import type { BoundaryRecord } from "./boundary.js";
import {
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  unlinkSync,
  renameSync,
  mkdirSync,
  statSync,
  existsSync,
} from "node:fs";
import { dirname, resolve, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { readRound } from "./round-state.js";
const hash = (text: string | Uint8Array) =>
  createHash("sha256").update(text).digest("hex");
const block = /```x-round-state\s*\n([\s\S]*?)\n```/;
export class HarnessConflict extends Error {
  code: string;
  constructor(message: string) {
    super(message);
    this.code = "CONFLICT";
  }
}
// The only business state is the original ledger. Locks and proofs are not state replicas.
export interface RoundSnapshot {
  state: BoundaryRecord;
  revision: string;
  path: string;
}
export interface RoundStore {
  path: string;
  evidenceExists(path: string): boolean;
  fingerprint(path: string): string;
  processId: number | null;
  ownerAlive(pid: unknown): boolean;
  transaction(
    fn: (
      snapshot: RoundSnapshot,
    ) => BoundaryRecord | undefined | Promise<BoundaryRecord | undefined>,
  ): Promise<RoundSnapshot>;
  load(): Promise<RoundSnapshot>;
  save(snapshot: RoundSnapshot, state: BoundaryRecord): Promise<RoundSnapshot>;
  withLock<T>(fn: () => T | Promise<T>): Promise<T>;
  recoverAbandonedLock(): Promise<{ recovered: boolean; evidenceRef: string }>;
  recordProof(proof: unknown): Promise<string>;
}
export class FileRoundStore implements RoundStore {
  readonly #ledgerPath!: {
    ledgerPath: string;
    proofDirectory: string;
  }["ledgerPath"];
  readonly #proofDirectory!: {
    ledgerPath: string;
    proofDirectory: string;
  }["proofDirectory"];
  #path!: ReturnType<typeof resolve>;
  #lockPath!: ReturnType<typeof join>;
  #proofDir!: ReturnType<typeof resolve>;
  #held!: boolean;
  path!: any;
  evidenceExists!: any;
  processId!: any;
  constructor({
    ledgerPath,
    proofDirectory,
  }: {
    ledgerPath: string;
    proofDirectory: string;
  }) {
    this.recordProof = this.recordProof.bind(this);
    this.recoverAbandonedLock = this.recoverAbandonedLock.bind(this);
    this.withLock = this.withLock.bind(this);
    this.save = this.save.bind(this);
    this.load = this.load.bind(this);
    this.transaction = this.transaction.bind(this);
    this.ownerAlive = this.ownerAlive.bind(this);
    this.fingerprint = this.fingerprint.bind(this);
    this.#ledgerPath = ledgerPath;
    this.#proofDirectory = proofDirectory;
    this.#path = resolve(this.#ledgerPath);
    this.#lockPath = join(dirname(this.#path), ".x-harness.lock");
    this.#proofDir = resolve(this.#proofDirectory);
    this.#held = false;
    this.path = this.#path;
    this.evidenceExists = existsSync;
    this.processId = typeof process !== "undefined" ? process.pid : null;
  }
  public fingerprint(file: string) {
    return hash(readFileSync(resolve(file)));
  }
  public ownerAlive(ownerPid: unknown): boolean {
    if (
      typeof ownerPid !== "number" ||
      !Number.isInteger(ownerPid) ||
      ownerPid < 1
    )
      return true;
    if (typeof process === "undefined" || typeof process.kill !== "function")
      return true;
    try {
      process.kill(ownerPid, 0);
      return true;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
      throw error;
    }
  }
  public async transaction(
    fn: (
      snapshot: RoundSnapshot,
    ) => BoundaryRecord | undefined | Promise<BoundaryRecord | undefined>,
  ): Promise<RoundSnapshot> {
    const start = Date.now();
    while (true) {
      let entered = false;
      try {
        return await this.withLock(async () => {
          entered = true;
          const snapshot = await this.load();
          const state = await fn(snapshot);
          return state ? this.save(snapshot, state) : snapshot;
        });
      } catch (error: unknown) {
        if (
          entered ||
          (error as NodeJS.ErrnoException).code !== "CONFLICT" ||
          Date.now() - start >= 2000
        )
          throw error;
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }
    }
  }
  public async load(): Promise<RoundSnapshot> {
    const text = readFileSync(this.#path, "utf8");
    return { state: readRound(text), revision: hash(text), path: this.#path };
  }
  public async save(
    snapshot: RoundSnapshot,
    state: BoundaryRecord,
  ): Promise<RoundSnapshot> {
    if (!this.#held) throw new HarnessConflict("保存原台账必须持有账号锁");
    const text = readFileSync(this.#path, "utf8");
    if (snapshot.revision !== hash(text))
      throw new HarnessConflict("原台账已变化：重新定向读取，禁止覆盖");
    if (readRound(text).batchId !== state.batchId)
      throw new HarnessConflict("禁止替换原批次ID");
    const next = text.replace(
      block,
      () => "```x-round-state\n" + JSON.stringify(state, null, 2) + "\n```",
    );
    const temp = `${this.#path}.harness-${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, next, {
        flag: "wx",
        mode: statSync(this.#path).mode & 0o777,
      });
      // Other writers must honor the same lock; CAS additionally detects observed external edits.
      if (hash(readFileSync(this.#path, "utf8")) !== snapshot.revision)
        throw new HarnessConflict("原台账在结算中变化");
      renameSync(temp, this.#path);
    } finally {
      if (existsSync(temp)) unlinkSync(temp);
    }
    return { state, revision: hash(next), path: this.#path };
  }
  public async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    if (this.#held) throw new HarnessConflict("账号操作禁止重入");
    if (existsSync(`${this.#lockPath}.recovery`))
      throw new HarnessConflict("原锁恢复核验进行中");
    let fd: number;
    try {
      fd = openSync(this.#lockPath, "wx", 0o600);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new HarnessConflict("账号锁占用：不并发写、不自动偷锁");
      throw error;
    }
    try {
      writeFileSync(
        fd,
        JSON.stringify({
          pid: typeof process !== "undefined" ? process.pid : null,
          acquiredAt: new Date().toISOString(),
          ledgerPath: this.#path,
        }),
      );
      this.#held = true;
      return await fn();
    } finally {
      this.#held = false;
      closeSync(fd);
      unlinkSync(this.#lockPath);
    }
  }
  public async recoverAbandonedLock(): Promise<{
    recovered: boolean;
    evidenceRef: string;
  }> {
    if (this.#held) throw new HarnessConflict("不能恢复当前正在持有的锁");
    const recovery = `${this.#lockPath}.recovery`;
    let fd: number;
    try {
      fd = openSync(recovery, "wx", 0o600);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new HarnessConflict("另一执行器正在核验原锁");
      throw error;
    }
    try {
      const original = readFileSync(this.#lockPath, "utf8"),
        owner = JSON.parse(original);
      if (!Number.isInteger(owner.pid) || owner.pid < 1)
        throw new HarnessConflict("锁owner缺失，不能自动移除");
      if (typeof process === "undefined" || typeof process.kill !== "function")
        throw new HarnessConflict("当前宿主无进程核验能力，禁止恢复原锁");
      try {
        process.kill(owner.pid, 0);
        throw new HarnessConflict("原进程仍在：禁止抢占账号锁");
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
      const proof = await this.recordProof({
        observedAt: new Date().toISOString(),
        recovery: "owner-process-confirmed-exited",
        owner,
      });
      if (readFileSync(this.#lockPath, "utf8") !== original)
        throw new HarnessConflict("原锁已变化，禁止移除");
      unlinkSync(this.#lockPath);
      return { recovered: true, evidenceRef: proof };
    } finally {
      closeSync(fd);
      unlinkSync(recovery);
    }
  }
  public async recordProof(proof: unknown): Promise<string> {
    mkdirSync(this.#proofDir, { recursive: true });
    const file = join(this.#proofDir, `${randomUUID()}.json`);
    writeFileSync(file, JSON.stringify(proof, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
    return file;
  }
}
export function createFileRoundStore(
  ...args: ConstructorParameters<typeof FileRoundStore>
): RoundStore {
  return new FileRoundStore(...args);
}
