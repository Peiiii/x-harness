import {
  createXGrowthHarness,
  type XGrowthHarness,
  type CuaTab,
  type ReadResult,
} from "../dist/index.js";
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
