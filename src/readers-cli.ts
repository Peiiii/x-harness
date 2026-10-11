import { axParserCode } from "./readers-ax-program.js";

import { readPosts, changes } from "./readers-posts.js";
import { readProfile, screenCandidates } from "./readers-profile.js";
import { readAX } from "./readers-ax-parser.js";
import { AXHarness, createAXHarness } from "./readers-ax-host.js";

export function setupCode(): any {
  return `var xReadPosts = ${readPosts.toString()};\nvar xReadChanges = ${changes.toString()};\nvar xReadProfile = ${readProfile.toString()};\nvar xScreenCandidates = ${screenCandidates.toString()};\nvar xReadAX = ${axParserCode};\nvar xCreateAXHarness = (function(readAX) { const AXHarness = ${AXHarness.toString()}; return ${createAXHarness.toString()}; })(xReadAX);\nvar xAXSessions = {};\nvar xReadCache = {};\n`;
}

export function profileCode({ tab = "xtab", handle }: any = {}): any {
  return profilesCode([{ tab, handle }]);
}

export function profilesCode(entries: any): any {
  if (!Array.isArray(entries) || !entries.length || entries.length > 5)
    throw new Error("一次读取1～5位");
  for (const { tab, handle } of entries) {
    if (!/^[A-Za-z_$][\w$]*$/.test(tab ?? ""))
      throw new Error("tab必须是已有Tab变量名");
    if (!/^[A-Za-z0-9_]{1,15}$/.test(handle ?? ""))
      throw new Error("需要已观察的X handle");
  }
  const inputs = entries
    .map(
      ({ tab, handle }: any) => `{tab:${tab},handle:${JSON.stringify(handle)}}`,
    )
    .join(",");
  return `var xProfiles = [];\nfor (var entry of [${inputs}]) {\n  var page = new URL(await entry.tab.url());\n  if (page.origin !== 'https://x.com' || page.pathname.toLowerCase() !== '/' + entry.handle.toLowerCase()) { xProfiles.push({handle:entry.handle,blue:null,relationship:'unknown',alerts:['profile-url-mismatch']}); continue; }\n  xProfiles.push(await entry.tab.playwright.evaluate(xReadProfile, {handle:entry.handle}));\n}\nnodeRepl.write(xScreenCandidates(xProfiles));\n`;
}

export function browserCode({
  handle = "xtab",
  offset = 0,
  limit = 5,
  targetId = "",
  fresh = false,
}: any = {}): any {
  if (!/^[A-Za-z_$][\w$]*$/.test(handle))
    throw new Error("handle必须是当前REPL已有Tab变量名");
  if (targetId && !/^\d+$/.test(targetId))
    throw new Error("targetId必须是已观察的数字公开ID");
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 5
  )
    throw new Error("无效读取窗口");
  return `var xReadResult = await ${handle}.playwright.evaluate(xReadPosts, ${JSON.stringify({ offset, limit, targetId })});\nnodeRepl.write(xReadChanges(xReadResult, xReadCache, await ${handle}.url(), ${fresh}));\n`;
}

export function axCode({
  handle = "chrome",
  mode = "posts",
  offset = 0,
  limit = 1,
  targetId = "",
  targetHandle = "",
  fresh = false,
}: any = {}): any {
  if (!/^[A-Za-z_$][\w$]*$/.test(handle))
    throw new Error("handle必须是已有原生App/Tab变量名");
  // Share validation with the pure parser, without requiring a browser.
  readAX("", { mode, offset, limit, targetId, targetHandle });
  return `if (xAXSessions.${handle}?.app !== ${handle}) xAXSessions.${handle} = {app:${handle}, harness:xCreateAXHarness(${handle})};\nvar xAXResult = await xAXSessions.${handle}.harness.observe(${JSON.stringify({ mode, offset, limit, targetId, targetHandle })});\nnodeRepl.write(xReadChanges(xAXResult, xReadCache, xAXResult.page ?? 'unknown', ${fresh}));\n`;
}

export function runReaderCLI(): void {
  try {
    const args = process.argv.slice(2);
    const value = (flag: any, fallback: any) =>
      args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
    process.stdout.write(
      args.includes("--setup")
        ? setupCode()
        : args.includes("--ax")
          ? axCode({
              handle: value("--handle", "chrome"),
              mode: value("--mode", "posts"),
              offset: Number(value("--offset", 0)),
              limit: Number(value("--limit", 1)),
              targetId: value("--id", ""),
              targetHandle: value("--person", ""),
              fresh: args.includes("--fresh"),
            })
          : args.includes("--profile")
            ? profileCode({
                tab: value("--handle", "xtab"),
                handle: value("--profile", ""),
              })
            : browserCode({
                handle: value("--handle", "xtab"),
                offset: Number(value("--offset", 0)),
                limit: Number(value("--limit", 5)),
                targetId: value("--id", ""),
                fresh: args.includes("--fresh"),
              }),
    );
  } catch (error: any) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
