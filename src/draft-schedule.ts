import { existsSync, readFileSync } from "node:fs";

// Only explicit original draft metadata constrains submission, never quoted body.
export class DraftSchedule {
  resolve(action: any): { at?: string; invalid?: boolean } {
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
    if (!declared.length) return {};
    if (
      declared.some(
        (v) =>
          typeof v !== "string" ||
          !/(?:Z|[+-]\d{2}:\d{2})$/.test(v) ||
          !Number.isFinite(Date.parse(v)),
      )
    )
      return { invalid: true };
    return {
      at: new Date(
        Math.max(...declared.map((v) => Date.parse(v))),
      ).toISOString(),
    };
  }
  reason(action: any, now: number): string | null {
    const schedule = this.resolve(action);
    if (schedule.invalid) return "draft-not-before-invalid";
    return schedule.at && now < Date.parse(schedule.at)
      ? "draft-not-before-not-reached"
      : null;
  }
}
