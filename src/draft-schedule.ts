import { existsSync, readFileSync } from "node:fs";

// Only explicit original draft metadata constrains submission, never quoted body.
export class DraftSchedule {
  resolve(action: any): {
    at?: string;
    until?: string;
    invalid?: boolean;
    invalidAfter?: boolean;
  } {
    if (action.kind !== "original") return {};
    const text =
      action.draftPath && existsSync(action.draftPath)
        ? readFileSync(action.draftPath, "utf8")
        : "";
    const metadata = text.split(/^##\s/m, 1)[0];
    const declared = [
      action.notBefore,
      ...Array.from(
        metadata.matchAll(
          /^(?:notBefore\s*:\s*|最早发布窗口[：:]\s*)([^\n;；]+)/gm,
        ),
        (m) => m[1].trim().replace(/^['"]|['"]$/g, ""),
      ),
    ].filter((v) => v !== undefined && v !== null);
    const endings = [
      action.notAfter,
      ...Array.from(
        metadata.matchAll(
          /^(?:notAfter\s*:\s*|最晚发布窗口[：:]\s*)([^\n;；]+)/gm,
        ),
        (m) => m[1].trim().replace(/^['"]|['"]$/g, ""),
      ),
    ].filter((v) => v !== undefined && v !== null);
    if (
      endings.some(
        (v) =>
          typeof v !== "string" ||
          !/(?:Z|[+-]\d{2}:\d{2})$/.test(v) ||
          !Number.isFinite(Date.parse(v)),
      )
    )
      return { invalid: true, invalidAfter: true };
    const until = endings.length
      ? new Date(Math.min(...endings.map((v) => Date.parse(v)))).toISOString()
      : undefined;
    if (!declared.length) return until ? { until } : {};
    if (
      declared.some(
        (v) =>
          typeof v !== "string" ||
          !/(?:Z|[+-]\d{2}:\d{2})$/.test(v) ||
          !Number.isFinite(Date.parse(v)),
      )
    )
      return { invalid: true };
    const at = new Date(
      Math.max(...declared.map((v) => Date.parse(v))),
    ).toISOString();
    if (until && Date.parse(until) <= Date.parse(at))
      return { invalid: true, invalidAfter: true };
    return { at, ...(until ? { until } : {}) };
  }
  reason(action: any, now: number): string | null {
    const schedule = this.resolve(action);
    if (schedule.invalid)
      return schedule.invalidAfter
        ? "draft-not-after-invalid"
        : "draft-not-before-invalid";
    if (schedule.until && now >= Date.parse(schedule.until))
      return "draft-window-expired";
    return schedule.at && now < Date.parse(schedule.at)
      ? "draft-not-before-not-reached"
      : null;
  }
}
