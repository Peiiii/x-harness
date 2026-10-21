import { xAPIPath, networkRates } from "./network-events.js";

export const captureURLs = ["https://x.com/i/api/*", "https://api.x.com/*"];
const phases = {
  request: "Network.requestWillBeSent",
  response: "Network.responseReceived",
  cache: "Network.responseStarted",
  completed: "Network.loadingFinished",
  failed: "Network.loadingFailed",
};
/** Only these fields can enter storage. Raw browser payloads never enter the database. */
export function nativeEvent(
  phase,
  details,
  { installId, sessionId, runId, sequence, observedAt },
) {
  const location = xAPIPath(details.url);
  if (
    !location ||
    !phases[phase] ||
    !Number.isFinite(details.timeStamp) ||
    typeof details.requestId !== "string"
  )
    return null;
  const headers = {};
  for (const h of details.responseHeaders ?? [])
    if (
      typeof h.name === "string" &&
      [
        "x-rate-limit-limit",
        "x-rate-limit-remaining",
        "x-rate-limit-reset",
        "retry-after",
      ].includes(h.name.toLowerCase())
    )
      headers[h.name] = h.value;
  const eventId = [
    installId,
    sessionId,
    details.requestId,
    phase,
    details.timeStamp,
    details.statusCode ?? "",
    location,
  ].join(":");
  return {
    eventId,
    sequence,
    sourceId: [
      installId,
      sessionId,
      Number.isInteger(details.tabId) ? details.tabId : -1,
    ].join(":"),
    runId,
    method: phases[phase],
    requestId: details.requestId,
    requestMethod:
      typeof details.method === "string" ? details.method : undefined,
    location,
    endpoint: location.replace(/\/i\/api\/graphql\/[^/]+\//, "/i/api/graphql/"),
    status:
      phase === "response" && Number.isInteger(details.statusCode)
        ? details.statusCode
        : undefined,
    occurredAt: new Date(details.timeStamp).toISOString(),
    wallTime: details.timeStamp / 1000,
    timeQuality: "browser-wall-clock",
    observedAt,
    fromCache:
      typeof details.fromCache === "boolean" ? details.fromCache : undefined,
    rateLimit: phase === "response" ? networkRates(headers) : undefined,
    ...(phase === "failed"
      ? {
          errorText: /^net::ERR_[A-Z0-9_]+$/.test(details.error)
            ? details.error
            : "unclassified-network-error",
        }
      : {}),
  };
}
