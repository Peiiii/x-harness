import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as root from "../dist/index.js";
import { createBusinessHarness, createXPlatform } from "../dist/diagnostics.js";
import { fixture, sourceFixture, NOW } from "./fixtures.mjs";
const business = (f) =>
  createBusinessHarness({
    platform: createXPlatform(f.browser, { clock: () => NOW }),
    store: f.store,
    clock: () => NOW,
  });
const small = (value) =>
  assert.ok(
    Buffer.byteLength(JSON.stringify(value)) <= 1024,
    JSON.stringify(value),
  );
const noise = "NOISE_SHOULD_NOT_LEAK".repeat(2000);

test("package root exposes only business factory; binding is inert and diagnostics stay separate", (t) => {
  assert.deepEqual(Object.keys(root), ["createXGrowthHarness"]);
  const f = fixture(t);
  let reads = 0;
  const api = root.createXGrowthHarness({
    tab: {
      id: "new-tab",
      playwright: {
        evaluate() {
          reads++;
        },
      },
    },
    ledgerPath: f.ledger,
    proofDirectory: f.dir,
  });
  assert.equal(reads, 0);
  for (const name of [
    "preflight",
    "resumeGrowthRound",
    "observe",
    "act",
    "store",
    "platform",
  ])
    assert.equal(api[name], undefined);
  for (const name of [
    "readPost",
    "readPerson",
    "readBookmarks",
    "followBatch",
    "publishPost",
    "runGrowthRound",
  ])
    assert.equal(typeof api[name], "function");
});

test("decision and delta whitelist nested source evidence, preserve entire body and keep original proof", async (t) => {
  const f = fixture(t),
    body = "完整目标正文。\n".repeat(500),
    source = {
      id: "11",
      author: "source",
      body,
      datetime: new Date(NOW).toISOString(),
      url: "https://x.com/source/status/11",
      images: [{ src: "image", alt: "实图", hidden: noise }],
      media: [{ kind: "video", requiresViewing: true, hidden: noise }],
      links: [
        { href: "https://example.com", text: "来源", hidden: noise },
        "/source",
        "/source/status/11",
        "/source/status/11/analytics",
        "/source/status/11/quotes",
      ],
      navigation: noise,
      hidden: noise,
    };
  let reads = 0;
  const platform = {
    preflight: () => ({ covered: true }),
    captureProof: ({ observation }) => ({ observation }),
    async searchSources() {
      reads++;
      return {
        sources: [source],
        complete: true,
        pageComplete: false,
        controls: noise,
        dom: noise,
        unknownField: noise,
      };
    },
  };
  const api = createBusinessHarness({ store: f.store, platform });
  const receipt = await api.searchSources({ query: "AI" });
  small(receipt);
  assert.equal(receipt.sources, undefined);
  const detail = await api.searchSources({ query: "AI", mode: "decision" });
  assert.equal(detail.sources[0].body, body);
  assert.deepEqual(detail.sources[0].links, [
    { href: "https://example.com", text: "来源" },
  ]);
  assert.doesNotMatch(
    JSON.stringify(detail),
    /NOISE_SHOULD_NOT_LEAK|hidden|navigation|controls|unknownField/,
  );
  assert.equal(
    JSON.parse(readFileSync(detail.evidenceRef)).observation.unknownField,
    noise,
  );
  const delta = await api.searchSources({ query: "AI", mode: "delta" });
  assert.deepEqual(delta.sources, []);
  assert.deepEqual(delta.unchangedIds, ["11"]);
  const second = await api.searchSources({ query: "AI", mode: "delta" });
  assert.deepEqual(second.unchangedIds, ["11"]);
  assert.deepEqual(second.sources, []);
  small(second);
  assert.equal(reads, 4);
});

