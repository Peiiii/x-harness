import { executionHoldsPage } from "./executor-actionability.js";
import { classifyReadFailure } from "./read-failure-classification.js";
import type { BoundaryRecord } from "./boundary.js";
import type { GrowthDependencies } from "./growth-dependencies.js";

export class GrowthReading {
  static #readingTabs = new Set<string>();
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
  private async assertReadTabAvailable(): Promise<void> {
    const executor = this.#executor;
    if (!executor) return;
    const latest = await this.#store.load();
    if (
      Object.values(latest.state.executions ?? {}).some(
        (e: any) =>
          e.tabId === executor.tabId &&
          e.runtimeId !== this.#runtimeId &&
          executionHoldsPage(e) &&
          this.#store.ownerAlive(e.pid),
      )
    )
      throw new Error("same-tab-or-executor-claimed");
  }
  private async handleReadTask(
    operation: any,
    { mode = "receipt", ...input }: any = {},
  ): Promise<any> {
    if (!["decision", "receipt", "delta"].includes(mode))
      throw new Error("读取模式须为decision/receipt/delta");
    if (
      this.#session.running ||
      (this.#executor?.tabId &&
        GrowthReading.#readingTabs.has(this.#executor.tabId))
    )
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
    if (this.#executor?.tabId)
      GrowthReading.#readingTabs.add(this.#executor.tabId);
    try {
      await this.assertReadTabAvailable();
      let value = await this.#platform[operation](input);
      if (
        operation === "readAccount" &&
        (typeof value.accountHandle !== "string" ||
          !/^[A-Za-z0-9_]{1,15}$/.test(value.accountHandle))
      ) {
        value = {
          ...value,
          status: "needsDecision",
          complete: false,
          needsStateCheck: true,
          missing: [...new Set([...(value.missing ?? []), "accountHandle"])],
        };
      }
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
        ...((value.sources ?? value.feedback ?? value.people)
          ? {
              ids: (value.sources ?? value.feedback ?? value.people).map(
                (p: any) => p.id ?? p.handle,
              ),
            }
          : {}),
        ...(operation === "readAccount"
          ? {
              accountHandle: value.accountHandle ?? null,
              accountURL: value.accountURL ?? null,
            }
          : {}),
        ...(value.missing?.length ? { missing: value.missing } : {}),
      };
      if (operation === "readPostComments") {
        receipt.pageComplete = false;
        receipt.paginationBoundary = value.paginationBoundary;
      }
      if (mode === "receipt") return receipt;
      const collection = value.sources
        ? "sources"
        : value.feedback
          ? "feedback"
          : value.people
            ? "people"
            : null;
      if (mode === "delta" && collection) {
        const unchangedIds: any[] = [],
          changed: any[] = [];
        for (const entry of value[collection]) {
          const key = JSON.stringify([
            operation,
            input,
            entry.id ?? entry.handle,
          ]);
          const normalized = JSON.stringify(entry, (name: any, val: any) =>
            name === "observedAt" ? undefined : val,
          );
          if (this.#readCache.get(key) === normalized)
            unchangedIds.push(entry.id ?? entry.handle);
          else changed.push(entry);
          this.#readCache.set(key, normalized);
        }
        return { ...receipt, [collection]: changed, unchangedIds };
      }
      return mode === "delta" ? receipt : { ...value, ...receipt };
    } catch (error: any) {
      const { message, ...classification } = classifyReadFailure(
        error,
        this.#stamp(),
      );
      const diagnostic: BoundaryRecord = { operation, ...classification };
      const evidenceRef = await this.#store.recordProof({
        capturedAt: this.#stamp(),
        diagnostic: { ...diagnostic, error: message },
      });
      return {
        status: "needsDecision",
        fresh: false,
        complete: false,
        evidenceRef,
        diagnostic:
          mode === "decision"
            ? { ...diagnostic, error: message.slice(0, 240) }
            : diagnostic,
      };
    } finally {
      if (this.#executor?.tabId)
        GrowthReading.#readingTabs.delete(this.#executor.tabId);
      this.#session.running = false;
    }
  }
}
export function createGrowthReading(
  ...args: ConstructorParameters<typeof GrowthReading>
) {
  return new GrowthReading(...args);
}
