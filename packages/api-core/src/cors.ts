import { isIP } from "node:net";
import type { ServerConfig } from "@veolms/config";

export interface CorsMatcher {
  isAllowedOrigin: (origin: string | undefined) => boolean;
}

export function createCorsMatcher(config: ServerConfig): CorsMatcher {
  // CORS_ORIGINS entries may use a leading `*.` host wildcard (for example
  // `https://*.dev-preview.veolms.org`) to allow every subdomain of that host
  // with the same scheme and port. The bare parent host is not matched.
  const corsWildcardOrigins = config.CORS_ORIGINS.flatMap((entry) => {
    const match = /^(https?):\/\/\*\.([^/:]+)(?::(\d+))?$/iu.exec(entry);
    if (!match?.[1] || !match[2]) return [];
    return [
      {
        protocol: `${match[1].toLowerCase()}:`,
        hostSuffix: `.${match[2].toLowerCase()}`,
        port: match[3] ?? "",
      },
    ];
  });

  const matchesCorsWildcard = (origin: string): boolean => {
    if (corsWildcardOrigins.length === 0) return false;
    try {
      const url = new URL(origin);
      return corsWildcardOrigins.some(
        (pattern) =>
          url.protocol === pattern.protocol &&
          url.port === pattern.port &&
          url.hostname.endsWith(pattern.hostSuffix),
      );
    } catch {
      return false;
    }
  };

  const isAllowedOrigin = (origin: string | undefined): boolean => {
    if (
      !origin ||
      config.CORS_ORIGINS.includes(origin) ||
      config.WEBAUTHN_ORIGINS.includes(origin) ||
      matchesCorsWildcard(origin)
    ) {
      return true;
    }
    if (config.NODE_ENV === "production") return false;

    try {
      const url = new URL(origin);
      if (url.protocol !== "http:" || isIP(url.hostname) !== 4) return false;

      const octets = url.hostname.split(".").map(Number);
      if (
        octets.some(
          (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255,
        )
      ) {
        return false;
      }

      const firstOctet = octets[0] ?? -1;
      const secondOctet = octets[1] ?? -1;
      return (
        firstOctet === 10 ||
        (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
        (firstOctet === 192 && secondOctet === 168)
      );
    } catch {
      return false;
    }
  };

  return { isAllowedOrigin };
}
