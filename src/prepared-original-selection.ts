/** Retain submitted history; only an untouched skipped action can be superseded. */
export function selectPreparedOriginal(state: any, draftPath: string): any {
  const matches = (state.actions ?? []).filter(
    (action: any) =>
      action.kind === "original" && action.draftPath === draftPath,
  );
  const current = matches.filter(
    (action: any) =>
      !(
        action.status === "skipped" &&
        !action.intentAt &&
        !action.activatedAt &&
        !action.claim &&
        !action.publicId &&
        !(state.attempts ?? []).some(
          (attempt: any) => attempt.actionId === action.id,
        )
      ),
  );
  if (current.length === 1) return current[0];
  return matches[0];
}
