import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CuaTab, PostEvidence, PostMediaResult } from "./types.js";
import type { RoundStore } from "./store.js";

/** Read cached bytes for an exact loaded source image, without network or navigation. */
export class PostMediaCache {
  constructor(
    private tab: CuaTab,
    private store: RoundStore,
    private allowed: () => Promise<boolean>,
    private validSource: () => boolean,
  ) {}
  private route(url: unknown, p: PostEvidence) {
    if (typeof url !== "string" || !p.author || !p.id) return false;
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname === "x.com" &&
      new RegExp(
        `^/${p.author}/status/${p.id}(?:/photo/[0-9]+|/history)?/?$`,
        "i",
      ).test(u.pathname)
    );
  }
  private type(bytes: Buffer) {
    const hex = bytes.subarray(0, 12).toString("hex");
    if (hex.startsWith("ffd8ff")) return "image/jpeg";
    if (hex.startsWith("89504e470d0a1a0a")) return "image/png";
    if (/^GIF8[79]a/.test(bytes.toString("ascii", 0, 6))) return "image/gif";
    if (
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP"
    )
      return "image/webp";
    return null;
  }
  async read(p: PostEvidence, images: string[], result: PostMediaResult) {
    const fail = (reason: string) => {
      result.reason = reason;
      return result;
    };
    if (!this.tab.capabilities?.get || !this.tab.playwright?.locator)
      return fail("page-cache-unavailable");
    const cdp = (await this.tab.capabilities.get("cdp")) as {
      send(method: string, params?: Record<string, unknown>): Promise<any>;
    };
    if (typeof cdp?.send !== "function") return fail("page-cache-unavailable");
    if (!(await this.allowed())) return fail("night-platform-boundary");
    if (!this.validSource() || !this.route(await this.tab.url(), p))
      return fail("media-route-changed");
    const tree = await cdp.send("Page.getFrameTree");
    const frame = tree?.frameTree?.frame;
    if (!frame?.id || !this.route(frame.url, p))
      return fail("media-frame-unconfirmed");
    for (const src of images) {
      if (!(await this.allowed())) return fail("night-platform-boundary");
      if (!this.route(await this.tab.url(), p))
        return fail("media-route-changed");
      const href = new URL(p.url!).pathname;
      const locator = this.tab.playwright.locator(
        `article:has(a[href=${JSON.stringify(href)}]) img[src=${JSON.stringify(src)}]`,
      );
      if ((await locator.count()) !== 1 || !locator.evaluate)
        return fail("media-dom-image-unconfirmed");
      const loaded = await locator.evaluate((element: any) => ({
        src: element.currentSrc,
        complete: element.complete,
        width: element.naturalWidth,
        height: element.naturalHeight,
      }));
      if (
        loaded.src !== src ||
        !loaded.complete ||
        !loaded.width ||
        !loaded.height
      )
        return fail("media-cache-image-not-loaded");
      const response = await cdp.send("Page.getResourceContent", {
        frameId: frame.id,
        url: src,
      });
      if (
        !response?.base64Encoded ||
        typeof response.content !== "string" ||
        !response.content.length ||
        response.content.length > 36_000_000 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(response.content)
      )
        return fail("media-cache-content-unconfirmed");
      const bytes = Buffer.from(response.content, "base64"),
        contentType = this.type(bytes);
      if (!contentType) return fail("media-format-unconfirmed");
      if (!(await this.allowed())) return fail("night-platform-boundary");
      if (!this.route(await this.tab.url(), p))
        return fail("media-route-changed");
      const proof = await this.store.recordProof({
        operation: "post-media-cache",
        postId: p.id,
        src,
        frameURL: frame.url,
        naturalWidth: loaded.width,
        naturalHeight: loaded.height,
        byteLength: bytes.length,
        contentType,
      });
      const path = join(
        dirname(proof),
        `source-image-${randomUUID()}.${contentType.split("/")[1]}`,
      );
      await writeFile(path, bytes, { flag: "wx" });
      result.images.push({ src, path, contentType });
    }
    if (!(await this.allowed())) return fail("night-platform-boundary");
    result.complete = this.route(await this.tab.url(), p);
    result.status = result.complete ? "observed" : "needsDecision";
    if (!result.complete) result.reason = "media-route-changed";
    return result;
  }
}
