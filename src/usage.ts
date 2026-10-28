import {
  mkdirSync,
  writeFileSync,
  renameSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

interface UsageTraceContext {
  sessionId: string;
  callId: string;
  rootCallId: string;
  rootOperation: string;
}
const usageContext = new AsyncLocalStorage<UsageTraceContext>();

/** Content-free join to an original action-stage proof, isolated per async call. */
export function currentXUsageTrace(): UsageTraceContext | undefined {
  const context = usageContext.getStore();
  return context ? { ...context } : undefined;
}
interface UsageBindingContext {
  transport?: "dom" | "native";
  tabId?: string;
  executorId?: string;
  runtimeIdentity?: { sourceCommit: string; artifactSha256?: string };
}

export interface XUsageStatus {
  directory: string;
  sessionId: string;
  calls: number;
  failedWrites: number;
  lastError?: "usage-log-unavailable";
}
interface UsageRecord {
  schema: 1;
  id: string;
  sessionId: string;
  layer: "harness" | "browser";
  operation: string;
  rootCallId?: string;
  parentCallId?: string;
  binding?: UsageBindingContext;
  readTransport?: "native-fallback";
  domReadTiming?: Record<string, number | string>;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  status?: string;
  reason?: string;
  threw?: boolean;
  http429?: boolean;
}
const label = (value: unknown): string | undefined =>
  typeof value === "string" && /^[A-Za-z][A-Za-z0-9:_-]{0,95}$/.test(value)
    ? value
    : undefined;

function readTiming(
  value: unknown,
): Record<string, number | string> | undefined {
  if (!value || typeof value !== "object") return;
  const raw = value as Record<string, unknown>;
  const timing: Record<string, number | string> = {};
  for (const key of [
    "enteredAtMs",
    "finishedAtMs",
    "hostStartedAtMs",
    "hostFinishedAtMs",
  ]) {
    const n = raw[key];
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) timing[key] = n;
  }
  if (raw.visibilityState === "visible" || raw.visibilityState === "hidden")
    timing.visibilityState = raw.visibilityState;
  return Object.keys(timing).length ? timing : undefined;
}

/** Local call-frequency evidence. Never reads a page, starts a timer or stores arguments. */
export class XUsageJournal {
  #directory: string;
  #sessionId = randomUUID();
  #calls = 0;
  #failedWrites = 0;
  #binding: UsageBindingContext;
  constructor(proofDirectory: string, binding: UsageBindingContext = {}) {
    this.#directory = join(proofDirectory, "usage", this.#sessionId);
    const identity = binding.runtimeIdentity;
    this.#binding = {
      ...(["dom", "native"].includes(binding.transport ?? "")
        ? { transport: binding.transport }
        : {}),
      ...(typeof binding.tabId === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9:_-]{0,95}$/.test(binding.tabId)
        ? { tabId: binding.tabId }
        : {}),
      ...(label(binding.executorId) ? { executorId: binding.executorId } : {}),
      ...(identity &&
      typeof identity.sourceCommit === "string" &&
      /^[a-f0-9]{40}$/.test(identity.sourceCommit)
        ? {
            runtimeIdentity: {
              sourceCommit: identity.sourceCommit,
              ...(/^[a-f0-9]{64}$/.test(identity.artifactSha256 ?? "")
                ? { artifactSha256: identity.artifactSha256 }
                : {}),
            },
          }
        : {}),
    };
  }
  status(): XUsageStatus {
    return {
      directory: this.#directory,
      sessionId: this.#sessionId,
      calls: this.#calls,
      failedWrites: this.#failedWrites,
      ...(this.#failedWrites
        ? { lastError: "usage-log-unavailable" as const }
        : {}),
    };
  }
  #write(record: UsageRecord) {
    try {
      mkdirSync(this.#directory, { recursive: true, mode: 0o700 });
      const file = join(this.#directory, record.id + ".json");
      const temporary = file + ".tmp";
      writeFileSync(temporary, JSON.stringify(record), { mode: 0o600 });
      renameSync(temporary, file);
    } catch {
      this.#failedWrites++;
    }
  }
  wrap<T extends object>(
    target: T,
    layer: UsageRecord["layer"],
    methods?: string[],
  ): T {
    const cache = new Map<string, unknown>();
    return new Proxy(target, {
      get: (object, key) => {
        const value = Reflect.get(object, key, object);
        if (
          typeof key !== "string" ||
          typeof value !== "function" ||
          key === "constructor" ||
          key === "usageStatus" ||
          (!methods && key in Object.prototype) ||
          (methods && !methods.includes(key))
        )
          return value;
        if (!cache.has(key))
          cache.set(key, (...args: unknown[]) =>
            this.#call(
              () => Reflect.apply(value, object, args),
              layer,
              layer === "browser" && key === "act"
                ? `${key}:${label((args[0] as { operation?: unknown })?.operation) ?? "unknown"}`
                : key,
            ),
          );
        return cache.get(key);
      },
    });
  }
  #call(
    invoke: () => unknown,
    layer: UsageRecord["layer"],
    operation: string,
  ): unknown {
    const started = Date.now();
    const active = usageContext.getStore();
    const parent = active?.sessionId === this.#sessionId ? active : undefined;
    const callId = randomUUID();
    const record: UsageRecord = {
      schema: 1,
      id: callId,
      sessionId: this.#sessionId,
      rootCallId: parent?.rootCallId ?? callId,
      ...(parent ? { parentCallId: parent.callId } : {}),
      binding: this.#binding,
      layer,
      operation,
      startedAt: new Date(started).toISOString(),
    };
    this.#calls++;
    this.#write(record);
    const finish = (result: unknown, threw = false) => {
      const raw = result as {
        status?: unknown;
        reason?: unknown;
        diagnostic?: { code?: unknown };
        readTransport?: unknown;
        domReadTiming?: unknown;
      } | null;
      const reason = threw
        ? result instanceof Error
          ? result.message
          : ""
        : (raw?.reason ?? raw?.diagnostic?.code);
      this.#write({
        ...record,
        finishedAt: new Date().toISOString(),
        durationMs: Math.max(0, Date.now() - started),
        status: threw ? "threw" : (label(raw?.status) ?? "returned"),
        reason: threw ? undefined : label(raw?.diagnostic?.code),
        threw,
        ...(raw?.readTransport === "native-fallback"
          ? { readTransport: "native-fallback" as const }
          : {}),
        ...(layer === "browser" &&
        operation === "observe" &&
        readTiming(raw?.domReadTiming)
          ? { domReadTiming: readTiming(raw?.domReadTiming) }
          : {}),
        http429:
          typeof reason === "string" &&
          /(?:HTTP[- :]*429|\b429\b)/i.test(reason),
      });
      return result;
    };
    return usageContext.run(
      {
        sessionId: this.#sessionId,
        callId,
        rootCallId: record.rootCallId!,
        rootOperation: parent?.rootOperation ?? operation,
      },
      () => {
        try {
          const result = invoke();
          return result &&
            typeof (result as PromiseLike<unknown>).then === "function"
            ? Promise.resolve(result).then(
                (value) => finish(value),
                (error) => {
                  finish(error, true);
                  throw error;
                },
              )
            : finish(result);
        } catch (error) {
          finish(error, true);
          throw error;
        }
      },
    );
  }
}

