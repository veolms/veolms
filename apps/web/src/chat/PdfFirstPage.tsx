import type { ChatAttachment } from "@veolms/contracts";
import { useEffect, useRef, useState } from "react";

import { chatService } from "../services/chat";

/** Drawn first pages and page counts, for this visit (by attachment). */
const drawn = new Map<string, { image: string; pages: number }>();
/** Bigger files show the plain document card (no first page). */
const MAX_BYTES = 25 * 1024 * 1024;
const WIDTH_PX = 576;

let pdfjsReady: Promise<typeof import("pdfjs-dist")> | null = null;
/** pdf.js and its worker, loaded with the first PDF a chat shows. */
function loadPdfJs() {
  pdfjsReady ??= Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return pdfjsReady;
}

async function drawFirstPage(
  attachment: ChatAttachment,
): Promise<{ image: string; pages: number }> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(
    await (await chatService.readFileBlob(attachment)).arrayBuffer(),
  );
  const task = pdfjs.getDocument({ data, enableXfa: false });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: WIDTH_PX / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    // The top of the page, as WhatsApp shows it (a card, not the page).
    canvas.height = Math.round(Math.min(viewport.height, viewport.width * 0.6));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No canvas");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, viewport }).promise;
    return { image: canvas.toDataURL("image/jpeg", 0.82), pages: doc.numPages };
  } finally {
    void task.destroy();
  }
}

/**
 * WhatsApp's PDF card: the top of the first page over the file's name, with
 * how many pages it has. Drawn in this browser (pdf.js) once the card comes
 * into view; until then, or if it can't be drawn, the card has no picture.
 */
export function PdfFirstPage({
  attachment,
  onPages,
}: {
  attachment: ChatAttachment;
  onPages: (pages: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(() => drawn.get(attachment.id) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (shown) {
      onPages(shown.pages);
      return;
    }
    const box = ref.current;
    if (!box || attachment.size > MAX_BYTES) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        drawFirstPage(attachment)
          .then((result) => {
            drawn.set(attachment.id, result);
            if (!cancelled) {
              setShown(result);
              onPages(result.pages);
            }
          })
          .catch(() => {
            if (!cancelled) setFailed(true);
          });
      },
      { rootMargin: "200px" },
    );
    observer.observe(box);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [attachment, shown, onPages]);

  if (failed || attachment.size > MAX_BYTES) return null;
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="aspect-[5/3] w-full overflow-hidden rounded-t-lg bg-white"
    >
      {shown ? (
        <img
          src={shown.image}
          alt=""
          className="size-full object-cover object-top"
        />
      ) : (
        <div className="size-full animate-pulse bg-[color-mix(in_srgb,var(--text)_8%,white)]" />
      )}
    </div>
  );
}
