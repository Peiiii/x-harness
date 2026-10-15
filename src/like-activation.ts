import { readAX } from "./readers-ax-parser.js";
import { sameHandle, sameText, xURL } from "./platform-rules.js";

/** Like toggles require one native activation, never locator keyboard focus. */
export class NativeLikeActivation {
  readonly #tab: any;
  constructor(tab: any) {
    this.#tab = tab;
  }
  private target(state: string, args: any) {
    const raw = readAX(state, { mode: "posts", limit: 5 });
    if (
      raw.needsStateCheck ||
      raw.alerts?.length ||
      xURL(raw.page).href !== args.page
    )
      throw Error("like-native-target-unconfirmed");
    // Page the same immutable full snapshot in memory, not repeated UI reads.
    const posts = [...raw.posts];
    for (let offset = 5; offset < raw.renderedArticles; offset += 5)
      posts.push(...readAX(state, { mode: "posts", offset, limit: 5 }).posts);
    const exact = posts.filter((p: any) => p.id === args.post.id);
    const sameBody = posts.filter(
      (p: any) =>
        sameText(p.text, args.post.body) &&
        p.evidence.some((e: any) =>
          sameHandle(
            e.label.match(/x\.com\/(\w+)\/status\//)?.[1],
            args.post.author,
          ),
        ),
    );
    const candidates = exact.length
      ? exact.filter((p: any) => sameHandle(p.author, args.post.author))
      : sameBody.length !== 1
        ? []
        : sameBody.filter(
            (p: any) =>
              p.id === null &&
              sameText(p.text, args.post.body) &&
              p.evidence.some((e: any) => {
                const link = e.label.match(
                  /x\.com\/(\w+)\/status\/(\d{12,})…(?:,|$)/,
                );
                return (
                  link &&
                  sameHandle(link[1], args.post.author) &&
                  args.post.id.startsWith(link[2])
                );
              }),
          );
    if (exact.length > 1 || candidates.length !== 1)
      throw Error("like-native-target-unconfirmed");
    return { ...raw, posts: candidates };
  }
  public async submit(args: any) {
    const raw = this.target(
      await this.#tab.getAXState({ emit: false, disableDiffing: true }),
      args,
    );
    const controls = raw.posts[0].evidence.filter((e: any) =>
      /^(?:按钮|切换按钮) .*?(?:喜欢|Likes?|Unlike)/i.test(e.label),
    );
    if (controls.length !== 1 || /disabled/.test(controls[0].label))
      throw Error("like-native-control-unconfirmed");
    if (/喜欢了|取消喜欢|Unlike|Liked/i.test(controls[0].label))
      return { preexisting: true };
    await args.beforeSubmit?.();
    await this.#tab.click(controls[0].index);
    return {
      observation: this.target(
        await this.#tab.getAXState({ emit: false, disableDiffing: true }),
        args,
      ),
    };
  }
}
