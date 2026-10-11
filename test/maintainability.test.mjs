import test from "node:test";
import assert from "node:assert/strict";
import { checkSource, checkCycles } from "../scripts/check-maintainability.mjs";

test("1000 line file limit is inclusive and rejects overflow", () => {
  assert.deepEqual(checkSource("// code\n".repeat(1000), "sample.ts"), []);
  assert.equal(
    checkSource("// code\n".repeat(1001), "sample.ts")[0].rule,
    "file-lines",
  );
});
test("long functions cannot hide behind a small file or nested closure", () => {
  const source = "function work(){\n" + "doWork();\n".repeat(151) + "}";
  assert.equal(checkSource(source, "sample.ts")[0].rule, "function-lines");
  const nested = "function factory(){\n" + source + "\nreturn work;\n}";
  const findings = checkSource(nested, "sample.ts");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].name, "work");
});
test("runtime cycles fail while a directed dependency graph passes", () => {
  assert.deepEqual(
    checkCycles(
      new Map([
        ["api", ["state"]],
        ["state", ["store"]],
        ["store", []],
      ]),
    ),
    [],
  );
  assert.equal(
    checkCycles(
      new Map([
        ["api", ["state"]],
        ["state", ["api"]],
      ]),
    )[0].rule,
    "dependency-cycle",
  );
});

test("stateful factories must move lifecycle and behavior into a class", () => {
  assert.equal(
    checkSource(
      "export function createSession(){let busy=false;return {busy};}",
      "session.ts",
    )[0].rule,
    "stateful-owner-class",
  );
  assert.deepEqual(
    checkSource(
      "export function createSession(){return new Session();}",
      "session.ts",
    ),
    [],
  );
});
