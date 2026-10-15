import test from "node:test";
import assert from "node:assert/strict";
import { ThreadLikeActivation } from "../dist/thread-like-activation.js";

function state(liked = false, id = "101") {
  return `Window: "Post", App: Google Chrome.
0 标准窗口 Post, URL: x.com/Author/status/100
\t1 container 主页时间线
\t\t2 container Author @Author comment
\t\t\t3 link 下午9:00 · 2026年10月14日, Value: x.com/Author/status/${id}
\t\t\t4 文本 comment
\t\t\t5 按钮 ${liked ? "1 喜欢次数。喜欢了" : "0 喜欢次数。喜欢"}
`;
}

test("thread activation uses a single exact AX click with intent once, never a focus click plus keyboard", async () => {
  let clicked = 0,
    intents = 0,
    liked = false;
  const activation = new ThreadLikeActivation({
    getAXState: async () => state(liked),
    click: async (index) => {
      assert.equal(index, 5);
      clicked++;
      liked = true;
    },
    pressKey: async () => {
      throw Error("unexpected keyboard");
    },
  });
  const out = await activation.submit({
    post: { id: "101", author: "Author" },
    page: "https://x.com/Author/status/100",
    beforeSubmit: async () => {
      intents++;
    },
  });
  assert.equal(clicked, 1);
  assert.equal(intents, 1);
  assert.match(out.observation.posts[0].evidence.at(-1).label, /喜欢了/);
  await activation.submit({
    post: { id: "101", author: "Author" },
    page: "https://x.com/Author/status/100",
    beforeSubmit: async () => {
      intents++;
    },
  });
  assert.equal(clicked, 1);
  assert.equal(intents, 1);
});

test("changed thread, author or target cannot reach intent or click", async () => {
  for (const mismatch of [
    { page: "https://x.com/Author/status/999", author: "Author" },
    { page: "https://x.com/Author/status/100", author: "Other" },
  ]) {
    const activation = new ThreadLikeActivation({
      getAXState: async () => state(),
      click: async () => {
        throw Error("unexpected click");
      },
    });
    await assert.rejects(
      activation.submit({
        post: { id: "101", author: mismatch.author },
        page: mismatch.page,
        beforeSubmit: async () => {
          throw Error("unexpected intent");
        },
      }),
      /target-unconfirmed/,
    );
  }
});

function clipped({
  duplicate = false,
  author = "Author",
  body = "hello",
  page = "Author/status/100",
} = {}) {
  const card = (index, id) => `\t\t${index} container Author @${author} comment
\t\t\t${index + 1} link 1小时 前, Value: x.com/${author}/status/${id}
\t\t\t${index + 2} 文本 ${body}
\t\t\t${index + 3} 按钮 0 喜欢次数。喜欢\n`;
  return (
    `Window: "Post", App: Google Chrome.\n0 标准窗口 Post, URL: x.com/${page}\n\t1 container 主页时间线\n` +
    card(2, "123456789012345…") +
    (duplicate ? card(10, "123456789012345…") : "")
  );
}

test("clipped native link binds one fresh full DOM body/author/ID prefix without inventing an AX ID", async () => {
  let clicks = 0,
    intents = 0;
  const activation = new ThreadLikeActivation({
    getAXState: async () => clipped(),
    click: async (index) => {
      assert.equal(index, 5);
      clicks++;
    },
  });
  const result = await activation.submit({
    post: { id: "1234567890123456789", author: "Author", body: "hello" },
    page: "https://x.com/Author/status/100",
    beforeSubmit: async () => {
      intents++;
    },
  });
  assert.equal(clicks, 1);
  assert.equal(intents, 1);
  assert.equal(result.observation.posts[0].id, null);
});

test("clipped link ambiguity, body/author/prefix mismatch, wrong route and alerts never reach intent", async () => {
  for (const [raw, post] of [
    [clipped({ duplicate: true }), {}],
    [
      clipped({ duplicate: true }).replace(
        /123456789012345…(?=[^]*$)/,
        "1234567890123459999",
      ),
      {},
    ],
    [clipped(), { body: "other" }],
    [clipped(), { author: "Other" }],
    [clipped(), { id: "9999999999999999999" }],
    [clipped({ page: "Author/status/999" }), {}],
    [clipped() + "\n9 文本 rate limit", {}],
    [clipped(), { body: undefined }],
  ]) {
    const activation = new ThreadLikeActivation({
      getAXState: async () => raw,
      click: async () => {
        throw Error("unexpected click");
      },
    });
    await assert.rejects(
      activation.submit({
        post: {
          id: "1234567890123456789",
          author: "Author",
          body: "hello",
          ...post,
        },
        page: "https://x.com/Author/status/100",
        beforeSubmit: async () => {
          throw Error("unexpected intent");
        },
      }),
      /target-unconfirmed/,
    );
  }
});
