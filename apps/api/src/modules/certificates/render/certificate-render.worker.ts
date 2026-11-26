import { parentPort } from "node:worker_threads";

import {
  renderCertificatePdf,
  type CertificateRenderDesign,
  type CertificateRenderInput,
} from "./certificate-pdf.ts";

/**
 * Draws certificates off the API's main thread. A page takes about 90 ms
 * of CPU (most of it laying out and subsetting the fonts); on the main
 * thread that would hold up every other request for as long.
 */
parentPort?.on(
  "message",
  async (message: {
    id: number;
    input: CertificateRenderInput;
    design?: CertificateRenderDesign;
    signature?: Uint8Array | null;
  }) => {
    try {
      const input = {
        ...message.input,
        issuedAt: new Date(message.input.issuedAt),
      };
      const pdf = await renderCertificatePdf(
        input,
        message.design,
        message.signature,
      );
      // A fresh buffer of exactly the PDF, handed over rather than copied
      // again. (The buffer a library returns may be a shared pool slice or
      // otherwise not transferable: pdf-lib's is not.)
      const bytes = new Uint8Array(pdf);
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
