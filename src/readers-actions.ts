import { readComposer } from "./readers-composer.js";
import { readPosts } from "./readers-posts.js";

// Upload only through the observed media button and browser file chooser.
export async function attachImage(tab: any, { path }: any = {}): Promise<any> {
  if (!/^\/.*\.(?:png|jpe?g|webp|mp4)$/i.test(path ?? ""))
    throw new Error("需要绝对图片或MP4路径");
  if (
    typeof tab?.playwright?.evaluate !== "function" ||
    typeof tab?.playwright?.getByRole !== "function" ||
    typeof tab?.playwright?.waitForEvent !== "function"
  )
    throw new Error("harness能力不足：DOM图片选择器");
  const before = await tab.playwright.evaluate(readComposer);
  if (before.needsStateCheck || before.alerts?.length)
    throw new Error("图片上传前编辑器未确认");
  const buttons = before.buttons.filter(
    (b: any) =>
      /^(添加照片或视频|Add photos or video)$/i.test(b.label) && !b.disabled,
  );
  if (buttons.length !== 1) throw new Error("图片按钮未唯一观察");
  const button = tab.playwright.getByRole("button", {
    name: buttons[0].label,
    exact: true,
  });
  if ((await button.count()) !== 1 || typeof button.click !== "function")
    throw new Error("图片按钮未唯一定位");
  const chooserPromise = tab.playwright.waitForEvent("filechooser", {
    timeoutMs: 10000,
  });
  await button.click();
  const chooser = await chooserPromise;
  if (typeof chooser?.setFiles !== "function")
    throw new Error("harness能力不足：setFiles");
  await chooser.setFiles([path]);
  return tab.playwright.evaluate(readComposer);
}

export async function openReply(tab: any, { postId }: any = {}): Promise<any> {
  if (!/^\d+$/.test(postId ?? "")) throw new Error("需要已观察公开ID");
  if (
    typeof tab?.playwright?.evaluate !== "function" ||
    typeof tab?.playwright?.locator !== "function"
  )
    throw new Error("harness能力不足：精准回复范围");
  const state = await tab.playwright.evaluate(readPosts, {
    targetId: postId,
    limit: 1,
  });
  const post = state.posts[0];
  if (
    state.needsStateCheck ||
    state.alerts.length ||
    state.posts.length !== 1 ||
    post.missing.length ||
    post.needsExpansion
  )
    throw new Error("回复根帖证据未完整");
  const buttons = post.buttons.filter(
    (b: any) => /回复|Reply/i.test(b.label) && !b.disabled,
  );
  if (buttons.length !== 1) throw new Error("回复按钮未唯一观察");
  const article = tab.playwright
    .locator("article")
    .filter({ has: tab.playwright.locator(`a[href="${post.primary}"]`) });
  if ((await article.count()) !== 1) throw new Error("回复文章范围不唯一");
  const button = article.getByRole("button", {
    name: buttons[0].label,
    exact: true,
  });
  if ((await button.count()) !== 1) throw new Error("回复控件不唯一");
  await button.click();
  return tab.playwright.evaluate(readComposer);
}
