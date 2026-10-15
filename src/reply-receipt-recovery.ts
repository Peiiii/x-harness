import { sameHandle, samePublishedText } from "./platform-rules.js";
import { publicationTime } from "./publication-time.js";
import type { RoundStore } from "./store.js";
import type { ActionResult, XGrowthHarness } from "./types.js";
import type { BoundaryRecord } from "./boundary.js";

/** One bounded public lookup and original-action binding lifecycle; never submits. */
export class ReplyReceiptRecovery {
  #store: RoundStore;
  #clock: () => number;
  #api: Pick<
    XGrowthHarness,
    "searchSources" | "readCreator" | "verifySubmission"
  >;
  constructor(
    store: RoundStore,
    clock: () => number,
    api: Pick<
      XGrowthHarness,
      "searchSources" | "readCreator" | "verifySubmission"
    >,
  ) {
    this.#store = store;
    this.#clock = clock;
    this.#api = api;
  }
  public async run(taskId: string, results: ActionResult[]) {
    const snapshot = await this.#store.load();
    if (snapshot.state.batchId !== taskId) return;
    const pending = results
      .filter((r) => r.status === "unknown")
      .map((r) =>
        snapshot.state.actions.find((a: BoundaryRecord) => a.id === r.actionId),
      )
      .filter(
        (a: BoundaryRecord | undefined) =>
          a?.kind === "reply" &&
          ["unknown", "intent"].includes(a.status) &&
          !a.observedPublicURL &&
          typeof a.text === "string" &&
          a.text.trim() &&
          /^[A-Za-z0-9_]{1,15}$/.test(a.accountHandle ?? "") &&
          Number.isFinite(Date.parse(a.intentAt)),
      ) as BoundaryRecord[];
    if (
      !pending.length ||
      !pending.every((a) =>
        sameHandle(a.accountHandle, pending[0].accountHandle),
      )
    )
      return;
    const phrases = pending
      .map((a) => '"' + a.text.slice(0, 80).replace(/["\\]/g, " ") + '"')
      .join(" OR ");
    const recipients = pending.map(
      (a) => a.conversation?.recipientHandle ?? a.author,
    );
    const recipientQuery = recipients.every((h) =>
      /^[A-Za-z0-9_]{1,15}$/.test(h ?? ""),
    )
      ? [...new Set(recipients)].map((h) => `to:${h}`).join(" OR ")
      : phrases;
    const query = `from:${pending[0].accountHandle} (${recipientQuery}) filter:replies`;
    let found = await this.#api.searchSources({
      query,
      limit: 5,
      maxPages: 1,
      mode: "decision",
    });
    if (
      !found.sources?.length &&
      found.missing?.includes("source-page-unconfirmed")
    )
      found = await this.#api.searchSources({
        query,
        limit: 5,
        maxPages: 1,
        mode: "decision",
      });
    if (
      found.fresh &&
      found.evidenceRef &&
      !found.sources?.length &&
      !found.missing?.includes("platform-alert")
    ) {
      const own = await this.#api.readCreator({
        handle: pending[0].accountHandle,
        timeline: "replies",
        target: 10,
        maxScrolls: 1,
        mode: "decision",
      });
      if (
        own.fresh &&
        own.evidenceRef &&
        own.creator?.timeline?.kind === "replies" &&
        sameHandle(own.person?.handle, pending[0].accountHandle) &&
        !own.missing?.includes("platform-alert")
      )
        found = own;
    }
    if (!found.fresh || !found.evidenceRef) return;
    for (const action of pending) {
      const matches = (found.sources ?? []).filter(
        (p) =>
          sameHandle(p.author, action.accountHandle) &&
          samePublishedText(p.body, action.text) &&
          /^\d+$/.test(p.id ?? "") &&
          !p.needsExpansion &&
          p.url?.toLowerCase() ===
            `https://x.com/${action.accountHandle}/status/${p.id}`.toLowerCase() &&
          !(action.beforeIds ?? []).includes(p.id) &&
          publicationTime(p) >= Date.parse(action.intentAt) &&
          publicationTime(p) <= this.#clock() + 5000,
      );
      if (matches.length !== 1) continue;
      let bound = false;
      await this.#store.transaction(({ state }) => {
        const current = state.actions.find(
          (a: BoundaryRecord) => a.id === action.id,
        );
        if (
          state.batchId === taskId &&
          current?.status === "unknown" &&
          current.intentAt === action.intentAt &&
          current.postId === action.postId &&
          current.text === action.text &&
          !current.observedPublicURL &&
          !current.claim
        ) {
          current.observedPublicURL = matches[0].url;
          current.observedPublicEvidenceRef = found.evidenceRef;
          bound = true;
        }
        return state;
      });
      if (bound) {
        const recovered = await this.#api.verifySubmission({
          taskId,
          actionId: action.id,
        });
        const index = results.findIndex((r) => r.actionId === action.id);
        if (index >= 0) results[index] = recovered;
      }
    }
  }
}
