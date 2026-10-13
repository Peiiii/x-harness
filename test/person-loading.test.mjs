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
