import type { BoundaryRecord } from "./boundary.js";
import { parseAXNodes } from "./readers-ax-tree.js";
import { readAX } from "./readers-ax-parser.js";

/** Finite discovery in the currently selected, exactly named native folder. */
export class NativeBookmarkCollector {
  constructor(private low: BoundaryRecord, private state: () => string) {}
  async collect({ folder, discoverOnly = false, resume = false, processedIds = [], maxPages = 3, limit = 1 }: any): Promise<any> {
    if (resume && discoverOnly) throw Error("bookmark-resume-discovery-conflict");
    if (discoverOnly) return { complete: false, sources: [], missing: ["native.bookmark-folder-inventory"] };
    if (typeof folder !== "string" || !folder.trim() || !Array.isArray(processedIds) ||
        processedIds.some((x: any) => typeof x !== "string" || !/^\d+$/.test(x)) ||
        !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 5 ||
        !Number.isInteger(limit) || limit < 1 || limit > 50) throw Error("Invalid native bookmark window");
    const seen = new Set(processedIds), inspected = new Set<string>(), sources: any[] = [], missing = new Set<string>();
    let selectedPage = "", lastId: string | null = null, pages = 0, previous = "", offset = 0;
    const result = () => ({ folder, folderEvidence: { entryPage: selectedPage, selectedPage, name: folder },
      sources, inspectedIds: [...inspected], complete: false, pageComplete: false,
      missing: [...missing, "native-bookmark-bounded-window"],
      paginationBoundary: { kind: "native-selected-folder-window", lastId, renderedCount: inspected.size, scopeComplete: false }, pages });
    for (let page = 0; page < maxPages; page++) {
      const observation = await this.low.observe({ mode: "posts", offset, limit: 5 });
      const raw = this.state(), nodes = parseAXNodes(raw);
      const tabs = nodes.filter((n: any) => /^(?:标签|tab) \(selected\) /.test(n.label) && n.label.split(", Value:")[0].replace(/^(?:标签|tab) \(selected\) /, "").trim() === folder);
      const headings = nodes.filter((n: any) => /^(?:标题|heading) /.test(n.label) && n.label.split(", Value:")[0].replace(/^(?:标题|heading) /, "").trim() === folder);
      const own = readAX(raw, { mode: "navigation" }).evidence.filter((n: any) => /^link 个人资料, Value: x\.com\/\w+$/.test(n.label));
      if (!/^https?:\/\//.test(observation.page ?? "")) observation.page = observation.page ? "https://" + observation.page : "";
      if (!/^https:\/\/x\.com\/(?:i\/history\/bookmarks|i\/bookmarks)\/\d+\/?$/.test(observation.page) ||
          tabs.length !== 1 || headings.length !== 1 || own.length !== 1 || observation.needsStateCheck || observation.alerts?.length ||
          (selectedPage && selectedPage !== observation.page)) {
        missing.add("native-bookmark-folder-unconfirmed"); return result();
      }
      selectedPage = observation.page; pages++;
      const ids = (observation.posts ?? []).map((p: any) => p.id).join(",");
      if (page && ids === previous) { missing.add("native-bookmark-no-new-window"); return result(); }
      previous = ids;
      for (const post of observation.posts ?? []) {
        if (!post.id || !post.author || inspected.has(post.id)) continue;
        inspected.add(post.id); lastId = post.id;
        if (seen.has(post.id)) continue;
        const detailMissing = [...(post.missing ?? []), "native-source-detail-and-media-review-required"];
        sources.push({ ...post, body: post.text, url: `https://x.com/${post.author}/status/${post.id}`,
          images: [], media: [], missing: detailMissing });
        if (sources.length >= limit) return result();
      }
      if (page + 1 >= maxPages) break;
      if (observation.moreInDOM) { offset += 5; continue; }
      offset = 0;
      const anchor = observation.posts?.flatMap((p: any) => p.evidence ?? []).find((e: any) => /^link .*Value: x\.com\/\w+\/status\/\d+(?:,|$)/.test(e.label));
      if (!anchor) { missing.add("native-bookmark-scroll-anchor-unconfirmed"); return result(); }
      await this.low.act({ index: anchor.index, operation: "scroll", value: "down", read: { mode: "posts", limit: 5 } });
    }
    return result();
  }
}
