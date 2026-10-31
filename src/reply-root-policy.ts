import { readFileSync } from "node:fs";
import type { BoundaryRecord } from "./boundary.js";

/** Reuse immutable publication evidence; never treat a new child as a fresh root. */
export function replyRootAgeReason(
  action: BoundaryRecord,
  maximumHours: unknown,
  now: number,
): string | null {
  if (maximumHours === undefined) return null;
  if (
    typeof maximumHours !== "number" ||
    !Number.isFinite(maximumHours) ||
    maximumHours <= 0
  )
    return "reply-root-age-policy-invalid";
  const rootId = action.conversation?.rootId;
  if (!/^\d+$/.test(rootId ?? "")) return "reply-root-identity-required";
  const evidenceRefs = [action.freshMetricsEvidenceRef, action.evidenceRef]
    .filter((ref): ref is string => typeof ref === "string" && ref.length > 0)
    .filter((ref, index, refs) => refs.indexOf(ref) === index);
  for (const evidenceRef of evidenceRefs) {
    let observation;
    try {
      observation = JSON.parse(readFileSync(evidenceRef, "utf8")).observation;
    } catch {
      continue;
    }
    const nodes = ["posts", "context", "threadPosts", "sources"].flatMap(
      (key) => (Array.isArray(observation?.[key]) ? observation[key] : []),
    );
    if (!nodes.some((node) => node?.id === action.postId)) continue;
    const root = nodes.find((node) => node?.id === rootId);
    if (!root) continue;
    if (root.replyToId) return "reply-root-is-known-child";
    if (
      typeof root.datetime !== "string" ||
      !/(Z|[+-]\d\d:\d\d)$/.test(root.datetime)
    )
      return "reply-root-absolute-time-required";
    const published = Date.parse(root.datetime);
    if (!Number.isFinite(published) || !Number.isFinite(now) || published > now)
      return "reply-root-time-invalid";
    return now - published > maximumHours * 3600000
      ? "reply-root-expired"
      : null;
  }
  return "reply-root-publication-proof-required";
}
