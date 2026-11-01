// pm2 process file for the API on a server.
//
// The API runs in pm2 cluster mode: several Node processes share port
// API_PORT, and `pm2 reload` replaces them one at a time. Each new process
// must report ready (startApiServer in @veolms/api-core) before the old one
// it replaces is stopped, so there is always a process accepting requests
// during a deploy (zero downtime).
//
// Start it once (this replaces a fork-mode process of the same name, which
// is a short outage the one time it happens):
//   pm2 delete veolms-api; pm2 start ecosystem.config.cjs && pm2 save
// Deploys then run:
//   pm2 reload ecosystem.config.cjs --only veolms-api --update-env
// pm2 6 recognises a process file by its name: keep `ecosystem.config.cjs`.
//
// Everything the API keeps between requests that must hold across processes
// (sessions, queues, job locks) is in Postgres, so the processes need not
// share memory. Per-process only: rate-limit counters and the short (30-60
// s) caches of settings and pages.

const path = require("node:path");

const instances = Number.parseInt(process.env.API_INSTANCES ?? "", 10);

module.exports = {
  apps: [
    {
      name: "veolms-api",
      cwd: path.join(__dirname, "apps/api"),
      // Node 24 runs the TypeScript directly (type stripping), as
      // `pnpm start:api` does. Named explicitly: pm2 6 would pick bun for
      // a .ts file.
      script: "src/index.ts",
      interpreter: "node",
      // Absolute: Node reads it before pm2 moves into `cwd`.
      node_args: [`--env-file-if-exists=${path.join(__dirname, ".env")}`],
      exec_mode: "cluster",
      instances: Number.isFinite(instances) && instances > 0 ? instances : 2,
      // A new process counts as up when it sends "ready" (after listen),
      // not merely when it is spawned.
      wait_ready: true,
      // How long pm2 waits for that "ready". When it runs out pm2 stops the
      // old process anyway, so it is well above the API's start-up time.
      listen_timeout: 60_000,
      // Time an old process gets to finish its requests and jobs before
      // SIGKILL. startApiServer gives itself 10 s.
      kill_timeout: 15_000,
    },
  ],
};
