import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretUpIcon as CaretUp } from "@phosphor-icons/react/CaretUp";
import { MagnifyingGlassMinusIcon as ZoomOut } from "@phosphor-icons/react/MagnifyingGlassMinus";
import { MagnifyingGlassPlusIcon as ZoomIn } from "@phosphor-icons/react/MagnifyingGlassPlus";
import type { ChatAttachment } from "@veolms/contracts";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import { chatService } from "../services/chat";
import { NoPreview } from "./FilePreview";
import { loadPdfJs } from "./PdfFirstPage";

/** Bigger PDFs open in the browser's own viewer instead (no full download first). */
const MAX_DRAWN_BYTES = 150 * 1024 * 1024;
/** A page is never drawn wider than this at 100 % (a wide screen). */
const PAGE_MAX_WIDTH_PX = 1000;
const ZOOM_STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5, 3] as const;
/** The page width at 100 %: the room less side margins for the viewer's ‹ › (WhatsApp). */
function fitWidth(room: number): number {
  const margins = room >= 640 ? 144 : 32;
  return Math.max(200, Math.min(room - margins, PAGE_MAX_WIDTH_PX));
}
/** Pages this far out of view are drawn ahead, so scrolling finds them ready. */
const DRAW_AHEAD = "800px 0px";

/**
 * A PDF as WhatsApp's viewer shows one: its pages one under another, the
 * width of the screen, on the viewer's dark ground; the page you are on
 * and zoom in a column at the right. Pages are drawn in this browser
 * (pdf.js) as they come near the view.
 */
