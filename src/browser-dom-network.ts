// Read-only transport diagnostics through the same real Chrome tab capability.
// Never return credential headers, cookies or bodies; only numeric rate metadata is allowed.
export async function readXNetworkDiagnostics(
  tab: any,
  { afterSequence = 0, startObserving = false }: any = {},
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
    ],
  });
  const isXAPI = (u: URL) =>
    (u.hostname === "x.com" && u.pathname.startsWith("/i/api/")) ||
    u.hostname === "api.x.com";
  const requestLocations = new Map<string, string>();
  const traffic = new Map<string, any>();
  const times: number[] = [];
  for (const event of result.events) {
    const p = event.params ?? {};
    let u: URL;
    try {
      u = new URL(p.response?.url ?? p.request?.url);
    } catch {
      continue;
    }
    if (!isXAPI(u)) continue;
    const location = u.origin + u.pathname;
    if (p.requestId) requestLocations.set(p.requestId, location);
    const row = traffic.get(location) ?? {
      location,
      requests: 0,
      responses: 0,
      statuses: {},
    };
    if (event.method === "Network.requestWillBeSent") row.requests++;
    if (event.method === "Network.responseReceived") {
      row.responses++;
      const status = p.response?.status;
      if (Number.isInteger(status))
        row.statuses[status] = (row.statuses[status] ?? 0) + 1;
    }
    if (Number.isFinite(p.timestamp)) times.push(p.timestamp);
    traffic.set(location, row);
  }
  const rates = (headers: Record<string, unknown> = {}) => {
    const allowed: Record<string, number> = {};
    for (const [key, value] of Object.entries(headers)) {
      const name = key.toLowerCase();
      if (
        ![
          "x-rate-limit-limit",
          "x-rate-limit-remaining",
          "x-rate-limit-reset",
          "retry-after",
        ].includes(name)
      )
        continue;
      if (!/^\d{1,12}$/.test(String(value).trim())) continue;
      allowed[name] = Number(value);
    }
    const out: Record<string, number | string> = {};
    if (allowed["x-rate-limit-limit"] !== undefined)
      out.limit = allowed["x-rate-limit-limit"];
    if (allowed["x-rate-limit-remaining"] !== undefined)
      out.remaining = allowed["x-rate-limit-remaining"];
    if (allowed["x-rate-limit-reset"] !== undefined) {
      const date = new Date(allowed["x-rate-limit-reset"] * 1000);
      if (Number.isFinite(date.getTime())) out.resetAt = date.toISOString();
    }
    if (allowed["retry-after"] !== undefined)
      out.retryAfterSeconds = allowed["retry-after"];
    return Object.keys(out).length ? out : undefined;
  };
  return {
    cursor: result.cursor,
    hasMore: result.hasMore,
    truncated: result.truncated,
    traffic: {
      complete: !result.truncated && !result.hasMore,
      requests: [...traffic.values()].reduce((n, r) => n + r.requests, 0),
      responses: [...traffic.values()].reduce((n, r) => n + r.responses, 0),
      durationSeconds:
        times.length > 1 ? Math.max(...times) - Math.min(...times) : null,
      endpointCount: traffic.size,
      endpoints: [...traffic.values()]
        .sort((a, b) => b.requests - a.requests)
        .slice(0, 10),
    },
    events: result.events
      .map((e: any) => {
        const p = e.params ?? {};
        const response = p.response ?? {};
        let location: any;
        try {
          const u = new URL(response.url ?? p.request?.url);
          location =
            ["http:", "https:"].includes(u.protocol) && isXAPI(u)
              ? u.origin + u.pathname
              : null;
        } catch {
          location = requestLocations.get(p.requestId) ?? null;
        }
        return {
          method: e.method,
          requestId: p.requestId,
          location,
          requestMethod: p.request?.method,
          status: response.status,
          errorText: p.errorText,
          canceled: p.canceled,
          timestamp: Number.isFinite(p.timestamp) ? p.timestamp : undefined,
          wallTime: Number.isFinite(p.wallTime) ? p.wallTime : undefined,
          rateLimit: rates(response.headers),
        };
      })
      .filter(
        (e: any) =>
          e.location &&
          (e.method === "Network.loadingFailed" ||
            e.status >= 400 ||
            e.requestMethod === "POST" ||
            /\/(EditTweet|CreateTweet)[A-Za-z0-9_]*$/.test(e.location)),
      ),
  };
}
