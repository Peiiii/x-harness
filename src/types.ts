/** Public business contract. Raw browser observations never cross this interface. */
export type OperationKind = "follow" | "original" | "reply";
export type ReadMode = "receipt" | "decision" | "delta";
export type EvidenceRef = string;
export interface PostCommentsOptions {
  target: PostTarget;
  maxPages?: number;
  timeBudgetMs?: number;
  processedIds?: string[];
  mode?: ReadMode;
}
export interface PostTarget {
  postId: string;
  url: string;
  evidenceRef: EvidenceRef;
}
export interface PersonTarget {
  handle: string;
  url: string;
  evidenceRef: EvidenceRef;
}
export interface ImageEvidence {
  src?: string | null;
  alt?: string | null;
}
export interface MediaEvidence {
  kind?: string;
  src?: string | null;
  poster?: string | null;
  label?: string | null;
  duration?: string | number;
  requiresViewing?: boolean;
}
export interface LinkEvidence {
  href: string;
  text?: string;
  label?: string;
}
export interface AuthorIdentityEvidence {
  handle: string;
  profileURL: string;
  name?: string | null;
  source: "post-card";
  blue: true | null;
  missing: string[];
}
export interface PostEvidence {
  id: string | null;
  author?: string | null;
  authorIdentity?: AuthorIdentityEvidence;
  datetime?: string | null;
  url?: string | null;
  body?: string | null;
  images?: ImageEvidence[];
  media?: MediaEvidence[];
  links?: (string | LinkEvidence)[];
  metrics?: string[];
  replyToId?: string | null;
  quoted?: boolean;
  quoteCards?: Array<{
    text: string;
    datetime: string;
    body?: string;
    author?: string | null;
    links?: string[];
  }>;
  quoteSource?: {
    id: string;
    url: string;
    author: string;
    datetime: string;
    body: string;
    parentId: string;
    cardText: string;
  };
  videoElements?: number;
  needsExpansion?: boolean;
  missing?: string[];
}
export interface CounterEvidence {
  value?: number | null;
  raw?: string | null;
  text?: string | string[] | null;
  precision?: string;
  url?: string | null;
}
export interface PersonEvidence {
  handle: string;
  url?: string;
  blue?: boolean | null;
  relationship?: string;
  biography?: string | null;
  following?: CounterEvidence | null;
  followers?: CounterEvidence | null;
}
export interface FeedbackEvidence {
  id: string;
  metrics?: (string | { label?: string; value?: string | number })[];
  replies?: PostEvidence[];
  unconfirmedReplyIds?: string[];
  pageComplete?: boolean;
  missing?: string[];
}
export interface Diagnostic {
  operation?: string;
  category?: string;
  code: string;
  next?: "inspect-local-proof" | "restore-proof-store";
  evidenceRef?: EvidenceRef;
}
export interface SourceOriginEvidence {
  kind: "explore-recommendations" | "home-recommendations";
  page: string;
  selectedTab: "为你推荐" | "For you";
}
export interface ReadResult {
  excludedSourceIds?: string[];
  status: "observed" | "needsDecision" | "needsCapability";
  fresh?: boolean;
  complete?: boolean;
  pageComplete?: boolean;
  evidenceRef?: EvidenceRef;
  ids?: string[];
  missing?: string[];
  reason?: string;
  diagnostic?: Diagnostic;
  accountHandle?: string | null;
  accountURL?: string | null;
  people?: PersonEvidence[];
  offset?: number;
  renderedPeople?: number;
  moreInDOM?: boolean;
  folders?: string[];
  folder?: string;
  folderEvidence?: { entryPage?: string; selectedPage?: string; name?: string };
  paginationBoundary?: {
    kind?: string;
    lastId?: string;
    renderedCount?: number;
    waitMs?: number;
    scopeComplete?: boolean;
    rootId?: string;
    pages?: number;
    hiddenOrUnavailable?: "unknown";
  };
  sources?: PostEvidence[];
  sourceOrigin?: SourceOriginEvidence;
  post?: PostEvidence;
  context?: PostEvidence[];
  threadPosts?: PostEvidence[];
  person?: PersonEvidence;
  feedback?: FeedbackEvidence[];
  unchangedIds?: string[];
  creator?: CreatorEvidence;
}
export interface FollowbackAuditOptions {
  direction?: "both" | "followback";
  /** Positive-only seed-network discovery; requires direction: "followback". */
  viewer?: { handle: string; evidenceRef: EvidenceRef };
  /** Bounded positive-only discovery; never an all-followers count. Requires viewer. */
  followerSubset?: "verified";
  /** Explicit user permission for this read task during 00–07; never authorizes writes. */
  nightReadAuthorization?: {
    userAuthorized: boolean;
    evidenceRef: EvidenceRef;
    expiresAt: string;
  };
  following: { url: string; evidenceRef: EvidenceRef; expectedCount?: number };
  followers: { url: string; evidenceRef: EvidenceRef; expectedCount?: number };
  maxWindows?: number;
  scanId?: string;
  resumeEvidenceRef?: EvidenceRef;
}
export interface FollowbackAuditResult {
  direction: "both" | "followback";
  viewerHandle?: string;
  listOwnerHandle?: string;
  followerSubset?: "verified";
  status: "observed" | "needsDecision" | "waiting";
  scanId: string;
  complete: boolean;
  followingComplete: boolean;
  followersComplete: boolean;
  followingCount: number;
  followersCount: number;
  mutualCount: number;
  notFollowedBackCount: number;
  nonFollowerCount: number;
  provisionalCount: number;
  evidenceRef: EvidenceRef;
  startedAt: string;
  observedAt: string;
  reason?: string;
}
export interface PeopleOptions {
  target: { url: string; evidenceRef: EvidenceRef };
  offset?: number;
  limit?: number;
  /** Existing bulk window: explicit true allows a limit up to 1000. */
  bulk?: boolean;
  /** Reset an observed list to its confirmed start before collecting. */
  reset?: boolean;
  advance?: boolean;
  mode?: ReadMode;
}
export interface WindowOptions {
  /** Skip known authors before expanding source cards. Does not approve other sources. */
  excludedHandles?: string[];
  mode?: ReadMode;
  limit?: number;
  maxPages?: number;
  processedIds?: string[];
}
export interface IncomingReplyOptions extends WindowOptions {}
export interface ThreadLikeOptions {
  url: string;
  reuseCurrentPage?: boolean;
  batchId?: string;
  sampleRate?: number;
  maxLikes?: number;
  maxPages?: number;
  timeBudgetMs?: number;
}
export interface ThreadLikeResult {
  status: "verified" | "checkpoint" | "waiting" | "unknown" | "needsDecision";
  batchId: string;
  url: string;
  scopeComplete: false;
  reason?: string;
  resumeAt?: string;
  evidenceRef?: string;
  counts: {
    observed: number;
    selected: number;
    verified: number;
    preexisting: number;
    skipped: number;
    unknown: number;
    pending: number;
    newLikesThisCall: number;
  };
}
export interface IncomingLikeOptions {
  batchId: string;
  targets: (PostTarget & { author: string; incomingEvidenceRef: string })[];
  sampleRate?: number;
}
export interface IncomingLikeResult {
  status: "verified" | "waiting" | "needsDecision" | "unknown";
  results: { postId: string; status: string; evidenceRef?: string }[];
  resumeAt?: string;
  reason?: string;
}
export interface IncomingConversationOptions extends IncomingReplyOptions {
  targets?: PostTarget[];
}
export interface IncomingConversationResult {
  sourceComplete?: boolean;
  status: "observed" | "needsDecision" | "needsCapability";
  missing?: string[];
  evidenceRef?: string;
  diagnostic?: Diagnostic;
  reason?: string;
  pageComplete: false;
  conversations: {
    targetId: string;
    post?: PostEvidence;
    ancestorPath: PostEvidence[];
    nodes: PostEvidence[];
    edges: { parentId: string; childId: string }[];
    unconfirmedParentIds: string[];
    rootCandidateId: string | null;
    attempts: {
      id: string;
      status: string;
      postId: string;
      publicId?: string;
      round?: number;
    }[];
    evidenceRef?: string;
    complete: boolean;
    missing: string[];
    pageComplete: false;
  }[];
}
export interface BookmarkOptions extends WindowOptions {
  folder?: string;
  /** Continue the currently observed named-folder window without reselecting it. */
  resume?: boolean;
  /** Discover names only; never read all bookmarks as a named folder. */
  discoverOnly?: boolean;
}
export interface SearchOptions extends WindowOptions {
  query: string;
  /** Continue only the currently confirmed exact query without reopening its top. */
  resume?: boolean;
}
export interface ReplyDiscoveryOptions {
  queries: string[];
  target?: number;
  maxWindows?: number;
  processedIds?: string[];
  excludedHandles?: string[];
  /** Omitted: 20 likes. Explicit null disables only the likes gate. */
  minLikes?: number | null;
  maxAgeHours?: number;
  chineseOnly?: boolean;
}
export interface ReplyDiscoveryResult {
  status: "observed" | "needsDecision";
  reason?: string;
  candidates: {
    post: PostEvidence;
    evidenceRef: EvidenceRef;
    query: string;
    requiresReview: true;
  }[];
  examinedIds: string[];
  windows: {
    query: string;
    evidenceRef?: EvidenceRef;
    status: ReadResult["status"];
    missing: string[];
    observed: number;
  }[];
  rejections: Record<string, number>;
  targetReached: boolean;
  pageComplete: false;
  evidenceRef?: EvidenceRef;
}
export interface ExploreRecommendationOptions extends WindowOptions {}
export interface HomeRecommendationOptions extends WindowOptions {}
export interface CreatorOptions {
  handle: string;
  /** Explicitly select the observed profile Replies tab; default remains Posts. */
  timeline?: "posts" | "replies";
  target?: number;
  maxScrolls?: number;
  navigate?: boolean;
  expand?: boolean;
  mode?: ReadMode;
}
export interface CreatorEvidence {
  timeline?: { kind: "replies"; page: string; selectedTab: string };
  name?: string | null;
  joined?: string | null;
  totalPostsText?: string | null;
  externalLinks?: string[];
  scrolls?: number;
  observedAt?: string;
}
export interface FeedbackOptions {
  targets: PostTarget[];
  replyLimit?: number;
  mode?: ReadMode;
}
export interface FollowBlueCheckException {
  kind: "follow-blue-check";
  userAuthorized: true;
  actionId: string;
  handle: string;
  accountHandle: string;
  /** Explicit policy authorization and observed source-membership proof. */
  evidenceRef: EvidenceRef;
  scopeEvidenceRef: EvidenceRef;
  expiresAt: string;
}
export interface QualityReview {
  approved: boolean;
  evidenceRef: EvidenceRef;
  approvedText?: string;
  draftFingerprint?: string;
  handle?: string;
  blue?: boolean | null;
  blueCheckException?: FollowBlueCheckException;
  chinese?: boolean;
}
interface PreparedActionBase {
  id: string;
  status: "prepared";
  accountHandle: string;
  accountURL: string;
  accountEvidenceRef: EvidenceRef;
  quality: QualityReview;
}
export type PreparedAction = PreparedActionBase &
  (
    | { kind: "follow"; handle: string; url: string; evidenceRef: EvidenceRef }
    | {
        kind: "original";
        draftPath: string;
        notBefore?: string;
        /** Exclusive publication deadline; does not block unknown recovery. */
        notAfter?: string;
        text: string;
        composeURL: string;
        composeEvidenceRef: EvidenceRef;
        quoteTarget?: PostTarget;
        assets?: { path: string; alt: string }[];
        activation?: "click" | "keyboard";
      }
    | {
        kind: "reply";
        conversation?: {
          recipientHandle: string;
          rootId: string;
          round: number;
          automatedLoop?: boolean;
        };
        postId: string;
        url: string;
        evidenceRef: EvidenceRef;
        text: string;
        assets?: { path: string; alt: string }[];
        activation?: "click" | "keyboard";
      }
  );
