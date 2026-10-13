import { readFileSync, existsSync } from "node:fs";

const phases = [
  "RUNNING",
  "VERIFYING",
  "SETTLING",
  "WAITING",
  "BLOCKED",
  "COMPLETE",
];
export function checkRound(
  state: any,
  { now = Date.now(), evidenceExists = existsSync }: any = {},
): any {
  const errors: any[] = [];
  const require = (ok: any, message: any) => {
    if (!ok) errors.push(message);
  };
  require(state && phases.includes(state.status), "运行标记缺失或无效");
  require(typeof state?.batchId === "string" &&
    state.batchId.length > 0, "原批次ID缺失");
  require(Number.isFinite(Date.parse(state?.updatedAt)), "实际更新时间缺失");
  const items = state?.items ?? [];
  const scope = state?.scopeKinds ?? ["follow", "original", "reply"];
  require(Array.isArray(scope) &&
    scope.length > 0 &&
    new Set(scope).size === scope.length &&
    scope.every((k: any) =>
      ["follow", "original", "reply"].includes(k),
    ), "轮次职责范围无效");
  if (state?.scopeKinds)
    require(typeof state.scopeEvidenceRef === "string" &&
      evidenceExists(state.scopeEvidenceRef), "职责分工缺原合同证据");
  require(Array.isArray(items) &&
    items.length === 3, "必须逐项核关注、原创、回复");
  for (const kind of ["follow", "original", "reply"]) {
    const matches = items.filter((i: any) => i.kind === kind);
    require(matches.length === 1, `${kind}缺失或重复`);
  }
  const pending: any[] = [];
  for (const item of items) {
    require(["planned", "verified", "unknown"].every(
      (k: any) => Number.isInteger(item[k]) && item[k] >= 0,
    ), `${item.kind}数量必须为非负整数`);
    require(item.verified <= item.planned &&
      item.unknown <=
        item.planned - item.verified, `${item.kind}未知不得算成功`);
    require(typeof item.actionable ===
      "boolean", `${item.kind}当前可执行性缺失`);
    require(item.verified === 0 ||
      (Array.isArray(item.resultEvidence) &&
        item.resultEvidence.length > 0 &&
        item.resultEvidence.every(
          evidenceExists,
        )), `${item.kind}完成量缺真实结果证据`);
    if (
      Array.isArray(scope) &&
      scope.includes(item.kind) &&
      (item.verified < item.planned || item.unknown > 0)
    )
      pending.push(item);
  }
  const closing = ["WAITING", "BLOCKED", "COMPLETE"].includes(state?.status);
  if (state?.status === "COMPLETE")
    require(pending.length === 0, "目标有欠量或未知，禁止标完成");
  if (state?.status === "WAITING" || state?.status === "BLOCKED") {
    require(pending.length > 0, "无剩余项不得伪造等待或阻塞");
    require(pending.every(
      (i: any) => i.actionable === false,
    ), "仍有当前可执行项，禁止结束");
    for (const item of pending) {
      require(typeof item.reason === "string" &&
        item.reason.trim().length > 0, `${item.kind}缺具体等待/阻塞原因`);
      require(typeof item.resumeWhen === "string" &&
        item.resumeWhen.trim().length > 0, `${item.kind}缺恢复条件`);
      require(Array.isArray(item.blockEvidence) &&
        item.blockEvidence.length > 0 &&
        item.blockEvidence.every(
          evidenceExists,
        ), `${item.kind}缺存在的阻塞证据`);
    }
    require(state.stop?.independentActionsHandled ===
      true, "未核独立可执行事项，禁止结束");
    require(Number.isFinite(Date.parse(state.stop?.nextScheduledCheckAt)) &&
      Date.parse(state.stop.nextScheduledCheckAt) >
        now, "下一真实调度检查机会缺失或已到，必须接续");
    if (state.status === "WAITING")
      require(Number.isFinite(Date.parse(state.stop?.nextEligibleCheckAt)) &&
        Date.parse(state.stop.nextEligibleCheckAt) >
          now, "等待条件已到或缺失，必须接续");
    if (state.status === "BLOCKED")
      require(new Set(state.stop?.attemptedPaths ?? []).size >=
        2, "单一路径失败不足以结束：须核独立替代路径");
  }

  // Reply sourcing is work: an empty queue is never an exit permission.
  if (
    state?.scopeKinds?.length === 1 &&
    state.scopeKinds[0] === "reply" &&
    ["WAITING", "BLOCKED"].includes(state.status)
  ) {
    const exit = state.stop?.replyExit;
    const allowed = [
      "platform-restriction",
      "authentication-required",
      "tool-unavailable",
      "user-stop",
      "outside-window",
      "pending-results",
    ];
    require(exit &&
      allowed.includes(
        exit.reason,
      ), "评论专责缺许可停止原因；候选不足、空队列或等待下次唤醒必须继续");
    if (exit && allowed.includes(exit.reason)) {
      require(typeof exit.evidenceRef === "string" &&
        evidenceExists(exit.evidenceRef), "评论停止缺真实限制证据");
      require(typeof exit.independentEvidenceRef === "string" &&
        evidenceExists(
          exit.independentEvidenceRef,
        ), "评论停止缺独立可做项审计证据");
      const age = now - Date.parse(exit.observedAt);
      require(Number.isFinite(age) &&
        age >= 0 &&
        age <= 300000, "评论停止证据必须为最近5分钟实际观察");
      const reply = items.find((item: any) => item.kind === "reply");
      if (exit.reason === "pending-results")
        require(reply &&
          reply.unknown > 0 &&
          reply.planned - reply.verified ===
            reply.unknown, "未提交欠量仍在；未知提交不能冻结新对象");
      if (exit.reason === "outside-window") {
        const shanghaiHour = (new Date(now).getUTCHours() + 8) % 24;
        require(shanghaiHour <
          7, "仍在上海07至24点评论执行窗口，不能以时段截止结束");
      }
      if (exit.reason === "user-stop")
        require(typeof exit.instructionEvidenceRef === "string" &&
          evidenceExists(
            exit.instructionEvidenceRef,
          ), "用户停止须有明确原指令证据");
    }
  }
  return {
    valid: errors.length === 0,
    mayEnd: closing && errors.length === 0,
    status: state?.status,
    scopeKinds: scope,
    pending: pending.map((i: any) => ({
      kind: i.kind,
      remaining: i.planned - i.verified,
      unknown: i.unknown,
    })),
    errors,
  };
}
export function readRound(markdown: any): any {
  const match = markdown.match(/```x-round-state\s*\n([\s\S]*?)\n```/);
  if (!match) throw new Error("当前台账缺运行标记：默认视为未结束，须接续");
  return JSON.parse(match[1]);
}
export function runRoundCLI(): void {
  try {
    const file = process.argv.slice(2).find((a: any) => !a.startsWith("--"));
    if (!file)
      throw new Error(
        "用法：node scripts/x-round-state.mjs <原台账> [--check-end]",
      );
    const state = readRound(readFileSync(file, "utf8"));
    const executionId = process.argv
      .find((a: string) => a.startsWith("--execution="))
      ?.slice("--execution=".length);
    let scoped = state;
    if (executionId !== undefined) {
      const execution = state.executions?.[executionId];
      if (!execution?.scopeKinds?.length || !execution.evidenceRef)
        throw new Error("原台账执行者或职责证据缺失");
      scoped = {
        ...state,
        status: execution.status,
        scopeKinds: execution.scopeKinds,
        scopeEvidenceRef: execution.evidenceRef,
        stop: execution.stop,
      };
      const gap = execution.followGapCondition;
      if (
        gap &&
        execution.scopeKinds.length === 1 &&
        execution.scopeKinds[0] === "reply"
      ) {
        const ids = gap.actionIds;
        if (
          !gap.sourceExecutor ||
          !existsSync(gap.authorizationEvidenceRef ?? "") ||
          !Array.isArray(ids) ||
          !ids.length ||
          new Set(ids).size !== ids.length ||
          gap.planned !== ids.length
        )
          throw Error("conditional-reply-scope-unconfirmed");
        const actions = ids.map((id: string) =>
          state.actions.find((a: any) => a.id === id),
        );
        if (actions.some((a: any) => !a || a.kind !== "reply"))
          throw Error("conditional-reply-actions-unconfirmed");
        scoped.items = state.items.map((item: any) =>
          item.kind !== "reply"
            ? item
            : {
                ...state.items.find((i: any) => i.kind === "reply"),
                planned: ids.length,
                verified: actions.filter((a: any) => a.status === "verified")
                  .length,
                unknown: actions.filter((a: any) =>
                  ["intent", "unknown"].includes(a.status),
                ).length,
                actionable: actions.some((a: any) => a.status === "prepared"),
                reason: execution.currentWork,
                resumeAt: execution.stop?.nextEligibleCheckAt,
                resumeWhen: execution.currentWork,
                blockEvidence: [execution.stop?.evidenceRef].filter(Boolean),
                resultEvidence: actions
                  .filter((a: any) => a.status === "verified")
                  .map((a: any) => a.resultEvidence),
              },
        );
      }
    }
    const result = checkRound(scoped);
    console.log(JSON.stringify(result));
    process.exitCode =
      result.valid && (!process.argv.includes("--check-end") || result.mayEnd)
        ? 0
        : 1;
  } catch (error: any) {
    console.log(
      JSON.stringify({ valid: false, mayEnd: false, errors: [error.message] }),
    );
    process.exitCode = 1;
  }
}
