import test from "node:test";
import assert from "node:assert/strict";
import {
  createBusinessHarness,
  createGrowthHarness,
  createDOMXBrowser,
} from "../dist/diagnostics.js";
import { fixture } from "./fixtures.mjs";
const bytes = (v) => Buffer.byteLength(JSON.stringify(v));

test("fixed output cost comparison preserves full target with one fresh collection per request", async (t) => {
  const full = "用于判断的完整正文。\n".repeat(500),
    noise = "无关导航、控件和调试信息".repeat(1000);
  const f = fixture(t);
  let collections = 0;
  const platform = {
    preflight: () => ({ covered: true }),
    captureProof: ({ observation }) => ({ observation }),
    async searchSources() {
      collections++;
      return {
        complete: true,
        pageComplete: false,
        sources: [
          {
            id: "11",
            body: full,
            author: "source",
            url: "https://x.com/source/status/11",
            datetime: "2026-10-11T12:00:00Z",
            navigation: noise,
            images: [{ src: "image", alt: "事实图", debug: noise }],
          },
        ],
        dom: noise,
        controls: noise,
      };
    },
  };
  // Existing rich lower-layer result is the baseline; the business facade owns projection.
  const raw = createGrowthHarness({ platform, store: f.store }),
    api = createBusinessHarness({ platform, store: f.store });
  const baseline = await raw.searchSources({ query: "AI", mode: "decision" }),
    decision = await api.searchSources({ query: "AI", mode: "decision" }),
    receipt = await api.searchSources({ query: "AI" });
  assert.equal(decision.sources[0].body, full);
  assert.equal(collections, 3);
  assert.equal(decision.pageComplete, false);
  assert.ok(bytes(decision) < bytes(baseline) / 4);
  assert.ok(bytes(receipt) <= 1024);
  const first = await api.searchSources({ query: "AI", mode: "delta" }),
    second = await api.searchSources({ query: "AI", mode: "delta" });
  assert.deepEqual(first.sources, []);
  assert.deepEqual(first.unchangedIds, ["11"]);
  assert.deepEqual(second.unchangedIds, ["11"]);
  assert.equal(collections, 5);
  assert.ok(bytes(second) <= 1024);
  t.diagnostic(
    JSON.stringify({
      measurement: "UTF-8 JSON bytes, not billed tokens",
      baselineDecision: bytes(baseline),
      businessDecision: bytes(decision),
      receipt: bytes(receipt),
      unchangedDelta: bytes(second),
      freshCollectionsPerCall: 1,
      bodyBytes: Buffer.byteLength(full),
    }),
  );
});

test("profile navigation waits for profile content and permits self profiles without a Follow button", async () => {
  const calls = [];
  const locator = {
    filter() {
      return this;
    },
    async count() {
      return 0;
    },
    async waitFor() {
      calls.push("profile-ready");
    },
  };
  const tab = {
    id: "self-tab",
    async goto(url) {
      calls.push(url);
    },
    playwright: {
      locator(selector) {
        calls.push(selector);
        return locator;
      },
      async waitForURL() {},
      getByRole() {
        throw Error("self profile has no Follow button");
      },
    },
  };
  const browser = createDOMXBrowser(tab);
  await browser.act({
    operation: "openObserved",
    url: "https://x.com/Pei",
    handle: "Pei",
    view: "person",
    evidenceRef: "observed",
  });
  assert.ok(calls.includes('[data-testid="UserName"]'));
  assert.ok(calls.includes("profile-ready"));
});

