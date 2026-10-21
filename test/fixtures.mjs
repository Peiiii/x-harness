import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createGrowthHarness } from "../dist/diagnostics.js";
import { createFileRoundStore } from "../dist/diagnostics.js";
import { createXPlatform } from "../dist/diagnostics.js";
import { readRound } from "../dist/diagnostics.js";
export const NOW = Date.parse("2026-10-11T10:00:00+08:00");
export function fixture(
  t,
  { planned = [1, 1, 1], actionKinds = ["follow", "original", "reply"] } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "x-growth-harness-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const proof = join(dir, "review.json"),
    draft = join(dir, "draft.post.md");
  writeFileSync(proof, JSON.stringify({ reviewed: true }));
  writeFileSync(draft, "已审正文");
  const actions = actionKinds.map((kind, index) => ({
    id: `${kind}-${index}`,
    kind,
    status: "prepared",
    accountHandle: "Pei",
    accountURL: "https://x.com/Pei",
    accountEvidenceRef: proof,
    ...(kind === "follow"
      ? {
          handle: "reader",
          url: "https://x.com/reader",
          evidenceRef: proof,
          quality: {
            approved: true,
            handle: "reader",
            blue: true,
            chinese: true,
            evidenceRef: proof,
          },
        }
      : {
          text: kind === "reply" ? "有具体贡献的回复" : "已审正文",
          draftPath: draft,
          ...(kind === "reply"
            ? {
                postId: "123",
                url: "https://x.com/author/status/123",
                evidenceRef: proof,
              }
            : {
                composeURL: "https://x.com/compose/post",
                composeEvidenceRef: proof,
              }),
          quality: {
            approved: true,
            approvedText: kind === "reply" ? "有具体贡献的回复" : "已审正文",
            evidenceRef: proof,
            ...(kind === "original"
              ? {
                  draftFingerprint: createHash("sha256")
                    .update("已审正文")
                    .digest("hex"),
                }
              : {}),
          },
        }),
  }));
  const state = {
    batchId: "round-1",
    status: "RUNNING",
    updatedAt: new Date(NOW).toISOString(),
    accountHandle: "Pei",
    items: ["follow", "original", "reply"].map((kind, i) => ({
      kind,
      planned: planned[i],
      verified: 0,
      unknown: 0,
      actionable: true,
    })),
    execution: { owner: "harness", exclusive: true },
    attempts: [],
    attemptsCoverage: {
      complete: true,
      since: new Date(NOW - 3600000).toISOString(),
      evidenceRef: proof,
    },
    actions,
  };
  const ledger = join(dir, "day.md");
  const markdown = (s) =>
    `# Original\n\n\`\`\`x-round-state\n${JSON.stringify(s, null, 2)}\n\`\`\`\n\nKeep unrelated WIP exactly.\n`;
  writeFileSync(ledger, markdown(state));
  const store = createFileRoundStore({
    ledgerPath: ledger,
    proofDirectory: join(dir, "proofs"),
  });
  let now = NOW;
  const posts = [
    {
      id: "10",
      author: "Pei",
      body: "以前的文章",
      datetime: new Date(NOW - 60000).toISOString(),
    },
  ];
  const following = new Set(),
    writes = [],
    commands = [],
    observations = [];
  let accountHandle = "Pei";
  function browserForTab() {
    let page = "https://x.com/Pei",
      editorText = "",
      replyToId = null;
    return {
      missing: [],
      failAfter: null,
      wrongAuthor: false,
      wrongReply: false,
      alerts: [],
      readsFail: false,
      setAccountHandle(value) {
        accountHandle = value;
      },
      capabilities() {
        return this.missing;
      },
      async observe(query) {
        observations.push(query.view);
        if (this.readsFail && query.view === "person")
          throw new Error("person transport failed");
        const base = {
          page,
          needsStateCheck: false,
          alerts: this.alerts,
          accountHandle,
          accountURL: `https://x.com/${accountHandle}`,
        };
        if (query.view === "person")
          return {
            ...base,
            handle: query.handle,
            blue: true,
            relationship: following.has(query.handle)
              ? "following"
              : "not-following",
          };
        if (query.view === "composer")
          return { ...base, editorText, replyToId };
        if (query.view === "posts")
          return {
            ...base,
            posts: query.targetId
              ? [{ id: query.targetId, author: "author", body: "主帖" }]
              : posts,
          };
        return base;
      },
      async act(command) {
        commands.push(command.operation);
        if (command.operation === "openObserved") {
          page = command.url;
          editorText = "";
          replyToId = null;
          return;
        }
        if (command.operation === "refreshPosts") return;
        if (command.operation === "refreshPerson") {
          if (this.rollbackFollow) following.clear();
          return;
        }
        if (command.operation === "openReply") {
          replyToId = command.postId;
          editorText = "";
          return;
        }
        if (command.operation === "fillComposer") {
          editorText = command.text;
          return;
        }
        if (["submitPost", "submitReply"].includes(command.operation))
          await command.beforeSubmit?.();
        const s = readRound(readFileSync(ledger, "utf8"));
        assert.ok(
          s.actions.some((a) => a.status === "intent"),
          "intent is persisted before a submission",
        );
        writes.push(command.operation);
        if (command.operation === "follow") following.add(command.handle);
        else if (["submitPost", "submitReply"].includes(command.operation)) {
          posts.push({
            id: String(1000 + posts.length),
            author: this.wrongAuthor ? "someoneElse" : "Pei",
            body: editorText,
            datetime: new Date(now).toISOString(),
            replyToId: this.wrongReply ? "999" : replyToId,
          });
          editorText = "";
        }
        if (this.failAfter === command.operation)
          throw new Error("transport lost after submit");
      },
    };
  }
  const browser = browserForTab();
  const platform = createXPlatform(browser, { clock: () => now });
  const harness = createGrowthHarness({ platform, store, clock: () => now });
  return {
    dir,
    ledger,
    store,
    state,
    proof,
    draft,
    posts,
    following,
    writes,
    commands,
    observations,
    browser,
    platform,
    harness,
    newExecutor(id, scopeKinds) {
      const browser = browserForTab();
      const platform = createXPlatform(browser, { clock: () => now });
      const parallelStore = createFileRoundStore({
        ledgerPath: ledger,
        proofDirectory: join(dir, "proofs"),
      });
      return {
        browser,
        platform,
        store: parallelStore,
        api: createGrowthHarness({
          platform,
          store: parallelStore,
          clock: () => now,
          executor: { id, scopeKinds, tabId: id, evidenceRef: proof },
        }),
      };
    },
    edit(fn) {
      const s = readRound(readFileSync(ledger, "utf8"));
      fn(s);
      writeFileSync(ledger, markdown(s));
    },
    read: () => readRound(readFileSync(ledger, "utf8")),
    setNow: (n) => {
      now = n;
    },
  };
}

