import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, open } from "node:fs/promises";
import { join } from "node:path";
import {
  xAPIPath,
  networkRates,
  type XNetworkRecord,
} from "./network-events.js";
import { shanghaiDay } from "./network-journal.js";

/** Import a local, user-approved native extension export into the same replay format. */
export async function importNativeXNetworkExport(
  inputPath: string,
  directory: string,
) {
  const bytes = await readFile(inputPath, "utf8");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const input = JSON.parse(bytes);
  if (
    input.schema !== "x-native-network-export/v1" ||
    !Array.isArray(input.records) ||
    !input.health?.runId
  )
    throw new Error("invalid-native-network-export");
  const allowed = [
    "eventId",
    "sequence",
    "sourceId",
    "runId",
    "method",
    "requestId",
    "requestMethod",
    "location",
    "endpoint",
    "status",
    "occurredAt",
    "wallTime",
    "timeQuality",
    "observedAt",
    "fromCache",
    "latencyMs",
    "orphanResponse",
    "orphanFailure",
    "errorText",
  ];
  const groups = new Map<string, XNetworkRecord[]>();
  for (const raw of input.records) {
    if (
      xAPIPath(raw.location) !== raw.location ||
      !raw.eventId ||
      !raw.sourceId ||
      !Number.isFinite(Date.parse(raw.occurredAt))
    )
      throw new Error("invalid-native-network-record");
    const record: any = Object.fromEntries(
      allowed
        .filter((key) => raw[key] !== undefined)
        .map((key) => [key, raw[key]]),
    );
    if (record.errorText && !/^net::ERR_[A-Z0-9_]+$/.test(record.errorText))
      record.errorText = "unclassified-network-error";
    record.endpoint = record.location.replace(
      /\/i\/api\/graphql\/[^/]+\//,
      "/i/api/graphql/",
    );
    const rate = raw.rateLimit ?? {};
    record.rateLimit = networkRates({
      "x-rate-limit-limit": rate.limit,
      "x-rate-limit-remaining": rate.remaining,
      "x-rate-limit-reset": rate.resetAt
        ? Date.parse(rate.resetAt) / 1000
        : undefined,
      "retry-after": rate.retryAfterSeconds,
    });
    const day = shanghaiDay(Date.parse(record.occurredAt));
    const group = groups.get(day) ?? [];
    group.push(record);
    groups.set(day, group);
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const metadataPath = join(directory, "import-meta.json");
  try {
    const handle = await open(metadataPath, "wx", 0o600);
    try {
      await handle.writeFile(
        JSON.stringify({ digest, exportedAt: input.exportedAt }) + "\n",
      );
    } finally {
      await handle.close();
    }
  } catch (error: any) {
    if (error.code !== "EEXIST") throw error;
    const previous = JSON.parse(await readFile(metadataPath, "utf8"));
    if (previous.digest !== digest)
      throw new Error("native-export-requires-new-snapshot-directory");
  }
  const runs = input.runs ?? [input.health];
  for (const [day, records] of groups) {
    const sources = new Map<string, any>();
    const outputPath = join(directory, `${day}.jsonl`);
    const seen = new Set<string>();
    try {
      for (const line of (await readFile(outputPath, "utf8"))
        .trim()
        .split("\n")) {
        if (!line) continue;
        const b = JSON.parse(line);
        for (const source of b.sources ?? [])
          for (const r of source.records ?? []) seen.add(r.eventId);
      }
    } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
    }
    for (const r of records) {
      if (seen.has(r.eventId)) continue;
      seen.add(r.eventId);
      const source = sources.get(r.sourceId) ?? {
        sourceId: r.sourceId,
        tabId: r.sourceId.split(":").at(-1),
        records: [],
      };
      source.records.push(r);
      sources.set(r.sourceId, source);
    }
    const batch = {
      schema: "x-network-batch/v1",
      transport: "chrome-webRequest",
      runId: input.health.runId,
      observedAt: input.exportedAt,
      from: runs[0]?.startedAt,
      sources: [...sources.values()],
      gaps: runs.flatMap((r: any) => r.gaps ?? []),
    };
    if (sources.size)
      await writeFile(outputPath, JSON.stringify(batch) + "\n", {
        mode: 0o600,
        flag: "a",
      });
  }
  const health = {
    ...input.health,
    degraded: !!input.captureError,
    captureError: input.captureError,
    intervalMs: 60000,
  };
  await writeFile(
    join(directory, "health.json"),
    JSON.stringify(health, null, 2) + "\n",
    { mode: 0o600 },
  );
  return {
    schema: "x-native-network-import/v1",
    records: input.records.length,
    days: groups.size,
    directory,
    health,
  };
}
