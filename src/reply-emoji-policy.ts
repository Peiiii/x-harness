import { createHash } from "node:crypto";

const hasEmoji = (text: string) =>
  /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(text);

export function replyEmojiReason(
  state: any,
  action: any,
  policy: any,
): string | null {
  // New draft policy must never obstruct recovery of a prior submission.
  if (!policy || action.status !== "prepared" || action.intentAt) return null;
  if (
    !Number.isFinite(policy.sampleRate) ||
    policy.sampleRate < 0 ||
    policy.sampleRate > 1 ||
    !Number.isInteger(policy.maxInRecent) ||
    policy.maxInRecent < 0 ||
    policy.maxInRecent > 10
  )
    return "reply-emoji-policy-invalid";
  if (!hasEmoji(action.text ?? "")) return null;
  const recent = (state.actions ?? [])
    .filter(
      (a: any) =>
        a.kind === "reply" &&
        a.id !== action.id &&
        ["intent", "unknown", "verified"].includes(a.status) &&
        Number.isFinite(Date.parse(a.intentAt)),
    )
    .sort((a: any, b: any) => Date.parse(b.intentAt) - Date.parse(a.intentAt))
    .slice(0, 9);
  if (hasEmoji(recent[0]?.text ?? "")) return "reply-emoji-consecutive";
  if (
    recent.filter((a: any) => hasEmoji(a.text ?? "")).length + 1 >
    policy.maxInRecent
  )
    return "reply-emoji-rolling-budget";
  const draw =
    createHash("sha256")
      .update("reply-emoji-v1:" + action.id)
      .digest()
      .readUInt32BE(0) / 0x100000000;
  return draw < policy.sampleRate ? null : "reply-emoji-not-selected";
}
