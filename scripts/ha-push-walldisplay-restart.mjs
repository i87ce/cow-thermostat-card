// Push examples/ha-cow-walldisplay-restart.yaml to HA packages and reload scripts.
//
//   node scripts/ha-push-walldisplay-restart.mjs
//   node scripts/ha-push-walldisplay-restart.mjs --apply
//
// Requires SSH to HAOS (see docs/07-ha-remote-access.md).
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const APPLY = process.argv.includes("--apply");
const SSH_HOST = process.env.HA_SSH_HOST || "172.16.0.200";
const SSH_PORT = process.env.HA_SSH_PORT || "22222";
const SSH_KEY = process.env.HA_SSH_KEY || `${process.env.HOME}/.ssh/id_rsa`;
const REMOTE = "/config/packages/cow_walldisplay_restart.yaml";

const src = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "examples",
  "ha-cow-walldisplay-restart.yaml",
);
const body = readFileSync(src, "utf8");

function run(cmd, args, input) {
  const r = spawnSync(cmd, args, { encoding: "utf8", input });
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

run(
  "ssh",
  [
    "-i",
    SSH_KEY,
    "-p",
    SSH_PORT,
    "-o",
    "BatchMode=yes",
    `root@${SSH_HOST}`,
    `docker exec -i homeassistant tee ${REMOTE} > /dev/null`,
  ],
  body,
);
console.log("✓ uploaded package");

run("ssh", [
  "-i",
  SSH_KEY,
  "-p",
  SSH_PORT,
  "-o",
  "BatchMode=yes",
  `root@${SSH_HOST}`,
  "ha core restart",
]);
console.log("✓ restarted HA core (loads new package files)");
console.log("\nService: script.cow_walldisplay_restart_all_apps");
