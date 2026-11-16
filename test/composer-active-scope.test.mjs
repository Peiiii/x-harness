import test from "node:test";
import assert from "node:assert/strict";
import { composerFixture } from "./composer-scope-fixture.mjs";

for (const nested of [false, true])
  test(`one active modal ignores the untouched background editor: nested=${nested}`, async () => {
    const f = composerFixture({ nested });
    let boundaries = 0;
    await f.submit(async () => boundaries++);
    assert.equal(f.state.fills, 1);
    assert.equal(f.state.submits, 1);
    assert.equal(boundaries, 1);
    assert.equal(f.state.backgroundFills, 0);
    assert.equal(f.state.backgroundSubmits, 0);
    assert.equal(f.background.text, "Unrelated background draft");
  });

test("nested modal long-parent expansion retains the same active scope", async () => {
  const f = composerFixture({ nested: true, truncated: true });
  await f.submit();
  assert.equal(f.state.expansions, 1);
  assert.equal(f.state.submits, 1);
  assert.equal(f.state.backgroundFills, 0);
});

for (const options of [
  { duplicate: true },
  { twoEditors: true },
  { nested: true, twoEditors: true },
])
  test(`true active ambiguity refuses preparation: ${JSON.stringify(options)}`, async () => {
    const f = composerFixture(options);
    await assert.rejects(f.submit());
    assert.equal(f.state.submits, 0);
    assert.equal(f.state.fills, 0);
    assert.equal(f.state.backgroundFills, 0);
  });

test("a second active editor appearing at authorization blocks the captured submit", async () => {
  const f = composerFixture({ nested: true });
  await assert.rejects(
    f.submit(async () => {
      const other = Object.create(Object.getPrototypeOf(f.foreground));
      Object.assign(other, f.foreground, { parentElement: f.inner });
      f.inner.children.push(other);
    }),
    /reply-submit-context-unconfirmed/,
  );
  assert.equal(f.state.submits, 0);
  assert.equal(f.state.backgroundSubmits, 0);
});

test("a new independent modal at authorization blocks submission", async () => {
  const f = composerFixture({ nested: true });
  await assert.rejects(
    f.submit(async () => f.addIndependentModal()),
    /reply-submit-context-unconfirmed/,
  );
  assert.equal(f.state.submits, 0);
  assert.equal(f.state.backgroundSubmits, 0);
});

test("an active editor without its own submit cannot borrow the background button", async () => {
  const f = composerFixture({ nested: true });
  f.removeSubmit();
  await assert.rejects(f.submit());
  assert.equal(f.state.fills, 0);
  assert.equal(f.state.submits, 0);
  assert.equal(f.state.backgroundFills, 0);
});

test("inline main scope excludes a background sidebar editor and duplicate Reply label", async () => {
  const f = composerFixture({ inline: true });
  await f.submit();
  assert.equal(f.state.submits, 1);
  assert.equal(f.state.backgroundFills, 0);
  assert.equal(f.state.backgroundSubmits, 0);
  assert.equal(f.background.text, "Unrelated background draft");
});

test("a background Post control does not contaminate the active reply scope", async () => {
  const f = composerFixture({ nested: true });
  f.backgroundButton.text = "发帖";
  await f.submit();
  assert.equal(f.state.submits, 1);
  assert.equal(f.state.backgroundSubmits, 0);
});

test("an active Post composer with an incidental target link remains refused", async () => {
  const f = composerFixture({ nested: true });
  f.foregroundButton.text = "发帖";
  await assert.rejects(f.submit());
  assert.equal(f.state.fills, 0);
  assert.equal(f.state.submits, 0);
});

test("an existing active draft remains untouched", async () => {
  const f = composerFixture({ nested: true });
  f.foreground.text = "Existing active draft";
  await assert.rejects(f.submit());
  assert.equal(f.foreground.text, "Existing active draft");
  assert.equal(f.state.fills, 0);
});

test("wrong active parent ID never falls back to matching quoted body", async () => {
  const f = composerFixture({ nested: true });
  f.inner.children[0].attrs.href = "/Peer/status/999";
  await assert.rejects(f.submit());
  assert.equal(f.state.fills, 0);
  assert.equal(f.state.submits, 0);
});

test("a modal appearing after main-scope observation blocks stale background filling", async () => {
  const f = composerFixture({ inline: true });
  await f.browser.observe({ view: "composer" });
  f.showModal();
  await assert.rejects(
    f.browser.act({
      operation: "fillComposer",
      text: "Must not fill stale scope",
    }),
    /composer-scope-not-unique/,
  );
  assert.equal(f.state.fills, 0);
  assert.equal(f.state.backgroundFills, 0);
});

test("reader scopes nested containers by node containment, not repeated dialog text", () => {
  const f = composerFixture({ nested: true });
  f.state.opened = true;
  const dialogs = f.document.querySelectorAll('[role="dialog"]');
  assert.equal(dialogs.length, 2);
  assert.notEqual(dialogs[0], dialogs[1]);
  assert.equal(dialogs[0].contains(dialogs[1]), true);
  const raw = f.raw();
  assert.equal(raw.needsStateCheck, false);
  assert.equal(raw.composerScope, "dialog");
  assert.equal(raw.editors.length, 1);
  assert.equal(raw.replyToId, "123");
});

test("identical independent dialog text never collapses distinct active nodes", () => {
  const f = composerFixture({ duplicate: true });
  f.state.opened = true;
  const dialogs = f.document.querySelectorAll('[role="dialog"]');
  assert.equal(dialogs[0].innerText, dialogs[1].innerText);
  assert.equal(dialogs[0].contains(dialogs[1]), false);
  const raw = f.raw();
  assert.equal(raw.needsStateCheck, true);
  assert.ok(raw.missing.includes("composer-scope-not-unique"));
});
