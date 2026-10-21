import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
const root = resolve(import.meta.dirname, ".."),
  destination = resolve(root, ".local/observation-extension");
const manifest = JSON.parse(
  readFileSync(join(root, "observation-extension/manifest.json")),
);
if (
  JSON.stringify(manifest.permissions) !==
  JSON.stringify(["webRequest", "storage", "alarms"])
)
  throw Error("Unexpected observation permissions");
if (
  JSON.stringify(manifest.host_permissions) !==
  JSON.stringify(["https://x.com/*", "https://api.x.com/*"])
)
  throw Error("Unexpected observation hosts");
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(join(root, "observation-extension"), destination, { recursive: true });
cpSync(
  join(root, "dist/network-events.js"),
  join(destination, "network-events.js"),
);
writeFileSync(
  join(destination, "BUILD.json"),
  JSON.stringify(
    {
      schema: "x-observation-extension/v1",
      version: manifest.version,
      privacy: "X API metadata only; no external upload",
    },
    null,
    2,
  ) + "\n",
);
cpSync(join(root, "LICENSE"), join(destination, "LICENSE"));
console.log(JSON.stringify({ destination, version: manifest.version }));