/** Replay call evidence; absent files never imply zero platform traffic. */
export function readXUsageReport(
  proofDirectories: string[],
  options: { since?: string; until?: string } = {},
) {
  const records = new Map<string, UsageRecord>();
  const gaps: { directory: string; code: string }[] = [];
  const visit = (directory: string, depth = 0) => {
    if (depth > 2) return;
    let files: import("node:fs").Dirent[];
    try {
      files = readdirSync(directory, { withFileTypes: true });
    } catch {
      gaps.push({ directory, code: "usage-directory-unavailable" });
      return;
    }
    for (const file of files) {
      const path = join(directory, file.name);
      if (file.isDirectory()) {
        visit(path, depth + 1);
        continue;
      }
      if (!file.name.endsWith(".json")) continue;
      try {
        const value = JSON.parse(readFileSync(path, "utf8")) as UsageRecord;
        if (
          value.schema !== 1 ||
          !value.id ||
          !["harness", "browser"].includes(value.layer) ||
          !label(value.operation) ||
          !Number.isFinite(Date.parse(value.startedAt))
        )
          throw new Error("schema");
        if (
          (options.since && value.startedAt < options.since) ||
          (options.until && value.startedAt >= options.until)
        )
          continue;
        if (!records.get(value.id)?.finishedAt || value.finishedAt)
          records.set(value.id, value);
      } catch {
        gaps.push({ directory: path, code: "malformed-usage-record" });
      }
    }
  };
  for (const dir of proofDirectories) visit(join(dir, "usage"));
  const operations: Record<
    string,
    {
      calls: number;
      unfinished: number;
      http429: number;
      threw: number;
      durationMs: number;
      statuses: Record<string, number>;
    }
  > = {};
  const minutes: Record<string, { harness: number; browser: number }> = {};
  for (const r of records.values()) {
    const key = `${r.layer}:${r.operation}`;
    const aggregate = (operations[key] ??= {
      calls: 0,
      unfinished: 0,
      http429: 0,
      threw: 0,
      durationMs: 0,
      statuses: Object.create(null),
    });
    aggregate.calls++;
    aggregate.unfinished += Number(!r.finishedAt);
    aggregate.http429 += Number(r.http429 === true);
    aggregate.threw += Number(r.threw === true);
    aggregate.durationMs += r.durationMs ?? 0;
    const status = r.status ?? "unfinished";
    aggregate.statuses[status] = (aggregate.statuses[status] ?? 0) + 1;
    const minute = r.startedAt.slice(0, 16) + "Z";
    (minutes[minute] ??= { harness: 0, browser: 0 })[r.layer]++;
  }
  return {
    schema: 1,
    metric: "harness-call-frequency",
    records: records.size,
    operations,
    minutes,
    gaps,
    coverage: {
      httpRequestCountKnown: false,
      fullAccountCoverageProven: false,
      zeroEventsMeansIdle: false,
    },
    limitations: [
      "Calls and browser operations are separate layers; never add them as HTTP requests.",
      "Only calls through instrumented bindings are covered; older bindings and browser background activity are unknown.",
      "http429 counts explicit signals in returned reasons/errors, not all network 429 responses.",
      "Unfinished calls may still be running or may have been interrupted.",
    ],
  };
}
