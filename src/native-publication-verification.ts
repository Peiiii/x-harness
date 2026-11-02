import { sameHandle, xURL } from "./platform-rules.js";
import type { ActionTrace } from "./action-trace.js";

/** One read-only continuation avoids a model round trip for a stale native timeline. */
export class NativePublicationVerification {
  constructor(
    private findSubmission: (action: any) => Promise<any>,
    private trace: ActionTrace,
  ) {}

  async verify(action: any, submission: any) {
    const first = await this.trace.run("verify-public", () =>
      this.findSubmission(action),
    );
    if (!this.canContinue(action, submission, first)) return first;
    return this.trace.run("verify-public-continuation", () =>
      this.findSubmission(action),
    );
  }

  private canContinue(action: any, submission: any, value: any) {
    if (
      action.kind !== "original" ||
      submission?.nativeSubmissionCleared !== true ||
      value.verified !== false ||
      value.needsStateCheck ||
      value.alerts?.length ||
      !sameHandle(value.accountHandle, action.accountHandle) ||
      value.missing?.length !== 1 ||
      value.missing[0] !== "unique-public-submission-unconfirmed"
    )
      return false;
    try {
      return (
        xURL(value.page).href.replace(/\/$/, "").toLowerCase() ===
        xURL(action.accountURL).href.replace(/\/$/, "").toLowerCase()
      );
    } catch {
      return false;
    }
  }
}

/** Missing submitted editor permits one read-only receipt lookup, never acceptance or resend. */
export async function verifyMissingSubmittedEditor(
  findSubmission: (action: any) => Promise<any>,
  trace: ActionTrace,
  action: any,
  error: any,
): Promise<any | null> {
  const d = error?.submissionDiagnostic;
  if (
    action.kind !== "original" ||
    d?.code !== "submitted-editor-clear-unconfirmed" ||
    d.editorState !== "missing" ||
    d.alerts?.length ||
    !sameHandle(d.accountHandle, action.accountHandle)
  )
    return null;
  try {
    if (xURL(d.page).href !== xURL(action.composeURL).href) return null;
    const result = await trace.run("verify-public-after-editor-missing", () =>
      findSubmission(action),
    );
    return { ...result, submissionDiagnostic: d };
  } catch {
    return null;
  }
}
