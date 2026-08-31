import { GetParameterCommand, type SSMClient } from "@aws-sdk/client-ssm";

// Debian's Cloud Team publishes the current AMI ID for every release under
// this public, per-region SSM parameter namespace, refreshed automatically
// on every point release — resolving through it means we never hardcode
// (and never go stale on) a region-specific AMI ID.
// Docs: https://wiki.debian.org/Cloud/AmazonEC2Image
const DEBIAN_RELEASE = "13";

// Keyed by region + parameter name (not just parameter name) — the same
// architecture/release resolves to a different AMI ID per region, so a
// region-agnostic cache key would serve a stale AMI from whichever region
// was resolved first once a caller switches regions.
//
// Entries expire after DEBIAN_AMI_CACHE_TTL_MS so a long-running daemon or
// a warm/reused Lambda execution environment eventually picks up a newer
// Debian point-release AMI (including security patches) instead of
// resolving the same AMI ID for its entire process lifetime.
const DEBIAN_AMI_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const debianAmiCache = new Map<
  string,
  { promise: Promise<string>; cachedAt: number }
>();

export function resolveDebianAmiId(
  ssm: SSMClient,
  region: string,
  architecture: "arm64" | "x86_64",
): Promise<string> {
  const debianArch = architecture === "arm64" ? "arm64" : "amd64";
  const parameterName = `/aws/service/debian/release/${DEBIAN_RELEASE}/latest/${debianArch}`;
  const cacheKey = `${region}:${parameterName}`;

  const cached = debianAmiCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < DEBIAN_AMI_CACHE_TTL_MS) {
    return cached.promise;
  }

  const promise = ssm
    .send(new GetParameterCommand({ Name: parameterName }))
    .then((res) => {
      const amiId = res.Parameter?.Value;
      if (!amiId) {
        throw new Error(
          `SSM parameter ${parameterName} returned no AMI ID — cannot resolve a Debian ${DEBIAN_RELEASE} image in ${region}.`,
        );
      }
      return amiId;
    })
    .catch((err: unknown) => {
      debianAmiCache.delete(cacheKey);
      throw err;
    });

  debianAmiCache.set(cacheKey, { promise, cachedAt: Date.now() });
  return promise;
}
