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
