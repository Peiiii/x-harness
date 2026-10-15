import { randomUUID } from "node:crypto";
import { kinds } from "./growth-constants.js";
import { createGrowthPolicy } from "./growth-policy.js";
import { createGrowthState } from "./growth-state.js";
import { createGrowthExecution } from "./growth-execution.js";
import { createParallelRound } from "./growth-parallel.js";
import { createPlannedRound } from "./growth-plan.js";
import { createIndependentPublishing } from "./growth-publishing.js";
import { createGrowthReading } from "./growth-reading.js";
import { createGrowthRecovery } from "./growth-recovery.js";
import { createFollowBatch } from "./growth-batch.js";
import { createGrowthTasks } from "./growth-tasks.js";
/** Synchronous composition only; owners retain one original ledger and settlement path. */
export class GrowthHarness {
  readonly #platform!: any;
  readonly #store!: any;
  readonly #clock!: any;
  readonly #executor!: any;
  #session!: { claim: any; running: boolean };
  #evidenceExists!: any;
  #runtimeId!: ReturnType<typeof randomUUID>;
  #authorizedWindow!: ReturnType<typeof createGrowthPolicy>["authorizedWindow"];
  #scope!: ReturnType<typeof createGrowthPolicy>["scope"];
  #project!: ReturnType<typeof createGrowthPolicy>["project"];
  #capability!: ReturnType<typeof createGrowthPolicy>["capability"];
  #waitBudget!: ReturnType<typeof createGrowthPolicy>["waitBudget"];
  #guardInput!: ReturnType<typeof createGrowthPolicy>["guardInput"];
  #load!: ReturnType<typeof createGrowthState>["load"];
  #save!: ReturnType<typeof createGrowthState>["save"];
  #result!: ReturnType<typeof createGrowthState>["result"];
  #settleProof!: ReturnType<typeof createGrowthState>["settleProof"];
  #releaseSession!: ReturnType<typeof createGrowthState>["releaseSession"];
  #execute!: ReturnType<typeof createGrowthExecution>["execute"];
  #parallelRound!: ReturnType<typeof createParallelRound>["parallelRound"];
  #round!: ReturnType<typeof createPlannedRound>["round"];
  #publishIndependent!: ReturnType<
    typeof createIndependentPublishing
  >["publishIndependent"];
  #prepareActionsForCall!: ReturnType<
    typeof createIndependentPublishing
  >["prepareActionsForCall"];
  #readTask!: ReturnType<typeof createGrowthReading>["readTask"];
  #createGrowthRecoveryResult!: ReturnType<typeof createGrowthRecovery>;
  #createFollowBatchResult!: ReturnType<typeof createFollowBatch>;
  #createGrowthTasksResult!: ReturnType<typeof createGrowthTasks>;
  verifyPublishedPost!: ({
    taskId,
    draftPath,
    publicURL,
    evidenceRef,
    sourceLink,
    sourceLinks,
  }: any) => Promise<any>;
  verifySubmission!: ({ taskId, actionId }: any) => Promise<any>;
  verifyFollow!: (target: any) => Promise<any>;
  followBatch!: ({
    taskId,
    handles,
    preparedActions,
    pacing,
  }?: any) => Promise<import("./boundary.js").BoundaryRecord>;
  preflight!: ({ operation, input }: any) => any;
  readCreator!: (args: any) => Promise<any>;
  readPeople!: (args: any) => Promise<any>;
  inspectAccount!: (args: any) => Promise<any>;
  readPost!: (args: any) => Promise<any>;
  readPerson!: (args: any) => Promise<any>;
  readBookmarks!: (args: any) => Promise<any>;
  searchSources!: (args: any) => Promise<any>;
  readExploreRecommendations!: (args?: any) => Promise<any>;
  readHomeRecommendations!: (args?: any) => Promise<any>;
  readFeedback!: (args: any) => Promise<any>;
  runGrowthRound!: (args: any) => Promise<any>;
  resumeGrowthRound!: (args: any) => Promise<any>;
  inspectRound!: ({ taskId }: any) => Promise<any>;
  followOne!: ({ taskId, handle }: any) => Promise<any>;
  publishPost!: (input: any) => Promise<any>;
  replyToPost!: ({ taskId, postId, text, preparedAction }: any) => Promise<any>;
  constructor({
    platform,
    store,
    clock = () => Date.now(),
    executor,
  }: any = {}) {
    this.#platform = platform;
    this.#store = store;
    this.#clock = clock;
    this.#executor = executor;
    this.#session = { claim: undefined as any, running: false };
    this.#evidenceExists = this.#store.evidenceExists ?? (() => false);
    this.#runtimeId = randomUUID();
    if (
      this.#executor &&
      (!this.#executor.id ||
        !this.#executor.tabId ||
        !Array.isArray(this.#executor.scopeKinds) ||
        !this.#executor.scopeKinds.length ||
        new Set(this.#executor.scopeKinds).size !==
          this.#executor.scopeKinds.length ||
        this.#executor.scopeKinds.some((k: any) => !kinds.includes(k)) ||
        !this.#evidenceExists(this.#executor.evidenceRef) ||
        typeof this.#store.transaction !== "function")
    )
      throw new Error(
        "并行执行者需ID、独立tab、有效职责及原合同证据与transaction",
      );
    const {
      authorizedWindow,
      scope,
      project,
      capability,
      waitBudget,
      guardInput,
    } = createGrowthPolicy({
      executor: this.#executor,
      clock: this.#clock,
      evidenceExists: this.#evidenceExists,
      platform: this.#platform,
      store: this.#store,
    });
    this.#authorizedWindow = authorizedWindow;
    this.#scope = scope;
    this.#project = project;
    this.#capability = capability;
    this.#waitBudget = waitBudget;
    this.#guardInput = guardInput;
    const { load, save, result, settleProof, releaseSession } =
      createGrowthState({
        store: this.#store,
        project: this.#project,
        clock: this.#clock,
        evidenceExists: this.#evidenceExists,
        stamp: this.stamp.bind(this),
        executor: this.#executor,
        waitBudget: this.#waitBudget,
        platform: this.#platform,
        runtimeId: this.#runtimeId,
        session: this.#session,
      });
    this.#load = load;
    this.#save = save;
    this.#result = result;
    this.#settleProof = settleProof;
    this.#releaseSession = releaseSession;
    const { execute } = createGrowthExecution({
      evidenceExists: this.#evidenceExists,
      capability: this.#capability,
      platform: this.#platform,
      settleProof: this.#settleProof,
      clock: this.#clock,
      save: this.#save,
      guardInput: this.#guardInput,
      waitBudget: this.#waitBudget,
      authorizedWindow: this.#authorizedWindow,
      stamp: this.stamp.bind(this),
      store: this.#store,
      executor: this.#executor,
      session: this.#session,
    });
    this.#execute = execute;
    const { parallelRound } = createParallelRound({
      load: this.#load,
      scope: this.#scope,
      result: this.#result,
      store: this.#store,
      executor: this.#executor,
      runtimeId: this.#runtimeId,
      stamp: this.stamp.bind(this),
      evidenceExists: this.#evidenceExists,
      execute: this.#execute,
      clock: this.#clock,
      releaseSession: this.#releaseSession,
      session: this.#session,
    });
    this.#parallelRound = parallelRound;
    const { round } = createPlannedRound({
      store: this.#store,
      load: this.#load,
      result: this.#result,
      evidenceExists: this.#evidenceExists,
      save: this.#save,
      execute: this.#execute,
      clock: this.#clock,
      stamp: this.stamp.bind(this),
    });
    this.#round = round;
    const { publishIndependent, prepareActionsForCall } =
      createIndependentPublishing({
        clock: this.#clock,
        evidenceExists: this.#evidenceExists,
        capability: this.#capability,
        store: this.#store,
        load: this.#load,
        guardInput: this.#guardInput,
        save: this.#save,
        platform: this.#platform,
        stamp: this.stamp.bind(this),
        settleProof: this.#settleProof,
      });
    this.#publishIndependent = publishIndependent;
    this.#prepareActionsForCall = prepareActionsForCall;
    const { readTask } = createGrowthReading({
      platform: this.#platform,
      executor: this.#executor,
      store: this.#store,
      runtimeId: this.#runtimeId,
      stamp: this.stamp.bind(this),
      releaseSession: this.#releaseSession,
      session: this.#session,
    });
    this.#readTask = readTask;
    this.composeTasks();
  }
  private composeTasks() {
    this.#createGrowthRecoveryResult = createGrowthRecovery({
      capability: this.#capability,
      platform: this.#platform,
      load: this.#load,
      evidenceExists: this.#evidenceExists,
      clock: this.#clock,
      store: this.#store,
      settleProof: this.#settleProof,
      executor: this.#executor,
      parallelRound: this.#parallelRound,
      round: this.#round,
      readTask: this.#readTask,
    });
    this.#createFollowBatchResult = createFollowBatch({
      prepareActionsForCall: this.#prepareActionsForCall,
      store: this.#store,
      scope: this.#scope,
      stamp: this.stamp.bind(this),
      clock: this.#clock,
      evidenceExists: this.#evidenceExists,
      executor: this.#executor,
      parallelRound: this.#parallelRound,
      round: this.#round,
    });
    this.#createGrowthTasksResult = createGrowthTasks({
      platform: this.#platform,
      capability: this.#capability,
      executor: this.#executor,
      readTask: this.#readTask,
      parallelRound: this.#parallelRound,
      round: this.#round,
      load: this.#load,
      result: this.#result,
      publishIndependent: this.#publishIndependent,
      prepareActionsForCall: this.#prepareActionsForCall,
    });
    Object.assign(
      this,
      Object.assign(
        {},
        this.#createGrowthRecoveryResult,
        this.#createFollowBatchResult,
        this.#createGrowthTasksResult,
      ),
    );
  }

  private stamp() {
    return new Date(this.#clock()).toISOString();
  }
}
export function createGrowthHarness(
  ...args: ConstructorParameters<typeof GrowthHarness>
): any {
  return new GrowthHarness(...args);
}
