import { useEffect, useState, type ReactNode } from "react";

import { drawPdfFirstPage } from "./PdfFirstPage";

/** Bigger files keep the plain document card (no page is drawn). */
const MAX_BYTES = 25 * 1024 * 1024;
/** Drawn at this width; shown smaller, so it stays sharp on a phone. */
const WIDTH_PX = 720;

/**
 * The attach screen's PDF preview, as WhatsApp shows one before sending:
 * the whole first page, and how many pages the file has. Drawn in this
 * browser from the chosen file; until it is drawn, or when it can't be (a
 * broken or locked PDF, or a very big one), `fallback` shows instead.
 */
export function LocalPdfPreview({
  file,
  fallback,
}: {
  file: Blob;
  fallback: ReactNode;
}) {
  const [shown, setShown] = useState<{
    file: Blob;
    image: string;
    pages: number;
  } | null>(null);
  const [failed, setFailed] = useState<Blob | null>(null);
  const tooBig = file.size > MAX_BYTES;

  useEffect(() => {
    if (tooBig) return;
    let cancelled = false;
    void file
      .arrayBuffer()
      .then((buffer) =>
        drawPdfFirstPage(new Uint8Array(buffer), {
          crop: false,
          width: WIDTH_PX,
        }),
      )
      .then((result) => {
        if (!cancelled) setShown({ file, ...result });
      })
      .catch(() => {
        if (!cancelled) setFailed(file);
      });
    return () => {
      cancelled = true;
    };
  }, [file, tooBig]);

  if (tooBig || failed === file) return <>{fallback}</>;
  if (shown?.file !== file) {
    return (
      <div
        aria-hidden="true"
        className="aspect-[1/1.414] max-h-full w-72 max-w-full animate-pulse rounded-md bg-[color-mix(in_srgb,var(--text)_10%,white)]"
      />
    );
  }
  return (
    <figure className="m-0 flex max-h-full min-h-0 flex-col items-center gap-2">
      <img
        src={shown.image}
        alt="First page of the PDF"
        className="max-h-[calc(100%-1.75rem)] min-h-0 w-auto max-w-full rounded-md bg-white object-contain shadow-[0_8px_30px_rgb(0_0_0/0.25)]"
      />
      <figcaption className="text-[0.8rem] text-(--muted)">
        {shown.pages} {shown.pages === 1 ? "page" : "pages"}
      </figcaption>
    </figure>
  );
}
