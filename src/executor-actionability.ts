/** An explicit executor-local restriction never relaxes account-wide refusals. */
export function actionableForExecutor(
  state: any,
  kind: string,
  executor: any,
  evidenceExists: (path: any) => boolean,
): boolean {
  const item = state.items.find((i: any) => i.kind === kind);
  if (item?.actionable === true) return true;
  const restriction = item?.executionRestriction;
  return Boolean(
    restriction?.scope === "executor" &&
    restriction.executorId &&
    restriction.reason === item.reason &&
    item.blockEvidence?.includes(restriction.evidenceRef) &&
    executor?.id &&
    restriction.executorId !== executor.id &&
    executor.scopeKinds?.includes(kind) &&
    evidenceExists(executor.evidenceRef) &&
    evidenceExists(restriction.evidenceRef) &&
    state.executions?.[restriction.executorId]?.scopeKinds?.some(
      (scope: string) => ["follow", "reply", "original"].includes(scope),
    ),
  );
}

/** Read telemetry is not a durable claim on a tab or an executor. */
export function executionHoldsPage(execution: any): boolean {
  return Boolean(
    execution.actionId ||
    (execution.activity &&
      !/^(?:read[A-Z]|searchSources$)/.test(execution.activity)),
  );
}
