import {
  createXGrowthHarness,
  type FollowBlueCheckException,
  type XGrowthHarness,
  type CuaTab,
  type ReadResult,
  type PostMediaResult,
} from "../dist/index.js";
declare const policyProof: string;
declare const membershipProof: string;
const blueException: FollowBlueCheckException = {
  kind: "follow-blue-check",
  userAuthorized: true,
  actionId: "follow-reviewed",
  handle: "reader",
  accountHandle: "operator",
  evidenceRef: policyProof,
  scopeEvidenceRef: membershipProof,
  expiresAt: "2026-12-01T12:00:00Z",
};
declare const tab: CuaTab;
const api: XGrowthHarness = createXGrowthHarness({
  tab,
  ledgerPath: "/original/day.md",
  proofDirectory: "/proof",
});
const read: Promise<ReadResult> = api.readPost({
  target: {
    postId: "123",
    url: "https://x.com/a/status/123",
    evidenceRef: "/proof",
  },
  mode: "decision",
});
void read;
api.runGrowthRound({
  taskId: "round",
  maxActions: 1,
  decision: {
    actionId: "follow-reviewed",
    approved: true,
    evidenceRef: policyProof,
    blue: null,
    chinese: true,
    blueCheckException: blueException,
  },
});
const connected = createXGrowthHarness({
  ledgerPath: "/original/day.md",
  proofDirectory: "/proof",
  connection: {
    check: async () => [],
    openTab: async () => tab,
  },
});
connected.then((result) => {
  if (result.status === "ready") result.harness.inspectAccount();
  else result.diagnostic.code;
});
// @ts-expect-error The asynchronous connection cannot be used as a bound harness.
connected.inspectAccount();
api.publishPost({ taskId: "round", draftPath: "/draft.post.md" });
// @ts-expect-error The root does not expose preflight or lower browser actions.
api.preflight({ operation: "submitPost" });
// @ts-expect-error An observed post requires ID, URL and evidence.
api.readPost({ target: { postId: "123" } });
// @ts-expect-error An unsupported output mode cannot leak raw observations.
api.searchSources({ query: "AI", mode: "raw" });
// @ts-expect-error Both app and tab cannot be selected.
createXGrowthHarness({
  tab,
  app: { getAXState: async () => ({}) },
  ledgerPath: "/day",
  proofDirectory: "/proof",
});
// @ts-expect-error There is no submitPost root export.
import { submitPost } from "../dist/index.js";

// @ts-expect-error Prepared follow objects require observed target and identity evidence.
const incomplete: import("../dist/index.js").PreparedAction = {
  id: "a",
  kind: "follow",
  status: "prepared",
  accountHandle: "a",
  accountURL: "https://x.com/a",
  accountEvidenceRef: "/proof",
  quality: { approved: true, evidenceRef: "/proof" },
};
void incomplete;

api.readCreator({ handle: "creator", target: 10, mode: "decision" });
// @ts-expect-error Creator collection accepts a typed count, not a string.
api.readCreator({ handle: "creator", target: "10" });

api
  .likePostAndComments({ url: "https://x.com/a/status/123", sampleRate: 0.6 })
  .then((result) => {
    const coverage: false = result.scopeComplete;
    void coverage;
    result.counts.newLikesThisCall;
  });
// @ts-expect-error No precollected target list is needed/accepted.
api.likePostAndComments({ targets: [] });

const media: Promise<PostMediaResult> = api.readPostMedia({
  target: {
    postId: "123",
    url: "https://x.com/peer/status/123",
    evidenceRef: "/proof",
  },
  maxImages: 4,
});
void media;
