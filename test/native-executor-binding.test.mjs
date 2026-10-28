import test from "node:test";
import assert from "node:assert/strict";
import { createXGrowthHarness } from "../dist/index.js";
import { fixture } from "./fixtures.mjs";
for (const mode of ["proved", "missing", "wrong-proof"])
  test(`native actor keeps the original independent-tab requirement: ${mode}`, async (t) => {
    const f = fixture(t),
      app = {
        getAXState: async () =>
          `0 标准窗口 X, URL: x.com/home\n  1 link 个人资料, Value: x.com/Pei`,
      };
    const bind = () =>
      createXGrowthHarness({
        app,
        ledgerPath: f.ledger,
        proofDirectory: f.dir,
        executor: {
          id: "original-actor",
          scopeKinds: ["original"],
          evidenceRef: f.proof,
        },
        ...(mode === "missing"
          ? {}
          : {
              nativeTaskTab: {
                id: "observed-owned-tab",
                evidenceRef:
                  mode === "wrong-proof" ? "/missing-native-proof" : f.proof,
              },
            }),
      });
    if (mode === "proved") {
      const api = bind();
      const r = await api.inspectAccount({ mode: "decision" });
      assert.equal(r.status, "observed");
      assert.equal(r.accountHandle, "Pei");
    } else assert.throws(bind, /executor-requires-independent-tab/);
  });
