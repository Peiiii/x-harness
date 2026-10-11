import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const app = dirname(fileURLToPath(import.meta.url));
const cli = dirname(
  realpathSync(execFileSync("which", ["gemigo"], { encoding: "utf8" }).trim()),
);
const { GemigoApiClient } = await import(
  pathToFileURL(join(cli, "api.js")).href
);
const { loadSession } = await import(
  pathToFileURL(join(cli, "session-store.js")).href
);
const { zipDirectory, validateStaticDirectory } = await import(
  pathToFileURL(join(cli, "static-site.js")).href
);
const session = await loadSession();
if (!session) throw Error("gemigo login required");
const deployment = JSON.parse(
  readFileSync(join(app, "deployment.json"), "utf8"),
);
const client = new GemigoApiClient(session.origin, session.cookie);
if (!(await client.getCurrentUser())) throw Error("gemigo session expired");
await validateStaticDirectory(join(app, "dist"));
const zip = await zipDirectory(join(app, "dist"));
const upload = await client.uploadDeploymentSource(deployment.projectId, zip);
const run = await client.startDeployment({
  id: deployment.projectId,
  sourceType: "zip",
  zipSourceKey: upload.zipSourceKey,
});
const status = await client.streamDeployment(run.deploymentId, {
  onStatus: (s) => console.log(s.status),
});
if (status.status !== "SUCCESS")
  throw Error(status.errorMessage ?? "Deployment failed");
console.log(
  JSON.stringify({
    ...deployment,
    deploymentId: run.deploymentId,
    status: status.status,
  }),
);
