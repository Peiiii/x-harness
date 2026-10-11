import { mkdirSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const app = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(resolve(app, "../package.json"), "utf8"),
);
mkdirSync(resolve(app, "dist"), { recursive: true });
cpSync(resolve(app, "src/style.css"), resolve(app, "dist/style.css"));
writeFileSync(
  resolve(app, "dist/index.html"),
  readFileSync(resolve(app, "src/index.html"), "utf8").replaceAll(
    "{{VERSION}}",
    manifest.version,
  ),
);
execFileSync(
  resolve(app, "../node_modules/.bin/tsc"),
  ["-p", resolve(app, "tsconfig.json")],
  { stdio: "inherit" },
);
cpSync(resolve(app, "../LICENSE"), resolve(app, "dist/LICENSE.txt"));
cpSync(
  resolve(
    app,
    `../.local/release/${manifest.name.replace("@", "").replace("/", "-")}-${manifest.version}.tgz`,
  ),
  resolve(app, "dist/x-harness.tgz"),
);
cpSync(resolve(app, "../README.md"), resolve(app, "dist/README.txt"));
cpSync(resolve(app, "../skill/SKILL.md"), resolve(app, "dist/SKILL.md"));

cpSync(resolve(app, "../skill/references"), resolve(app, "dist/references"), {
  recursive: true,
});