export interface ExecutionDecision {
  actionId?: string;
  kind?: OperationKind;
  status?: string;
  reason?: string;
  missing?: string[];
  resumeAt?: string;
  owner?: string;
  evidenceRef?: EvidenceRef;
}
export interface ActionResult {
  status:
    | "verified"
    | "unknown"
    | "prepared"
    | "skipped"
    | "preexisting"
    | "waiting"
    | "needsDecision"
    | "needsCapability";
  taskId: string;
  actionId?: string;
  publicId?: string;
  publicURL?: string;
  evidenceRef?: EvidenceRef;
  reason?: string;
  missing?: string[];
  resumeAt?: string;
  diagnostic?: Diagnostic;
}
export interface RoundResult {
  diagnostic?: Diagnostic;
  status: string;
  taskId: string;
  mayEnd: boolean;
  scopeKinds?: OperationKind[];
  actual?: Partial<
    Record<OperationKind, { verified: number; unknown: number }>
  >;
  gaps?: { kind: OperationKind; remaining: number; unknown: number }[];
  decision?: ExecutionDecision[];
  evidenceRef?: EvidenceRef;
  settlementErrors?: string[];
  checkpoint?: {
    taskId: string;
    executorId: string;
    completed: number;
    resume: string;
  };
}
export interface BatchResult {
  diagnostic?: Diagnostic;
  status: string;
  taskId: string;
  batchId?: string;
  planned: number;
  attempted: number;
  verified: number;
  unknown: number;
  remaining: number;
  mayEnd: boolean;
  evidenceRef?: EvidenceRef;
  decision?: ExecutionDecision[];
}
export type RoundDecision =
  | {
      type: "prepareActions";
      accountHandle: string;
      ownershipEvidenceRef: EvidenceRef;
      actions: PreparedAction[];
      attemptsCoverage?: {
        complete: boolean;
        since: string;
        evidenceRef: EvidenceRef;
      };
      sharedAttempts?: { kind: OperationKind; at: string }[];
      nextScheduledCheckAt?: string;
    }
  | {
      actionId: string;
      approved: boolean;
      evidenceRef: EvidenceRef;
      approvedText?: string;
      draftFingerprint?: string;
      blue?: boolean | null;
      blueCheckException?: FollowBlueCheckException;
      chinese?: boolean;
    };
