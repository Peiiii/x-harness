import { randomUUID } from "node:crypto";

/** Durable, content-free progress evidence; diagnostics never activate an action. */
export class ActionTrace {
  readonly runId = randomUUID();
  readonly evidenceRefs: string[] = [];
  constructor(
    private store: { recordProof(value: any): Promise<string> },
    private clock: () => number,
    private action: { id: string; kind: string },
  ) {}

  annotate(observation: any) {
    return {
      ...observation,
      actionTrace: { runId: this.runId, evidenceRefs: [...this.evidenceRefs] },
    };
  }

  async run<T>(stage: string, operation: () => Promise<T>): Promise<T> {
    const started = this.clock();
    await this.record(stage, "started", started);
    try {
      const value = await operation();
      await this.record(stage, "returned", started, value);
      return value;
    } catch (error) {
      await this.record(stage, "error", started, undefined, error);
      throw error;
    }
  }

  private async record(
    stage: string,
    status: string,
    started: number,
    value?: any,
    error?: any,
  ) {
    const diagnostic = error?.submissionDiagnostic;
    const summary =
      value && typeof value === "object"
        ? Object.fromEntries(
            [
              "page",
              "accountHandle",
              "verified",
              "missing",
              "alerts",
              "available",
            ]
              .filter((key) => value[key] !== undefined)
              .map((key) => [key, value[key]]),
          )
        : undefined;
    try {
      this.evidenceRefs.push(
        await this.store.recordProof({
          kind: "action-stage",
          runId: this.runId,
          actionId: this.action.id,
          scope: this.action.kind,
          stage,
          status,
          capturedAt: new Date(this.clock()).toISOString(),
          startedAt: new Date(started).toISOString(),
          durationMs: this.clock() - started,
          ...(summary ? { summary } : {}),
          ...(error
            ? {
                error: String(error.message ?? error)
                  .split("\n")[0]
                  .slice(0, 240),
              }
            : {}),
          ...(diagnostic ? { submissionDiagnostic: diagnostic } : {}),
        }),
      );
    } catch {
      // A failed optional diagnostic must not replay or replace the business operation.
    }
  }
}
