import type {
  PostEvidence,
  PersonEvidence,
  FeedbackEvidence,
  ReadResult,
  ReadMode,
  Diagnostic,
  ExecutionDecision,
  LinkEvidence,
} from "./types.js";
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue =>
  value && typeof value === "object" ? (value as ObjectValue) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const strings = (value: unknown): string[] =>
  list(value).filter((v): v is string => typeof v === "string");
function pick(value: unknown, keys: string[]): ObjectValue {
  const input = object(value),
    out: ObjectValue = {};
  for (const key of keys) {
    const v = input[key];
    if (
      v !== undefined &&
      (v === null || ["string", "number", "boolean"].includes(typeof v))
    )
      out[key] = v;
  }
  return out;
}
export const stableReason = (value: unknown): string | undefined =>
  typeof value === "string"
    ? /^[a-z][a-z0-9.-]{0,95}$/.test(value)
      ? value
      : "harness-boundary-error"
    : undefined;
export function diagnostic(value: unknown): Diagnostic | undefined {
  const raw = object(value);
  if (typeof raw.code !== "string") return undefined;
  return {
    ...pick(raw, ["operation", "category", "next", "evidenceRef"]),
    code: stableReason(raw.code)!,
  } as Diagnostic;
}
export function source(value: unknown, page?: string): PostEvidence {
  const raw = object(value),
    out = pick(raw, [
      "id",
      "author",
      "datetime",
      "url",
      "body",
      "needsExpansion",
      "replyToId",
    ]) as unknown as PostEvidence;
  out.id = typeof raw.id === "string" ? raw.id : null;
  if (out.body === undefined && typeof raw.text === "string")
    out.body = raw.text;
  if (!out.url && typeof raw.primary === "string" && page) {
    try {
      out.url = new URL(raw.primary, page).href;
    } catch {
      /* explicit missing below */
    }
  }
  const identity = object(raw.authorIdentity);
  if (
    typeof out.author === "string" &&
    typeof identity.handle === "string" &&
    identity.handle.toLowerCase() === out.author.toLowerCase() &&
    identity.source === "post-card" &&
    identity.profileURL === `https://x.com/${identity.handle}`
  ) {
    out.authorIdentity = {
      handle: identity.handle,
      profileURL: identity.profileURL as string,
      name: typeof identity.name === "string" ? identity.name : null,
      source: "post-card",
      blue: identity.blue === true ? true : null,
      missing: strings(identity.missing),
    };
  }
  if (raw.metrics !== undefined)
    out.metrics = [
      ...new Set(
        list(raw.metrics).flatMap((m) => {
          const label = typeof m === "string" ? m : object(m).label;
          return typeof label === "string" &&
            /\d/.test(label) &&
            /回复|转帖|喜欢|书签|观看|查看|replies|reposts?|likes?|bookmarks?|views?/i.test(
              label,
            )
            ? [label]
            : [];
        }),
      ),
    ];
  if (raw.quoteCards)
    out.quoteCards = list(raw.quoteCards).map((v) =>
      pick(v, ["text", "datetime", "body", "author", "links"]),
    ) as typeof out.quoteCards;
  if (raw.quoteSource)
    out.quoteSource = pick(raw.quoteSource, [
      "id",
      "url",
      "author",
      "datetime",
      "body",
      "parentId",
      "cardText",
    ]) as typeof out.quoteSource;
  if (raw.images !== undefined)
    out.images = list(raw.images).map((v) => pick(v, ["src", "alt"]));
  if (raw.media !== undefined)
    out.media = list(raw.media).map((v) =>
      pick(v, [
        "kind",
        "src",
        "poster",
        "label",
        "duration",
        "requiresViewing",
      ]),
    );
  if (raw.links !== undefined)
    out.links = list(raw.links).flatMap((v): (string | LinkEvidence)[] =>
      typeof v === "string"
        ? [v]
        : typeof object(v).href === "string"
          ? [
              pick(v, ["href", "text", "label"]) as unknown as {
                href: string;
                text?: string;
                label?: string;
              },
            ]
          : [],
    );
  if (out.links)
    out.links = out.links.filter((link) => isContentLink(link, out));
  if (raw.metrics !== undefined) {
    const metrics = list(raw.metrics).flatMap((value): string[] => {
      if (typeof value === "string") return [value];
      const label = object(value).label;
      return typeof label === "string" ? [label] : [];
    });
    out.metrics = [
      ...new Set(
        metrics.filter(
          (label) =>
            /(?:回复|转帖|喜欢|书签|观看|查看|引用|replies|reply|reposts?|retweets?|likes?|bookmarks?|views?|quotes?)/i.test(
              label,
            ) && /\d/.test(label),
        ),
      ),
    ];
  }
  if (strings(raw.missing).length) out.missing = strings(raw.missing);
  return out;
}
function isContentLink(
  link: string | LinkEvidence,
  post: PostEvidence,
): boolean {
  const href = typeof link === "string" ? link : link.href;
  try {
    const url = new URL(href, post.url ?? "https://x.com");
    if (url.hostname !== "x.com") return true;
    if (
      /\/status\/\d+\/(?:analytics|quotes|retweets|likes|bookmarks)\/?$/.test(
        url.pathname,
      )
    )
      return false;
    if (
      post.author &&
      url.pathname.toLowerCase() === `/${post.author}`.toLowerCase()
    )
      return false;
    if (post.url && url.href === new URL(post.url).href) return false;
  } catch {
    /* Keep an observed unresolved link; do not infer its destination. */
  }
  return true;
}
function person(value: unknown): PersonEvidence {
  const raw = object(value),
    out = pick(raw, [
      "handle",
      "url",
      "blue",
      "relationship",
      "biography",
    ]) as unknown as PersonEvidence;
  for (const key of ["following", "followers"] as const) {
    if (raw[key] !== undefined) {
      out[key] =
        raw[key] === null
          ? null
          : pick(raw[key], ["value", "raw", "text", "precision", "url"]);
      const counter = object(raw[key]);
      if (out[key] && Array.isArray(counter.text))
        out[key]!.text = strings(counter.text);
    }
  }
  return out;
}
function feedback(value: unknown): FeedbackEvidence {
  const raw = object(value),
    out = pick(raw, ["id", "pageComplete"]) as unknown as FeedbackEvidence;
  if (raw.metrics !== undefined)
    out.metrics = list(raw.metrics).flatMap(
      (v): NonNullable<FeedbackEvidence["metrics"]> => {
        const label = typeof v === "string" ? v : object(v).label,
          value = object(v).value;
        if (
          typeof label !== "string" ||
          !/(?:回复|转帖|喜欢|书签|观看|查看|引用|replies|reply|reposts?|retweets?|likes?|bookmarks?|views?|quotes?)/i.test(
            label,
          )
        )
          return [];
        if (
          !/\d/.test(label) &&
          typeof value !== "number" &&
          typeof value !== "string"
        )
          return [];
        return [typeof v === "string" ? v : pick(v, ["label", "value"])];
      },
    );
  if (out.metrics)
    out.metrics = [
      ...new Map(
        out.metrics.map((metric) => [JSON.stringify(metric), metric]),
      ).values(),
    ];
  if (raw.replies !== undefined)
    out.replies = list(raw.replies).map((v) => source(v));
  if (raw.replyCandidates !== undefined)
    out.replyCandidates = list(raw.replyCandidates).map(
      (v) =>
        pick(v, ["id", "author", "url"]) as unknown as NonNullable<
          FeedbackEvidence["replyCandidates"]
        >[number],
    );
  if (raw.unconfirmedReplyIds !== undefined)
    out.unconfirmedReplyIds = strings(raw.unconfirmedReplyIds);
  if (strings(raw.missing).length) out.missing = strings(raw.missing);
  return out;
}
export function readResult(
  operation: string,
  value: unknown,
  mode: ReadMode,
): ReadResult {
  const raw = object(value),
    out = pick(raw, [
      "status",
      "fresh",
      "complete",
      "pageComplete",
      "evidenceRef",
      "reason",
      "offset",
      "renderedPeople",
      "moreInDOM",
    ]) as unknown as ReadResult;
  if (operation === "readPostComments" && raw.paginationBoundary)
    out.paginationBoundary = pick(raw.paginationBoundary, [
      "kind",
      "rootId",
      "pages",
      "lastId",
      "scopeComplete",
      "hiddenOrUnavailable",
    ]);
  if (operation === "readBookmarks") {
    if (raw.paginationBoundary)
      out.paginationBoundary = pick(raw.paginationBoundary, [
        "kind",
        "lastId",
        "renderedCount",
        "waitMs",
        "scopeComplete",
      ]);
    if (raw.folders !== undefined) out.folders = strings(raw.folders);
    if (typeof raw.folder === "string") out.folder = raw.folder;
    if (raw.folderEvidence)
      out.folderEvidence = pick(raw.folderEvidence, [
        "entryPage",
        "selectedPage",
        "name",
      ]);
  }
  if (out.reason) out.reason = stableReason(out.reason);
  if (!["observed", "needsDecision", "needsCapability"].includes(out.status))
    out.status = "needsDecision";
  if (out.status !== "observed" && out.complete === undefined)
    out.complete = false;
  if (raw.ids !== undefined) out.ids = strings(raw.ids);
  if (
    ["readExploreRecommendations", "readHomeRecommendations"].includes(
      operation,
    )
  ) {
    const home = operation === "readHomeRecommendations";
    const origin = object(raw.sourceOrigin);
    try {
      const page = new URL(String(origin.page));
      if (
        origin.kind ===
          (home ? "home-recommendations" : "explore-recommendations") &&
        (!home || raw.page === page.href) &&
        page.protocol === "https:" &&
        page.hostname === "x.com" &&
        !page.username &&
        !page.password &&
        !page.port &&
        page.pathname.replace(/\/+$/, "") === (home ? "/home" : "/explore") &&
        ["为你推荐", "For you"].includes(String(origin.selectedTab))
      )
        out.sourceOrigin = {
          kind: home ? "home-recommendations" : "explore-recommendations",
          page: page.href,
          selectedTab: String(origin.selectedTab) as "为你推荐" | "For you",
        };
    } catch {
      /* Unverified provenance is omitted at the public business boundary. */
    }
  }
  const missing = strings(raw.missing);
  if (list(raw.alerts).length && !missing.includes("platform-alert"))
    missing.push("platform-alert");
  if (missing.length) out.missing = missing;
  const d = diagnostic(raw.diagnostic);
  if (d) out.diagnostic = d;
  if (operation === "inspectAccount")
    Object.assign(out, pick(raw, ["accountHandle", "accountURL"]));
  if (mode === "receipt") return out;
  if (operation === "readPost") {
    if (raw.threadPosts)
      out.threadPosts = list(raw.threadPosts).map((p) =>
        source(p, typeof raw.page === "string" ? raw.page : undefined),
      );
    if (raw.context)
      out.context = list(raw.context).map((p) =>
        source(p, typeof raw.page === "string" ? raw.page : undefined),
      );
    const posts = list(raw.posts);
    if (posts.length === 1)
      out.post = source(
        posts[0],
        typeof raw.page === "string" ? raw.page : undefined,
      );
  } else if (operation === "readPeople")
    out.people = list(raw.people).map(person);
  else if (operation === "readPerson" && typeof raw.handle === "string")
    out.person = person(raw);
  else if (operation === "readCreator" && raw.profile && raw.meta) {
    const meta = object(raw.meta);
    const header = typeof meta.headerText === "string" ? meta.headerText : "";
    const timeline = object(raw.timeline);
    out.person = person(raw.profile);
    out.creator = {
      ...pick(raw, ["scrolls", "observedAt"]),
      ...(timeline.kind === "replies" &&
      typeof timeline.page === "string" &&
      typeof timeline.selectedTab === "string"
        ? {
            timeline: {
              kind: "replies" as const,
              page: timeline.page,
              selectedTab: timeline.selectedTab,
            },
          }
        : {}),
      ...pick(meta, ["totalPostsText"]),
      name: header.split("\n")[0] || null,
      joined: header.match(/\d{4}年\d{1,2}月 加入/)?.[0] ?? null,
      externalLinks: strings(meta.externalLinks).filter((href) => {
        try {
          const host = new URL(href).hostname;
          return !/(^|\.)(?:x\.com|twitter\.com)$/.test(host);
        } catch {
          return true;
        }
      }),
    };
    out.sources = list(raw.sources).map((v) => {
      const row = object(v);
      const post = source(
        v,
        typeof raw.page === "string" ? raw.page : undefined,
      );
      post.metrics = [
        ...new Set(
          [
            ...strings(row.metricDescriptions),
            ...list(row.buttons).map((b) => object(b).label),
            ...list(row.analytics).map((a) => object(a).label),
          ].filter(
            (label): label is string =>
              typeof label === "string" &&
              /(?:回复|转帖|喜欢|书签|观看|查看|replies|reposts?|likes?|bookmarks?|views?)/i.test(
                label,
              ) &&
              /\d/.test(label),
          ),
        ),
      ];
      Object.assign(
        post,
        pick(row, ["quoted", "videoElements", "quoteCards", "quoteSource"]),
      );
      return post;
    });
  } else if (raw.sources !== undefined)
    out.sources = list(raw.sources).map((v) => source(v));
  else if (raw.feedback !== undefined)
    out.feedback = list(raw.feedback).map(feedback);
  return out;
}
export function decisions(value: unknown): ExecutionDecision[] {
  return list(value).map((v) => {
    const raw = object(v),
      out = pick(raw, [
        "actionId",
        "kind",
        "status",
        "reason",
        "resumeAt",
        "owner",
        "evidenceRef",
      ]) as ExecutionDecision;
    if (out.reason) out.reason = stableReason(out.reason);
    if (strings(raw.missing).length) out.missing = strings(raw.missing);
    return out;
  });
}
