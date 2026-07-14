// Push examples/ha-cow-walldisplay-restart.yaml to HA packages and reload scripts.
//
//   node scripts/ha-push-walldisplay-restart.mjs
//   node scripts/ha-push-walldisplay-restart.mjs --apply
//
// Requires SSH to HAOS (see docs/07-ha-remote-access.md).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const APPLY = process.argv.includes("--apply");
const SSH_HOST = process.env.HA_SSH_HOST || "172.16.0.200";
const SSH_PORT = process.env.HA_SSH_PORT || "22222";
const SSH_KEY = process.env.HA_SSH_KEY || `${process.env.HOME}/.ssh/id_rsa`;
const REMOTE_TMP = "/tmp/cow_walldisplay_restart.yaml";
const REMOTE = "/config/packages/cow_walldisplay_restart.yaml";

const src = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "examples",
  "ha-cow-walldisplay-restart.yaml",
);

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status || 1);
  }
  return r.stdout;
}

console.log(`Source: ${src}`);
console.log(`Target: ${SSH_HOST}:${REMOTE}`);
if (!APPLY) {
  console.log("\n(dry-run — pass --apply to upload + reload HA scripts)");
  process.exit(0);
}

run("scp", [
  "-i",
  SSH_KEY,
  "-P",
  SSH_PORT,
  "-o",
  "BatchMode=yes",
  src,
  `root@${SSH_HOST}:${REMOTE_TMP}`,
]);
run("ssh", [
  "-i",
  SSH_KEY,
  "-p",
  SSH_PORT,
  "-o",
  "BatchMode=yes",
  `root@${SSH_HOST}`,
  `docker exec homeassistant cp ${REMOTE_TMP} ${REMOTE}`,
]);
console.log("✓ uploaded package");

run("ssh", [
  "-i",
  SSH_KEY,
  "-p",
  SSH_PORT,
  "-o",
  "BatchMode=yes",
  `root@${SSH_HOST}`,
  "docker exec homeassistant ha core reload --scripts 2>/dev/null || docker exec homeassistant ha core reload",
]);
console.log("✓ reloaded HA (scripts/rest_command)");
console.log("\nService: script.cow_walldisplay_restart_all_apps");
