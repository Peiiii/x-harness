import { PlatformThreadLikes } from "./platform-thread-likes.js";
import { createPlatformObservation } from "./platform-observation.js";
import { createPlatformTargets } from "./platform-targets.js";
import { createPlatformCollections } from "./platform-collections.js";
import { createPlatformDiagnostics } from "./platform-diagnostics.js";
import { createPlatformWriting } from "./platform-writing.js";
import { createPlatformCapabilities } from "./platform-capabilities.js";
export { xURL } from "./platform-rules.js";
export class XPlatform {
  readonly #clock!: any;
  #createPlatformObservationResult!: ReturnType<
    typeof createPlatformObservation
  >;
  #missing!: {
    missing: (operation: any) => any[];
    observed: (query: any) => Promise<any>;
    open: (target: any, query: any) => Promise<any>;
    ready: (query: any) => Promise<any>;
    choose: (
      value: any,
      pattern: any,
      { activateSelected }?: any,
    ) => Promise<any>;
  }["missing"];
  #observed!: {
    missing: (operation: any) => any[];
    observed: (query: any) => Promise<any>;
    open: (target: any, query: any) => Promise<any>;
    ready: (query: any) => Promise<any>;
    choose: (
      value: any,
      pattern: any,
      { activateSelected }?: any,
    ) => Promise<any>;
  }["observed"];
  #open!: {
    missing: (operation: any) => any[];
    observed: (query: any) => Promise<any>;
    open: (target: any, query: any) => Promise<any>;
    ready: (query: any) => Promise<any>;
    choose: (
      value: any,
      pattern: any,
      { activateSelected }?: any,
    ) => Promise<any>;
  }["open"];
  #ready!: {
    missing: (operation: any) => any[];
    observed: (query: any) => Promise<any>;
    open: (target: any, query: any) => Promise<any>;
    ready: (query: any) => Promise<any>;
    choose: (
      value: any,
      pattern: any,
      { activateSelected }?: any,
    ) => Promise<any>;
  }["ready"];
  #choose!: {
    missing: (operation: any) => any[];
    observed: (query: any) => Promise<any>;
    open: (target: any, query: any) => Promise<any>;
    ready: (query: any) => Promise<any>;
    choose: (
      value: any,
      pattern: any,
      { activateSelected }?: any,
    ) => Promise<any>;
  }["choose"];
  #createPlatformTargetsResult!: ReturnType<typeof createPlatformTargets>;
  #readAccount!: ReturnType<typeof createPlatformObservation>["readAccount"];
  #readFeedback!: {
    readAccount: () => Promise<any>;
    readFeedback: ({ targets, replyLimit }?: any) => Promise<any>;
    readPerson: (target: any) => Promise<any>;
    readPost: (target: any) => Promise<any>;
  }["readFeedback"];
  #readPerson!: {
    readAccount: () => Promise<any>;
    readFeedback: ({ targets, replyLimit }?: any) => Promise<any>;
    readPerson: (target: any) => Promise<any>;
    readPost: (target: any) => Promise<any>;
  }["readPerson"];
  #readPost!: {
    readAccount: () => Promise<any>;
    readFeedback: ({ targets, replyLimit }?: any) => Promise<any>;
    readPerson: (target: any) => Promise<any>;
    readPost: (target: any) => Promise<any>;
  }["readPost"];
  #createPlatformCollectionsResult!: ReturnType<
    typeof createPlatformCollections
  >;
  #collectSources!: {
    collectSources: ({ processedIds, maxPages, limit }?: any) => Promise<any>;
    readCreator: (args: import("./types.js").CreatorOptions) => Promise<any>;
    readBookmarks: ({ folder, ...window }?: any) => Promise<any>;
    searchSources: ({
      query,
      limit,
      maxPages,
      processedIds,
    }?: any) => Promise<any>;
  }["collectSources"];
  #readCreator!: {
    collectSources: ({ processedIds, maxPages, limit }?: any) => Promise<any>;
    readCreator: (args: import("./types.js").CreatorOptions) => Promise<any>;
    readBookmarks: ({ folder, ...window }?: any) => Promise<any>;
    searchSources: ({
      query,
      limit,
      maxPages,
      processedIds,
    }?: any) => Promise<any>;
  }["readCreator"];
  #readBookmarks!: {
    collectSources: ({ processedIds, maxPages, limit }?: any) => Promise<any>;
    readCreator: (args: import("./types.js").CreatorOptions) => Promise<any>;
    readBookmarks: ({ folder, ...window }?: any) => Promise<any>;
    searchSources: ({
      query,
      limit,
      maxPages,
      processedIds,
    }?: any) => Promise<any>;
  }["readBookmarks"];
  #searchSources!: {
    collectSources: ({ processedIds, maxPages, limit }?: any) => Promise<any>;
    readCreator: (args: import("./types.js").CreatorOptions) => Promise<any>;
    readBookmarks: ({ folder, ...window }?: any) => Promise<any>;
    searchSources: ({
      query,
      limit,
      maxPages,
      processedIds,
    }?: any) => Promise<any>;
  }["searchSources"];
  #readExploreRecommendations!: ReturnType<
    typeof createPlatformCollections
  >["readExploreRecommendations"];
  #readHomeRecommendations!: ReturnType<
    typeof createPlatformCollections
  >["readHomeRecommendations"];
  #createPlatformDiagnosticsResult!: ReturnType<
    typeof createPlatformDiagnostics
  >;
  #followStage!: {
    followStage: (action: any, stage: any, run: any) => Promise<any>;
    captureProof: ({ observation }: any) => {
      followDiagnostics?: any[] | undefined;
      capturedAt: string;
      observation: any;
    };
  }["followStage"];
  #captureProof!: {
    followStage: (action: any, stage: any, run: any) => Promise<any>;
    captureProof: ({ observation }: any) => {
      followDiagnostics?: any[] | undefined;
      capturedAt: string;
      observation: any;
    };
  }["captureProof"];
  #createPlatformWritingResult!: ReturnType<typeof createPlatformWriting>;
  #compose!: {
    compose: (action: any) => Promise<any>;
    findSubmission: (
      action: any,
      context?: { phase?: "baseline" },
    ) => Promise<any>;
    submitFollow: (action: any) => Promise<any>;
    submitPost: (action: any) => Promise<any>;
    submitReply: (action: any) => Promise<any>;
  }["compose"];
  #findSubmission!: {
    compose: (action: any) => Promise<any>;
    findSubmission: (
      action: any,
      context?: { phase?: "baseline" },
    ) => Promise<any>;
    submitFollow: (action: any) => Promise<any>;
    submitPost: (action: any) => Promise<any>;
    submitReply: (action: any) => Promise<any>;
  }["findSubmission"];
  #submitFollow!: {
    compose: (action: any) => Promise<any>;
    findSubmission: (
      action: any,
      context?: { phase?: "baseline" },
    ) => Promise<any>;
    submitFollow: (action: any) => Promise<any>;
    submitPost: (action: any) => Promise<any>;
    submitReply: (action: any) => Promise<any>;
  }["submitFollow"];
  #submitPost!: {
    compose: (action: any) => Promise<any>;
    findSubmission: (
      action: any,
      context?: { phase?: "baseline" },
    ) => Promise<any>;
    submitFollow: (action: any) => Promise<any>;
    submitPost: (action: any) => Promise<any>;
    submitReply: (action: any) => Promise<any>;
  }["submitPost"];
  #submitReply!: {
    compose: (action: any) => Promise<any>;
    findSubmission: (
      action: any,
      context?: { phase?: "baseline" },
    ) => Promise<any>;
    submitFollow: (action: any) => Promise<any>;
    submitPost: (action: any) => Promise<any>;
    submitReply: (action: any) => Promise<any>;
  }["submitReply"];
  #createPlatformCapabilitiesResult!: ReturnType<
    typeof createPlatformCapabilities
  >;
  #preflight!: { preflight: ({ operation, input }: any) => any }["preflight"];
  readPostComments!: (args: any) => Promise<any>;
  readThreadLikeWindow!: (args: any) => Promise<any>;
  advanceThreadLikes!: (args: any) => Promise<any>;
  likeThreadPost!: (args: any) => Promise<any>;
  likePost!: (target: any) => Promise<any>;
  preflight!: ({ operation, input }: any) => any;
  readCreator!: (args: import("./types.js").CreatorOptions) => Promise<any>;
  readPeople!: (args: any) => Promise<any>;
  readAccount!: ReturnType<typeof createPlatformObservation>["readAccount"];
  readBookmarks!: ({ folder, ...window }?: any) => Promise<any>;
  searchSources!: ({
    query,
    limit,
    maxPages,
    processedIds,
  }?: any) => Promise<any>;
  readExploreRecommendations!: ReturnType<
    typeof createPlatformCollections
  >["readExploreRecommendations"];
  readHomeRecommendations!: ReturnType<
    typeof createPlatformCollections
  >["readHomeRecommendations"];
  readFeedback!: ({ targets, replyLimit }?: any) => Promise<any>;
  readPerson!: (target: any) => Promise<any>;
  readPost!: (target: any) => Promise<any>;
  findSubmission!: (
    action: any,
    context?: { phase?: "baseline" },
  ) => Promise<any>;
  submitFollow!: (action: any) => Promise<any>;
  submitPost!: (action: any) => Promise<any>;
  submitReply!: (action: any) => Promise<any>;
  captureProof!: ({ observation }: any) => {
    followDiagnostics?: any[] | undefined;
    capturedAt: string;
    observation: any;
  };
  constructor(browser: any, { clock = () => Date.now() }: any = {}) {
    this.#clock = clock;
    this.#createPlatformObservationResult = createPlatformObservation({
      browser: browser,
      clock: this.#clock,
    });
    const { missing, observed, open, ready, choose } =
      this.#createPlatformObservationResult;
    this.#missing = missing;
    this.#observed = observed;
    this.#open = open;
    this.#ready = ready;
    this.#choose = choose;
    const threadLikes = new PlatformThreadLikes({
      browser,
      open,
      ready,
      observed,
    });
    this.readThreadLikeWindow =
      threadLikes.readThreadLikeWindow.bind(threadLikes);
    this.readPostComments = threadLikes.readPostComments.bind(threadLikes);
    this.advanceThreadLikes = threadLikes.advanceThreadLikes.bind(threadLikes);
    this.likeThreadPost = threadLikes.likeThreadPost.bind(threadLikes);
    this.#createPlatformTargetsResult = createPlatformTargets({
      observed: this.#observed,
      open: this.#open,
      browser: browser,
      ready: this.#ready,
    });
    const { readFeedback, readPerson, readPost } =
      this.#createPlatformTargetsResult;
    this.likePost = this.#createPlatformTargetsResult.likePost;
    this.#readAccount = this.#createPlatformObservationResult.readAccount;
    this.#readFeedback = readFeedback;
    this.#readPerson = readPerson;
    this.#readPost = readPost;
    this.#createPlatformCollectionsResult = createPlatformCollections({
      ready: this.#ready,
      observed: this.#observed,
      browser: browser,
      choose: this.#choose,
    });
    const {
      collectSources,
      readCreator,
      readBookmarks,
      searchSources,
      readExploreRecommendations,
      readHomeRecommendations,
    } = this.#createPlatformCollectionsResult;
    this.#collectSources = collectSources;
    this.#readCreator = readCreator;
    this.#readBookmarks = readBookmarks;
    this.#searchSources = searchSources;
    this.#readExploreRecommendations = readExploreRecommendations;
    this.#readHomeRecommendations = readHomeRecommendations;
    this.#createPlatformDiagnosticsResult = createPlatformDiagnostics({
      clock: this.#clock,
    });
    const { followStage, captureProof } = this.#createPlatformDiagnosticsResult;
    this.#followStage = followStage;
    this.#captureProof = captureProof;
    this.#createPlatformWritingResult = createPlatformWriting({
      observed: this.#observed,
      browser: browser,
      followStage: this.#followStage,
      readPerson: this.#readPerson,
      open: this.#open,
      clock: this.#clock,
      readPost: this.#readPost,
    });
    const { compose, findSubmission, submitFollow, submitPost, submitReply } =
      this.#createPlatformWritingResult;
    this.#compose = compose;
    this.#findSubmission = findSubmission;
    this.#submitFollow = submitFollow;
    this.#submitPost = submitPost;
    this.#submitReply = submitReply;
    this.#createPlatformCapabilitiesResult = createPlatformCapabilities({
      missing: this.#missing,
      browser: browser,
    });
    const { preflight } = this.#createPlatformCapabilitiesResult;
    this.#preflight = preflight;
    this.preflight = this.#preflight;
    this.readCreator = this.#readCreator;
    this.readAccount = this.#readAccount;
    this.readBookmarks = this.#readBookmarks;
    this.searchSources = this.#searchSources;
    this.readExploreRecommendations = this.#readExploreRecommendations;
    this.readHomeRecommendations = this.#readHomeRecommendations;
    this.readFeedback = this.#readFeedback;
    this.readPerson = this.#readPerson;
    this.readPeople = this.#createPlatformTargetsResult.readPeople;
    this.readPost = this.#readPost;
    this.findSubmission = this.#findSubmission;
    this.submitFollow = this.#submitFollow;
    this.submitPost = this.#submitPost;
    this.submitReply = this.#submitReply;
    this.captureProof = this.#captureProof;
  }
}
export function createXPlatform(
  ...args: ConstructorParameters<typeof XPlatform>
): any {
  return new XPlatform(...args);
}