test("representative complete tasks have one public invocation and retain writes, recovery, proof and scoped results", async (t) => {
  const rows = [];
  for (const scenario of [
    "publish",
    "reply",
    "followBatch",
    "unknownRecovery",
    "round",
  ]) {
    for (const layer of ["raw", "business"]) {
      for (let sample = 0; sample < 5; sample++) {
        const config =
          scenario === "publish" || scenario === "unknownRecovery"
            ? { planned: [0, 1, 0], actionKinds: ["original"] }
            : scenario === "reply"
              ? { planned: [0, 0, 1], actionKinds: ["reply"] }
              : scenario === "followBatch"
                ? { planned: [5, 0, 0], actionKinds: Array(5).fill("follow") }
                : {};
        const f = fixture(t, config);
        if (scenario === "followBatch")
          f.edit(
            (s) =>
              (s.actions = s.actions.map((a, i) => ({
                ...a,
                handle: "reader" + i,
                url: "https://x.com/reader" + i,
                quality: { ...a.quality, handle: "reader" + i },
              }))),
          );
        const api =
          layer === "raw"
            ? f.harness
            : createBusinessHarness({
                platform: f.platform,
                store: f.store,
                clock: () => Date.parse("2026-10-11T02:00:00Z"),
              });
        const args =
          scenario === "reply"
            ? { taskId: "round-1", postId: "123", text: "有具体贡献的回复" }
            : scenario === "followBatch"
              ? {
                  taskId: "round-1",
                  handles: [
                    "reader0",
                    "reader1",
                    "reader2",
                    "reader3",
                    "reader4",
                  ],
                }
              : scenario === "round"
                ? { taskId: "round-1" }
                : { taskId: "round-1", draftPath: f.draft };
        const method =
          scenario === "reply"
            ? "replyToPost"
            : scenario === "followBatch"
              ? "followBatch"
              : scenario === "round"
                ? "runGrowthRound"
                : "publishPost";
        let calls = 1;
        if (scenario === "unknownRecovery") {
          f.browser.failAfter = "submitPost";
          await api.publishPost(args);
          calls++;
        }
        const start = performance.now(),
          out = await api[method](args),
          durationMs = performance.now() - start;
        assert.equal(
          f.writes.length,
          scenario === "followBatch" ? 5 : scenario === "round" ? 3 : 1,
        );
        assert.equal(
          f.read().items.reduce((n, i) => n + i.unknown, 0),
          0,
        );
        if (layer === "business" && scenario !== "round")
          assert.ok(bytes(out) <= 1024);
        const proofBytes = out.evidenceRef
          ? Buffer.byteLength(
              (await import("node:fs")).readFileSync(out.evidenceRef),
            )
          : null;
        rows.push({
          scenario,
          layer,
          calls,
          inputBytes: bytes(args),
          outputBytes: bytes(out),
          proofBytes,
          internalObservations: f.observations.length,
          internalActions: f.commands.length,
          writes: f.writes.length,
          durationMs: Number(durationMs.toFixed(2)),
        });
      }
    }
  }
  for (const scenario of [
    "publish",
    "reply",
    "followBatch",
    "unknownRecovery",
    "round",
  ]) {
    const raw = rows.find((r) => r.scenario === scenario && r.layer === "raw"),
      business = rows.find(
        (r) => r.scenario === scenario && r.layer === "business",
      );
    assert.equal(business.calls, raw.calls);
    assert.equal(business.internalObservations, raw.internalObservations);
    assert.equal(business.writes, raw.writes);
  }
  t.diagnostic(
    JSON.stringify({
      boundary:
        "isolated assembled ports + actual file store, not live platform writes or billed tokens",
      samplesPerScenarioAndLayer: 5,
      moduleCache:
        "warm; new harness and original unexecuted fixture per trial",
      rows: [...new Set(rows.map((r) => r.scenario + ":" + r.layer))].map(
        (key) => {
          const samples = rows.filter(
              (r) => r.scenario + ":" + r.layer === key,
            ),
            times = samples.map((r) => r.durationMs).sort((a, b) => a - b);
          const { durationMs, ...first } = samples[0];
          return {
            ...first,
            durationMs: {
              min: times[0],
              p50: times[2],
              p95: times[4],
              max: times[4],
            },
          };
        },
      ),
    }),
  );
});

test("an inert observed permalink gets one bounded direct navigation; alerts or interrupted connection never fall back", async () => {
  for (const fault of ["inert", "alert", "interrupted"]) {
    const calls = [];
    let waits = 0;
    const link = {
      filter() {
        return this;
      },
      async count() {
        return 1;
      },
      async click() {
        calls.push("click");
      },
    };
    const tab = {
      async goto() {
        calls.push("goto");
      },
      playwright: {
        async evaluate() {
          return {
            page: "https://x.com/Pei",
            alerts: fault === "alert" ? ["请验证身份"] : [],
            needsStateCheck: false,
          };
        },
        locator() {
          return link;
        },
        getByRole() {
          return {
            first() {
              return { async waitFor() {} };
            },
          };
        },
        async waitForURL() {
          if (waits++ === 0)
            throw Error(
              fault === "interrupted"
                ? "extension connection interrupted"
                : "Timed out waiting for URL https://x.com/source/status/123",
            );
        },
      },
    };
    const browser = createDOMXBrowser(tab);
    await browser.observe({ view: "posts" });
    const action = () =>
      browser.act({
        operation: "openObserved",
        view: "posts",
        url: "https://x.com/source/status/123",
        evidenceRef: "observed",
      });
    if (fault === "inert") {
      await action();
      assert.deepEqual(calls, ["click", "goto"]);
      assert.equal(waits, 2);
    } else {
      await assert.rejects(action());
      assert.deepEqual(calls, ["click"]);
    }
  }
});
