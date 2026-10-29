import { networkRates, xAPIPath } from "./network-events.js";
import type { ObservedReadHttp } from "./read-failure-types.js";

const property = (value: unknown, key: string): unknown => {
  try {
    return value && (typeof value === "object" || typeof value === "function")
      ? (value as Record<string, unknown>)[key]
      : undefined;
  } catch {
    return undefined;
  }
};
/** Project only supplied response evidence. No browser call, quota inference or recovery mutation. */
export function observedReadHttp(value: unknown): ObservedReadHttp | undefined {
  const status = property(value, "status");
  if (
    typeof status !== "number" ||
    !Number.isInteger(status) ||
    status < 400 ||
    status > 599 ||
    property(value, "scope") !== "failed-read-operation"
  )
    return;
  const at = property(value, "observedAt");
  if (typeof at !== "string" || !Number.isFinite(Date.parse(at))) return;
  const out: ObservedReadHttp = {
    status,
    scope: "failed-read-operation",
    observedAt: new Date(at).toISOString(),
  };
  const endpoint = xAPIPath(property(value, "endpoint"));
  if (endpoint) out.endpoint = endpoint;
  for (const key of ["limit", "remaining", "retryAfterSeconds"] as const) {
    const v = property(value, key);
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[key] = v;
  }
  const reset = property(value, "resetAt");
  if (typeof reset === "string" && Number.isFinite(Date.parse(reset)))
    out.resetAt = new Date(reset).toISOString();
  return out;
}
function failureStatus(
  error: unknown,
  suppliedMessage?: string,
): number | undefined {
  const status =
    property(property(error, "response"), "status") ??
    property(error, "status");
  if (
    typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 400 &&
    status <= 599
  )
    return status;
  const raw = property(error, "message");
  const message =
    suppliedMessage ??
    (typeof error === "string" ? error : typeof raw === "string" ? raw : "");
  const match = message.match(
    /\bHTTP[- :]*([45]\d{2})\b|\bstatus(?: code| of)?[: =]+([45]\d{2})\b|server responded[^\n]*\b([45]\d{2})\b/i,
  );
  return match ? Number(match[1] ?? match[2] ?? match[3]) : undefined;
}
export function explicitHttp429(error: unknown, suppliedMessage?: string) {
  return failureStatus(error, suppliedMessage) === 429;
}
export function classifyReadFailure(error: unknown, observedAt: string) {
  const raw = property(error, "message");
  const message =
    typeof error === "string"
      ? error
      : typeof raw === "string"
        ? raw
        : "read-failure-message-unavailable";
  const code = property(error, "code"),
    response = property(error, "response");
  const status = failureStatus(error, message);
  let rates = {};
  if (status !== undefined) {
    try {
      const headers = property(response, "headers");
      if (headers && typeof headers === "object")
        rates = networkRates(headers as Record<string, unknown>) ?? {};
    } catch {
      /* Missing response fields remain unknown. */
    }
  }
  const http =
    status !== undefined
      ? observedReadHttp({
          status,
          scope: "failed-read-operation",
          observedAt,
          endpoint: property(response, "url") ?? property(error, "url"),
          ...rates,
        })
      : undefined;
  const category = http
    ? http.status === 429
      ? http.endpoint
        ? "platform-rate-limit"
        : "http-rate-limit"
      : http.endpoint
        ? "platform-http-error"
        : "http-error"
    : /connection|transport|interrupted|extension|node_repl exec context not found/i.test(
          message,
        )
      ? "browser-connection"
      : "ui-not-confirmed";
  return {
    message,
    category,
    code:
      code === "CONFLICT"
        ? "ledger-conflict"
        : /same-tab-or-executor-claimed/.test(message)
          ? "tab-busy"
          : http
            ? `http-${http.status}`
            : category === "browser-connection"
              ? "connection-failed"
              : "observation-unconfirmed",
    ...(http ? { observedHttp: http } : {}),
  };
}
