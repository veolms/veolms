const CONFIGURED_API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "/v1"
).replace(/\/api(?=\/v1\/?$)/u, "");

function isPrivateIpv4Address(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
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
}

/** Use the current LAN host when the configured API URL points to loopback. */
export function getApiBaseUrl(): string {
  if (
    typeof window === "undefined" ||
    !isPrivateIpv4Address(window.location.hostname)
  ) {
    return CONFIGURED_API_BASE_URL;
  }

  try {
    const configuredUrl = new URL(
      CONFIGURED_API_BASE_URL,
      window.location.origin,
    );
    if (
      (configuredUrl.hostname === "localhost" ||
        configuredUrl.hostname === "127.0.0.1") &&
      configuredUrl.protocol === "http:"
    ) {
      configuredUrl.hostname = window.location.hostname;
      return configuredUrl.toString().replace(/\/$/u, "");
    }
  } catch {
    // Keep the configured value if it is not a valid URL.
  }

  return CONFIGURED_API_BASE_URL;
}

export const API_BASE_URL = getApiBaseUrl();

export const API_BASE_URL_ORIGIN = (() => {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return null;
  }
})();

export function getApiRequestUrl(path: string): string {
  return `${API_BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