test("top-level readPost expands one observed target once and filters adjacent articles", async (t) => {
  const f = fixture(t),
    calls = [],
    target = {
      postId: "11",
      url: "https://x.com/source/status/11",
      evidenceRef: f.proof,
    };
  let expanded = false;
  const browser = {
    capabilities: () => [],
    async observe() {
      calls.push("observe");
      return {
        page: target.url,
        accountHandle: "Pei",
        posts: [
          { id: "10", body: noise },
          {
            id: "11",
            author: "source",
            body: expanded ? "完整原文" : "片段",
            datetime: new Date(NOW).toISOString(),
            primary: "/source/status/11",
            needsExpansion: !expanded,
          },
        ],
        needsStateCheck: false,
        alerts: [],
      };
    },
    async act(c) {
      calls.push(c.operation);
      expanded = true;
    },
  };
  const api = createBusinessHarness({
    platform: createXPlatform(browser),
    store: f.store,
  });
  const result = await api.readPost({ target, mode: "decision" });
  assert.equal(result.complete, true);
  assert.equal(result.post.body, "完整原文");
  assert.equal(result.post.url, target.url);
  assert.doesNotMatch(JSON.stringify(result), /NOISE_SHOULD_NOT_LEAK/);
  assert.equal(calls.filter((c) => c === "expandPost").length, 1);
  const delta = await api.readPost({ target, mode: "delta" }),
    again = await api.readPost({ target, mode: "delta" });
  assert.equal(delta.post, undefined);
  assert.deepEqual(delta.unchangedIds, ["11"]);
  assert.equal(again.post, undefined);
  assert.deepEqual(again.unchangedIds, ["11"]);
});

test("top-level readPerson provides decision evidence and minimal default, without manual account/nav calls", async (t) => {
  const f = fixture(t),
    api = business(f),
    target = {
      handle: "reader",
      url: "https://x.com/reader",
      evidenceRef: f.proof,
    };
  const minimal = await api.readPerson({ target });
  small(minimal);
  assert.equal(minimal.person, undefined);
  const detail = await api.readPerson({ target, mode: "decision" });
  assert.equal(detail.person.handle, "reader");
  assert.equal(detail.person.relationship, "not-following");
  assert.equal(detail.person.url, target.url);
  assert.equal(detail.accountHandle, undefined);
});

test("single publication adopts reviewed action, submits once, verifies and returns no round summary", async (t) => {
  const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] }),
    action = f.read().actions[0];
  f.edit((s) => (s.actions = []));
  const api = business(f),
    out = await api.publishPost({
      taskId: "round-1",
      draftPath: f.draft,
      preparedAction: action,
    });
  assert.equal(out.status, "verified", JSON.stringify(out));
  assert.match(out.publicURL, /\/Pei\/status\/\d+$/);
  assert.equal(f.writes.length, 1);
  small(out);
  for (const key of ["actual", "gaps", "mayEnd", "decision", "observation"])
    assert.equal(out[key], undefined);
  const repeated = await api.publishPost({
    taskId: "round-1",
    draftPath: f.draft,
  });
  assert.equal(repeated.status, "verified");
  assert.equal(f.writes.length, 1);
});

test("single reply adopts reviewed action, binds public parent and returns one-item proof", async (t) => {
  const f = fixture(t, { planned: [0, 0, 1], actionKinds: ["reply"] }),
    action = f.read().actions[0];
  f.edit((s) => (s.actions = []));
  const out = await business(f).replyToPost({
    taskId: "round-1",
    postId: action.postId,
    text: action.text,
    preparedAction: action,
  });
  assert.equal(out.status, "verified", JSON.stringify(out));
  assert.equal(f.posts.at(-1).replyToId, "123");
  assert.equal(f.writes.length, 1);
  small(out);
  assert.equal(out.actual, undefined);
});

test("unknown submission resumes through same public API without repeating a write", async (t) => {
  const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] }),
    api = business(f);
  f.browser.failAfter = "submitPost";
  const first = await api.publishPost({
    taskId: "round-1",
    draftPath: f.draft,
  });
  assert.equal(first.status, "unknown");
  assert.equal(f.read().items[1].unknown, 1);
  const second = await api.publishPost({
    taskId: "round-1",
    draftPath: f.draft,
  });
  assert.equal(second.status, "verified");
  assert.equal(f.writes.length, 1);
  assert.equal(f.read().items[1].unknown, 0);
});

