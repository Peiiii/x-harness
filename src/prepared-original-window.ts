import { isDeepStrictEqual } from "node:util";

export function canRenewOriginalWindow(
  state: any,
  stored: any,
  incoming: any,
): boolean {
  if (
    stored.kind !== "original" ||
    stored.status !== "prepared" ||
    stored.intentAt ||
    stored.activatedAt ||
    stored.claim ||
    stored.publicId ||
    (state.attempts ?? []).some(
      (attempt: any) => attempt.actionId === stored.id,
    )
  )
    return false;

  const previous = structuredClone(stored);
  const proposed = structuredClone(incoming);
  delete previous.notBefore;
  delete previous.notAfter;
  delete proposed.notBefore;
  delete proposed.notAfter;
  if (!isDeepStrictEqual(previous, proposed)) return false;

  for (const boundary of ["notBefore", "notAfter"] as const) {
    const value = incoming[boundary];
    if (value !== undefined && typeof value !== "string") return false;
    if (value !== undefined && !Number.isFinite(Date.parse(value)))
      return false;
    if (stored[boundary] !== undefined && value === undefined) return false;
  }
  if (
    incoming.notBefore === stored.notBefore &&
    incoming.notAfter === stored.notAfter
  )
    return false;
  if (
    incoming.notBefore !== undefined &&
    incoming.notAfter !== undefined &&
    Date.parse(incoming.notAfter) <= Date.parse(incoming.notBefore)
  )
    return false;
  return true;
}
