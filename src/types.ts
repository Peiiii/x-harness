/** Public business contract. Raw browser observations never cross this interface. */
export type OperationKind = "follow" | "original" | "reply";
export type ReadMode = "receipt" | "decision" | "delta";
export type EvidenceRef = string;
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
export interface PostEvidence {
  id: string | null;
  author?: string | null;
  datetime?: string | null;
  url?: string | null;
  body?: string | null;
  images?: ImageEvidence[];
  media?: MediaEvidence[];
  links?: (string | LinkEvidence)[];
  metrics?: string[];
  quoted?: boolean;
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
export interface ReadResult {
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
  sources?: PostEvidence[];
  post?: PostEvidence;
  person?: PersonEvidence;
  feedback?: FeedbackEvidence[];
  unchangedIds?: string[];
  creator?: CreatorEvidence;
}
export interface WindowOptions {
  mode?: ReadMode;
  limit?: number;
  maxPages?: number;
  processedIds?: string[];
}
export interface IncomingReplyOptions extends WindowOptions {}
export interface BookmarkOptions extends WindowOptions {
  folder: string;
}
export interface SearchOptions extends WindowOptions {
  query: string;
}
export interface CreatorOptions {
  handle: string;
  target?: number;
  maxScrolls?: number;
  navigate?: boolean;
  expand?: boolean;
  mode?: ReadMode;
}
export interface CreatorEvidence {
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
export interface QualityReview {
  approved: boolean;
  evidenceRef: EvidenceRef;
  approvedText?: string;
  draftFingerprint?: string;
  handle?: string;
  blue?: boolean;
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
        text: string;
        composeURL: string;
        composeEvidenceRef: EvidenceRef;
        assets?: { path: string; alt: string }[];
        activation?: "click" | "keyboard";
      }
    | {
        kind: "reply";
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
      blue?: boolean;
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
export interface FollowOptions {
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
export interface Executor {
  id: string;
  scopeKinds: OperationKind[];
  evidenceRef: EvidenceRef;
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
    evaluate<T, A>(fn: (arg: A) => T, arg: A): Promise<T>;
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
export interface XGrowthHarness {
  readCreator(args: CreatorOptions): Promise<ReadResult>;
  readBookmarks(args: BookmarkOptions): Promise<ReadResult>;
  searchSources(args: SearchOptions): Promise<ReadResult>;
  readIncomingReplies(args?: IncomingReplyOptions): Promise<ReadResult>;
  readPost(args: { target: PostTarget; mode?: ReadMode }): Promise<ReadResult>;
  readPerson(args: {
    target: PersonTarget;
    mode?: ReadMode;
  }): Promise<ReadResult>;
  readFeedback(args: FeedbackOptions): Promise<ReadResult>;
  inspectAccount(args?: { mode?: ReadMode }): Promise<ReadResult>;
  inspectRound(args: { taskId: string }): Promise<RoundResult>;
  runGrowthRound(args: RoundOptions): Promise<RoundResult>;
  followBatch(args: FollowOptions): Promise<BatchResult>;
  followOne(args: { taskId: string; handle: string }): Promise<ActionResult>;
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
  }): Promise<ActionResult>;
  verifyFollow(args: {
    handle: string;
    url?: string;
    evidenceRef?: EvidenceRef;
    mode?: "receipt" | "decision";
  }): Promise<ReadResult & { handle: string; verified: boolean }>;
}
