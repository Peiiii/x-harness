import { open } from "node:fs/promises";
import { executorWindowAllowed } from "./growth-policy.js";
import type { RoundStore } from "./store.js";
import type {
  CuaTab,
  Executor,
  PostMediaOptions,
  PostMediaResult,
  ReadResult,
  PostEvidence,
  XGrowthHarness,
} from "./types.js";

interface AssetPort {
  list(): Promise<{
    id: string;
    pageUrl: string | null;
    assets: { id: string; kind: string; url: string }[];
  }>;
  bundle(options: { inventoryId: string; assetIds: string[] }): Promise<{
    assets: {
      id: string;
      url: string;
      path: string;
      contentType: string | null;
    }[];
    failures: unknown[];
  }>;
}

/** Export only images already observed on the exact freshly read post. */
export class PostMedia {
  constructor(
    private tab: CuaTab,
    private store: RoundStore,
    private clock: () => number = Date.now,
    private executor?: Executor,
  ) {}
  private async allowed() {
    const { state } = await this.store.load();
    const now = this.clock(),
      hour = new Date(now + 8 * 3600000).getUTCHours();
    const permit =
      state.executions?.[this.executor?.id ?? ""]?.windowAuthorization;
    if (permit)
      return executorWindowAllowed(
        state,
        this.executor,
        permit.kind,
        now,
        (ref) => this.store.evidenceExists(ref),
      );
    return hour >= 7 && hour < 24;
  }
  private route(
    url: string | null,
    post: { id: string | null; author?: string | null },
  ) {
    if (!url || !post.author || !post.id) return false;
    try {
      const u = new URL(url);
      return (
        u.protocol === "https:" &&
        u.hostname === "x.com" &&
        new RegExp(
          `^/${post.author}/status/${post.id}(?:/history|/photo/[0-9]+)?/?$`,
          "i",
        ).test(u.pathname)
      );
    } catch {
      return false;
    }
  }
  private async imageType(path: string) {
    const file = await open(path, "r");
    try {
      const bytes = Buffer.alloc(12);
      await file.read(bytes, 0, 12, 0);
      const hex = bytes.toString("hex");
      if (hex.startsWith("ffd8ff")) return "image/jpeg";
      if (hex.startsWith("89504e470d0a1a0a")) return "image/png";
      if (/^GIF8[79]a/.test(bytes.toString("ascii"))) return "image/gif";
      if (
        bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP"
      )
        return "image/webp";
      return null;
    } finally {
      await file.close();
    }
  }
  private async fromDOM(
    p: PostEvidence,
    images: string[],
    result: PostMediaResult,
    timeoutMs: number,
  ) {
    result.acquisition = "dom-media";
    if (!this.tab.playwright?.locator) {
      result.status = "needsCapability";
      result.reason = "dom-media-unavailable";
      return result;
    }
    for (const src of images) {
      if (!(await this.allowed())) {
        result.reason = "night-platform-boundary";
        return result;
      }
      if (!this.route(await this.tab.url(), p)) {
        result.reason = "media-route-changed";
        return result;
      }
      const href = new URL(p.url!).pathname;
      const locator = this.tab.playwright.locator(
        `article:has(a[href=${JSON.stringify(href)}]) img[src=${JSON.stringify(src)}]`,
      );
      if (!locator.downloadMedia) {
        result.status = "needsCapability";
        result.reason = "dom-media-unavailable";
        return result;
      }
      if ((await locator.count()) !== 1) {
        result.reason = "media-dom-image-unconfirmed";
        return result;
      }
      if (!(await this.allowed())) {
        result.reason = "night-platform-boundary";
        return result;
      }
      const path = await locator.downloadMedia({ timeoutMs });
      const contentType = await this.imageType(path);
      if (!contentType) {
        result.reason = "media-format-unconfirmed";
        return result;
      }
      result.images.push({ src, path, contentType });
    }
    if (!(await this.allowed())) {
      result.reason = "night-platform-boundary";
      return result;
    }
    result.complete = this.route(await this.tab.url(), p);
    result.status = result.complete ? "observed" : "needsDecision";
    if (!result.complete) result.reason = "media-route-changed";
    return result;
  }
  async read(
    options: PostMediaOptions,
    readPost: XGrowthHarness["readPost"],
  ): Promise<PostMediaResult> {
    let result: PostMediaResult = {
      status: "needsDecision",
      complete: false,
      images: [],
    };
    let assetInventory: unknown;
    const finish = async () => ({
      ...result,
      evidenceRef: await this.store.recordProof({
        operation: "readPostMedia",
        assetInventory,
        capturedAt: new Date(this.clock()).toISOString(),
        result,
      }),
    });
    try {
      const max = options.maxImages ?? 4;
      const timeoutMs = options.timeoutMs ?? 10000;
      if (
        !Number.isInteger(max) ||
        max < 1 ||
        max > 4 ||
        !Number.isFinite(timeoutMs) ||
        timeoutMs < 1000 ||
        timeoutMs > 30000
      ) {
        result.reason = "media-options-invalid";
        return finish();
      }
      if (
        !options.target?.postId ||
        !options.target.url ||
        !options.target.evidenceRef
      ) {
        result.reason = "media-target-invalid";
        return finish();
      }
      if (!this.tab.capabilities?.get && !this.tab.playwright?.locator) {
        result.status = "needsCapability";
        result.reason = "page-assets-unavailable";
        return finish();
      }
      if (!(await this.allowed())) {
        result.reason = "night-platform-boundary";
        return finish();
      }
      const source: ReadResult = await readPost({
        target: options.target,
        mode: "decision",
      });
      result.sourceEvidenceRef = source.evidenceRef;
      const p = source.post;
      if (
        source.status !== "observed" ||
        !source.fresh ||
        !source.complete ||
        !p ||
        p.id !== options.target.postId ||
        !/^\w{1,15}$/.test(p.author ?? "") ||
        !/^\d+$/.test(p.id ?? "") ||
        !this.route(p.url ?? null, p) ||
        !this.route(options.target.url, p) ||
        p.needsExpansion ||
        p.missing?.length ||
        !source.evidenceRef ||
        !this.store.evidenceExists(source.evidenceRef)
      ) {
        result.reason = "media-source-unconfirmed";
        return finish();
      }
      if (p.quoteCards?.length) {
        result.reason = "quoted-media-scope-unconfirmed";
        return finish();
      }
      const images = [
        ...new Set((p.images ?? []).map((image) => image.src ?? "")),
      ];
      if (!images.length) {
        result.status = "observed";
        result.complete = true;
        return finish();
      }
      if (images.length > max) {
        result.reason = "media-limit-incomplete";
        return finish();
      }
      if (
        images.some((src) => {
          try {
            const u = new URL(src);
            return (
              u.protocol !== "https:" ||
              u.hostname !== "pbs.twimg.com" ||
              !u.pathname.startsWith("/media/")
            );
          } catch {
            return true;
          }
        })
      ) {
        result.reason = "media-image-origin-unconfirmed";
        return finish();
      }
      if (!this.tab.capabilities?.get) {
        result = await this.fromDOM(p, images, result, timeoutMs);
        return finish();
      }
      const cap = (await this.tab.capabilities.get("pageAssets")) as AssetPort;
      if (
        typeof cap?.list !== "function" ||
        typeof cap?.bundle !== "function"
      ) {
        result.status = "needsCapability";
        result.reason = "page-assets-unavailable";
        return finish();
      }
      if (!(await this.allowed())) {
        result.reason = "night-platform-boundary";
        return finish();
      }
      const inventory = await cap.list();
      assetInventory = inventory;
      if (
        !this.route(inventory.pageUrl, p) ||
        !this.route(await this.tab.url(), p)
      ) {
        result.reason = "media-route-changed";
        return finish();
      }
      const selected = images.map((src) =>
        inventory.assets.find((a) => a.kind === "image" && a.url === src),
      );
      if (selected.some((a) => !a)) {
        result = await this.fromDOM(p, images, result, timeoutMs);
        return finish();
      }
      if (!(await this.allowed())) {
        result.reason = "night-platform-boundary";
        return finish();
      }
      result.acquisition = "page-assets";
      const exported = await cap.bundle({
        inventoryId: inventory.id,
        assetIds: selected.map((a) => a!.id),
      });
      result.images = selected.flatMap((a) => {
        const asset = exported.assets.find(
          (x) =>
            x.id === a!.id &&
            x.url === a!.url &&
            x.path &&
            x.contentType?.startsWith("image/"),
        );
        return asset
          ? [
              {
                src: asset.url,
                path: asset.path,
                contentType: asset.contentType!,
              },
            ]
          : [];
      });
      if (!(await this.allowed())) {
        result.reason = "night-platform-boundary";
        return finish();
      }
      result.complete =
        result.images.length === images.length &&
        !exported.failures.length &&
        this.route(await this.tab.url(), p);
      result.status = result.complete ? "observed" : "needsDecision";
      if (!result.complete) result.reason = "media-export-incomplete";
      return finish();
    } catch (error) {
      result.reason = "media-read-failed";
      result.error = String(error);
      return finish();
    }
  }
}
