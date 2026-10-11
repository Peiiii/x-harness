import type { BoundaryRecord } from "./boundary.js";
import type { RoundStore } from "./store.js";
/** Explicit instance dependencies; each owner accepts only its declared subset. */
export interface GrowthDependencies {
  platform: BoundaryRecord;
  store: RoundStore;
  clock: () => number;
  executor: BoundaryRecord | undefined;
  stamp: () => string;
  evidenceExists: (path: string) => boolean;
  runtimeId: string;
  session: { claim: any; running: boolean };
  authorizedWindow: (state: any, kind: string) => boolean;
  scope: (state: any) => any;
  project: (state: any) => any;
  load: (taskId: any) => Promise<any>;
  save: (snapshot: any, state: any) => Promise<any>;
  result: (snapshot: any, needs?: any) => any;
  capability: (operation: any, input?: any) => any;
  waitBudget: (state: any) => any;
  guardInput: (state: any, action: any, independentExecution?: any) => any;
  settleProof: (
    snapshot: any,
    action: any,
    observation: any,
    { preserveStatus }?: any,
  ) => Promise<any>;
  execute: (snapshot: any, action: any) => Promise<any>;
  parallelRound: ({
    taskId,
    decision,
    selector,
    requestedKind,
    maxActions,
  }?: any) => Promise<any>;
  round: ({ taskId, decision, selector, requestedKind }?: any) => Promise<any>;
  publishIndependent: ({
    taskId,
    draftPath,
    preparedAction,
    independentExecution,
  }: any) => Promise<any>;
  releaseSession: (taskId?: any) => Promise<any>;
  readTask: (operation: any, { mode, ...input }?: any) => Promise<any>;
  prepareActionsForCall: (taskId: string, actions?: any[]) => Promise<void>;
}
