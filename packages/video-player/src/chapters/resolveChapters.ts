import type {
  ChapterInput,
  ChapterSource,
  ResolveChaptersOptions,
  ResolvedChapters,
} from "./chapterTypes.ts";
import { normalizeChapters } from "./normalizeChapters.ts";
import { parseChaptersFromDescription } from "./parseChaptersFromDescription.ts";

function resolveExplicitSource(
  source: ChapterSource,
  chapters: readonly ChapterInput[] | undefined,
  duration: number | undefined,
): ResolvedChapters | null {
  if (!chapters || chapters.length === 0) {
    return null;
  }

  const normalized = normalizeChapters(chapters, { duration });
  if (normalized.length === 0) {
    return null;
  }

  return { source, chapters: normalized };
}

/**
 * Resolves exactly one chapter source using this precedence:
 * manual configuration, metadata, then parsed description timestamps.
 */
export function resolveChapters(
  options: ResolveChaptersOptions,
): ResolvedChapters {
  const manual = resolveExplicitSource(
    "manual",
    options.manualChapters,
    options.duration,
  );
  if (manual) {
    return manual;
  }

  const metadata = resolveExplicitSource(
    "metadata",
    options.metadataChapters,
    options.duration,
  );
  if (metadata) {
    return metadata;
  }

  const parsed = parseChaptersFromDescription(options.description ?? "", {
    duration: options.duration,
  });

  return parsed.length > 0
    ? { source: "description", chapters: parsed }
    : { source: null, chapters: [] };
}
