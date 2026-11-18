import {
  networkFailureHttpStatus,
  type VideoEngineError,
} from "@veolms/video-player";

import { supportService } from "../../services/support/support.service";
import { readTechnicalDetails } from "../../support/technicalDetails";

/**
 * "Report" on the player's error screen: one press sends the team a support
 * report (category "video") with what is needed to find the cause, without
 * the learner having to describe anything:
 *
 * - the page's address and the lesson;
 * - the error (code, message, and the data the player kept with it: for a
 *   refused request, the address, the HTTP status and the server's answer);
 * - a screenshot of what the learner sees (`screenshot.png`);
 * - the page's recent network requests with their status, time and size,
 *   and the player's own `veo:` marks (`video-report.json`).
 *
 * Tokens are taken out of every address (the query is dropped) and out of
 * the error's data. The video picture itself is left out of the screenshot:
 * a protected video cannot be drawn, and the error screen covers it anyway.
 */

/** Requests kept: the newest, from the last few minutes. */
const MAX_REQUESTS = 150;
const REQUEST_WINDOW_MS = 5 * 60_000;
const MAX_MARKS = 40;
/** A screenshot that takes longer is left out; the report goes without it. */
const SCREENSHOT_TIMEOUT_MS = 15_000;

export interface VideoProblemReportOptions {
  error: VideoEngineError;
  lessonTitle: string;
}

/** Sends the report; resolves with its number for the button ("#123"). */
export async function sendVideoProblemReport({
  error,
  lessonTitle,
}: VideoProblemReportOptions): Promise<string> {
  const reportedAt = new Date();
  const page = `${location.pathname}${location.search}`;
  // Read before the screenshot: taking it adds requests of its own.
  const requests = recentRequests();
  const marks = recentMarks();
  const screenshot = await takeScreenshot();
  const httpStatus = networkFailureHttpStatus(error);
  const failed = requests.filter((request) => request.failed);

  const details = {
    reportedAt: reportedAt.toISOString(),
    page: location.origin + page,
    lessonTitle,
    error: {
      code: error.code,
      category: error.category,
      message: error.message,
      fatal: error.fatal,
      httpStatus,
      data: scrubbed(error.details),
      cause: error.cause instanceof Error ? error.cause.message : undefined,
    },
    connection: readConnection(),
    visibility: document.visibilityState,
    requests,
    marks,
  };

  const attachmentIds: string[] = [];
  const upload = async (
    file: File,
    size?: { width: number; height: number },
  ) => {
    try {
      const stored = await supportService.uploadAttachment(file, size ?? {});
      attachmentIds.push(stored.id);
    } catch {
      // The report still goes, with what could be attached.
    }
  };
  if (screenshot) {
    await upload(
      new File([screenshot.blob], "screenshot.png", { type: "image/png" }),
      screenshot,
    );
  }
  await upload(
    new File([JSON.stringify(details, null, 2)], "video-report.json", {
      type: "application/json",
    }),
  );

  const lines = [
    "Video error reported from the player (sent automatically).",
    "",
    `Lesson: ${lessonTitle}`,
    `Page: ${location.origin}${page}`,
    `Error: ${error.code} (${error.category}): ${error.message}`,
    httpStatus !== null ? `HTTP status: ${httpStatus}` : null,
    `Reported at: ${reportedAt.toISOString()}`,
    `Requests in the last minutes: ${requests.length}, failed: ${failed.length}`,
    ...failed
      .slice(-5)
      .map(
        (request) =>
          `  ${request.status || "no answer"} ${request.url} (${request.ms} ms)`,
      ),
    "",
    "The screenshot and the full request list are attached (video-report.json).",
  ].filter((line): line is string => line !== null);

  const created = await supportService.createTicket({
    kind: "problem",
    category: "video",
    content: lines.join("\n").slice(0, 9_000),
    pagePath: page.slice(0, 500),
    pageLabel: lessonTitle.slice(0, 200),
    technical: readTechnicalDetails(),
    contactAllowed: true,
    attachmentIds,
  });
  return `#${created.number}`;
}

interface ReportedRequest {
  url: string;
  type: string;
  status: number;
  ms: number;
  kb: number;
  /** Seconds before the report it started. */
  agoSeconds: number;
  failed: boolean;
}

/** An address without its query (where the tokens are), shortened. */
function withoutQuery(url: string): string {
  try {
    const parsed = new URL(url, location.href);
    const keys = [...new Set(parsed.searchParams.keys())];
    return `${parsed.origin}${parsed.pathname}${keys.length ? `?${keys.join("&")}` : ""}`.slice(
      0,
      300,
    );
  } catch {
    return url.split("?")[0]!.slice(0, 300);
  }
}

