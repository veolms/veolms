import type { OauthProvider } from "@veolms/contracts";

export const OAUTH_PROVIDER_STORAGE_KEY = "veolms_oauth_provider";
export const OAUTH_RETURN_TO_STORAGE_KEY = "veolms_oauth_return_to";

export function isOauthProvider(value: string | null): value is OauthProvider {
  return value === "google" || value === "github";
}

export function clearOauthHandoff(): void {
  if (typeof window === "undefined") return;

  window.sessionStorage.removeItem(OAUTH_PROVIDER_STORAGE_KEY);
  window.sessionStorage.removeItem(OAUTH_RETURN_TO_STORAGE_KEY);
}
