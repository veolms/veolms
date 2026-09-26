export interface ChapterInput {
  id?: string;
  title: string;
  startTime: number;
  endTime?: number;
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
