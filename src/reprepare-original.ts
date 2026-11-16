import { isDeepStrictEqual } from "node:util";
import { DraftSchedule } from "./draft-schedule.js";

export interface OriginalRepreparation {
  actionId: string;
  expectedAction: Record<string, unknown>;
  evidenceRef: string;
}

/** Explicit reviewed revision of a never-submitted skipped stable action. */
export function reprepareOriginal(
  state: any,
  stored: any,
  incoming: any,
  decision: any,
  guardInput: (state: any, action: any) => any,
  evidenceExists: (ref: string) => boolean,
  stamp: () => string,
): boolean {
  const requests = decision.reprepareOriginals;
  if (!Array.isArray(requests)) return false;
  const matches = requests.filter((r: any) => r?.actionId === stored.id);
  if (matches.length !== 1)
    throw new Error("original-repreparation-request-invalid");
  const request = matches[0];
  if (
    stored.kind !== "original" ||
    stored.status !== "skipped" ||
    incoming.kind !== "original" ||
    incoming.status !== "prepared" ||
    incoming.id !== stored.id ||
    incoming.accountHandle !== stored.accountHandle ||
    incoming.draftPath !== stored.draftPath ||
    // The caller may run in a host VM; compare values in the SDK realm.
    !isDeepStrictEqual(structuredClone(request.expectedAction), stored)
  )
    throw new Error("original-repreparation-snapshot-mismatch");
  const history = stored.preparationHistory ?? [];
  if (!Array.isArray(history))
    throw new Error("original-repreparation-history-invalid");
  if (
    [stored, incoming].some(protectedHistory) ||
    [...(state.attempts ?? []), ...(decision.sharedAttempts ?? [])].some(
      (a: any) => a.actionId === stored.id,
    )
  )
    throw new Error("original-repreparation-protected-history");
  if (
    !evidenceExists(request.evidenceRef) ||
    request.evidenceRef !== incoming.quality?.evidenceRef ||
    request.evidenceRef === stored.quality?.evidenceRef ||
    !incoming.notBefore ||
    !incoming.notAfter ||
    new DraftSchedule().resolve(incoming).invalid
  )
    throw new Error("original-repreparation-fresh-review-window-required");
  const reason = guardInput(state, incoming);
  if (reason && reason !== "draft-not-before-not-reached")
    throw new Error(reason);
  const previous = structuredClone(stored);
  delete previous.preparationHistory;
  const revised = structuredClone(incoming);
  delete revised.preparationHistory;
  // Retain all original history; callers cannot replace it with supplied history.
  revised.preparationHistory = [
    ...structuredClone(history),
    { action: previous, evidenceRef: request.evidenceRef, revisedAt: stamp() },
  ];
  for (const key of Object.keys(stored)) delete stored[key];
  Object.assign(stored, revised);
  return true;
}

function protectedHistory(action: any): boolean {
  if (!action || typeof action !== "object") return true;
  const history = action.preparationHistory ?? [];
  return (
    [
      "intentAt",
      "activatedAt",
      "submittedAt",
      "claim",
      "publicId",
      "publicURL",
    ].some((key) => action[key] !== undefined) ||
    action.userRejected === true ||
    action.revoked === true ||
    action.authorizationRevoked === true ||
    ["intent", "unknown", "verified", "preexisting"].includes(action.status) ||
    !Array.isArray(history) ||
    history.some((entry: any) => protectedHistory(entry?.action))
  );
}
