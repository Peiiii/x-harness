import { checkSource } from "../scripts/check-maintainability.mjs";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const releaseDir = dirname(fileURLToPath(import.meta.url));
const repository = resolve(releaseDir, "..");
const rootPack = process.argv.includes("--root-pack");
const destination = resolve(
  process.argv.slice(2).find((arg) => arg !== "--root-pack") ??
    join(repository, ".local/release/package"),
);
const git = (...args) => execFileSync("git", args, { cwd: repository });
const revision = git("rev-parse", "HEAD").toString().trim();
if (rootPack)
  git(
    "diff",
    "--exit-code",
    "HEAD",
    "--",
    "src",
    "generated",
    "release",
    "skill",
    "README.md",
    "LICENSE",
    "package.json",
    "tsconfig.json",
    "scripts",
  );
const manifest = JSON.parse(git("show", `${revision}:package.json`).toString());
execFileSync(
  process.execPath,
  [join(repository, "scripts/check-maintainability.mjs")],
  { stdio: "inherit" },
);
// Every byte shipped is selected from one committed revision, including CLI and Skill.
const clean = join(repository, ".release-source");
rmSync(clean, { recursive: true, force: true });
mkdirSync(clean, { recursive: true });
const paths = git(
  "ls-tree",
  "-r",
  "--name-only",
  revision,
  "src",
  "generated",
  "scripts/generate-observation.mjs",
  "scripts/build-observation-extension.mjs",
  "observation-extension",
  "tsconfig.json",
  "release/src",
  "release/tsconfig.json",
  "skill",
  "README.md",
  "LICENSE",
)
  .toString()
  .trim()
  .split("\n");
for (const file of paths) {
  const contents = git("show", `${revision}:${file}`);
  const findings = /\.(?:ts|js|mjs)$/.test(file)
    ? checkSource(contents.toString(), file, {
        checkFunctions: file.startsWith("src/"),
      })
    : [];
  if (findings.length)
    throw new Error(
      `Pinned source violates maintainability: ${JSON.stringify(findings)}`,
    );
  const target = join(clean, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}
writeFileSync(join(clean, "package.json"), JSON.stringify({ type: "module" }));
symlinkSync(
  join(repository, "node_modules"),
  join(clean, "node_modules"),
  "dir",
);
for (const config of ["tsconfig.json", "release/tsconfig.json"])
  execFileSync(
    join(repository, "node_modules/.bin/tsc"),
    ["-p", join(clean, config)],
    { stdio: "inherit" },
  );
execFileSync(
  process.execPath,
  [join(clean, "scripts/generate-observation.mjs")],
  { stdio: "inherit" },
);
execFileSync(
  process.execPath,
  [join(clean, "scripts/build-observation-extension.mjs")],
  { stdio: "inherit" },
);
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
for (const directory of ["dist", "generated", "skill"])
  cpSync(join(clean, directory), join(destination, directory), {
    recursive: true,
  });
cpSync(
  join(clean, ".local/observation-extension"),
  join(destination, "observation-extension"),
  { recursive: true },
);
mkdirSync(join(destination, "cli"));
cpSync(join(clean, ".release-cli/main.js"), join(destination, "cli/main.js"));
// Root npm pack also obtains a working bin through prepack.
mkdirSync(join(repository, "cli"), { recursive: true });
cpSync(join(destination, "cli/main.js"), join(repository, "cli/main.js"));
for (const name of ["README.md", "LICENSE"])
  cpSync(join(clean, name), join(destination, name));
const {
  scripts,
  devDependencies,
  private: privateFlag,
  ...publicManifest
} = manifest;
publicManifest.files = [
  "dist",
  "generated",
  "cli",
  "skill",
  "README.md",
  "LICENSE",
  "SOURCE.md",
  "observation-extension",
];
publicManifest.gitHead = revision;
writeFileSync(
  join(destination, "package.json"),
  JSON.stringify(publicManifest, null, 2) + "\n",
);
writeFileSync(
  join(destination, "SOURCE.md"),
  `# Corresponding source\n\nVersion ${manifest.version}, commit ${revision}.\n\nComplete source, build scripts and dependencies: https://github.com/Peiiii/x-harness/tree/${revision}\n\nClone this revision, run npm ci, npm run bootstrap and npm run release:build.\n\nLicense: AGPL-3.0-only.\n`,
);
cpSync(
  join(destination, "SOURCE.md"),
  join(destination, "observation-extension/SOURCE.md"),
);
if (rootPack) {
  cpSync(
    join(destination, "observation-extension"),
    join(repository, "observation-extension"),
    { recursive: true },
  );
  rmSync(join(repository, "dist"), { recursive: true, force: true });
  cpSync(join(destination, "dist"), join(repository, "dist"), {
    recursive: true,
  });
  cpSync(join(destination, "SOURCE.md"), join(repository, "SOURCE.md"));
}
console.log(
  JSON.stringify({
    destination,
    version: manifest.version,
    license: manifest.license,
    revision,
  }),
);
