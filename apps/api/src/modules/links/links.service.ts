import {
  normalizeShortLinkPath,
  type CreateShortLinkRequest,
  type ShortLink,
  type ShortLinkPathCheckResponse,
  type ShortLinkResolveResponse,
  type UpdateShortLinkRequest,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import { getAppPathSegments, getCoreRoutes } from "@veolms/web-core";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";

import { httpError } from "../../lib/errors.ts";
import * as repository from "./links.repository.ts";
import {
  checkDestination,
  collectOwnHosts,
  describeClash,
  findStaticClash,
  randomShortPath,
  suggestAlternatives,
} from "./links.rules.ts";

/** How long the edge keeps a resolved link when the API can purge it. */
const PURGED_EDGE_SECONDS = 86_400;
/** ...and when it cannot: a change shows within this long. */
const UNPURGED_EDGE_SECONDS = 60;
/** A second purge, for a visit read just before the change was saved. */
const SECOND_PURGE_DELAY_MS = 5_000;
const DEPLOYED_PATHS_TTL_MS = 10 * 60_000;
const DEPLOYED_PATHS_TIMEOUT_MS = 2_000;

export interface LinksServiceConfig {
  WEB_URL: string;
  /** The site's other addresses (its CORS origins): links may not lead there. */
  CORS_ORIGINS?: readonly string[];
  API_PUBLIC_URL?: string | undefined;
  SHORT_LINKS_RESOLVE_URL?: string | undefined;
  CLOUDFLARE_ZONE_ID?: string | undefined;
  CLOUDFLARE_CACHE_PURGE_TOKEN?: string | undefined;
}

/** The app's own first segments, from core's route tree (computed once). */
const coreAppSegments: ReadonlySet<string> = new Set(
  getAppPathSegments(getCoreRoutes()),
);

let deployedSegments: { at: number; segments: Set<string> } | null = null;

/**
 * The first segments the deployed site uses, as its build wrote them to
 * `/__app-paths.json` (the full route tree, extensions included, and the
 * build's top-level files). Best effort: core's tree is always checked.
 */
async function readDeployedSegments(webUrl: string): Promise<Set<string>> {
  if (
    deployedSegments &&
    Date.now() - deployedSegments.at < DEPLOYED_PATHS_TTL_MS
  ) {
    return deployedSegments.segments;
  }
  let segments = new Set<string>();
  try {
    const response = await fetch(new URL("/__app-paths.json", webUrl), {
      signal: AbortSignal.timeout(DEPLOYED_PATHS_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (response.ok) {
      const body: unknown = await response.json();
      if (
        body &&
        typeof body === "object" &&
        "segments" in body &&
        Array.isArray(body.segments)
      ) {
        segments = new Set(
          body.segments
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.toLowerCase()),
        );
      }
    }
  } catch {
    // Not deployed (local development) or not reachable: core's tree only.
  }
  deployedSegments = { at: Date.now(), segments };
  return segments;
}

function presentLink(row: repository.ShortLinkRow): ShortLink {
  return {
    id: row.id,
    path: row.path,
    destination: row.destination,
    mode: row.mode,
    redirectStatus: row.redirect_status === 301 ? 301 : 302,
    isActive: row.is_active,
    visitCount: Number(row.visit_count),
    lastVisitedAt: row.last_visited_at?.toISOString() ?? null,
    createdBy: row.created_by
      ? { id: row.created_by, name: row.created_by_name }
      : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function createLinksService({
  database,
  config,
  logger,
}: {
  database: Kysely<Database>;
  config: LinksServiceConfig;
  logger?: FastifyBaseLogger;
}) {
  const ownHosts = collectOwnHosts([
    config.WEB_URL,
    config.API_PUBLIC_URL,
    config.SHORT_LINKS_RESOLVE_URL,
    ...(config.CORS_ORIGINS ?? []),
  ]);
  const canPurge = Boolean(
    config.SHORT_LINKS_RESOLVE_URL &&
    config.CLOUDFLARE_ZONE_ID &&
    config.CLOUDFLARE_CACHE_PURGE_TOKEN,
  );

  async function appSegments(): Promise<Set<string>> {
    const deployed = await readDeployedSegments(config.WEB_URL);
    return new Set([...coreAppSegments, ...deployed]);
  }

  /** Paths in `candidates` that are free, in their order. */
  async function freePaths(
    candidates: readonly string[],
    exceptLinkId?: string,
  ): Promise<string[]> {
    const segments = await appSegments();
    const open = candidates.filter(
      (candidate) => !findStaticClash(candidate, segments),
    );
    const [takenLinks, takenNames] = await Promise.all([
      repository.findTakenLinkPaths(database, open, exceptLinkId),
      repository.findTakenUsernames(
        database,
        open
          .filter((path) => !path.slice(1).includes("/"))
          .map((path) => path.slice(1)),
      ),
    ]);
    return open.filter(
      (path) => !takenLinks.has(path) && !takenNames.has(path.slice(1)),
    );
  }

  async function suggestRandom(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const [free] = await freePaths(
        Array.from({ length: 5 }, () => randomShortPath()),
      );
      if (free) return free;
    }
    throw httpError(
      503,
      "LINK_PATH_UNAVAILABLE",
      "No free short path was found. Try again.",
    );
  }

  async function check(
    rawPath: string | undefined,
    exceptLinkId?: string,
  ): Promise<ShortLinkPathCheckResponse> {
    if (!rawPath || rawPath.trim() === "" || rawPath.trim() === "/") {
      return {
        path: null,
        available: false,
        reason: null,
        suggestion: await suggestRandom(),
      };
    }
    const path = normalizeShortLinkPath(rawPath);
    const segments = await appSegments();
    const staticClash = findStaticClash(rawPath, segments);
    let reason: string | null = staticClash ? describeClash(staticClash) : null;
    if (!reason && path) {
      const takenLinks = await repository.findTakenLinkPaths(
        database,
        [path],
        exceptLinkId,
      );
      if (takenLinks.has(path)) reason = describeClash({ kind: "link" });
      else if (!path.slice(1).includes("/")) {
        const names = await repository.findTakenUsernames(database, [
          path.slice(1),
        ]);
        if (names.size > 0) reason = describeClash({ kind: "username" });
      }
    }
    if (!reason)
      return { path, available: true, reason: null, suggestion: null };
    const [suggestion] = await freePaths(
      suggestAlternatives(path ?? rawPath),
      exceptLinkId,
    );
    return {
      path,
      available: false,
      reason,
      suggestion: suggestion ?? (await suggestRandom()),
    };
  }

  async function requireFreePath(rawPath: string, exceptLinkId?: string) {
    const result = await check(rawPath, exceptLinkId);
    if (!result.available || !result.path) {
      const hint = result.suggestion ? ` Try ${result.suggestion}.` : "";
      throw httpError(
        409,
        "LINK_PATH_TAKEN",
        `${result.reason ?? "This path cannot be used."}${hint}`,
      );
    }
    return result.path;
  }

  function requireDestination(destination: string): string {
    const problem = checkDestination(destination, ownHosts);
    if (problem) throw httpError(400, "LINK_DESTINATION_INVALID", problem);
    return new URL(destination.trim()).toString();
  }

  function resolveUrlFor(path: string): string | null {
    if (!config.SHORT_LINKS_RESOLVE_URL) return null;
    return `${config.SHORT_LINKS_RESOLVE_URL}?path=${encodeURIComponent(path)}`;
  }

  async function purgeOnce(urls: string[]) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${config.CLOUDFLARE_ZONE_ID}/purge_cache`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.CLOUDFLARE_CACHE_PURGE_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ files: urls }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      throw new Error(`Cloudflare purge answered ${response.status}`);
    }
  }

  /**
   * Clears the edge's copy of these paths' answers, so a change shows on
   * the next visit. Purged again a few seconds later, in case a visit read
   * the old row just before it was saved and put that back in the cache.
   */
  function purgeEdge(paths: readonly string[]) {
    if (!canPurge) return;
    const urls = [...new Set(paths)]
      .map(resolveUrlFor)
      .filter((url): url is string => url !== null);
    if (urls.length === 0) return;
    const run = () =>
      purgeOnce(urls).catch((error: unknown) =>
        logger?.warn(
          { err: error instanceof Error ? error.message : String(error) },
          "Short link edge purge failed",
        ),
      );
    void run();
    setTimeout(() => void run(), SECOND_PURGE_DELAY_MS).unref();
  }

  async function getLink(id: string): Promise<ShortLink> {
    const row = await repository.findLinkById(database, id);
    if (!row) throw httpError(404, "LINK_NOT_FOUND", "Link not found.");
    return presentLink(row);
  }

  return {
    edgeCacheSeconds: canPurge ? PURGED_EDGE_SECONDS : UNPURGED_EDGE_SECONDS,

    async list(): Promise<ShortLink[]> {
      return (await repository.listLinks(database)).map(presentLink);
    },

    check,

    async create(
      input: CreateShortLinkRequest,
      userId: string | null,
    ): Promise<ShortLink> {
      const destination = requireDestination(input.destination);
      const path =
        input.path && input.path.trim() !== "" && input.path.trim() !== "/"
          ? await requireFreePath(input.path)
          : await suggestRandom();
      const id = await repository.insertLink(database, {
        path,
        destination,
        mode: input.mode ?? "redirect",
        redirectStatus: input.redirectStatus ?? 302,
        createdBy: userId,
      });
      purgeEdge([path]);
      return await getLink(id);
    },

    async update(
      id: string,
      input: UpdateShortLinkRequest,
    ): Promise<ShortLink> {
      const current = await repository.findLinkById(database, id);
      if (!current) throw httpError(404, "LINK_NOT_FOUND", "Link not found.");
      const path =
        input.path !== undefined &&
        normalizeShortLinkPath(input.path) !== current.path
          ? await requireFreePath(input.path, id)
          : undefined;
      const destination =
        input.destination !== undefined
          ? requireDestination(input.destination)
          : undefined;
      await repository.updateLink(database, id, {
        ...(path !== undefined ? { path } : {}),
        ...(destination !== undefined ? { destination } : {}),
        ...(input.mode !== undefined ? { mode: input.mode } : {}),
        ...(input.redirectStatus !== undefined
          ? { redirectStatus: input.redirectStatus }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      });
      purgeEdge(path ? [current.path, path] : [current.path]);
      return await getLink(id);
    },

    async remove(id: string): Promise<void> {
      const path = await repository.deleteLink(database, id);
      if (!path) throw httpError(404, "LINK_NOT_FOUND", "Link not found.");
      purgeEdge([path]);
    },

    /** The active link at a path, or null; for the website Worker. */
    async resolve(rawPath: string): Promise<ShortLinkResolveResponse | null> {
      const path = normalizeShortLinkPath(rawPath);
      if (!path) return null;
      const row = await repository.findActiveLinkByPath(database, path);
      if (!row) return null;
      return {
        id: row.id,
        path: row.path,
        destination: row.destination,
        mode: row.mode,
        redirectStatus: row.redirect_status === 301 ? 301 : 302,
      };
    },

    async recordVisit(id: string): Promise<void> {
      await repository.recordVisit(database, id);
    },

    /** Whether a username would be hidden by a link at `/<name>`. */
    async isLinkPath(name: string): Promise<boolean> {
      const path = normalizeShortLinkPath(name);
      if (!path) return false;
      const taken = await repository.findTakenLinkPaths(database, [path]);
      return taken.has(path);
    },
  };
}

export type LinksService = ReturnType<typeof createLinksService>;
