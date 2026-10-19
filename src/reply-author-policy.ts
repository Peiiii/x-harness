import type { BoundaryRecord } from "./boundary.js";

/** Resolve explicit category corrections without discarding original reservations. */
export function replyHistoryActions(state: BoundaryRecord): BoundaryRecord[] {
  const records = [
    ...(state.replyAuthorHistory?.entries ?? []),
    ...(state.actions ?? []),
  ];
  const categories = new Map<string, unknown>();
  for (const record of records) {
    if (record.id && record.sourceCategory !== undefined)
      categories.set(record.id, record.sourceCategory);
  }
  return records
    .filter((record) => record.kind === "reply")
    .map((record) => ({
      ...record,
      sourceCategory: categories.has(record.id)
        ? categories.get(record.id)
        : record.sourceCategory,
    }));
}

export function isIncomingReply(action: BoundaryRecord): boolean {
  return ["incoming", "incoming-reply"].includes(action.sourceCategory);
}

/** Account policy counts distinct original actions, including unresolved submissions. */
export function replyAuthorReason(
  state: BoundaryRecord,
  action: BoundaryRecord,
  evidenceExists: (path: string) => boolean,
): string | null {
  const policy = state.replyAuthorPolicy;
  if (
    action.kind !== "reply" ||
    !policy ||
    !(
      action.followGapContribution ||
      ["mutual", "casual"].includes(action.sourceCategory)
    )
  )
    return null;
  if (
    policy.userAuthorized !== true ||
    policy.max !== 2 ||
    !evidenceExists(policy.evidenceRef ?? "")
  )
    return "reply-author-policy-unconfirmed";
  const handle = action.conversation?.recipientHandle
    ?.replace(/^@/, "")
    .toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(handle ?? ""))
    return "reply-author-identity-required";
  const history = state.replyAuthorHistory;
  if (!history?.complete || !evidenceExists(history.evidenceRef ?? ""))
    return "reply-author-history-unconfirmed";
  const ids = new Set<string>();
  for (const a of replyHistoryActions(state)) {
    if (isIncomingReply(a)) continue;
    const author = (a.author ?? a.conversation?.recipientHandle)
      ?.replace(/^@/, "")
      .toLowerCase();
    if (
      a.id !== action.id &&
      a.kind === "reply" &&
      author === handle &&
      ["intent", "unknown", "verified", "preexisting"].includes(a.status)
    )
      ids.add(a.id);
  }
  return ids.size >= policy.max ? "reply-author-limit" : null;
}
