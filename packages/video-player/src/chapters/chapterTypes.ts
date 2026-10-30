export interface ChapterInput {
  id?: string;
  title: string;
  startTime: number;
  endTime?: number;
  thumbnailUrl?: string;
}

/** Source metadata for a chapter candidate without changing parser output. */
export interface DescriptionChapterDeclaration extends ChapterInput {
  declarationId: string;
  sourceStart: number;
  sourceEnd: number;
  timestampStart: number;
  timestampEnd: number;
  lineStart: number;
  lineEnd: number;
  isPlainText: boolean;
}

export interface Chapter {
  id: string;
  title: string;
  startTime: number;
  endTime?: number;
  /** A still from the start of the chapter, when one has been extracted. */
  thumbnailUrl?: string;
}

export type ChapterSource = "manual" | "metadata" | "description";

export interface NormalizeChaptersOptions {
  duration?: number;
}

export interface ParseChaptersOptions extends NormalizeChaptersOptions {}

export interface ResolveChaptersOptions extends NormalizeChaptersOptions {
  manualChapters?: readonly ChapterInput[];
  metadataChapters?: readonly ChapterInput[];
  description?: string;
}

export interface ResolvedChapters {
  source: ChapterSource | null;
  chapters: Chapter[];
}
