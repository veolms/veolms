import type { Category } from "@veolms/contracts";

export const EMPTY_CATEGORIES: Category[] = [];

export type ThumbnailUploadStatus =
  "idle" | "uploading" | "confirming" | "processing" | "saving" | "error";

export type ChecklistState = "idle" | "validating" | "valid" | "invalid";

// Basics State Model & Normalization
export interface BasicsFormState {
  title: string;
  shortDescription: string;
  description: string;
  categoryId: string;
  difficulty: "beginner" | "intermediate" | "advanced" | "";
  language: string;
  instructorAlias: string;
  showInstructorName: boolean;
}

export const initialBasicsState: BasicsFormState = {
  title: "",
  shortDescription: "",
  description: "",
  categoryId: "",
  difficulty: "",
  language: "en",
  instructorAlias: "",
  showInstructorName: true,
};

export const normalizeBasicsState = (
  raw?: Partial<BasicsFormState> | null,
): BasicsFormState => ({
  title: raw?.title ?? "",
  shortDescription: raw?.shortDescription ?? "",
  description: raw?.description ?? "",
  categoryId: raw?.categoryId ?? "",
  difficulty: (raw?.difficulty ?? "") as BasicsFormState["difficulty"],
  language: raw?.language || "en",
  instructorAlias: raw?.instructorAlias ?? "",
  showInstructorName:
    raw?.showInstructorName !== undefined
      ? Boolean(raw.showInstructorName)
      : true,
});

export function getThumbnailUploadErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Thumbnail upload failed. Please try again.";
}

export const isBasicsMetaEqual = (
  a: BasicsFormState,
  b: BasicsFormState,
): boolean => {
  const normA = normalizeBasicsState(a);
  const normB = normalizeBasicsState(b);
  return (
    normA.title === normB.title &&
    normA.shortDescription === normB.shortDescription &&
    normA.description === normB.description &&
    normA.categoryId === normB.categoryId &&
    normA.difficulty === normB.difficulty &&
    normA.instructorAlias === normB.instructorAlias
  );
};

export const isBasicsSettingsEqual = (
  a: BasicsFormState,
  b: BasicsFormState,
): boolean => {
  const normA = normalizeBasicsState(a);
  const normB = normalizeBasicsState(b);
  return (
    normA.language === normB.language &&
    normA.showInstructorName === normB.showInstructorName
  );
};

export const isBasicsEqual = (
  a: BasicsFormState,
  b: BasicsFormState,
): boolean => {
  return isBasicsMetaEqual(a, b) && isBasicsSettingsEqual(a, b);
};
