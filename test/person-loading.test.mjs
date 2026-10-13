import test from "node:test";
import assert from "node:assert/strict";
import { createDOMXBrowser } from "../dist/diagnostics.js";

for (const operation of ["openObserved", "refreshPerson"]) {
  for (const signal of [
    "loading",
    "alert",
    "changed-route",
    "transport",
    "absent",
    "reopen",
  ]) {
    test(`person ${operation} preserves bounded readiness: ${signal}`, async () => {
      let page = "https://x.com/reader",
        waits = 0,
        reloads = 0,
        navigations = 0,
        observations = 0;
      const target = {
        filter() {
          return this;
        },
        async count() {
          return 0;
        },
        async waitFor() {
          if (
            ++waits === 1 ||
            signal === "absent" ||
            (signal === "reopen" && waits <= 4)
          )
            throw Error(
              signal === "transport"
                ? "host disconnected"
                : "Playwright selector deadline exceeded",
            );
        },
      };
      const tab = {
        async url() {
          return page;
        },
        async goto(url) {
          navigations++;
          page = url;
        },
        async reload() {
          reloads++;
        },
        playwright: {
          locator() {
            return target;
          },
          getByRole() {
            return target;
          },
          async waitForURL() {},
          async waitForLoadState() {},
          async evaluate(_program, query) {
            observations++;
            assert.equal(query.view, "account");
            return {
              page: signal === "changed-route" ? "https://x.com/home" : page,
              accountHandle: "owner",
              alerts: signal === "alert" ? ["请验证身份"] : [],
              needsStateCheck: false,
            };
          },
        },
      };
      const action = () =>
        createDOMXBrowser(tab).act({
          operation,
          view: "person",
          forceNavigation: true,
          handle: "reader",
          url: page,
          evidenceRef: "synthetic-source",
        });
      if (signal === "loading" || signal === "reopen") {
        await action();
        assert.equal(waits, signal === "reopen" ? 5 : 2);
        assert.equal(observations, signal === "reopen" ? 4 : 1);
      } else {
        await assert.rejects(action());
        assert.equal(waits, signal === "absent" ? 8 : 1);
        assert.equal(
          observations,
          signal === "transport" ? 0 : signal === "absent" ? 7 : 1,
        );
      }
      assert.equal(reloads, operation === "refreshPerson" ? 1 : 0);
      assert.equal(
        navigations,
        (operation === "openObserved" ? 1 : 0) +
          (["absent", "reopen"].includes(signal) ? 1 : 0),
      );
    });
  }
}

for (const mode of ["incomplete", "loaded", "alert"]) {
  test(`current profile fast path preserves readiness: ${mode}`, async () => {
    const { PlatformObservation } =
      await import("../dist/platform-observation.js");
    let acts = 0,
      ready = mode === "loaded";
    const observation = new PlatformObservation({
      clock: () => 0,
      browser: {
        async observe() {
          return {
            page: "https://x.com/reader",
            handle: "reader",
            blue: ready ? true : null,
            relationship: ready ? "not-following" : "unknown",
            needsStateCheck: false,
            alerts: mode === "alert" ? ["challenge"] : [],
          };
        },
        async act(command) {
          assert.equal(command.operation, "openObserved");
          assert.equal(command.url, "https://x.com/reader");
          acts++;
          ready = true;
        },
      },
    });
    const result = await observation.open(
      { url: "https://x.com/reader", evidenceRef: "synthetic-proof" },
      { view: "person", handle: "reader" },
    );
    assert.equal(acts, mode === "incomplete" ? 1 : 0);
    assert.equal(result.blue, mode === "alert" ? null : true);
  });
}

test("native relationship proof does not reopen for unsupported color evidence", async () => {
  const { createNativeXBrowser, createXPlatform } =
    await import("../dist/diagnostics.js");
  const clicks = [];
  const app = {
    async getAXState() {
      return "0 标准窗口 Reader / X, URL: x.com/reader\n  1 link 个人资料, Value: x.com/Pei\n  2 container 主页时间线\n    3 按钮 关注 @reader\n    4 container 个人资料时间线\n  7 文本栏 (settable) 地址和搜索栏, Value: x.com/reader\n  8 按钮 重新加载\n";
    },
    async click(index) {
      clicks.push(index);
    },
    async pressKey() {},
    async paste() {},
  };
  const platform = createXPlatform(createNativeXBrowser(app));
  const out = await platform.readPerson({
    handle: "reader",
    url: "https://x.com/reader",
    evidenceRef: "observed-proof",
  });
  assert.equal(out.relationship, "not-following");
  assert.equal(out.blue, null);
  assert.equal(out.blueEvidenceSupported, false);
  assert.deepEqual(clicks, []);
});
