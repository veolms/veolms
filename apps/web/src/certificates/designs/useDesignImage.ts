import { useQuery } from "@tanstack/react-query";
import type { CertificateDesign } from "@veolms/contracts";

import { drawPdfFirstPage } from "../../chat/PdfFirstPage";
import { certificateDesignsService } from "../../services/certificates";

/** Wide enough to place details precisely, small enough to draw quickly. */
const SHEET_WIDTH_PX = 1400;

async function pdfImage(blob: Blob): Promise<string> {
  const data = new Uint8Array(await blob.arrayBuffer());
  return (await drawPdfFirstPage(data, { crop: false, width: SHEET_WIDTH_PX }))
    .image;
}

/**
 * A design as a picture, drawn in this browser:
 * - an uploaded image: as it is;
 * - an uploaded PDF: its first page (pdf.js);
 * - `withDetails`, or the built-in design: a sample certificate on it.
 * The blank sheet is what the editor places details on. Kept for the visit
 * by design and version.
 */
export function useDesignImage(
  design: Pick<CertificateDesign, "id" | "kind" | "contentType" | "updatedAt">,
  { withDetails = false }: { withDetails?: boolean } = {},
) {
  const sample = withDetails || design.kind === "builtin";
  return useQuery({
    queryKey: [
      "certificates",
      "design-image",
      design.id,
      design.updatedAt ?? "builtin",
      sample,
    ],
    queryFn: async () => {
      if (sample) {
        return pdfImage(await certificateDesignsService.preview(design.id));
      }
      const blob = await certificateDesignsService.file(design.id);
      if (design.contentType === "application/pdf") return pdfImage(blob);
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("The image could not be read."));
        reader.readAsDataURL(blob);
      });
    },
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: 1,
  });
}
