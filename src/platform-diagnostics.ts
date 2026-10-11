import type { BoundaryRecord } from "./boundary.js";
import type { PlatformDependencies } from "./platform-dependencies.js";

export class PlatformDiagnostics {
  #clock!: PlatformDependencies["clock"];
  #followDiagnostics!: any[];
  followStage!: (action: any, stage: any, run: any) => Promise<any>;
  captureProof!: ({ observation }: any) => {
    followDiagnostics?: any[] | undefined;
    capturedAt: string;
    observation: any;
  };
  constructor(dependencies: Pick<PlatformDependencies, "clock">) {
    const { clock } = dependencies;
    this.#clock = clock;
    this.#followDiagnostics = [];
    this.followStage = this.handleFollowStage.bind(this);
    this.captureProof = this.handleCaptureProof.bind(this);
  }
  private async handleFollowStage(
    action: any,
    stage: any,
    run: any,
  ): Promise<any> {
    const started = this.#clock();
    const event: BoundaryRecord = {
      actionId: action.id ?? null,
      handle: action.handle,
      stage,
      startedAt: new Date(started).toISOString(),
    };
    this.#followDiagnostics.push(event);
    if (this.#followDiagnostics.length > 40) this.#followDiagnostics.shift();
    try {
      const value = await run();
      Object.assign(event, {
        status: "returned",
        durationMs: this.#clock() - started,
      });
      if (value && typeof value === "object")
        Object.assign(event, {
          page: value.page,
          accountHandle: value.accountHandle,
          relationship: value.relationship,
          relationshipControls: value.relationshipControls,
          needsStateCheck: value.needsStateCheck,
          alerts: value.alerts,
          fresh: value.fresh,
        });
      return value;
    } catch (error: any) {
      Object.assign(event, {
        status: "error",
        durationMs: this.#clock() - started,
        error: String(error.message ?? error).slice(0, 500),
      });
      throw error;
    }
  }
  private handleCaptureProof({ observation }: any) {
    return {
      capturedAt: new Date(this.#clock()).toISOString(),
      observation,
      ...(this.#followDiagnostics.length
        ? { followDiagnostics: structuredClone(this.#followDiagnostics) }
        : {}),
    };
  }
}
export function createPlatformDiagnostics(
  ...args: ConstructorParameters<typeof PlatformDiagnostics>
) {
  return new PlatformDiagnostics(...args);
}
