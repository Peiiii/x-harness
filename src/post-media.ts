import { executorWindowAllowed } from "./growth-policy.js";
import type { RoundStore } from "./store.js";
import type {
  CuaTab,
  Executor,
  PostMediaOptions,
  PostMediaResult,
  ReadResult,
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
  async read(
    options: PostMediaOptions,
    readPost: XGrowthHarness["readPost"],
  ): Promise<PostMediaResult> {
    let result: PostMediaResult = {
      status: "needsDecision",
      complete: false,
      images: [],
    };
    const finish = async () => ({
      ...result,
      evidenceRef: await this.store.recordProof({
        operation: "readPostMedia",
        capturedAt: new Date(this.clock()).toISOString(),
        result,
      }),
    });
    try {
      const max = options.maxImages ?? 4;
      if (!Number.isInteger(max) || max < 1 || max > 4) {
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
      if (!this.tab.capabilities?.get) {
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
        result.reason = "media-inventory-incomplete";
        return finish();
      }
      if (!(await this.allowed())) {
        result.reason = "night-platform-boundary";
        return finish();
      }
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
