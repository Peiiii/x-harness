/** Refine an observed second-resolution timestamp only with its matching public X ID. */
export function publicationTime(post: {
  id?: string | null;
  datetime?: string | null;
}): number {
  const rendered = Date.parse(post.datetime ?? "");
  if (!Number.isFinite(rendered)) return NaN;
  if (!/^[1-9]\d{17,19}$/.test(post.id ?? "")) return rendered;
  const id = BigInt(post.id!);
  if (id > 9223372036854775807n) return NaN;
  // Twitter's published Snowflake layout: 41 timestamp bits, 22 lower bits.
  const decoded = Number((id >> 22n) + 1288834974657n);
  if (Math.floor(decoded / 1000) !== Math.floor(rendered / 1000)) return NaN;
  if (rendered % 1000 !== 0 && rendered !== decoded) return NaN;
  return decoded;
}
