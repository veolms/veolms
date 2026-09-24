export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

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
