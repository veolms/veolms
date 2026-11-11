import { useEffect, useRef, useState } from "react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";
import { getApiRequestUrl } from "../../lib/api-client";
import { cn } from "../../lib/utils";

/**
 * A reading lesson whose text is a PDF, drawn by the page itself, page by
 * page, in the place a text reading's words go (`LessonReadingStage`).
 *
 * The file is not handed to the browser's own PDF viewer, which offers to
 * save and print it. pdf.js draws each page as a picture on a canvas: there
 * is no text to select or copy, no link to the file, and the page's own
 * right-click menu, dragging, printing (Ctrl/⌘ P, and the print view) and
 * saving (Ctrl/⌘ S) are turned off while it is open. The API only answers
 * the page's own request for it (see `getLessonDocument`). None of this can
 * stop a screenshot, or someone determined with the browser's developer
 * tools; it keeps the file from being one click away.
 *
 * pdf.js is loaded only when such a lesson is opened.
 */

/** Pages past this many are not drawn (a reading, not a book). */
const MAX_PAGES = 300;
/** How long a resize settles before the pages are drawn again. */
const REDRAW_DELAY_MS = 150;

class LessonPdfError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Lesson PDF request failed (${status})`);
    this.status = status;
  }
}

/**
 * The files fetched this visit, by lesson, so the mini player's picture
 * and a lesson opened again do not fetch them again. A few at most.
 */
const files = new Map<string, Promise<ArrayBuffer>>();
const MAX_KEPT_FILES = 3;

function loadLessonPdf(courseId: string, lessonId: string) {
  const key = `${courseId}/${lessonId}`;
  const kept = files.get(key);
  if (kept) return kept;
  const loading = fetch(
    getApiRequestUrl(
      `/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/document`,
    ),
    { credentials: "include", cache: "no-store" },
  ).then((response) => {
    if (!response.ok) throw new LessonPdfError(response.status);
    return response.arrayBuffer();
  });
  loading.catch(() => files.delete(key));
  files.set(key, loading);
  if (files.size > MAX_KEPT_FILES) {
    const oldest = files.keys().next().value;
    if (oldest !== undefined) files.delete(oldest);
  }
  return loading;
}

let workerReady: Promise<typeof import("pdfjs-dist")> | null = null;

function loadPdfJs() {
  workerReady ??= Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return workerReady;
}

/** Keys that print or save the page, which a PDF reading turns off. */
function isPrintOrSaveKey(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return false;
  const key = event.key.toLowerCase();
  return key === "p" || key === "s";
}

export function LessonPdfReading({
  courseId,
  lessonId,
}: {
  courseId: string;
  lessonId: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasesRef = useRef<(HTMLCanvasElement | null)[]>([]);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(0);
  const [pageSizes, setPageSizes] = useState<
    { width: number; height: number }[]
  >([]);

  // The file, then pdf.js's reading of it.
  useEffect(() => {
    let cancelled = false;
    let loading: PDFDocumentLoadingTask | null = null;
    setFailed(false);
    setPdf(null);
    void (async () => {
      const [pdfjs, file] = await Promise.all([
        loadPdfJs(),
        loadLessonPdf(courseId, lessonId),
      ]);
      if (cancelled) return;
      // pdf.js takes the bytes over; the kept file stays whole for the
      // next reader.
      loading = pdfjs.getDocument({
        data: new Uint8Array(file.slice(0)),
        enableXfa: false,
      });
      const opened = await loading.promise;
      if (cancelled) return;
      const count = Math.min(opened.numPages, MAX_PAGES);
      const sizes: { width: number; height: number }[] = [];
      for (let number = 1; number <= count; number += 1) {
        const page = await opened.getPage(number);
        const viewport = page.getViewport({ scale: 1 });
        sizes.push({ width: viewport.width, height: viewport.height });
      }
      if (cancelled) return;
      setPageSizes(sizes);
      setPdf(opened);
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
      // Ends pdf.js's work on this file and lets its pages go.
      void loading?.destroy();
    };
  }, [attempt, courseId, lessonId]);

  // The width the pages are drawn at, settled after a resize.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const measure = () => {
      const next = Math.round(box.clientWidth);
      if (next > 0) setWidth(next);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const sizes = new ResizeObserver(() => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(measure, REDRAW_DELAY_MS);
    });
    sizes.observe(box);
    return () => {
      if (timer !== null) clearTimeout(timer);
      sizes.disconnect();
    };
  }, []);

  // Each page drawn at that width, one after another.
  useEffect(() => {
    if (!pdf || width <= 0) return undefined;
    let cancelled = false;
    let task: RenderTask | null = null;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    void (async () => {
      for (let index = 0; index < pageSizes.length; index += 1) {
        const canvas = canvasesRef.current[index];
        const size = pageSizes[index];
        if (cancelled || !canvas || !size) return;
        const page = await pdf.getPage(index + 1);
        if (cancelled) return;
        const viewport = page.getViewport({
          scale: (width / size.width) * ratio,
        });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        task = page.render({ canvas, viewport });
        await task.promise;
      }
    })().catch(() => {
      // A drawing cancelled by a newer width; anything else leaves the page
      // blank rather than the whole reading failed.
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageSizes, width]);

  // No printing or saving while the reading is open.
  useEffect(() => {
    const block = (event: KeyboardEvent) => {
      if (!isPrintOrSaveKey(event)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", block, { capture: true });
    return () =>
      window.removeEventListener("keydown", block, { capture: true });
  }, []);

  return (
    <div
      ref={boxRef}
      aria-label="Lesson reading"
      role="document"
      // Nothing to select, drag or save from the menu; and nothing in the
      // print view.
      className="select-none print:hidden [-webkit-touch-callout:none]"
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      onCopy={(event) => event.preventDefault()}
    >
      {failed ? (
        <div className="grid justify-items-center gap-3 py-10 text-center">
          <p className="m-0 text-sm text-(--muted)">
            Couldn&apos;t load this reading. Check your connection and try
            again.
          </p>
          <button
            type="button"
            className="rounded-full bg-(--accent) px-4 py-2 text-sm font-semibold text-(--on-accent,white)"
            onClick={() => setAttempt((count) => count + 1)}
          >
            Try again
          </button>
        </div>
      ) : !pdf ? (
        <div role="status" className="grid gap-3">
          <span className="block aspect-[1/1.3] w-full animate-pulse rounded-lg bg-current/8 motion-reduce:animate-none" />
          <span className="sr-only">Loading the reading</span>
        </div>
      ) : (
        <div className="grid gap-3">
          {pageSizes.map((size, index) => (
            <canvas
              // Pages never move or change places.
              key={index}
              ref={(canvas) => {
                canvasesRef.current[index] = canvas;
              }}
              aria-label={`Page ${index + 1} of ${pageSizes.length}`}
              role="img"
              draggable={false}
              // Its place is kept before it is drawn, so the reading does
              // not jump as pages arrive.
              style={{ aspectRatio: `${size.width} / ${size.height}` }}
              className={cn(
                "block h-auto w-full rounded-md bg-white shadow-[0_2px_10px_rgb(0_0_0/0.25)]",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
