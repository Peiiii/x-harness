import test from "node:test";
import assert from "node:assert/strict";
import { publicationTime } from "../dist/publication-time.js";
const second = Date.parse("2026-10-14T03:30:03Z");
const idAt = (at) =>
  (((BigInt(at) - 1288834974657n) << 22n) + 12345n).toString();
const observed = (at) => ({
  id: idAt(at),
  datetime: new Date(Math.floor(at / 1000) * 1000).toISOString(),
});
test("same-second new public ID proves creation after a millisecond intent", () => {
  assert.ok(publicationTime(observed(second + 736)) >= second + 6);
});
test("same-second older public ID still fails the original intent lower bound", () => {
  assert.ok(publicationTime(observed(second + 5)) < second + 6);
});
test("ID and rendered date disagreement is unknown, never an inferred timestamp", () => {
  assert.ok(
    Number.isNaN(
      publicationTime({
        id: idAt(second + 1000),
        datetime: new Date(second).toISOString(),
      }),
    ),
  );
});
test("explicit millisecond evidence must match the actual public ID", () => {
  assert.equal(
    publicationTime({
      id: idAt(second + 736),
      datetime: new Date(second + 736).toISOString(),
    }),
    second + 736,
  );
  assert.ok(
    Number.isNaN(
      publicationTime({
        id: idAt(second + 736),
        datetime: new Date(second + 735).toISOString(),
      }),
    ),
  );
});
test("missing timestamp and unsigned overflow never provide creation proof", () => {
  assert.ok(Number.isNaN(publicationTime({ id: idAt(second) })));
  assert.ok(
    Number.isNaN(
      publicationTime({
        id: "18446744073709551615",
        datetime: new Date(second).toISOString(),
      }),
    ),
  );
});
test("short legacy IDs retain the existing rendered-time lower bound", () => {
  assert.equal(
    publicationTime({ id: "11", datetime: new Date(second).toISOString() }),
    second,
  );
});
