import type { WebExtension } from "@veolms/plugin-sdk";

export type { WebExtension } from "@veolms/plugin-sdk";

export interface CreateVeoLMSWebOptions {
  /** Cloud-only web extensions that add additional routes to the route tree. */
  extensions?: WebExtension[];
}
