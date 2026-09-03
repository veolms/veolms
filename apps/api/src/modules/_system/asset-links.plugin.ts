import type { FastifyPluginAsync } from "fastify";

/** Fixed by the Android App Links spec — not configurable. */
export const ASSET_LINKS_ROUTE = "/.well-known/assetlinks.json";

/**
 * The Digital Asset Links document Android's App Links verifier fetches
 * from `GET /.well-known/assetlinks.json`. Shape is fixed by Google:
 * https://developers.google.com/digital-asset-links/v1/getting-started
 */
export interface AssetLinksStatement {
  relation: ["delegate_permission/common.handle_all_urls"];
  target: {
    namespace: "android_app";
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}

/** Splits the comma-separated fingerprint list and trims each entry. */
export function parseFingerprints(fingerprints: string): string[] {
  return fingerprints
    .split(",")
    .map((fingerprint) => fingerprint.trim())
    .filter((fingerprint) => fingerprint.length > 0);
}

export function buildAssetLinksDocument(
  packageName: string,
  fingerprints: string,
): AssetLinksStatement[] {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: parseFingerprints(fingerprints),
      },
    },
  ];
}

export interface AssetLinksPluginOptions {
  packageName: string;
  fingerprints: string;
}

/**
 * Registered directly on the root app (see app.ts) rather than through
 * `@fastify/autoload`: it must be served at the literal, unprefixed
 * `/.well-known/assetlinks.json` path Android looks for, not under
 * `/api/v1`, and its response must be the bare array Google expects, not
 * the app-wide `{success, data}` envelope — see the matching exemption in
 * app.ts's `preSerialization` hook.
 */
const assetLinksPlugin: FastifyPluginAsync<AssetLinksPluginOptions> = async (
  app,
  { packageName, fingerprints },
) => {
  const document = buildAssetLinksDocument(packageName, fingerprints);

  app.get(ASSET_LINKS_ROUTE, async (_request, reply) => {
    reply.type("application/json");
    return document;
  });
};

export default assetLinksPlugin;
