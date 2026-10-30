// Extras State Model & Normalization (server-backed: certificateEnabled)
export interface ExtrasFormState {
  enableCertificate: boolean;
}

export const initialExtrasState: ExtrasFormState = {
  enableCertificate: false,
};

export const normalizeExtrasState = (
  raw?: Partial<ExtrasFormState> | null,
): ExtrasFormState => ({
  enableCertificate: Boolean(raw?.enableCertificate),
});

export const isExtrasEqual = (
  a: ExtrasFormState,
  b: ExtrasFormState,
): boolean => {
  return a.enableCertificate === b.enableCertificate;
};

export function deriveSuggestedInclusions(params: {
  durationMode?: string;
  fixedDurationValue?: number;
  fixedDurationUnit?: string;
  enableCertificate?: boolean;
  enableDownloads?: boolean;
  hasPreviewLessons?: boolean;
  currentDraft?: Array<{ text: string }>;
}): string[] {
  const suggestions: string[] = [];

  if (params.durationMode === "lifetime") {
    suggestions.push("Full lifetime access");
  } else if (
    params.durationMode === "fixed" &&
    params.fixedDurationValue &&
    params.fixedDurationValue > 0
  ) {
    suggestions.push(
      `${params.fixedDurationValue} ${String(params.fixedDurationUnit || "Days").toLowerCase()} access`,
    );
  }

  if (params.enableCertificate) {
    suggestions.push("Certificate of completion");
  }

  if (params.enableDownloads) {
    suggestions.push("Downloadable resources");
  }

  if (params.hasPreviewLessons) {
    suggestions.push("Free preview lessons");
  }

  suggestions.push(
    "Personal guidance",
    "One-on-one session",
    "Community access",
    "Assignments & feedback",
    "Access on all devices",
  );

  const existing = new Set(
    (params.currentDraft || []).map((d) => d.text.trim().toLowerCase()),
  );

  return suggestions.filter(
    (sug, idx, arr) =>
      arr.findIndex((x) => x.toLowerCase() === sug.toLowerCase()) === idx &&
      !existing.has(sug.toLowerCase()),
  );
}

export const isManualIncludesEqual = (
  draft: Array<{ id: string; text: string }>,
  server: Array<{ id: string; text: string }>,
): boolean => {
  if (draft.length !== server.length) return false;
  for (let i = 0; i < draft.length; i++) {
    const d = draft[i];
    const s = server[i];
    if (!d || !s) return false;
    if (d.id !== s.id) return false;
    if (d.text.trim() !== s.text.trim()) return false;
  }
  return true;
};
