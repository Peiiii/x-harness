import type { GrowthDependencies } from "./growth-dependencies.js";

import { kinds, operations, same } from "./growth-constants.js";
export class GrowthTasks {
  #platform!: GrowthDependencies["platform"];
  #capability!: GrowthDependencies["capability"];
  #executor!: GrowthDependencies["executor"];
  #readTask!: GrowthDependencies["readTask"];
  #parallelRound!: GrowthDependencies["parallelRound"];
  #round!: GrowthDependencies["round"];
  #load!: GrowthDependencies["load"];
  #result!: GrowthDependencies["result"];
  #publishIndependent!: GrowthDependencies["publishIndependent"];
  #prepareActionsForCall!: GrowthDependencies["prepareActionsForCall"];
  constructor(
    dependencies: Pick<
      GrowthDependencies,
      | "platform"
      | "capability"
      | "executor"
      | "readTask"
      | "parallelRound"
      | "round"
      | "load"
      | "result"
      | "publishIndependent"
      | "prepareActionsForCall"
    >,
  ) {
    this.replyToPost = this.replyToPost.bind(this);
    this.publishPost = this.publishPost.bind(this);
    this.followOne = this.followOne.bind(this);
    this.inspectRound = this.inspectRound.bind(this);
    this.resumeGrowthRound = this.resumeGrowthRound.bind(this);
    this.runGrowthRound = this.runGrowthRound.bind(this);
    this.readPostComments = this.readPostComments.bind(this);
    this.readFeedback = this.readFeedback.bind(this);
    this.searchSources = this.searchSources.bind(this);
    this.readExploreRecommendations =
      this.readExploreRecommendations.bind(this);
    this.readHomeRecommendations = this.readHomeRecommendations.bind(this);
    this.readBookmarks = this.readBookmarks.bind(this);
    this.readPerson = this.readPerson.bind(this);
    this.readPeople = this.readPeople.bind(this);
    this.readPost = this.readPost.bind(this);
    this.inspectAccount = this.inspectAccount.bind(this);
    this.readCreator = this.readCreator.bind(this);
    this.preflight = this.preflight.bind(this);
    const {
      platform,
      capability,
      executor,
      readTask,
      parallelRound,
      round,
      load,
      result,
      publishIndependent,
      prepareActionsForCall,
    } = dependencies;
    this.#platform = platform;
    this.#capability = capability;
    this.#executor = executor;
    this.#readTask = readTask;
    this.#parallelRound = parallelRound;
    this.#round = round;
    this.#load = load;
    this.#result = result;
    this.#publishIndependent = publishIndependent;
    this.#prepareActionsForCall = prepareActionsForCall;
  }
  public preflight({ operation, input = {} }: any) {
    const executor = this.#executor;
    if (
      [
        "readPeople",
        "readBookmarks",
        "searchSources",
        "readExploreRecommendations",
        "readHomeRecommendations",
        "readFeedback",
        "readPostComments",
      ].includes(operation)
    )
      return this.#platform.preflight({ operation, input });
    if (["inspectRound", "verifySubmission"].includes(operation))
      return this.#capability("read", input);
    if (["inspectAccount", "verifyFollow"].includes(operation)) {
      const name = operation === "verifyFollow" ? "readPerson" : "readAccount";
      if (
        typeof this.#platform?.preflight !== "function" ||
        typeof this.#platform?.[name] !== "function"
      )
        return {
          covered: false,
          missing: [name],
          owner: "scripts/x-harness-platform.mjs",
        };
      return this.#platform.preflight({ operation: "read", input });
    }
    if (["runGrowthRound", "resumeGrowthRound"].includes(operation)) {
      const scoped = executor?.scopeKinds ?? input.scopeKinds ?? kinds;
      if (
        !Array.isArray(scoped) ||
        !scoped.length ||
        scoped.some((k: any) => !kinds.includes(k))
      )
        return {
          covered: false,
          missing: ["scopeKinds"],
          owner: "scripts/x-growth-harness.mjs",
        };
      const all = scoped.map((kind: any) =>
        this.#capability(operations[kind], { ...input, kind }),
      );
      return {
        covered: all.every((c: any) => c.covered),
        missing: [...new Set(all.flatMap((c: any) => c.missing))],
        owners: [
          ...new Set(
            all.filter((c: any) => !c.covered).map((c: any) => c.owner),
          ),
        ],
      };
    }
    if (
      ![
        "read",
        "followOne",
        "followBatch",
        "publishPost",
        "replyToPost",
        ...Object.values(operations),
      ].includes(operation)
    )
      return {
        covered: false,
        missing: [`operation.${operation}`],
        owner: "scripts/x-growth-harness.mjs",
      };
    return this.#capability(operation, input);
  }
  public readCreator(args: any) {
    return this.#readTask("readCreator", args);
  }
  public inspectAccount(args: any) {
    return this.#readTask("readAccount", { ...args, force: true });
  }
  public readPost(args: any) {
    return this.#readTask("readPost", { ...args, expand: true });
  }
  public readPeople(args: any) {
    return this.#readTask("readPeople", args);
  }
  public readPerson(args: any) {
    return this.#readTask("readPerson", args);
  }
  public readBookmarks(args: any) {
    return this.#readTask("readBookmarks", args);
  }
  public searchSources(args: any) {
    return this.#readTask("searchSources", args);
  }
  public readExploreRecommendations(args: any = {}) {
    return this.#readTask("readExploreRecommendations", args);
  }
  public readHomeRecommendations(args: any = {}) {
    return this.#readTask("readHomeRecommendations", args);
  }
  public readPostComments(args: any) {
    return this.#readTask("readPostComments", args);
  }
  public readFeedback(args: any) {
    return this.#readTask("readFeedback", args);
  }
  public runGrowthRound(args: any) {
    const executor = this.#executor;
    return executor ? this.#parallelRound(args) : this.#round(args);
  }
  public resumeGrowthRound(args: any) {
    const executor = this.#executor;
    return executor ? this.#parallelRound(args) : this.#round(args);
  }
  public async inspectRound({ taskId }: any) {
    const snapshot = await this.#load(taskId);
    return this.#result(snapshot);
  }
  public followOne({ taskId, handle }: any) {
    const executor = this.#executor;
    return (executor ? this.#parallelRound : this.#round)({
      taskId,
      requestedKind: "follow",
      selector: (a: any) => a.kind === "follow" && same(a.handle, handle),
    });
  }
  public async publishPost(input: any) {
    const executor = this.#executor;
    if (!executor && input.independentExecution)
      return this.#publishIndependent(input);
    if (
      input.preparedAction &&
      (input.preparedAction.kind !== "original" ||
        input.preparedAction.draftPath !== input.draftPath)
    )
      throw new Error("prepared-original-target-mismatch");
    await this.#prepareActionsForCall(
      input.taskId,
      input.preparedAction ? [input.preparedAction] : [],
    );
    return (executor ? this.#parallelRound : this.#round)({
      taskId: input.taskId,
      requestedKind: "original",
      selector: (a: any) =>
        a.kind === "original" && a.draftPath === input.draftPath,
    });
  }
  public async replyToPost({ taskId, postId, text, preparedAction }: any) {
    const executor = this.#executor;
    if (
      preparedAction &&
      (preparedAction.kind !== "reply" ||
        preparedAction.postId !== postId ||
        preparedAction.text !== text)
    )
      throw new Error("prepared-reply-target-mismatch");
    await this.#prepareActionsForCall(
      taskId,
      preparedAction ? [preparedAction] : [],
    );
    return (executor ? this.#parallelRound : this.#round)({
      taskId,
      requestedKind: "reply",
      selector: (a: any) =>
        a.kind === "reply" && a.postId === postId && a.text === text,
    });
  }
}
export function createGrowthTasks(
  ...args: ConstructorParameters<typeof GrowthTasks>
) {
  return new GrowthTasks(...args);
}
