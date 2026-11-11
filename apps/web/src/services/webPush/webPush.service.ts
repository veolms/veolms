import type {
  RegisterWebPushSubscription,
  WebPushConfig,
  WebPushTestResult,
} from "@veolms/contracts";

import { api } from "../../lib/api-client";

export const webPushService = {
  getConfig: () => api.get<WebPushConfig>("/me/web-push"),
  save: (subscription: RegisterWebPushSubscription) =>
    api.put<{ registered: true; enabled: boolean }>(
      "/me/web-push/subscription",
      subscription,
    ),
  remove: (endpoint: string, timeout?: number) =>
    api.post<{ removed: boolean }>(
      "/me/web-push/subscription/remove",
      { endpoint },
      timeout ? { timeout } : undefined,
    ),
  test: (endpoint: string) =>
    api.post<WebPushTestResult>("/me/web-push/test", { endpoint }),
};