export interface RoundOptions {
  taskId: string;
  decision?: RoundDecision;
  /** 0 with prepareActions persists the reviewed queue without reads or writes. */
  maxActions?: number;
}
export interface IndependentExecution {
  tabId: string;
  evidenceRef: EvidenceRef;
  scopeEvidenceRef: EvidenceRef;
  windowAuthorization?: {
    actionId: string;
    userAuthorized: true;
    expiresAt: string;
    evidenceRef: EvidenceRef;
  };
}
export interface OriginalCadenceOptions {
  taskId: string;
  minGapMs: number;
  userAuthorized: boolean;
  evidenceRef: EvidenceRef;
}
export interface PublishOptions {
  taskId: string;
  draftPath: string;
  preparedAction?: Extract<PreparedAction, { kind: "original" }>;
  independentExecution?: IndependentExecution;
}
export interface ReplyOptions {
  taskId: string;
  postId: string;
  text: string;
  preparedAction?: Extract<PreparedAction, { kind: "reply" }>;
}
export interface FollowPacing {
  minGapMs: number;
  maxGapMs: number;
}
export interface FollowOptions {
  pacing?: FollowPacing;
  taskId: string;
  handles: string[];
  preparedActions?: Extract<PreparedAction, { kind: "follow" }>[];
}
export interface SourceLinkEvidence {
  href: string;
  resolvedURL: string;
  evidenceRef: EvidenceRef;
  renderedText?: string;
}
export interface VerifiedTargetPlanOptions {
  taskId: string;
  kind: OperationKind;
  target: number;
  sourceCategories?: string[];
  excludedActionIds?: string[];
  userAuthorized: boolean;
  evidenceRef: EvidenceRef;
}
export interface VerifiedTargetPlanResult {
  status: "planned" | "needsDecision";
  reason?: string;
  kind?: OperationKind;
  target?: number;
  matchedVerified?: number;
  remaining?: number;
  capacity?: number;
  preservedUnknown?: number;
  goalEvidenceRef?: EvidenceRef;
  evidenceRef?: EvidenceRef;
}
export interface Executor {
  id: string;
  scopeKinds: OperationKind[];
  evidenceRef: EvidenceRef;
  replyMaxRootAgeHours?: number;
}
/** Structural host ports: the package reuses the provided CUA connection. */
export interface LocatorPort {
  count(): Promise<number>;
  click(options?: unknown): Promise<unknown>;
  fill(value: string): Promise<unknown>;
  first(): LocatorPort;
  waitFor(options: unknown): Promise<unknown>;
  press?(key: string, options?: unknown): Promise<unknown>;
  all?(): Promise<LocatorPort[]>;
  getByRole?(role: string, options?: unknown): LocatorPort;
}
export interface CuaTab {
  id?: string;
  url(): Promise<string>;
  goto?(url: string): Promise<unknown>;
  reload?(): Promise<unknown>;
  screenshot?(): Promise<unknown>;
  getAXState?(options: unknown): Promise<unknown>;
  scroll?(
    target: number | [number, number],
    direction: string,
    pages?: number,
  ): Promise<unknown>;
  playwright: {
    evaluate<T, A>(
      fn: (arg: A) => T,
      arg: A,
      options?: { timeoutMs?: number },
    ): Promise<T>;
    getByRole?(role: string, options?: unknown): LocatorPort;
    getByText?(text: string, options?: unknown): LocatorPort;
    locator?(selector: string): LocatorPort;
    waitForURL?(url: unknown, options?: unknown): Promise<unknown>;
    waitForLoadState?(options: unknown): Promise<unknown>;
  };
}
export interface CuaApp {
  getAXState(options: unknown): Promise<unknown>;
  click?(index: number): Promise<unknown>;
  pressKey?(key: string): Promise<unknown>;
  paste?(value: string): Promise<unknown>;
}
export type HarnessOptions = (
  { tab: CuaTab; app?: never } | { app: CuaApp; tab?: never }
) & {
  ledgerPath: string;
  proofDirectory: string;
  clock?: () => number;
  executor?: Executor;
};
export type HostConnectionOptions = Pick<
  HarnessOptions,
  "ledgerPath" | "proofDirectory" | "clock" | "executor"
