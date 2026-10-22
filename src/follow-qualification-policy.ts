import type { PreparedAction } from "./types.js";
import { same } from "./growth-constants.js";

/** An explicit action-bound policy exception changes only badge screening. */
export function followBlueCheckAllowed(
  action: Extract<PreparedAction, { kind: "follow" }>,
  now: number,
  evidenceExists: (reference: string) => boolean,
  observedBlue?: boolean | null,
): boolean {
  if (action.quality?.blue === true && observedBlue !== false) return true;
  const permit = action.quality?.blueCheckException;
  if (!permit) return false;
  const expiresAt = Date.parse(permit.expiresAt);
  return Boolean(
    permit.kind === "follow-blue-check" &&
    permit.userAuthorized === true &&
    permit.actionId === action.id &&
    same(permit.handle, action.handle) &&
    same(permit.accountHandle, action.accountHandle) &&
    typeof permit.evidenceRef === "string" &&
    evidenceExists(permit.evidenceRef) &&
    typeof permit.scopeEvidenceRef === "string" &&
    evidenceExists(permit.scopeEvidenceRef) &&
    Number.isFinite(expiresAt) &&
    now < expiresAt,
  );
}
