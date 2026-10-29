import { randomUUID } from "node:crypto";
import { bindXGrowthHarness } from "./binding.js";
import { createFileRoundStore } from "./store.js";
import type {
  CuaTab,
  HostConnectionOptions,
  HostConnectionResult,
  HostConnectionReceipt,
} from "./types.js";

const retryablePolicyError =
  "Unable to load browser request-header policy. Retry the browser command.";
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
function classify(message: string): string {
  if (
    /rejected.*security policy|browser URL policy|user took control/i.test(
      message,
    )
  )
    return "browser-control-rejected";
  if (message.trim() === retryablePolicyError)
    return "host-policy-initialization-failed";
  if (/request-header.*(?:gate|policy)|caller identity/i.test(message))
    return "host-policy-unavailable";
  return "browser-connection-failed";
}

/** Only the read-only initialization call can be replayed, never tab creation or business. */
export class HostConnection {
  readonly #options: HostConnectionOptions;
  readonly #started = Date.now();
  readonly #connectionId = randomUUID();
  readonly #attempts: Array<Record<string, unknown>> = [];
  #tab?: CuaTab;
  #receipt: HostConnectionReceipt = {
    phase: "check",
    checkAttempts: 0,
    openAttempts: 0,
    recovered: false,
    durationMs: 0,
  };
  constructor(options: HostConnectionOptions) {
    this.#options = options;
  }
  private receipt(): HostConnectionReceipt {
    return { ...this.#receipt, durationMs: Date.now() - this.#started };
  }
  private async proof(outcome: string): Promise<void> {
    this.#receipt.evidenceRef = await createFileRoundStore(
      this.#options,
    ).recordProof({
      operation: "connect-host",
      connectionId: this.#connectionId,
      startedAt: new Date(this.#started).toISOString(),
      pid: process.pid,
      outcome,
      completion: outcome === "started" ? "not-recorded" : "recorded",
      observedAt: new Date().toISOString(),
      connection: this.receipt(),
      attempts: this.#attempts,
      underlyingHttpStatus: "not-exposed-by-host",
      ...(this.#tab ? { tabId: this.#tab.id } : {}),
    });
  }
  private async failed(error: unknown): Promise<HostConnectionResult> {
    const reason = classify(messageOf(error));
    let code = reason;
    try {
      await this.proof("failed");
    } catch {
      code = "evidence-store-unavailable";
    }
    return {
      status: "needsDecision",
      reason,
      connection: this.receipt(),
      diagnostic: {
        operation: "connect-host",
        category: "host-connection",
        code,
        next:
          code === "evidence-store-unavailable"
            ? "restore-proof-store"
            : "inspect-local-proof",
        ...(this.#receipt.evidenceRef
          ? { evidenceRef: this.#receipt.evidenceRef }
          : {}),
      },
      ...(this.#tab ? { tab: this.#tab } : {}),
    };
  }
  public async connect(): Promise<HostConnectionResult> {
    const options = this.#options;
    if (
      !options.ledgerPath ||
      !options.proofDirectory ||
      options.tab ||
      options.app ||
      typeof options.connection?.check !== "function" ||
      typeof options.connection?.openTab !== "function"
    )
      throw new Error("host-connection-options-invalid");
    for (let attempt = 1; attempt <= 2; attempt++) {
      this.#receipt.checkAttempts = attempt;
      const started = Date.now();
      await this.proof("started").catch(() => {});
      try {
        await options.connection.check();
        this.#attempts.push({
          phase: "check",
          attempt,
          durationMs: Date.now() - started,
          status: "ready",
        });
        break;
      } catch (error) {
        const message = messageOf(error);
        this.#attempts.push({
          phase: "check",
          attempt,
          durationMs: Date.now() - started,
          error: message,
        });
        if (attempt === 2 || message.trim() !== retryablePolicyError)
          return this.failed(error);
        try {
          await this.proof("retrying-initialization");
        } catch {
          return this.failed(error);
        }
      }
    }
    this.#receipt.recovered = this.#receipt.checkAttempts === 2;
    this.#receipt.phase = "open-tab";
    this.#receipt.openAttempts = 1;
    const started = Date.now();
    await this.proof("started").catch(() => {});
    try {
      this.#tab = await options.connection.openTab();
      this.#attempts.push({
        phase: "open-tab",
        durationMs: Date.now() - started,
        status: "ready",
      });
      this.#receipt.phase = "bind";
      if (!this.#tab?.id) throw new Error("owned-tab-id-missing");
      const harness = bindXGrowthHarness({ ...options, tab: this.#tab });
      this.#receipt.phase = "ready";
      await this.proof(this.#receipt.recovered ? "recovered" : "ready").catch(
        () => {},
      );
      return {
        status: "ready",
        harness,
        tab: this.#tab,
        connection: this.receipt(),
      };
    } catch (error) {
      this.#attempts.push({
        phase: this.#receipt.phase,
        durationMs: Date.now() - started,
        error: messageOf(error),
      });
      return this.failed(error);
    }
  }
}