export function sourceFixture() {
  let page = "https://x.com/Pei",
    menu = false,
    selected = false,
    offset = 0,
    expanded = false;
  const calls = [];
  const full = "第一段具体原文。\n第二段完整推理。".repeat(100);
  const posts = [
    {
      id: "10",
      author: "author",
      datetime: new Date(NOW).toISOString(),
      primary: "/author/status/10",
      body: "已经处理",
    },
    {
      id: "11",
      author: "author",
      datetime: new Date(NOW).toISOString(),
      primary: "/author/status/11",
      body: full,
      needsExpansion: true,
      images: [
        { alt: "事实图", src: "https://pbs.twimg.com/media/source.png" },
      ],
    },
  ];
  const control = (label, href, role = "link") => ({ label, href, role });
  const browser = {
    capabilities: () => [],
    async observe(query) {
      calls.push(["observe", query.view]);
      const base = {
        page,
        accountHandle: "Pei",
        accountURL: "https://x.com/Pei",
        alerts: [],
        needsStateCheck: false,
      };
      if (query.view === "menu")
        return { ...base, items: [control("设置和隐私", "/settings")] };
      if (query.view === "navigation")
        return {
          ...base,
          controls: menu
            ? [control("历史", "/i/history")]
            : page.includes("/i/history")
              ? [
                  { ...control("书签", "/i/history", "tab"), selected: true },
                  control("复刻这里面的帖子", "/i/bookmarks/folder/7"),
                ]
              : [
                  control("更多菜单项", null, "button"),
                  control("历史", "/i/history"),
                ],
          headings: selected ? ["复刻这里面的帖子"] : [],
        };
      if (query.view === "posts")
        return {
          ...base,
          posts: query.targetId
            ? [{ ...posts[1], needsExpansion: !expanded }]
            : [offset ? { ...posts[1], needsExpansion: !expanded } : posts[0]],
        };
      return base;
    },
    async act(command) {
      calls.push(["act", command.operation]);
      if (command.operation === "openControl") {
        if (command.label === "更多菜单项") menu = true;
        else {
          page = "https://x.com" + command.href;
          selected = command.label === "复刻这里面的帖子";
        }
      }
      if (command.operation === "dismissMenu") menu = false;
      if (command.operation === "nextPosts") offset++;
      if (command.operation === "expandPost") expanded = true;
      if (command.operation === "searchSources") {
        page = `https://x.com/search?q=${encodeURIComponent(command.query)}`;
        offset = 1;
        expanded = true;
      }
      if (command.operation === "openObserved") page = command.url;
    },
  };
  return {
    browser,
    calls,
    full,
    platform: createXPlatform(browser, { clock: () => NOW }),
  };
}
