import assert from "node:assert/strict";
import {
  readFileSync,
  readdirSync,
  existsSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skill = join(root, "skill");
const read = (name) => readFileSync(join(skill, name), "utf8");
const entry = read("SKILL.md");
const refs = Object.fromEntries(
  readdirSync(join(skill, "references"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => [name, read("references/" + name)]),
);
const chars = (text) => [...text].length;
const intro = (text) => text.split(/^## /m)[0];
const section = (text, heading) => {
  const start = text.indexOf(`## ${heading}\n`);
  assert.ok(start >= 0, `Missing section: ${heading}`);
  const next = text.indexOf("\n## ", start + 4);
  return text.slice(start, next < 0 ? undefined : next);
};

// Character limits are reproducible loading proxies, not billed-token estimates.
const documents = {
  entry,
  read: entry + refs["reads.md"],
  recovery: entry + refs["recovery.md"],
  setup: entry + refs["setup.md"],
};
for (const operation of ["Publish", "Reply", "Follow", "Round"]) {
  documents[operation.toLowerCase()] =
    entry +
    intro(refs["writes.md"]) +
    section(refs["writes.md"], "Common review") +
    section(refs["writes.md"], operation);
}
const loads = Object.fromEntries(
  Object.entries(documents).map(([name, text]) => [name, chars(text)]),
);
const budgets = {
  entry: 2400,
  read: 4300,
  recovery: 5000,
  setup: 4700,
  publish: 5700,
  reply: 5300,
  follow: 5000,
  round: 5600,
};
for (const [name, limit] of Object.entries(budgets))
  assert.ok(
    loads[name] <= limit,
    `${name}: ${loads[name]} chars exceeds ${limit}`,
  );
const description = entry.match(/^description: (.+)$/m)?.[1];
assert.ok(
  description && chars(description) <= 180,
  "Discovery description exceeds 180 chars",
);
assert.match(
  entry,
  /Normal use needs no implementation source or type-file reading/,
);

for (const [name, text] of [
  ["SKILL.md", entry],
  ...Object.entries(refs).map(([name, text]) => ["references/" + name, text]),
]) {
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].split("#")[0];
    if (/^https?:/.test(target)) continue;
    assert.ok(
      existsSync(resolve(skill, dirname(name), target)),
      `${name}: broken link ${target}`,
    );
    assert.ok(
      !/\/src\/|\.d\.ts$/.test(target),
      `${name}: normal reference depends on implementation/types`,
    );
  }
}

// Check documentation as written against the built public declarations; no source parsing.
const require = createRequire(join(root, "package.json"));
const ts = require("typescript");
const snippets = [];
for (const text of [entry, ...Object.values(refs)]) {
  for (const match of text.matchAll(/```js\n([\s\S]*?)\n```/g))
    snippets.push(match[1]);
  for (const match of text.matchAll(/`(await x\.[^`]+)`/g))
    snippets.push(match[1] + ";");
}
const strings =
  "moduleURL ledgerPath proofDirectory selectedHandle actionId taskId accountHandle accountURL accountEvidenceRef text reviewProof draftFingerprint draftPath composeURL composeEvidenceRef postId parentURL parentProof handle url evidenceRef publicURL executorId authorizationProof startsAt expiresAt".split(
    " ",
  );
const declarations = `import { createXGrowthHarness, type XGrowthHarness, type CuaTab, type PostTarget } from ${JSON.stringify(join(root, "dist/index.js"))};\ndeclare const x: XGrowthHarness;\ndeclare const tab: CuaTab;\ndeclare const observedPost: PostTarget;\ndeclare const maxActions: number;\n${strings.map((name) => `declare const ${name}: string;`).join("\n")}\n`;
const directory = mkdtempSync(join(tmpdir(), "x-skill-check-"));
try {
  const file = join(directory, "examples.mts");
  writeFileSync(
    file,
    declarations +
      snippets
        .map(
          (snippet, index) =>
            `async function example${index}() {\n${snippet}\n}`,
        )
        .join("\n"),
  );
  const program = ts.createProgram([file], {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    paths: {
      "@nextclaw/x-harness/diagnostics": [join(root, "dist/diagnostics.d.ts")],
    },
    skipLibCheck: true,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => root,
      getCanonicalFileName: (name) => name,
      getNewLine: () => "\n",
    }),
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
let tokenizer;
const args = process.argv.slice(2);
assert.ok(
  !args.length || (args.length === 2 && args[0] === "--tokenizer"),
  "Usage: node scripts/check-x-harness-skill.mjs [--tokenizer <js-tiktoken module path>]",
);
if (args.length) {
  const { getEncoding } = await import(pathToFileURL(resolve(args[1])).href);
  const encoder = getEncoding("o200k_base");
  const tokens = Object.fromEntries(
    Object.entries(documents).map(([name, text]) => [
      name,
      encoder.encode(text).length,
    ]),
  );
  const tokenBudgets = {
    entry: 650,
    read: 1200,
    recovery: 1500,
    setup: 1400,
    publish: 1700,
    reply: 1600,
    follow: 1600,
    round: 1700,
  };
  for (const [name, limit] of Object.entries(tokenBudgets))
    assert.ok(
      tokens[name] <= limit,
      `${name}: ${tokens[name]} o200k_base tokens exceeds ${limit}`,
    );
  tokenizer = {
    encoding: "o200k_base",
    tokens,
    budgets: tokenBudgets,
    metric: "Static document tokens; not session usage or billed tokens",
  };
}
console.log(
  JSON.stringify({
    status: "passed",
    examples: snippets.length,
    descriptionChars: chars(description),
    loads,
    budgets,
    metric: "Unicode code points; not billed tokens",
    tokenizer,
  }),
);