test("followBatch adopts five reviewed targets and owns full serial submission/refresh/settlement", async (t) => {
  const f = fixture(t, {
    planned: [5, 0, 0],
    actionKinds: Array(5).fill("follow"),
  });
  const actions = f.read().actions.map((a, i) => ({
    ...a,
    handle: "reader" + i,
    url: "https://x.com/reader" + i,
    quality: { ...a.quality, handle: "reader" + i },
  }));
  f.edit((s) => (s.actions = []));
  const handles = actions.map((a) => a.handle),
    out = await business(f).followBatch({
      taskId: "round-1",
      handles,
      preparedActions: actions,
    });
  assert.equal(out.verified, 5, JSON.stringify(out));
  assert.equal(out.unknown, 0);
  assert.equal(out.remaining, 0);
  assert.equal(f.writes.length, 5);
  assert.equal(f.commands.filter((c) => c === "refreshPerson").length, 5);
  assert.equal(out.actual, undefined);
  small(out);
});

test("wrong review text, changed draft or scope cannot be hidden by single-item projection", async (t) => {
  const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] }),
    api = business(f);
  f.edit((s) => (s.actions[0].quality.approvedText = "另一段正文"));
  const out = await api.publishPost({ taskId: "round-1", draftPath: f.draft });
  assert.equal(out.status, "needsDecision");
  assert.equal(out.reason, "exact-text-quality-review-required");
  assert.equal(f.writes.length, 0);
  const second = fixture(t, { planned: [0, 0, 1], actionKinds: ["reply"] });
  second.edit((s) => {
    s.scopeKinds = ["follow"];
    s.scopeEvidenceRef = second.proof;
  });
  const blocked = await business(second).replyToPost({
    taskId: "round-1",
    postId: "123",
    text: "有具体贡献的回复",
  });
  assert.equal(blocked.status, "needsDecision");
  assert.equal(second.writes.length, 0);
});

test("connection failure keeps stable diagnostics only, including decision mode", async (t) => {
  const f = fixture(t);
  const platform = {
    preflight: () => ({ covered: true }),
    async searchSources() {
      throw Error("transport failed " + noise);
    },
  };
  const result = await createBusinessHarness({
    store: f.store,
    platform,
  }).searchSources({ query: "AI", mode: "decision" });
  assert.equal(result.diagnostic.code, "connection-failed");
  assert.doesNotMatch(JSON.stringify(result), /NOISE_SHOULD_NOT_LEAK|error/);
  small(result);
  assert.match(
    JSON.parse(readFileSync(result.evidenceRef)).diagnostic.error,
    /NOISE_SHOULD_NOT_LEAK/,
  );
});

test("bookmark acquisition uses one business request for paging and complete target proof", async (t) => {
  const f = fixture(t),
    s = sourceFixture(),
    api = createBusinessHarness({ store: f.store, platform: s.platform });
  const out = await api.readBookmarks({
    folder: "复刻这里面的帖子",
    processedIds: ["10"],
    limit: 1,
    maxPages: 3,
    mode: "decision",
  });
  assert.equal(out.sources[0].body, s.full);
  assert.equal(out.sources[0].images[0].alt, "事实图");
  assert.equal(out.sources[0].id, "11");
  assert.equal(out.complete, true);
});

