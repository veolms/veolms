/**
 * The academy's logo, as the invoice PDF draws it. A logo uploaded on
 * Platform > General is read straight from storage; an older logo set as an
 * https address is fetched. The answer is kept for a few minutes so a run of
 * invoices does not read it each time.
 *
 * Only PNG and JPEG can be drawn into a PDF. A logo that is not one of them,
 * or is damaged, leaves the invoice without a logo. A read that fails for a
 * passing reason (storage or network error) throws instead, and is not
 * kept: the invoice is stored for good, so it waits for the logo rather than
 * being stored without it.
 */

import { ACADEMY_LOGO_MAX_BYTES } from "@veolms/contracts";
import { createCache } from "@veolms/api-core";
import type { S3StorageService } from "@veolms/storage";
import {
  academyLogoKeyFromUrl,
  isDrawableLogo,
  readLogo,
} from "../../academy/academy-logo.ts";

export { isDrawablePng } from "../../academy/academy-logo.ts";

const LOGO_TIMEOUT_MS = 3_000;

/**
 * Logo bytes by URL (null for one that cannot be drawn), for every invoice
 * PDF. A new logo has a new URL, so entries are never stale; the bounds keep
 * old ones from piling up.
 */
const logos = createCache<Buffer | null>({
  name: "commerce.invoice-logos",
  ttlMs: 5 * 60_000,
  maxEntries: 50,
  maxBytes: 16 * 1024 * 1024,
  sizeOf: (image) => image?.length ?? 16,
});

/** A logo that could not be read this time; trying again may work. */
export class LogoUnavailableError extends Error {}

/** Reads at most `ACADEMY_LOGO_MAX_BYTES`; null when the body is larger. */
async function readCapped(response: Response): Promise<Buffer | null> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > ACADEMY_LOGO_MAX_BYTES || !response.body) return null;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > ACADEMY_LOGO_MAX_BYTES) return null;
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function fetchLogo(url: string): Promise<Buffer | null> {
  let address: URL;
  try {
    address = new URL(url);
  } catch {
    return null;
  }
  if (address.protocol !== "https:") return null;

  let response: Response;
  try {
    response = await fetch(address, {
      signal: AbortSignal.timeout(LOGO_TIMEOUT_MS),
      // The address is the logo itself; a redirect could lead the server
      // anywhere, including its own network.
      redirect: "error",
    });
  } catch (error) {
    throw new LogoUnavailableError(`The logo could not be fetched: ${url}`, {
      cause: error,
    });
  }
  if (response.status >= 500 || response.status === 429) {
    throw new LogoUnavailableError(
      `The logo address answered ${response.status}: ${url}`,
    );
  }
  if (!response.ok) return null;
  try {
    return await readCapped(response);
  } catch (error) {
    throw new LogoUnavailableError(`The logo could not be read: ${url}`, {
      cause: error,
    });
  }
}

async function readStoredLogo(
  storage: S3StorageService,
  key: string,
): Promise<Buffer | null> {
  try {
    return await readLogo(storage, key, ACADEMY_LOGO_MAX_BYTES);
  } catch (error) {
    throw new LogoUnavailableError(`The logo could not be read: ${key}`, {
      cause: error,
    });
  }
}

/**
 * The logo's image bytes, or null when there is none or it cannot be drawn.
 * Throws `LogoUnavailableError` when it could not be read this time.
 */
export async function loadInvoiceLogo(
  url: string | null | undefined,
  storage?: S3StorageService,
): Promise<Buffer | null> {
  if (!url) return null;
  // A read that throws (LogoUnavailableError) is not kept: the next invoice
  // tries again.
  return await logos.fetch(url, async () => {
    const key = academyLogoKeyFromUrl(url);
    const bytes =
      key && storage
        ? await readStoredLogo(storage, key)
        : await fetchLogo(url);
    return bytes && isDrawableLogo(bytes) ? bytes : null;
  });
}
