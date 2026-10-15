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