test("feedback decision/delta keeps parent evidence, unknown reply IDs and metric values while filtering noise", async (t) => {
  const f = fixture(t),
    body = "完整已确认回复";
  let reads = 0;
  const platform = {
    preflight: () => ({ covered: true }),
    captureProof: ({ observation }) => ({ observation }),
    async readFeedback() {
      reads++;
      return {
        feedback: [
          {
            id: "11",
            metrics: [
              { label: "观看", value: 123, hidden: noise },
              { label: "Grok 操作", hidden: noise },
              "更多",
              "分享帖子",
            ],
            replies: [
              {
                id: "12",
                body,
                author: "reader",
                datetime: new Date(NOW).toISOString(),
                url: "https://x.com/reader/status/12",
                buttons: noise,
              },
            ],
            unconfirmedReplyIds: ["13"],
            pageComplete: false,
            hidden: noise,
          },
        ],
        complete: true,
        pageComplete: false,
        debug: noise,
      };
    },
  };
  const api = createBusinessHarness({ store: f.store, platform });
  const first = await api.readFeedback({ targets: [], mode: "decision" });
  assert.equal(first.feedback[0].replies[0].body, body);
  assert.deepEqual(first.feedback[0].metrics, [{ label: "观看", value: 123 }]);
  assert.deepEqual(first.feedback[0].unconfirmedReplyIds, ["13"]);
  assert.equal(first.pageComplete, false);
  assert.doesNotMatch(
    JSON.stringify(first),
    /NOISE_SHOULD_NOT_LEAK|buttons|debug/,
  );
  await api.readFeedback({ targets: [], mode: "delta" });
  const second = await api.readFeedback({ targets: [], mode: "delta" });
  assert.deepEqual(second.feedback, []);
  assert.deepEqual(second.unchangedIds, ["11"]);
  assert.equal(reads, 3);
});

test("batch and round exceptions have bounded public decisions, with full local error proof", async (t) => {
  const f = fixture(t),
    api = business(f);
  const batch = await api.followBatch({ taskId: "round-1", handles: ["bad"] });
  assert.equal(batch.status, "needsDecision");
  assert.equal(batch.mayEnd, false);
  assert.equal(batch.verified, 0);
  assert.equal(batch.decision[0].reason, "harness-boundary-error");
  small(batch);
  assert.ok(batch.evidenceRef);
  assert.equal(batch.diagnostic.next, "inspect-local-proof");
  assert.equal(batch.diagnostic.evidenceRef, batch.evidenceRef);
  assert.ok(JSON.parse(readFileSync(batch.evidenceRef)).error);
  const round = await api.inspectRound({ taskId: "wrong-task" });
  assert.equal(round.status, "needsDecision");
  assert.equal(round.mayEnd, false);
  assert.ok(round.decision.length);
  assert.equal(round.diagnostic.next, "inspect-local-proof");
  assert.ok(JSON.parse(readFileSync(round.diagnostic.evidenceRef)).error);
  small(round);
});

test("prepared action import cannot replace an existing unknown action or reuse its ID for another target", async (t) => {
  const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] }),
    api = business(f),
    action = f.read().actions[0];
  f.browser.failAfter = "submitPost";
  const first = await api.publishPost({
    taskId: "round-1",
    draftPath: f.draft,
  });
  assert.equal(first.status, "unknown");
  const wrong = await api.publishPost({
    taskId: "round-1",
    draftPath: f.draft,
    preparedAction: {
      ...action,
      text: "换成另一条正文",
      quality: { ...action.quality, approvedText: "换成另一条正文" },
    },
  });
  assert.equal(wrong.status, "unknown");
  assert.equal(wrong.reason, "original-action-input-changed");
  assert.equal(f.read().actions[0].status, "unknown");
  assert.equal(f.writes.length, 1);
  const recovered = await api.publishPost({
    taskId: "round-1",
    draftPath: f.draft,
    preparedAction: action,
  });
  assert.equal(recovered.status, "verified");
  assert.equal(f.writes.length, 1);
});

test("missing absolute time is retained rather than calling a partially observed post complete", async (t) => {
  const f = fixture(t),
    target = {
      postId: "11",
      url: "https://x.com/source/status/11",
      evidenceRef: f.proof,
    };
  const browser = {
    capabilities: () => [],
    async act() {},
    async observe() {
      return {
        page: target.url,
        posts: [
          { id: "11", body: "完整正文", author: "source", datetime: null },
        ],
        alerts: [],
        needsStateCheck: false,
      };
    },
  };
  const out = await createBusinessHarness({
    platform: createXPlatform(browser),
    store: f.store,
  }).readPost({ target, mode: "decision" });
  assert.equal(out.complete, false);
  assert.equal(out.post.body, "完整正文");
  assert.ok(out.missing.includes("absolute-time-unconfirmed"));
});

