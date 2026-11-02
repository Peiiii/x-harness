import { HarnessConflict } from "./store-conflict.js";
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const object = (v: any): v is Record<string, any> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const conflict = (path: string): never => {
  throw new HarnessConflict(`原台账同一对象已变化：${path}`);
};
function collectionKey(values: any[]): string | undefined {
  return ["id", "kind"].find(
    (key) =>
      values.length > 0 &&
      values.every((v) => object(v) && typeof v[key] === "string"),
  );
}
function mergeArray(
  base: any[],
  current: any[],
  next: any[],
  path: string,
): any[] {
  const key = collectionKey([...base, ...current, ...next]);
  if (
    key &&
    [base, current, next].every(
      (a) => new Set(a.map((v) => v[key])).size === a.length,
    )
  ) {
    const maps = [base, current, next].map(
      (a) => new Map(a.map((v) => [v[key], v])),
    );
    const ids = [...new Set([...current, ...next].map((v) => v[key]))];
    return ids
      .map((id) =>
        mergeLedgerValue(
          maps[0]!.get(id),
          maps[1]!.get(id),
          maps[2]!.get(id),
          `${path}[${id}]`,
        ),
      )
      .filter((v) => v !== undefined);
  }
  if ([current, next].every((a) => base.every((v, i) => equal(v, a[i])))) {
    const result = [...current];
    for (const value of next.slice(base.length))
      if (!result.some((v) => equal(v, value))) result.push(value);
    return result;
  }
  return conflict(path);
}
/** Three-way reconciliation only merges independent mutations, never a last-write-wins edit. */
export function mergeLedgerValue(
  base: any,
  current: any,
  next: any,
  path = "state",
): any {
  if (equal(base, next)) return current;
  if (equal(base, current)) return next;
  if (
    path.endsWith(".updatedAt") &&
    [current, next].every(
      (v) => typeof v === "string" && Number.isFinite(Date.parse(v)),
    )
  )
    return Date.parse(current) > Date.parse(next) ? current : next;
  if ((base === undefined || object(base)) && object(current) && object(next)) {
    const result: Record<string, any> = {};
    for (const key of new Set([
      ...Object.keys(base ?? {}),
      ...Object.keys(current),
      ...Object.keys(next),
    ])) {
      const value = mergeLedgerValue(
        base?.[key],
        current[key],
        next[key],
        `${path}.${key}`,
      );
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  if (Array.isArray(base) && Array.isArray(current) && Array.isArray(next))
    return mergeArray(base, current, next, path);
  return conflict(path);
}
