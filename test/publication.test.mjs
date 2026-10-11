import test from "node:test";
import assert from "node:assert/strict";
import { createXPlatform } from "../dist/diagnostics.js";

const time = Date.parse("2026-10-11T13:58:58Z");
const action = {
  kind: "original",
  accountHandle: "owner",
  accountURL: "https://x.com/owner",
  accountEvidenceRef: "profile-proof",
  text: "已发布。\n\nhttps://x-harness.gemigo.app/",
  intentAt: "2026-10-11T13:58:23Z",
  beforeIds: ["9"],
  assets: [{ alt: "reviewed screenshot" }],
};
const post = {
  id: "10",
  author: "owner",
  body: action.text.slice(0, -1),
  datetime: "2026-10-11T13:58:31Z",
  images: [{ alt: "reviewed screenshot" }],
  primary: "/owner/status/10",
  needsExpansion: false,
};
async function verify(posts, inputAction = action) {
  const platform = createXPlatform(
    {
      capabilities: () => ["refreshPosts"],
      observe: async () => ({
        page: action.accountURL,
        accountHandle: "owner",
        needsStateCheck: false,
        alerts: [],
        posts,
      }),
      act: () => {
        throw Error("Replay must not operate a browser");
      },
    },
    { clock: () => time },
  );
  return platform.findSubmission(inputAction);
}
test("published root URL slash rendering verifies once with author, intent time, baseline and reviewed image", async () => {
  const result = await verify([post]);
  assert.equal(result.verified, true);
  assert.equal(result.publicId, "10");
});
test("URL equivalence does not weaken body, host, path, query, author, media or time verification", async () => {
  for (const changed of [
    { body: post.body.replace("已发布", "未发布") },
    { body: post.body.replace("gemigo.app", "other.app") },
    { body: post.body + "/other" },
    { body: post.body + "?different=1" },
    { author: "other" },
    { images: [] },
    { id: "9" },
    { datetime: "2026-10-11T13:58:00Z" },
    { needsExpansion: true },
  ])
    assert.equal(
      (await verify([{ ...post, ...changed }])).verified,
      false,
      JSON.stringify(changed),
    );
  assert.equal((await verify([post, { ...post, id: "11" }])).verified, false);
});

test("MP4 publication requires a video on the exact fresh post", async () => {
  const videoAction = { ...action, assets: [{ path: "/synthetic/clip.mp4" }] };
  assert.equal(
    (
      await verify(
        [{ ...post, images: [], media: [{ kind: "video" }] }],
        videoAction,
      )
    ).verified,
    true,
  );
  for (const media of [[], [{ kind: "image" }]])
    assert.equal(
      (await verify([{ ...post, media }], videoAction)).verified,
      false,
    );
});