function recentRequests(): ReportedRequest[] {
  if (typeof performance === "undefined") return [];
  const now = performance.now();
  const entries = performance.getEntriesByType(
    "resource",
  ) as PerformanceResourceTiming[];
  const picked: ReportedRequest[] = [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    if (now - entry.startTime > REQUEST_WINDOW_MS) break;
    const status = entry.responseStatus ?? 0;
    picked.push({
      url: withoutQuery(entry.name),
      type: entry.initiatorType,
      status,
      ms: Math.round(entry.duration),
      kb: Math.round((entry.transferSize ?? 0) / 1024),
      agoSeconds: Math.round((now - entry.startTime) / 100) / 10,
      // A status of 0 with no body is a request that got no answer (or one
      // from a site that hides its timing); both are worth a look.
      failed: status >= 400 || (status === 0 && entry.encodedBodySize === 0),
    });
    if (picked.length === MAX_REQUESTS) break;
  }
  return picked.reverse();
}

function recentMarks(): Array<{ at: number; name: string; detail?: unknown }> {
  if (typeof performance === "undefined") return [];
  try {
    return performance
      .getEntriesByType("mark")
      .filter((mark) => mark.name.startsWith("veo:"))
      .slice(-MAX_MARKS)
      .map((mark) => ({
        at: Math.round(mark.startTime),
        name: mark.name,
        detail: scrubbed((mark as PerformanceMark).detail ?? undefined),
      }));
  } catch {
    return [];
  }
}

/** A copy safe to send: no token in any address, nothing too long. */
function scrubbed(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    const text = /^https?:\/\//u.test(value) ? withoutQuery(value) : value;
    return text
      .replace(/([?&](?:t|token|sig|signature|key|auth)=)[^&\s"]+/giu, "$1…")
      .replace(/(Bearer\s+)[\w.-]+/gu, "$1…")
      .slice(0, 2_000);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth > 4) return "…";
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => scrubbed(item, depth + 1));
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    // A server's answer kept as bytes: its text, when it is text.
    try {
      const bytes =
        value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      return scrubbed(
        new TextDecoder().decode(bytes.slice(0, 2_000)),
        depth + 1,
      );
    } catch {
      return `(${value.byteLength} bytes)`;
    }
  }
  if (typeof value === "object") {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, 30)) {
      if (/token|authorization|cookie|secret|password/iu.test(key)) {
        copy[key] = "…";
      } else {
        copy[key] = scrubbed(item, depth + 1);
      }
    }
    return copy;
  }
  return String(value).slice(0, 200);
}

function readConnection() {
  const connection = (
    navigator as Navigator & {
      connection?: {
        effectiveType?: string;
        downlink?: number;
        rtt?: number;
        saveData?: boolean;
      };
    }
  ).connection;
  return {
    online: navigator.onLine,
    effectiveType: connection?.effectiveType,
    downlinkMbps: connection?.downlink,
    rttMs: connection?.rtt,
    saveData: connection?.saveData,
  };
}

interface Screenshot {
  blob: Blob;
  width: number;
  height: number;
}

/** What the learner sees, as a PNG; null when it cannot be taken in time. */
async function takeScreenshot(): Promise<Screenshot | null> {
  try {
    const capture = (async () => {
      const { toBlob } = await import("html-to-image");
      const width = window.innerWidth;
      const height = window.innerHeight;
      const blob = await toBlob(document.body, {
        width,
        height,
        // The visible part of the page, wherever it is scrolled to.
        style: {
          transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)`,
        },
        pixelRatio: 1,
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        // Fonts from other sites cannot be read; the page's own stand in.
        skipFonts: true,
        // An image another site will not hand over is left blank, not fatal.
        imagePlaceholder:
          "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
        filter: (node) =>
          !(node instanceof HTMLVideoElement) &&
          !(node instanceof HTMLIFrameElement) &&
          !(
            node instanceof HTMLCanvasElement &&
            node.width * node.height > 4_000_000
          ),
      });
      return blob ? { blob, width, height } : null;
    })();
    const timeout = new Promise<null>((resolve) =>
      window.setTimeout(() => resolve(null), SCREENSHOT_TIMEOUT_MS),
    );
    return await Promise.race([capture, timeout]);
  } catch {
    return null;
  }
}
