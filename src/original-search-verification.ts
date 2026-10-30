import { publicationTime } from "./publication-time.js";
import {
  sameHandle,
  samePublishedText,
  matchesReviewedAssets,
  xURL,
} from "./platform-rules.js";

/** A read-only receipt alternative after submission; never a baseline or activation. */
export class OriginalSearchVerification {
  constructor(
    private find: (action: any, context?: any) => Promise<any>,
    private search: (input: any) => Promise<any>,
    private clock: () => number,
  ) {}

  async verify(action: any, context?: any): Promise<any> {
    let original, failure: string | undefined;
    const allowed =
      action.kind === "original" &&
      context?.phase !== "baseline" &&
      ["intent", "unknown"].includes(action.status) &&
      Array.isArray(action.beforeIds) &&
      Number.isFinite(Date.parse(action.intentAt)) &&
      !action.assets?.length &&
      !action.quoteTarget;
    try {
      original = await this.find(action, context);
      if (
        !allowed ||
        original.verified ||
        original.alerts?.length ||
        (!original.loadError &&
          !original.missing?.includes("unique-public-submission-unconfirmed"))
      )
        return original;
      failure = "original-public-receipt-unconfirmed";
    } catch (error: any) {
      if (
        !allowed ||
        !/timed out|timeout|deadline exceeded/i.test(String(error.message))
      )
        throw error;
      failure = error.message;
    }
    const phrase = action.text
      .split(/\n+/)
      .sort((a: string, b: string) => b.length - a.length)[0]
      .replace(/"/g, "")
      .trim()
      .slice(0, 100);
    if (!phrase)
      return (
        original ?? { verified: false, missing: ["search-phrase-unavailable"] }
      );
    const query = `from:${action.accountHandle} "${phrase}" since:${action.intentAt.slice(0, 10)}`;
    let value;
    try {
      value = await this.search({ query, limit: 5, maxPages: 1 });
    } catch (error: any) {
      return {
        ...original,
        verified: false,
        missing: ["public-search-read-failed"],
        publicRecovery: {
          method: "exact-search-after-receipt-failure",
          originalError: failure,
          searchError: String(error.message),
        },
      };
    }
    let route = false;
    try {
      const u = xURL(value.page);
      route = u.pathname === "/search" && u.searchParams.get("q") === query;
    } catch {}
    const trusted =
      route &&
      value.query === query &&
      value.fresh === true &&
      sameHandle(value.accountHandle, action.accountHandle) &&
      !value.needsStateCheck &&
      !value.alerts?.length;
    const matches = trusted
      ? (value.sources ?? []).filter((p: any) => {
          let permalink = false;
          try {
            permalink =
              xURL(p.url).pathname.toLowerCase() ===
              `/${action.accountHandle}/status/${p.id}`.toLowerCase();
          } catch {}
          return (
            permalink &&
            /^\d+$/.test(p.id ?? "") &&
            sameHandle(p.author, action.accountHandle) &&
            samePublishedText(p.body, action.text) &&
            !p.needsExpansion &&
            !p.missing?.length &&
            p.replyToId == null &&
            matchesReviewedAssets(p, action.assets) &&
            !p.quoteSource &&
            !p.quoteCards?.length &&
            !action.beforeIds.includes(p.id) &&
            publicationTime(p) >= Date.parse(action.intentAt) &&
            publicationTime(p) <= this.clock() + 5000
          );
        })
      : [];
    return {
      ...value,
      posts: matches,
      verified: matches.length === 1,
      publicId: matches.length === 1 ? matches[0].id : null,
      missing:
        matches.length === 1 ? [] : ["unique-public-submission-unconfirmed"],
      publicRecovery: {
        method: "exact-search-after-receipt-failure",
        originalError: failure,
      },
    };
  }
}
