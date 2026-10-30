import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";

export type BasicsFieldKey =
  | "title"
  | "shortDescription"
  | "courseDescription"
  | "instructorAlias"
  | "showInstructorName";

export const BasicsFieldStatusIndicator = ({
  status,
  testId,
}: {
  status: "saving" | "saved" | "failed" | null;
  testId?: string;
}) => {
  if (!status) return null;

  if (status === "saving") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-(--accent)"
        aria-live="polite"
      >
        <CircleNotch
          size={12}
          className="animate-spin text-(--accent) shrink-0"
        />
        <span>Saving...</span>
      </span>
    );
  }

  if (status === "saved") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-emerald-500"
        aria-live="polite"
      >
        <span>Saved ✓</span>
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-rose-500"
        role="alert"
      >
        <WarningCircle
          size={12}
          weight="fill"
          className="shrink-0 text-rose-500"
        />
        <span>Save failed</span>
      </span>
    );
  }

  return null;
};

export type AccessRulesControlKey =
  | "accessType"
  | "durationMode"
  | "fixedDuration"
  | "enableQA"
  | "enableComments"
  | "enableDownloads"
  | "enableNotes";

export const AccessRulesControlStatusIndicator = ({
  status,
  testId,
}: {
  status: "saving" | "saved" | "failed" | null;
  testId?: string;
}) => {
  if (!status) return null;

  if (status === "saving") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-(--accent)"
        aria-live="polite"
      >
        <CircleNotch
          size={12}
          className="animate-spin text-(--accent) shrink-0"
        />
        <span>Saving...</span>
      </span>
    );
  }

  if (status === "saved") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-emerald-500"
        aria-live="polite"
      >
        <span>Saved ✓</span>
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-rose-500"
        role="alert"
      >
        <WarningCircle
          size={12}
          weight="fill"
          className="shrink-0 text-rose-500"
        />
        <span>Save failed</span>
      </span>
    );
  }

  return null;
};

export type PricingControlKey =
  | "pricingType"
  | "currency"
  | "sellingPrice"
  | "originalPrice"
  | "pricingDetails";

export const PricingControlStatusIndicator = ({
  status,
  testId,
}: {
  status: "saving" | "saved" | "failed" | null;
  testId?: string;
}) => {
  if (!status) return null;

  if (status === "saving") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-(--accent)"
        aria-live="polite"
      >
        <CircleNotch
          size={12}
          className="animate-spin text-(--accent) shrink-0"
        />
        <span>Saving...</span>
      </span>
    );
  }

  if (status === "saved") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-emerald-500"
        aria-live="polite"
      >
        <span>Saved ✓</span>
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-rose-500"
        role="alert"
      >
        <WarningCircle
          size={12}
          weight="fill"
          className="shrink-0 text-rose-500"
        />
        <span>Save failed</span>
      </span>
    );
  }

  return null;
};

export const ExtrasControlStatusIndicator = ({
  status,
  testId,
}: {
  status: "saving" | "saved" | "failed" | null;
  testId?: string;
}) => {
  if (!status) return null;

  if (status === "saving") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-(--accent)"
        aria-live="polite"
      >
        <CircleNotch
          size={12}
          className="animate-spin text-(--accent) shrink-0"
        />
        <span>Saving...</span>
      </span>
    );
  }

  if (status === "saved") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-emerald-500"
        aria-live="polite"
      >
        <span>Saved ✓</span>
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-rose-500"
        role="alert"
      >
        <WarningCircle
          size={12}
          weight="fill"
          className="shrink-0 text-rose-500"
        />
        <span>Save failed</span>
      </span>
    );
  }

  return null;
};

export const CurriculumItemStatusIndicator = ({
  status,
  testId,
}: {
  status: "saving" | "saved" | "failed" | null;
  testId?: string;
}) => {
  if (!status) return null;

  if (status === "saving") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-(--accent)"
        aria-live="polite"
      >
        <CircleNotch
          size={12}
          className="animate-spin text-(--accent) shrink-0"
        />
        <span>Saving...</span>
      </span>
    );
  }

  if (status === "saved") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-emerald-500"
        aria-live="polite"
      >
        <span>Saved ✓</span>
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-rose-500"
        role="alert"
      >
        <WarningCircle
          size={12}
          weight="fill"
          className="shrink-0 text-rose-500"
        />
        <span>Save failed</span>
      </span>
    );
  }

  return null;
};
