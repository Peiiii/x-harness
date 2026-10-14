import { createAXHarness } from "./readers-ax-host.js";
import { sameHandle, xURL } from "./platform-rules.js";

/** Chrome's locator press focuses by clicking first. Likes use one AX press. */
export class ThreadLikeActivation {
  #low: ReturnType<typeof createAXHarness>;
  constructor(tab: any) {
    this.#low = createAXHarness({
      getAXState: (options: any) => tab.getAXState(options),
      click: (index: number) => tab.click(index),
    });
  }
  public async submit(args: any) {
    const query = { mode: "posts", targetId: args.post.id, limit: 1 };
    const raw = await this.#low.observe(query);
    const post = raw.posts?.[0];
    if (
      raw.needsStateCheck ||
      raw.alerts?.length ||
      raw.posts?.length !== 1 ||
      post.id !== args.post.id ||
      !sameHandle(post.author, args.post.author) ||
      xURL(raw.page).href !== args.page
    )
      throw Error("thread-like-native-target-unconfirmed");
    const controls = (post.evidence ?? []).filter((e: any) =>
      /^(?:按钮|切换按钮) .*?(?:喜欢|Likes?|Unlike)/i.test(e.label),
    );
    if (controls.length !== 1 || /disabled/.test(controls[0].label))
      throw Error("thread-like-native-control-unconfirmed");
    if (/喜欢了|取消喜欢|Unlike|Liked/i.test(controls[0].label))
      return { preexisting: true };
    await args.beforeSubmit?.();
    const after = await this.#low.act({
      index: controls[0].index,
      operation: "click",
      read: query,
    });
    return { observation: after };
  }
}
