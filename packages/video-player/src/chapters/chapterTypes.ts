export interface ChapterInput {
  id?: string;
  title: string;
  startTime: number;
  endTime?: number;
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