test("receipt never seeds unseen content; cold delta returns it; changes in delivered evidence return complete updates", async (t) => {
  const f = fixture(t);
  let body = "首次正文";
  const platform = {
    preflight: () => ({ covered: true }),
    captureProof: ({ observation }) => ({ observation }),
    async searchSources() {
      return { complete: true, sources: [{ id: "11", body }] };
    },
  };
  const api = createBusinessHarness({ store: f.store, platform });
  await api.searchSources({ query: "AI" });
  const cold = await api.searchSources({ query: "AI", mode: "delta" });
  assert.equal(cold.sources[0].body, "首次正文");
  const warm = await api.searchSources({ query: "不同查询", mode: "delta" });
  assert.deepEqual(warm.sources, []);
  assert.deepEqual(warm.unchangedIds, ["11"]);
  body = "完整变化正文";
  const changed = await api.searchSources({ query: "AI", mode: "delta" });
  assert.equal(changed.sources[0].body, body);
  assert.deepEqual(changed.unchangedIds, []);
});

test("a local proof failure after persisted intent remains publicly unknown and recovers without a second write", async (t) => {
  const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] }),
    api = business(f),
    record = f.store.recordProof;
  f.store.recordProof = async (proof) => {
    if (f.writes.length) throw Error("local disk proof failure");
    return record.call(f.store, proof);
  };
  const first = await api.publishPost({
    taskId: "round-1",
    draftPath: f.draft,
  });
  assert.equal(first.status, "unknown");
  assert.equal(f.writes.length, 1);
  assert.equal(f.read().items[1].unknown, 1);
  assert.equal(typeof first.reason, "string");
  assert.equal(first.publicId, undefined);
  f.store.recordProof = record;
  const recovered = await api.publishPost({
    taskId: "round-1",
    draftPath: f.draft,
  });
  assert.equal(recovered.status, "verified");
  assert.equal(f.writes.length, 1);
});

test("failed executor release does not leave the local operation interlock stuck across recovery", async (t) => {
  const f = fixture(t),
    transaction = f.store.transaction;
  let transactions = 0;
  f.store.transaction = async (fn) => {
    if (++transactions === 2) throw Error("temporary-ledger-conflict");
    return transaction.call(f.store, fn);
  };
  const platform = {
    preflight: () => ({ covered: true }),
    captureProof: ({ observation }) => ({ observation }),
    async readAccount() {
      return {
        accountHandle: "Pei",
        accountURL: "https://x.com/Pei",
        complete: true,
      };
    },
  };
  const api = createBusinessHarness({
    store: f.store,
    platform,
    executor: {
      id: "reader",
      tabId: "own-tab",
      scopeKinds: ["follow"],
      evidenceRef: f.proof,
    },
  });
  const first = await api.inspectAccount();
  assert.equal(first.status, "needsDecision");
  const second = await api.inspectAccount();
  assert.equal(second.status, "observed");
  assert.equal(second.reason, undefined);
  assert.equal(f.read().executions.reader.activity, undefined);
});

test("feedback combines role-button counts with link-based views in one target collection and removes duplicates", async (t) => {
  const f = fixture(t),
    target = {
      postId: "11",
      url: "https://x.com/source/status/11",
      evidenceRef: f.proof,
    };
  const post = {
    id: "11",
    author: "source",
    body: "原帖",
    buttons: [
      { label: "2 回复。回复" },
      { label: "2 喜欢次数。喜欢" },
      { label: "Grok 操作" },
    ],
    metrics: [{ label: "观看 25 查看" }, { label: "2 回复。回复" }],
  };
  const browser = {
    capabilities: () => [],
    async act() {},
    async observe() {
      return {
        page: target.url,
        posts: [post],
        alerts: [],
        needsStateCheck: false,
      };
    },
  };
  const out = await createBusinessHarness({
    store: f.store,
    platform: createXPlatform(browser),
  }).readFeedback({ targets: [target], replyLimit: 0, mode: "decision" });
  assert.deepEqual(out.feedback[0].metrics, [
    { label: "2 回复。回复" },
    { label: "2 喜欢次数。喜欢" },
    { label: "观看 25 查看" },
  ]);
});