> & {
  tab?: never;
  app?: never;
  connection: {
    /** A documented, read-only host call; never create a tab or submit here. */
    check(): Promise<unknown>;
    /** A documented owned-tab creation/binding; called at most once. */
    openTab(): Promise<CuaTab>;
  };
};
export interface HostConnectionReceipt {
  phase: "check" | "open-tab" | "bind" | "ready";
  checkAttempts: number;
  openAttempts: number;
  recovered: boolean;
  durationMs: number;
  evidenceRef?: EvidenceRef;
}
export type HostConnectionResult =
  | {
      status: "ready";
      harness: XGrowthHarness;
      tab: CuaTab;
      connection: HostConnectionReceipt;
    }
  | {
      status: "needsDecision";
      reason: string;
      connection: HostConnectionReceipt;
      diagnostic: Diagnostic;
      /** Present if creation succeeded; preserve this tab, never create another blindly. */
      tab?: CuaTab;
    };

export interface FollowPriorityOptions {
  taskId: string;
  follow: FollowOptions & {
    executor: Executor;
    recoveryTargets?: {
      handle: string;
      url?: string;
      evidenceRef?: EvidenceRef;
    }[];
  };
  reply: {
    actions: PreparedAction[];
    verifiedTarget?: Omit<VerifiedTargetPlanOptions, "taskId" | "kind">;
  };
}
export interface FollowPriorityResult {
  selected: "follow" | "reply" | "none";
  reason?: string;
  resumeAt?: string;
  followResult?: BatchResult;
  replyResult?: {
    status: "verified" | "needsDecision";
    reason?: string;
    results: ActionResult[];
  };
}
export interface ReplyBatchOptions {
  likeTargetAfterVerified?: boolean;
  taskId: string;
  actions: PreparedAction[];
  followPriorityExecutorId?: string;
  verifiedTarget?: Omit<VerifiedTargetPlanOptions, "taskId" | "kind">;
  threadLikes?: Omit<ThreadLikeOptions, "url" | "batchId">;
  /** Deterministic project admission may deny a new reply, never waive root guards. */
  beforeReply?: (
    action: PreparedAction,
  ) => Promise<{ allowed: boolean; reason?: string }>;
}
export interface ReplyBatchResult {
  targetLikes?: { actionId: string; result: ThreadLikeResult }[];
  status: "verified" | "needsDecision";
  reason?: string;
  results: ActionResult[];
  threadLikes?: {
    actionId: string;
    rootPostId: string;
    result: ThreadLikeResult;
  }[];
  interactionStatus?:
    "verified" | "checkpoint" | "waiting" | "unknown" | "needsDecision";
  interactionReason?: string;
  pendingLikeActionIds?: string[];
  pendingReplyActionIds?: string[];
  interactionEvidenceRef?: EvidenceRef;
}
export interface XGrowthHarness {
  usageStatus?(): import("./usage.js").XUsageStatus;
  pinPost?(
    args: import("./profile-pin.js").PinOptions,
  ): Promise<import("./profile-pin.js").PinResult>;
  captureAccountScreenshot(
    options: AccountScreenshotOptions,
  ): Promise<AccountScreenshotResult>;
  runFollowPriorityBatch(
    args: FollowPriorityOptions,
  ): Promise<FollowPriorityResult>;
  likePostAndComments(args: ThreadLikeOptions): Promise<ThreadLikeResult>;
  planVerifiedTarget(
    args: VerifiedTargetPlanOptions,
  ): Promise<VerifiedTargetPlanResult>;
  replyBatch(args: ReplyBatchOptions): Promise<ReplyBatchResult>;
  likeIncomingBatch(args: IncomingLikeOptions): Promise<IncomingLikeResult>;
  readCreator(args: CreatorOptions): Promise<ReadResult>;
  readPeople(args: PeopleOptions): Promise<ReadResult>;
  readFollowbackAudit(
    args: FollowbackAuditOptions,
  ): Promise<FollowbackAuditResult>;
  readBookmarks(args: BookmarkOptions): Promise<ReadResult>;
  discoverReplyCandidates(
    args: ReplyDiscoveryOptions,
  ): Promise<ReplyDiscoveryResult>;
  searchSources(args: SearchOptions): Promise<ReadResult>;
  readExploreRecommendations(
    args?: ExploreRecommendationOptions,
  ): Promise<ReadResult>;
  readHomeRecommendations(
    args?: HomeRecommendationOptions,
  ): Promise<ReadResult>;
  readIncomingReplies(args?: IncomingReplyOptions): Promise<ReadResult>;
  readIncomingConversations(
    args?: IncomingConversationOptions,
  ): Promise<IncomingConversationResult>;
  readPost(args: {
    target: PostTarget;
    mode?: ReadMode;
    includeContext?: boolean;
    includeThread?: boolean;
    resolveQuote?: boolean;
  }): Promise<ReadResult>;
  readPerson(args: {
    target: PersonTarget;
    mode?: ReadMode;
  }): Promise<ReadResult>;
  readPostComments(args: PostCommentsOptions): Promise<ReadResult>;
  readFeedback(args: FeedbackOptions): Promise<ReadResult>;
  inspectAccount(args?: { mode?: ReadMode }): Promise<ReadResult>;
  inspectRound(args: { taskId: string }): Promise<RoundResult>;
  runGrowthRound(args: RoundOptions): Promise<RoundResult>;
  followBatch(args: FollowOptions): Promise<BatchResult>;
  followOne(args: { taskId: string; handle: string }): Promise<ActionResult>;
  configureOriginalCadence(
    options: OriginalCadenceOptions,
  ): Promise<Record<string, unknown>>;
  publishPost(args: PublishOptions): Promise<ActionResult>;
  replyToPost(args: ReplyOptions): Promise<ActionResult>;
  verifySubmission(args: {
    taskId: string;
    actionId: string;
  }): Promise<ActionResult>;
  verifyPublishedPost(args: {
    taskId: string;
    draftPath: string;
    publicURL: string;
    evidenceRef: EvidenceRef;
    sourceLink?: SourceLinkEvidence;
    sourceLinks?: SourceLinkEvidence[];
  }): Promise<ActionResult>;
  verifyFollow(args: {
    handle: string;
    url?: string;
    evidenceRef?: EvidenceRef;
    mode?: "receipt" | "decision";
  }): Promise<ReadResult & { handle: string; verified: boolean }>;
}

/** Capture the currently selected, fully loaded own-account surface. */
export interface AccountScreenshotOptions {
  surface: "analytics" | "revenue";
}

export type AccountScreenshotResult =
  | {
      status: "captured";
      surface: AccountScreenshotOptions["surface"];
      accountHandle: string;
      page: string;
      capturedAt: string;
      imagePath: string;
      imageMimeType: "image/png" | "image/jpeg";
      imageSha256: string;
      headings: string[];
      labels: string[];
      dataScope: "visible-viewport-only";
      imageKind: "real-screenshot";
      evidenceRef: EvidenceRef;
    }
  | { status: "needsCapability"; missing: string[] }
  | { status: "needsDecision"; reason: string; evidenceRef?: EvidenceRef };
