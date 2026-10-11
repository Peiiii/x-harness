import type { BoundaryRecord } from "./boundary.js";
import type { GrowthDependencies } from "./growth-dependencies.js";

export class GrowthReading {
  #platform!: GrowthDependencies["platform"];
  #executor!: GrowthDependencies["executor"];
  #store!: GrowthDependencies["store"];
  #runtimeId!: GrowthDependencies["runtimeId"];
  #stamp!: GrowthDependencies["stamp"];
  #releaseSession!: GrowthDependencies["releaseSession"];
  #session!: GrowthDependencies["session"];
  #readCache!: Map<any, any>;
  readTask!: (operation: any, { mode, ...input }?: any) => Promise<any>;
  constructor(
    dependencies: Pick<
      GrowthDependencies,
      | "platform"
      | "executor"
      | "store"
      | "runtimeId"
      | "stamp"
      | "releaseSession"
      | "session"
    >,
  ) {
    const {
      platform,
      executor,
      store,
      runtimeId,
      stamp,
      releaseSession,
      session,
    } = dependencies;
    this.#platform = platform;
    this.#executor = executor;
    this.#store = store;
    this.#runtimeId = runtimeId;
    this.#stamp = stamp;
    this.#releaseSession = releaseSession;
    this.#session = session;
    this.#readCache = new Map();
    this.readTask = this.handleReadTask.bind(this);
  }
  private async handleReadTask(
    operation: any,
    { mode = "receipt", ...input }: any = {},
  ): Promise<any> {
    const executor = this.#executor;
    if (!["decision", "receipt", "delta"].includes(mode))
      throw new Error("读取模式须为decision/receipt/delta");
    if (this.#session.running)
      return {
        status: "needsDecision",
        complete: false,
        reason: "same-tab-operation-running",
      };
    const caps = this.#platform.preflight({
      operation: ["readAccount", "readPerson", "readPost"].includes(operation)
        ? "read"
        : operation,
      input,
    });
    if (!caps.covered || typeof this.#platform[operation] !== "function")
      return {
        status: "needsCapability",
        ...caps,
        missing: [
          ...(caps.missing ?? []),
          ...(typeof this.#platform[operation] === "function"
            ? []
            : [`platform.${operation}`]),
        ],
      };
    this.#session.running = true;
    try {
      if (executor)
        await this.#store.transaction((latest: any) => {
          const next = structuredClone(latest.state);
          next.executions ??= {};
          if (
            Object.values(next.executions).some(
              (e: any) =>
                (e.tabId === executor.tabId || e.id === executor.id) &&
                e.runtimeId !== this.#runtimeId &&
                (e.activity || e.actionId) &&
                this.#store.ownerAlive(e.pid),
            )
          )
            throw new Error("same-tab-or-executor-claimed");
          next.executions[executor.id] = {
            ...next.executions[executor.id],
            ...executor,
            runtimeId: this.#runtimeId,
            pid: this.#store.processId,
            activity: operation,
            status: next.executions[executor.id]?.status ?? "RUNNING",
            updatedAt: this.#stamp(),
          };
          next.updatedAt = this.#stamp();
          return next;
        });
      const value = await this.#platform[operation](input);
      const evidenceRef = await this.#store.recordProof(
        await this.#platform.captureProof({ observation: value }),
      );
      const status =
        value.status ??
        (value.complete === false ||
        value.needsStateCheck ||
        value.alerts?.length
          ? "needsDecision"
          : "observed");
      const receipt: BoundaryRecord = {
        status,
        fresh: true,
        evidenceRef,
        complete:
          status === "observed" && (value.complete ?? !value.needsStateCheck),
        ...((value.sources ?? value.feedback)
          ? { ids: (value.sources ?? value.feedback).map((p: any) => p.id) }
          : {}),
        ...(operation === "readAccount"
          ? {
              accountHandle: value.accountHandle ?? null,
              accountURL: value.accountURL ?? null,
            }
          : {}),
        ...(value.missing?.length ? { missing: value.missing } : {}),
      };
      if (mode === "receipt") return receipt;
      const collection = value.sources
        ? "sources"
        : value.feedback
          ? "feedback"
          : null;
      if (mode === "delta" && collection) {
        const unchangedIds: any[] = [],
          changed: any[] = [];
        for (const entry of value[collection]) {
          const key = JSON.stringify([operation, input, entry.id]);
          const normalized = JSON.stringify(entry, (name: any, val: any) =>
            name === "observedAt" ? undefined : val,
          );
          if (this.#readCache.get(key) === normalized)
            unchangedIds.push(entry.id);
          else changed.push(entry);
          this.#readCache.set(key, normalized);
        }
        return { ...receipt, [collection]: changed, unchangedIds };
      }
      return mode === "delta" ? receipt : { ...value, ...receipt };
    } catch (error: any) {
      const category = /connection|transport|interrupted|extension/i.test(
        error.message,
      )
        ? "browser-connection"
        : "ui-not-confirmed";
      const code =
        error.code === "CONFLICT"
          ? "ledger-conflict"
          : /same-tab-or-executor-claimed/.test(error.message)
            ? "tab-busy"
            : category === "browser-connection"
              ? "connection-failed"
              : "observation-unconfirmed";
      const diagnostic: BoundaryRecord = { operation, category, code };
      const evidenceRef = await this.#store.recordProof({
        capturedAt: this.#stamp(),
        diagnostic: { ...diagnostic, error: error.message },
      });
      return {
        status: "needsDecision",
        fresh: false,
        complete: false,
        evidenceRef,
        diagnostic:
          mode === "decision"
            ? { ...diagnostic, error: error.message.slice(0, 240) }
            : diagnostic,
      };
    } finally {
      try {
        await this.#releaseSession();
      } finally {
        this.#session.running = false;
      }
    }
  }
}
export function createGrowthReading(
  ...args: ConstructorParameters<typeof GrowthReading>
) {
  return new GrowthReading(...args);
}
