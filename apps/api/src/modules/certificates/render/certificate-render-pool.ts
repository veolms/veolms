import { Worker } from "node:worker_threads";

import { AppError } from "../../../lib/errors.ts";
import type {
  CertificateRenderDesign,
  CertificateRenderInput,
} from "./certificate-pdf.ts";

/** Certificates waiting for the drawing thread before new ones are refused. */
const MAX_QUEUED = 20;
/** A page that is not drawn by then is given up (the thread is restarted). */
const RENDER_TIMEOUT_MS = 15_000;
/** The thread is stopped after this long without work, to free its memory. */
const IDLE_EXIT_MS = 5 * 60_000;

interface Job {
  id: number;
  input: CertificateRenderInput;
  design: CertificateRenderDesign | undefined;
  resolve: (pdf: Buffer) => void;
  reject: (error: Error) => void;
  timer?: NodeJS.Timeout;
}

/**
 * One background thread per API process draws certificate PDFs, one at a
 * time, so a burst of downloads queues there instead of holding up the
 * process's other requests. The thread starts with the first download and
 * stops when idle. When the queue is full the download is refused with 503
 * and the learner is asked to try again.
 */
export function createCertificateRenderPool() {
  let worker: Worker | null = null;
  let idleTimer: NodeJS.Timeout | null = null;
  let nextId = 1;
  let running: Job | null = null;
  const queue: Job[] = [];

  function startWorker(): Worker {
    const thread = new Worker(
      new URL("./certificate-render.worker.ts", import.meta.url),
    );
    thread.on(
      "message",
      (message: { id: number; pdf?: Uint8Array; error?: string }) => {
        const job = running;
        if (!job || job.id !== message.id) return;
        clearTimeout(job.timer);
        running = null;
        if (message.pdf) {
          job.resolve(
            Buffer.from(
              message.pdf.buffer,
              message.pdf.byteOffset,
              message.pdf.byteLength,
            ),
          );
        } else {
          job.reject(new Error(message.error ?? "The PDF could not be drawn."));
        }
        runNext();
      },
    );
    const fail = (error: Error) => {
      if (worker === thread) worker = null;
      const job = running;
      running = null;
      if (job) {
        clearTimeout(job.timer);
        job.reject(error);
      }
      runNext();
    };
    thread.on("error", fail);
    thread.on("exit", (code) => {
      if (worker === thread) worker = null;
      if (running) fail(new Error(`The drawing thread stopped (${code}).`));
    });
    // After the listeners: adding a "message" listener refs the thread
    // again, and a referenced idle thread would keep the process from
    // exiting (a stopped server, a finished test run).
    thread.unref();
    return thread;
  }

  function runNext() {
    if (running) return;
    const job = queue.shift();
    if (!job) {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        idleTimer = null;
        if (!running && queue.length === 0 && worker) {
          const idle = worker;
          worker = null;
          void idle.terminate();
        }
      }, IDLE_EXIT_MS);
      idleTimer.unref();
      return;
    }
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    worker ??= startWorker();
    running = job;
    job.timer = setTimeout(() => {
      // A thread that hangs is replaced; the next job gets a new one.
      const stuck = worker;
      worker = null;
      if (running === job) running = null;
      job.reject(new Error("Drawing the PDF took too long."));
      void stuck?.terminate();
      runNext();
    }, RENDER_TIMEOUT_MS);
    job.timer.unref();
    worker.postMessage({
      id: job.id,
      input: { ...job.input, issuedAt: job.input.issuedAt.toISOString() },
      // Copied to the thread (structured clone); a sheet is at most 15 MB.
      design: job.design,
    });
  }

  return {
    render(
      input: CertificateRenderInput,
      design?: CertificateRenderDesign,
    ): Promise<Buffer> {
      if (queue.length >= MAX_QUEUED) {
        return Promise.reject(
          new AppError(
            503,
            "CERTIFICATE_RENDER_BUSY",
            "Many certificates are being prepared right now. Try again in a minute.",
          ),
        );
      }
      return new Promise<Buffer>((resolve, reject) => {
        queue.push({ id: nextId++, input, design, resolve, reject });
        runNext();
      });
    },

    async close(): Promise<void> {
      if (idleTimer) clearTimeout(idleTimer);
      const thread = worker;
      worker = null;
      await thread?.terminate();
    },
  };
}

export type CertificateRenderPool = ReturnType<
  typeof createCertificateRenderPool
>;

let shared: CertificateRenderPool | null = null;

/** The process's one pool (each route plugin instance shares it). */
export function getCertificateRenderPool(): CertificateRenderPool {
  shared ??= createCertificateRenderPool();
  return shared;
}
