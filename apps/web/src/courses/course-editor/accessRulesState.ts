// Access Rules State Model & Normalization
export type AccessType = "everyone" | "restricted";
export type AccessDurationMode = "lifetime" | "fixed" | "";
export type DurationUnit = "Days" | "Weeks" | "Months" | "Years";

export interface AccessRulesFormState {
  accessType: AccessType;
  durationMode: AccessDurationMode;
  fixedDurationValue: number;
  fixedDurationUnit: DurationUnit;
  enableQA: boolean;
  enableComments: boolean;
  enableDownloads: boolean;
  enableNotes: boolean;
}

export const initialAccessRulesState: AccessRulesFormState = {
  accessType: "everyone",
  durationMode: "",
  fixedDurationValue: 30,
  fixedDurationUnit: "Days",
  enableQA: true,
  enableComments: true,
  enableDownloads: false,
  enableNotes: true,
};

export const normalizeAccessRulesState = (
  raw?: Partial<AccessRulesFormState> | null,
): AccessRulesFormState => ({
  accessType: (raw?.accessType || "everyone") as AccessType,
  durationMode: (raw?.durationMode || "") as AccessDurationMode,
  fixedDurationValue:
    typeof raw?.fixedDurationValue === "number" ? raw.fixedDurationValue : 30,
  fixedDurationUnit: (raw?.fixedDurationUnit || "Days") as DurationUnit,
  enableQA: raw?.enableQA !== undefined ? Boolean(raw.enableQA) : true,
  enableComments:
    raw?.enableComments !== undefined ? Boolean(raw.enableComments) : true,
  enableDownloads:
    raw?.enableDownloads !== undefined ? Boolean(raw.enableDownloads) : false,
  enableNotes: raw?.enableNotes !== undefined ? Boolean(raw.enableNotes) : true,
});

export const isAccessRuleConfigEqual = (
  a: AccessRulesFormState,
  b: AccessRulesFormState,
): boolean => {
  const normA = normalizeAccessRulesState(a);
  const normB = normalizeAccessRulesState(b);
  const durationMatch =
    normA.durationMode === normB.durationMode &&
    (normA.durationMode !== "fixed" ||
      (normA.fixedDurationValue === normB.fixedDurationValue &&
        normA.fixedDurationUnit === normB.fixedDurationUnit));
  return normA.accessType === normB.accessType && durationMatch;
};

export const isAccessSettingsEqual = (
  a: AccessRulesFormState,
  b: AccessRulesFormState,
): boolean => {
  const normA = normalizeAccessRulesState(a);
  const normB = normalizeAccessRulesState(b);
  return (
    normA.enableQA === normB.enableQA &&
    normA.enableComments === normB.enableComments &&
    normA.enableDownloads === normB.enableDownloads &&
    normA.enableNotes === normB.enableNotes
  );
};

export const isAccessRulesEqual = (
  a: AccessRulesFormState,
  b: AccessRulesFormState,
): boolean => {
  return isAccessRuleConfigEqual(a, b) && isAccessSettingsEqual(a, b);
};

const DAYS_PER_UNIT: Record<DurationUnit, number> = {
  Days: 1,
  Weeks: 7,
  Months: 30,
  Years: 365,
};

/**
 * How long the course stays with a learner, as the form now says it, in the
 * shape the course page reads (`accessIncludeTitle`); null while no
 * duration is chosen. The same days the Access rules step saves.
 */
export const accessRulesValidity = (
  state: AccessRulesFormState,
): {
  durationType: "lifetime" | "fixed_duration";
  durationDays: number | null;
} | null =>
  state.durationMode === "lifetime"
    ? { durationType: "lifetime", durationDays: null }
    : state.durationMode === "fixed"
      ? {
          durationType: "fixed_duration",
          durationDays:
            Math.max(1, state.fixedDurationValue || 1) *
            DAYS_PER_UNIT[state.fixedDurationUnit],
        }
      : null;
