import test from "node:test";
import assert from "node:assert/strict";
import { fixture, NOW } from "./fixtures.mjs";

for (const separator of ["\n", "\n\n"]) {
  for (const variant of [
    "valid",
    "wrong-source",
    "wrong-path",
    "missing-video",
    "changed-body",
  ]) {
    test(`video receipt source rendering: ${JSON.stringify(separator)} / ${variant}`, async (t) => {
      const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] });
      const sourceURL = "https://www.example.com/video/123";
      const renderedText =
        variant === "wrong-path"
          ? "https://example.com/video/999…"
          : "https://example.com/video/123…";
      const text = "reviewed source attribution" + separator + sourceURL;
      f.edit((s) => {
        const a = s.actions[0];
        Object.assign(a, {
          status: "unknown",
          text,
          intentAt: new Date(NOW).toISOString(),
          beforeIds: [],
          assets: [{ path: "/synthetic/clip.mp4" }],
        });
        s.items.find((i) => i.kind === "original").unknown = 1;
      });
      f.platform.readPost = async () => ({
        needsStateCheck: false,
        alerts: [],
        posts: [
          {
            id: "123",
            author: "Pei",
            body:
              (variant === "changed-body"
                ? "different"
                : "reviewed source attribution") +
              separator +
              renderedText,
            datetime: new Date(NOW).toISOString(),
            links: ["https://t.co/synthetic"],
            media: variant === "missing-video" ? [] : [{ kind: "video" }],
          },
        ],
      });
      const result = await f.harness.verifyPublishedPost({
        taskId: "round-1",
        draftPath: f.draft,
        publicURL: "https://x.com/Pei/status/123",
        evidenceRef: f.proof,
        sourceLink: {
          href: "https://t.co/synthetic",
          resolvedURL:
            variant === "wrong-source"
              ? "https://www.example.com/video/999"
              : sourceURL,
          renderedText,
          evidenceRef: f.proof,
        },
      });
      assert.equal(result.status, variant === "valid" ? "verified" : "unknown");
      assert.equal(f.writes.length, 0);
    });
  }
}
