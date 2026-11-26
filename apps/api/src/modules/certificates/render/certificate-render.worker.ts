import { parentPort } from "node:worker_threads";

import {
  renderCertificatePdf,
  type CertificateRenderInput,
} from "./certificate-pdf.ts";

/**
 * Draws certificates off the API's main thread. A page takes about 90 ms
 * of CPU (most of it laying out and subsetting the fonts); on the main
 * thread that would hold up every other request for as long.
 */
parentPort?.on(
  "message",
  async (message: { id: number; input: CertificateRenderInput }) => {
    try {
      const input = {
        ...message.input,
        issuedAt: new Date(message.input.issuedAt),
      };
      const pdf = await renderCertificatePdf(input);
      // Hand the bytes over instead of copying them.
      const bytes = new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
      parentPort!.postMessage({ id: message.id, pdf: bytes }, [
        bytes.buffer as ArrayBuffer,
      ]);
    } catch (error) {
      parentPort!.postMessage({
        id: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);
