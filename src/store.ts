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
import { HarnessConflict } from "./store-conflict.js";
import {
  LedgerWriteGate,
  ATOMIC_LEDGER_PROTOCOL,
} from "./ledger-write-gate.js";
import { mergeLedgerValue } from "./ledger-merge.js";
const hash = (text: string | Uint8Array) =>
  createHash("sha256").update(text).digest("hex");
const block = /```x-round-state\s*\n([\s\S]*?)\n```/;
export { HarnessConflict } from "./store-conflict.js";
// The only business state is the original ledger. Locks and proofs are not state replicas.
export interface RoundSnapshot {
  state: BoundaryRecord;
  revision: string;
  path: string;
}
export interface LockRecoveryContext {
  owner: Readonly<Record<string, unknown>>;
  lockFingerprint: string;
  ledgerRevision: string;
}
export interface LockRecoveryOptions {
  /** Trusted host verification under the recovery guard. Age alone is not evidence. */
  verifyExclusiveRecovery?: (context: LockRecoveryContext) => Promise<{
    confirmed: boolean;
    evidenceRef: string;
    lockFingerprint: string;
    ledgerRevision: string;
  }>;
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
  recoverAbandonedLock(
    options?: LockRecoveryOptions,
  ): Promise<{ recovered: boolean; evidenceRef: string }>;
  recordProof(proof: unknown): Promise<string>;
}
export class FileRoundStore implements RoundStore {
  readonly writeCoordination = ATOMIC_LEDGER_PROTOCOL;
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
  #referenceRoot?: string;
  #originalSnapshots = new WeakMap<RoundSnapshot, string>();
  #transactionSnapshots = new WeakSet<RoundSnapshot>();
  #owner?: { executorId?: string; runtimeId?: string; tabId?: string };
  path!: any;
  evidenceExists!: any;
  processId!: any;
  constructor({
    ledgerPath,
    proofDirectory,
    lockOwner,
    referenceRoot,
  }: {
    ledgerPath: string;
    proofDirectory: string;
    lockOwner?: { executorId?: string; runtimeId?: string; tabId?: string };
    referenceRoot?: string;
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
    this.#owner = lockOwner;
    this.path = this.#path;
    this.#referenceRoot = referenceRoot ? resolve(referenceRoot) : undefined;
    this.evidenceExists = (file: string) =>
      typeof file === "string" &&
      existsSync(
        this.#referenceRoot ? resolve(this.#referenceRoot, file) : file,
      );
    this.processId = typeof process !== "undefined" ? process.pid : null;
  }
  public fingerprint(file: string) {
    return hash(
      readFileSync(
        this.#referenceRoot
          ? resolve(this.#referenceRoot, file)
          : resolve(file),
      ),
    );
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
    let conflictStart: number | undefined;
    while (true) {
      try {
        const snapshot = await this.load();
        this.#transactionSnapshots.add(snapshot);
        const state = await fn(snapshot);
        return state ? await this.save(snapshot, state) : snapshot;
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== "CONFLICT") throw error;
        conflictStart ??= Date.now();
        if (Date.now() - conflictStart >= 2000) throw error;
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }
    }
  }
  public async load(): Promise<RoundSnapshot> {
    const text = readFileSync(this.#path, "utf8");
    const snapshot = {
      state: readRound(text),
      revision: hash(text),
      path: this.#path,
    };
    this.#originalSnapshots.set(snapshot, text);
    return snapshot;
  }
  public async save(
    snapshot: RoundSnapshot,
    state: BoundaryRecord,
  ): Promise<RoundSnapshot> {
    if (!this.#held && !this.#transactionSnapshots.has(snapshot))
      throw new HarnessConflict("保存原台账必须在本地编辑会话或原子事务中");
    return new LedgerWriteGate(this.#path, this.#owner).run(() => {
      const text = readFileSync(this.#path, "utf8"),
        current = readRound(text);
      if (current.batchId !== state.batchId)
        throw new HarnessConflict("禁止替换原批次ID");
      let merged = state;
      if (snapshot.revision !== hash(text)) {
        if (this.#transactionSnapshots.has(snapshot))
          throw new HarnessConflict("原子事务快照已变化：按最新状态重算");
        const base = this.#originalSnapshots.get(snapshot);
        if (!base)
          throw new HarnessConflict("原台账已变化且缺原始快照：重新读取");
        merged = mergeLedgerValue(readRound(base), current, state);
      }
      const next = text.replace(
        block,
        () => "```x-round-state\n" + JSON.stringify(merged, null, 2) + "\n```",
      );
      const temp = `${this.#path}.harness-${randomUUID()}.tmp`;
      try {
        writeFileSync(temp, next, {
          flag: "wx",
          mode: statSync(this.#path).mode & 0o777,
        });
        if (hash(readFileSync(this.#path, "utf8")) !== hash(text))
          throw new HarnessConflict("原台账被非原子写入者更改");
        renameSync(temp, this.#path);
      } finally {
        if (existsSync(temp)) unlinkSync(temp);
      }
      const saved = { state: merged, revision: hash(next), path: this.#path };
      this.#originalSnapshots.set(saved, next);
      return saved;
    });
  }
  private ownsLock(token: string | null): boolean {
    if (!token) return false;
    try {
      return JSON.parse(readFileSync(this.#lockPath, "utf8")).token === token;
    } catch {
      return false;
    }
  }
  /** Compatibility edit session. No physical lock is held while fn awaits. */
  public async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    if (this.#held) throw new HarnessConflict("同一存储实例禁止重入");
    this.#held = true;
    try {
      return await fn();
    } finally {
      this.#held = false;
    }
  }
  private releaseOwnedFile(path: string, token: string) {
    try {
      const owner = JSON.parse(readFileSync(path, "utf8"));
      if (owner.token === token) unlinkSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  public async recoverAbandonedLock(
    options: LockRecoveryOptions = {},
  ): Promise<{
    recovered: boolean;
    evidenceRef: string;
  }> {
    if (existsSync(this.#lockPath)) {
      let originalOwner: any;
      try {
        originalOwner = JSON.parse(readFileSync(this.#lockPath, "utf8"));
      } catch {}
      if (originalOwner?.protocol === ATOMIC_LEDGER_PROTOCOL)
        return {
          recovered: false,
          evidenceRef: await this.recordProof({
            recovery: "not-required-native-atomic-coordination",
            legacyWritesBlocked: true,
          }),
        };
    }
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
    const guardToken = randomUUID();
    try {
      writeFileSync(
        fd,
        JSON.stringify({
          token: guardToken,
          pid: typeof process !== "undefined" ? process.pid : null,
          acquiredAt: new Date().toISOString(),
          ledgerPath: this.#path,
        }),
      );
      const original = readFileSync(this.#lockPath, "utf8");
      let owner: Record<string, any>;
      try {
        const parsed = JSON.parse(original);
        owner =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : { unreadable: true };
      } catch {
        owner = { unreadable: true };
      }
      const context = {
        owner,
        lockFingerprint: hash(original),
        ledgerRevision: hash(readFileSync(this.#path)),
      };
      let verificationEvidenceRef: string | undefined;
      if (Number.isInteger(owner.pid) && owner.pid > 0) {
        if (
          typeof process === "undefined" ||
          typeof process.kill !== "function"
        )
          throw new HarnessConflict("当前宿主无进程核验能力，禁止恢复原锁");
        try {
          process.kill(owner.pid, 0);
          throw new HarnessConflict("原进程仍在：禁止抢占账号锁");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      } else {
        if (!options.verifyExclusiveRecovery)
          throw new HarnessConflict("锁owner缺失，不能自动移除");
        const verified = await options.verifyExclusiveRecovery(context);
        if (
          verified?.confirmed !== true ||
          verified.lockFingerprint !== context.lockFingerprint ||
          verified.ledgerRevision !== context.ledgerRevision ||
          typeof verified.evidenceRef !== "string" ||
          !this.evidenceExists(verified.evidenceRef)
        )
          throw new HarnessConflict(
            "缺少原上下文终止或全部写入者静止的精确证明",
          );
        verificationEvidenceRef = verified.evidenceRef;
      }
      const unchanged = () => {
        if (JSON.parse(readFileSync(recovery, "utf8")).token !== guardToken)
          throw new HarnessConflict("原恢复锁归属已变化");
        if (
          readFileSync(this.#lockPath, "utf8") !== original ||
          hash(readFileSync(this.#path)) !== context.ledgerRevision
        )
          throw new HarnessConflict("原锁或台账已变化，禁止移除");
      };
      unchanged();
      const proof = await this.recordProof({
        observedAt: new Date().toISOString(),
        recovery: verificationEvidenceRef
          ? "host-verified-exclusive-recovery"
          : "owner-process-confirmed-exited",
        owner,
        lockFingerprint: context.lockFingerprint,
        ledgerRevision: context.ledgerRevision,
        ...(verificationEvidenceRef ? { verificationEvidenceRef } : {}),
      });
      unchanged();
      unlinkSync(this.#lockPath);
      return { recovered: true, evidenceRef: proof };
    } finally {
      try {
        closeSync(fd);
      } finally {
        this.releaseOwnedFile(recovery, guardToken);
      }
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