export function PdfPages({ attachment }: { attachment: ChatAttachment }) {
  const tooBig = attachment.size > MAX_DRAWN_BYTES;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  /** Height over width of the first page: every page's room until drawn. */
  const [aspect, setAspect] = useState(1.414);
  const [failed, setFailed] = useState(false);
  const [room, setRoom] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (tooBig) return;
    const controller = new AbortController();
    let loading: { destroy: () => Promise<void> } | null = null;
    void (async () => {
      const blob = await chatService.readFileBlob(
        attachment,
        controller.signal,
      );
      const pdfjs = await loadPdfJs();
      if (controller.signal.aborted) return;
      const task = pdfjs.getDocument({
        data: new Uint8Array(await blob.arrayBuffer()),
        enableXfa: false,
      });
      loading = task;
      const document = await task.promise;
      if (controller.signal.aborted) return;
      const first = (await document.getPage(1)).getViewport({ scale: 1 });
      setAspect(first.height / first.width);
      setDoc(document);
    })().catch((error: unknown) => {
      if ((error as { name?: string }).name !== "AbortError") setFailed(true);
    });
    return () => {
      controller.abort();
      // Closes the document and its worker side (the pages drawn go with it).
      void loading?.destroy();
    };
  }, [attachment, tooBig]);

  // The width the pages fit at 100 %.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setRoom(entry.contentRect.width);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [doc]);

  const width = Math.round(fitWidth(room) * zoom);

  /**
   * The page a press of ⌃ / ⌄ is on its way to: pressed again before the
   * smooth scroll arrives, the next press goes on from there.
   */
  const aim = useRef<number | null>(null);
  /** The page whose middle is nearest the middle of the view. */
  const onScroll = useCallback(() => {
    const box = scrollRef.current;
    if (!box) return;
    const middle = box.scrollTop + box.clientHeight / 2;
    let nearest = 1;
    let best = Number.POSITIVE_INFINITY;
    for (const element of box.querySelectorAll<HTMLElement>("[data-page]")) {
      const distance = Math.abs(
        element.offsetTop + element.offsetHeight / 2 - middle,
      );
      if (distance < best) {
        best = distance;
        nearest = Number(element.dataset.page);
      }
    }
    setPage(nearest);
    if (aim.current === nearest) aim.current = null;
  }, []);

  const goTo = (number: number) => {
    if (number < 1 || number > (doc?.numPages ?? 0)) return;
    aim.current = number;
    const element = scrollRef.current?.querySelector<HTMLElement>(
      `[data-page="${number}"]`,
    );
    element?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const zoomBy = useCallback((step: 1 | -1) => {
    setZoom((current) => {
      const at = ZOOM_STEPS.indexOf(current as (typeof ZOOM_STEPS)[number]);
      const next =
        ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, at + step))];
      return next ?? current;
    });
  }, []);

  // Ctrl + wheel (and a trackpad pinch) zooms the pages, not the site.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1 : -1);
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [doc, zoomBy]);

  if (tooBig) {
    return (
      <div className="flex size-full justify-center px-2 pb-2 sm:px-16 sm:pb-6">
        <iframe
          title={attachment.name}
          src={chatService.fileUrl(attachment)}
          className="size-full max-w-5xl rounded-lg border-0 bg-white"
        />
      </div>
    );
  }
  if (failed) {
    return (
      <div className="flex size-full justify-center">
        <NoPreview attachment={attachment} failed />
      </div>
    );
  }

  const control =
    "inline-flex size-10 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-white hover:bg-white/15 disabled:cursor-default disabled:opacity-35";
  const total = doc?.numPages ?? 0;

  return (
    <div className="relative size-full">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="size-full overflow-auto overscroll-contain"
        aria-label={`${attachment.name}, page ${page} of ${total || "…"}`}
        role="document"
        tabIndex={0}
      >
        {doc ? (
          <div className="flex w-max min-w-full flex-col items-center gap-3 px-4 pb-6">
            {Array.from({ length: total }, (_, i) => (
              <PdfPage
                key={i + 1}
                doc={doc}
                number={i + 1}
                width={width}
                aspect={aspect}
                root={scrollRef}
              />
            ))}
          </div>
        ) : (
          <div className="flex justify-center px-4">
            <div
              className="animate-pulse rounded-sm bg-white/90"
              style={{
                width: fitWidth(room),
                aspectRatio: `1 / ${aspect}`,
              }}
            />
          </div>
        )}
      </div>
      {doc ? (
        <div
          className="absolute right-3 bottom-4 flex flex-col items-center gap-0.5 rounded-xl bg-[#1f2023]/90 p-1 text-white shadow-lg sm:right-5"
          aria-label="Pages and zoom"
          role="toolbar"
        >
          <span
            className="flex h-10 min-w-10 items-center justify-center rounded-lg border border-solid border-white/25 px-1 text-[0.9rem] font-semibold"
            aria-label={`Page ${page}`}
          >
            {page}
          </span>
          <span
            className="flex h-8 items-center text-[0.85rem] text-white/75"
            aria-label={`of ${total}`}
          >
            {total}
          </span>
          <span className="my-1 h-px w-7 bg-white/20" aria-hidden="true" />
          <button
            type="button"
            className={control}
            onClick={() => goTo((aim.current ?? page) - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <CaretUp size={18} />
          </button>
          <button
            type="button"
            className={control}
            onClick={() => goTo((aim.current ?? page) + 1)}
            disabled={page >= total}
            aria-label="Next page"
          >
            <CaretDown size={18} />
          </button>
          <span className="my-1 h-px w-7 bg-white/20" aria-hidden="true" />
          <button
            type="button"
            className={control}
            onClick={() => zoomBy(1)}
            disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]!}
            aria-label="Zoom in"
          >
            <ZoomIn size={19} />
          </button>
          <button
            type="button"
            className={control}
            onClick={() => zoomBy(-1)}
            disabled={zoom <= ZOOM_STEPS[0]}
            aria-label="Zoom out"
          >
            <ZoomOut size={19} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One page: room kept at the page's shape from the start, drawn sharp for
 * this screen once it comes near the view, and again when the zoom changes.
 */
function PdfPage({
  doc,
  number,
  width,
  aspect,
  root,
}: {
  doc: PDFDocumentProxy;
  number: number;
  width: number;
  aspect: number;
  root: RefObject<HTMLDivElement | null>;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  /** This page's own shape, once known (pages can differ). */
  const [ownAspect, setOwnAspect] = useState<number | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { root: root.current, rootMargin: DRAW_AHEAD },
    );
    observer.observe(box);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    void (async () => {
      const pdfPage = await doc.getPage(number);
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      setOwnAspect(base.height / base.width);
      const pixels = window.devicePixelRatio || 1;
      const viewport = pdfPage.getViewport({
        scale: (width * pixels) / base.width,
      });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      task = pdfPage.render({ canvas, viewport });
      await task.promise;
    })().catch(() => {
      // A cancelled draw (zoom changed) or a page pdf.js can't draw: the
      // white page stays.
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, near, number, width]);

  return (
    <div
      ref={boxRef}
      data-page={number}
      className="shrink-0 bg-white shadow-[0_2px_10px_rgb(0_0_0/0.35)]"
      style={{ width, aspectRatio: `1 / ${ownAspect ?? aspect}` }}
    >
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}
