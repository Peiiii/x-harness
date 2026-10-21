import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  truncate,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export const shanghaiDay = (time: number) =>
  new Date(time + 8 * 3600_000).toISOString().slice(0, 10);

/** One durable writer. Reports are independent readers and never take this lease. */
export class XNetworkJournal {
  readonly directory: string;
  readonly token = randomUUID();
  #owned = false;
  constructor(directory: string) {
    this.directory = directory;
  }

  async acquire() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = join(this.directory, "writer.lock");
    let handle;
    try {
      handle = await open(path, "wx", 0o600);
    } catch (error: any) {
      if (error.code !== "EEXIST") throw error;
      handle = await this.#recoverDeadWriter(path);
    }
    try {
      await handle.writeFile(
        JSON.stringify({ pid: process.pid, token: this.token }),
      );
      await handle.sync();
    } finally {
      await handle.close();
    }
    this.#owned = true;
    try {
      return await this.#repairTail();
    } catch (error) {
      await this.release();
      throw error;
    }
  }
  async #recoverDeadWriter(path: string) {
    // Recovery is serialized too: a stale pre-read may never unlink a new writer.
    const recoveryPath = join(this.directory, "recovery.lock");
    let guard;
    try {
      guard = await open(recoveryPath, "wx", 0o600);
    } catch {
      throw new Error("observer-writer-recovery-busy");
    }
    try {
      await guard.writeFile(
        JSON.stringify({ pid: process.pid, token: this.token }),
      );
      const existing = JSON.parse(await readFile(path, "utf8"));
      if (!Number.isInteger(existing.pid) || existing.pid <= 0)
        throw new Error("invalid-observer-lock");
      try {
        process.kill(existing.pid, 0);
        throw new Error("observer-writer-already-running");
      } catch (error: any) {
        if (error.code !== "ESRCH") throw error;
      }
      await unlink(path);
      return await open(path, "wx", 0o600);
    } finally {
      await guard.close();
      await unlink(recoveryPath);
    }
  }
  async #assertOwner() {
    if (!this.#owned) throw new Error("observer-writer-not-owned");
    const lock = JSON.parse(
      await readFile(join(this.directory, "writer.lock"), "utf8"),
    );
    if (lock.token !== this.token) {
      this.#owned = false;
      throw new Error("observer-writer-lease-lost");
    }
  }
  async #repairTail() {
    const names = (await readdir(this.directory))
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
      .sort();
    if (!names.length) return 0;
    const path = join(this.directory, names.at(-1)!);
    const size = (await stat(path)).size;
    if (!size) return 0;
    const handle = await open(path, "r");
    const tail = Buffer.alloc(Math.min(size, 1024 * 1024));
    try {
      await handle.read(tail, 0, tail.length, size - tail.length);
    } finally {
      await handle.close();
    }
    if (tail.at(-1) === 10) return 0;
    const boundary = tail.lastIndexOf(10);
    if (boundary < 0 && size > tail.length)
      throw new Error("journal-tail-too-large-to-repair");
    const keep = size - tail.length + boundary + 1;
    await truncate(path, keep);
    return size - keep;
  }
  async loadCheckpoint(): Promise<any | undefined> {
    try {
      const state = JSON.parse(
        await readFile(join(this.directory, "checkpoint.json"), "utf8"),
      );
      if (state.schema !== "x-network-checkpoint/v1")
        throw new Error("invalid-network-checkpoint");
      return state;
    } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  async commit(batch: any, checkpoint: any, now: number) {
    await this.#assertOwner();
    const handle = await open(
      join(this.directory, `${shanghaiDay(now)}.jsonl`),
      "a",
      0o600,
    );
    try {
      await handle.writeFile(JSON.stringify(batch) + "\n");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await this.#atomic("checkpoint.json", checkpoint);
    await this.#atomic("health.json", checkpoint.health);
  }
  async #atomic(name: string, value: unknown) {
    const temporary = join(this.directory, `${name}.${this.token}.tmp`);
    const handle = await open(temporary, "w", 0o600);
    try {
      await handle.writeFile(JSON.stringify(value, null, 2) + "\n");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, join(this.directory, name));
  }
  async release() {
    if (!this.#owned) return;
    await this.#assertOwner();
    await unlink(join(this.directory, "writer.lock"));
    this.#owned = false;
  }
}
