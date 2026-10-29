import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  linkSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { HarnessConflict } from "./store-conflict.js";
import { currentXUsageTrace } from "./usage.js";
export const ATOMIC_LEDGER_PROTOCOL = "atomic-ledger-commit/v1";
/** Native statement lifetime owns coordination; no business state is stored here. */
export class LedgerWriteGate {
  private readonly gatePath: string;
  private readonly compatibilityPath: string;
  constructor(
    ledgerPath: string,
    private readonly owner?: unknown,
  ) {
    this.gatePath = join(dirname(ledgerPath), ".x-harness-write.sqlite");
    this.compatibilityPath = join(dirname(ledgerPath), ".x-harness.lock");
  }
  /** Called only after the native write statement has exclusive writer ownership. */
  private claimCompatibilityFile(): string {
    const path = this.compatibilityPath;
    if (existsSync(path)) {
      let original: string;
      try {
        original = readFileSync(path, "utf8");
      } catch (error: any) {
        if (error.code === "ENOENT")
          throw new HarnessConflict("兼容写入已结束：按最新状态重算");
        throw error;
      }
      let owner: any;
      try {
        owner = JSON.parse(original);
      } catch {}
      if (
        owner?.protocol !== ATOMIC_LEDGER_PROTOCOL ||
        owner.gatePath !== this.gatePath
      )
        throw new HarnessConflict(
          "旧版账号锁尚在写入：新读取可继续，旧锁按原归属核验",
        );
      // Every owner of this protocol must hold this same native SQLite writer.
      // Acquiring it proves the prior native call ended; age/PID guesses are unnecessary.
      if (readFileSync(path, "utf8") !== original)
        throw new HarnessConflict("写入协调归属已变化");
      unlinkSync(path);
    }
    if (existsSync(path + ".recovery"))
      throw new HarnessConflict("旧版锁恢复核验进行中");
    const token = randomUUID(),
      temporary = path + "." + token + ".tmp";
    try {
      writeFileSync(
        temporary,
        JSON.stringify({
          protocol: ATOMIC_LEDGER_PROTOCOL,
          gatePath: this.gatePath,
          token,
          ...(this.owner ? { owner: this.owner } : {}),
          ...(currentXUsageTrace() ? { usageTrace: currentXUsageTrace() } : {}),
          acquiredAt: new Date().toISOString(),
        }),
        { flag: "wx", mode: 0o600 },
      );
      try {
        linkSync(temporary, path);
      } catch (error: any) {
        if (error.code === "EEXIST")
          throw new HarnessConflict("旧版写入同时进入：重新读取后接续");
        throw error;
      }
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
    return token;
  }
  private releaseCompatibilityFile(token: string): void {
    try {
      if (
        JSON.parse(readFileSync(this.compatibilityPath, "utf8")).token === token
      )
        unlinkSync(this.compatibilityPath);
    } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  run<T>(commit: () => T): T {
    const db = new DatabaseSync(this.gatePath);
    let result: T,
      committed = false,
      originalError: unknown;
    try {
      db.exec(
        "PRAGMA busy_timeout=1500; CREATE TABLE IF NOT EXISTS write_gate(id INTEGER PRIMARY KEY,n INTEGER NOT NULL); INSERT OR IGNORE INTO write_gate VALUES(1,0)",
      );
      db.function("commit_original_ledger", () => {
        let token: string | undefined;
        try {
          token = this.claimCompatibilityFile();
          result = commit();
          committed = true;
          return 1;
        } catch (error) {
          originalError = error;
          throw error;
        } finally {
          if (token) this.releaseCompatibilityFile(token);
        }
      });
      try {
        db.prepare(
          "UPDATE write_gate SET n=n+1 WHERE id=1 AND commit_original_ledger()=1",
        ).run();
      } catch (error) {
        if (!committed) throw originalError ?? error;
      }
      return result!;
    } finally {
      db.close();
    }
  }
}
