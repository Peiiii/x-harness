import { XNetworkDecoder, summarizeNetworkRecords } from "./network-events.js";

/** Read existing protocol events; observing never navigates or sends an X request. */
export async function readXNetworkDiagnostics(
  tab: any,
  {
    afterSequence = 0,
    startObserving = false,
    decoder = new XNetworkDecoder(),
    sourceId = "diagnostic",
  }: any = {},
): Promise<any> {
  if (typeof tab?.capabilities?.get !== "function")
    throw new Error("缺真实Chrome诊断能力");
  const cdp = await tab.capabilities.get("cdp");
  if (typeof cdp?.readEvents !== "function")
    throw new Error("缺只读网络事件能力");
  if (startObserving) await cdp.send("Network.enable");
  const result = await cdp.readEvents({
    afterSequence,
    limit: 1000,
    methods: [
      "Network.requestWillBeSent",
      "Network.responseReceived",
      "Network.loadingFailed",
      "Network.loadingFinished",
    ],
  });
  const decoded = decoder.decode(
    result.events,
    sourceId,
    new Date().toISOString(),
  );
  const traffic = summarizeNetworkRecords(decoded.records);
  return {
    cursor: result.cursor,
    hasMore: result.hasMore,
    truncated: result.truncated,
    traffic: { complete: !result.truncated && !result.hasMore, ...traffic },
    records: decoded.records,
    unmatchedFailures: decoded.unmatchedFailures,
    correlationEvictions: decoded.correlationEvictions,
    events: decoded.records.filter(
      (r: any) =>
        r.method === "Network.loadingFailed" ||
        (r.status ?? 0) >= 400 ||
        r.requestMethod === "POST" ||
        r.rateLimit ||
        /\/(EditTweet|CreateTweet)[A-Za-z0-9_]*$/.test(r.location),
    ),
  };
}
