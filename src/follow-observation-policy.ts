/** A same-day user permit waives internal pacing, never platform refusal. */
export function followObservationAuthorized(
  state: any,
  executor: any,
  now: number,
  evidenceExists: (reference: string) => boolean,
): boolean {
  const execution = state.executions?.[executor?.id];
  const permit = execution?.followObservationAuthorization;
  if (!executor?.scopeKinds?.includes("follow") || !permit) return false;
  const start = Date.parse(permit.startsAt);
  const end = Date.parse(permit.expiresAt);
  const local = new Date(now + 8 * 3600000);
  const midnight =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
    8 * 3600000;
  const window = execution.windowAuthorization;
  const windowStart = Date.parse(window?.startsAt);
  const windowEnd = Date.parse(window?.expiresAt);
  const earlyWindow = Boolean(
    window?.kind === "follow" &&
    window.executorId === executor.id &&
    window.userAuthorized === true &&
    typeof window.evidenceRef === "string" &&
    evidenceExists(window.evidenceRef) &&
    windowStart >= midnight + 6 * 3600000 &&
    windowStart <= start &&
    end <= windowEnd &&
    now < windowEnd &&
    windowEnd <= midnight + 24 * 3600000,
  );
  return Boolean(
    permit.kind === "follow" &&
    permit.executorId === executor.id &&
    permit.taskId === state.batchId &&
    typeof permit.accountHandle === "string" &&
    permit.accountHandle.toLowerCase() === state.accountHandle?.toLowerCase() &&
    permit.userAuthorized === true &&
    typeof permit.evidenceRef === "string" &&
    evidenceExists(permit.evidenceRef) &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= midnight + (earlyWindow ? 6 : 7) * 3600000 &&
    start <= now &&
    now < end &&
    end <= midnight + 24 * 3600000,
  );
}
