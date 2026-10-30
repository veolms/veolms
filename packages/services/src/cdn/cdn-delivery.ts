import type { S3StorageService } from "@veolms/storage";
import { AppError } from "@veolms/api-core";

export interface CdnDelivery {
  url: string;
  expiresAt?: number;
}

/**
 * Resolve a storage key to the same protected CDN delivery URL used by media.
 * The token is deliberately generated at response time and is never persisted.
 */
export function getCdnDeliveryUrl(
  storage: S3StorageService,
  storageKey: string,
): CdnDelivery {
  const requiresToken = !storage.isCdnPublicKey(storageKey);
  const expiresAt = requiresToken
    ? Math.floor(Date.now() / 1000) + storage.getCdnTokenTtlSeconds()
    : undefined;
  const token = requiresToken
    ? storage.createCdnAccessToken(storageKey, expiresAt)
    : undefined;

  if (requiresToken && !token) {
    throw new AppError(
      503,
      "CDN_NOT_CONFIGURED",
      "Protected media delivery is not configured.",
    );
  }

  const url = storage.getCdnObjectUrl(storageKey, token ?? undefined);
  if (!url) {
    throw new AppError(
      503,
      "CDN_NOT_CONFIGURED",
      "Media delivery is not configured.",
    );
  }

  return { url, expiresAt };
}
