/**
 * React-free chapter parsing entry point. The API imports this to derive the
 * same chapter list from a lesson description that the player shows.
 */
export type {
  Chapter,
  ChapterInput,
  ChapterSource,
  ResolveChaptersOptions,
  ResolvedChapters,
} from "./chapterTypes.ts";
export { resolveChapters } from "./resolveChapters.ts";
