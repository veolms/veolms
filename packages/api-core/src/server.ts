import type { ServerResponse } from "node:http";
import net from "node:net";

import type { FastifyInstance } from "fastify";

export interface StartApiServerOptions {
  app: FastifyInstance;
  /** Closed after the app, e.g. the Kysely instance the app was built on. */
  database: { destroy(): Promise<void> };
  host: string;
  port: number;
  /** Used in log lines, e.g. "VeoLMS Cloud API". */
  name?: string;
}

/** Longest a shutdown waits for requests in progress to be answered. */
const DRAIN_TIMEOUT_MS = 5000;
/** Longest a whole shutdown may take before the process is ended anyway. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Listens, and owns the process's life from then on: the shutdown on
 * SIGINT/SIGTERM (or pm2's "shutdown" message on Windows), and the policy
 * for unhandled rejections and uncaught exceptions. Shared by every API
 * entry point (core and editions), so that each one starts and stops the
 * same way.
 *
 * Built for zero-downtime reloads under pm2 cluster mode (see
 * ecosystem.config.cjs): after listen it sends "ready", which pm2 waits for
 * before it stops the old process; on shutdown it lets the requests in
 * progress finish before closing.
 */
export async function startApiServer({
  app,
  database,
  host,
  port,
  name = "VeoLMS API",
}: StartApiServerOptions): Promise<void> {
  // Responses not yet finished, so that a shutdown can let them finish. Once
  // shutting down, every response says `Connection: close`, so clients and
  // proxies send their next request over a new connection, to another
  // process.
  const openResponses = new Set<ServerResponse>();
  let draining = false;
  app.server.on("request", (_request, response: ServerResponse) => {
    if (draining) response.setHeader("Connection", "close");
    openResponses.add(response);
    response.once("close", () => openResponses.delete(response));
  });

  /**
   * Stops taking connections and waits until every request in progress has
   * its answer. `app.close()` alone is not enough: http.Server#close also
   * closes the connections it counts as idle, and a request whose handler
   * is still running counts as idle. Measured during pm2 reloads, those
   * requests were cut off (ECONNRESET at the client).
   */
  async function drainRequests(): Promise<void> {
    draining = true;
    for (const response of openResponses) {
      if (!response.headersSent) response.setHeader("Connection", "close");
    }
    if (app.server.listening) {
      // net.Server#close: no new connections (under pm2 cluster mode they go
      // to the other processes) while the open ones are left alone.
      net.Server.prototype.close.call(app.server);
    }
    const deadline = Date.now() + DRAIN_TIMEOUT_MS;
    while (openResponses.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (openResponses.size > 0) {
      app.log.warn(
        { open: openResponses.size },
        "Shutting down with requests still open (long-lived streams).",
      );
    }
  }

  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    app.log.info({ signal }, `Initiating graceful shutdown of ${name}...`);

    const timeoutId = setTimeout(() => {
      app.log.error(
        "Shutdown timeout exceeded. Forcefully terminating process.",
      );
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    let shutdownFailed = false;

    try {
      await drainRequests();
      await app.close();
    } catch (err) {
      shutdownFailed = true;
      app.log.error({ err }, "Failed to close application");
    }

    try {
      await database.destroy();
    } catch (err) {
      shutdownFailed = true;
      app.log.error({ err }, "Failed to destroy database");
    }

    clearTimeout(timeoutId);
    if (shutdownFailed) {
      process.exit(1);
    }

    app.log.info("Graceful shutdown completed successfully.");
    // Explicit: under pm2 cluster mode the IPC channel to pm2 keeps the
    // event loop alive. No argument keeps a process.exitCode set earlier
    // (see uncaughtException below).
    process.exit();
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }
  // pm2 stops processes with this message instead of a signal on Windows.
  process.on("message", (message) => {
    if (message === "shutdown") void shutdown("shutdown message");
  });

  // A rejected promise nobody awaited — typically a background timer's work —
  // used to be fatal: Node's default is to crash the process, which dropped
  // every in-flight request because one poller tick failed. Log it and keep
  // serving; the individual jobs own their own retries.
  process.on("unhandledRejection", (reason) => {
    app.log.error({ err: reason }, "Unhandled promise rejection");
  });

  // A thrown error nobody caught leaves the process in an unknown state, so
  // this one still ends the process — but through the graceful path, with a
  // structured log line instead of a bare stack trace on stderr.
  process.on("uncaughtException", (error) => {
    app.log.fatal({ err: error }, "Uncaught exception; shutting down");
    process.exitCode = 1;
    void shutdown("uncaughtException");
  });

  try {
    await app.listen({ host, port });
  } catch (error) {
    app.log.error({ err: error }, `Failed to start ${name}`);
    try {
      // Background queues are started while the app is being composed. If
      // listen() fails (for example because another dev server owns the
      // port), close Fastify first so its onClose hooks stop those queues
      // before the shared Kysely driver is destroyed.
      await app.close();
    } catch (closeError) {
      app.log.error(
        { err: closeError },
        "Failed to close application after listen error",
      );
    }
    await database.destroy();
    process.exit(1);
  }

  app.log.info(`${name} listening on http://${host}:${port}`);
  // pm2 (wait_ready, see ecosystem.config.cjs) stops the old process during
  // a reload only after this one says it is ready.
  process.send?.("ready");
}
