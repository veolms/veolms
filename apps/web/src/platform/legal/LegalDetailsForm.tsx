import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import {
  platformLegalSettingsSchema,
  type PlatformInvoiceSettings,
  type PlatformLegalSettings,
} from "@veolms/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import {
  SettingsSection,
  TextField,
} from "../../home-page-settings/homePageSettingsControls";
import { getApiError } from "../../lib/api-error";
import { academyKeys } from "../../services/academy";
import { legalPagesKeys } from "../../services/legal-pages";
import { useUpdatePlatformSettings } from "../../services/platform";

type Field = keyof PlatformLegalSettings;

function fieldProblems(
  draft: PlatformLegalSettings,
): Partial<Record<Field, string>> {
  const parsed = platformLegalSettingsSchema.safeParse(draft);
  if (parsed.success) return {};
  const problems: Partial<Record<Field, string>> = {};
  for (const issue of parsed.error.issues) {
    problems[issue.path[0] as Field] ??= issue.message;
  }
  return problems;
}

/** "Leave empty to use …", naming what an empty field falls back to. */
function fallbackHint(fallback: string, what: string): string {
  return fallback
    ? `Leave empty to use ${what}: ${fallback.split("\n")[0]}`
    : "";
}

/**
 * Who the legal pages name: the company, its address, where to write, and
 * the Grievance Officer. Every page fills these in, so a change here shows
 * on all of them.
 */
export function LegalDetailsForm({
  saved,
  invoice,
  academyName,
  setNotice,
}: {
  saved: PlatformLegalSettings;
  invoice: PlatformInvoiceSettings;
  academyName: string;
  setNotice?: (message: string) => void;
}) {
  const update = useUpdatePlatformSettings();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(saved);

  const isDirty = (Object.keys(saved) as Field[]).some(
    (field) => draft[field] !== saved[field],
  );
  const problems = fieldProblems(draft);
  const firstProblem = Object.values(problems)[0] ?? null;
  const saveError = update.isError ? getApiError(update.error).message : null;

  const text = (field: Field) => ({
    value: draft[field],
    onChange: (value: string) => {
      update.reset();
      setDraft((current) => ({ ...current, [field]: value }));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (firstProblem || !isDirty || update.isPending) return;
    update.mutate(
      { legal: draft },
      {
        onSuccess: (response) => {
          setDraft(response.settings.legal);
          // Every page and the support box show these details.
          void queryClient.invalidateQueries({ queryKey: legalPagesKeys.all });
          void queryClient.invalidateQueries({
            queryKey: academyKeys.publicBrand(),
          });
          setNotice?.("Legal details saved.");
        },
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate>
      <SettingsSection
        id="platform-legal-details-heading"
        title="Legal details"
        description="Every legal page fills these in where its text names your company, address, contact email or Grievance Officer."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="platform-legal-company"
            label="Company name"
            {...text("companyName")}
            maxLength={160}
            placeholder={
              invoice.companyName || academyName || "Example Labs LLP"
            }
            hint={
              fallbackHint(
                invoice.companyName || academyName,
                invoice.companyName ? "the invoice's" : "the academy's name",
              ) || undefined
            }
          />
          <TextField
            id="platform-legal-email"
            label="Contact email"
            {...text("contactEmail")}
            maxLength={254}
            placeholder={invoice.email || "contact@example.com"}
            hint={
              problems.contactEmail ??
              (fallbackHint(invoice.email, "the invoice's") ||
                "Shown on every page for questions, privacy requests and grievances.")
            }
          />
        </div>
        <TextField
          id="platform-legal-address"
          label="Postal address"
          {...text("postalAddress")}
          maxLength={500}
          multiline
          placeholder={invoice.address || "Street, city, postcode, country"}
          hint={
            fallbackHint(invoice.address, "the invoice's") ||
            "Shown on the Contact page, one line per line."
          }
        />
        <TextField
          id="platform-legal-grievance"
          label="Grievance Officer"
          {...text("grievanceOfficer")}
          maxLength={160}
          placeholder="Full name"
          hint="Named on the Terms, Privacy, Contact and Delete account pages. Indian law asks for one."
        />

        {firstProblem && isDirty ? (
          <p className="text-xs text-rose-500" role="alert">
            {firstProblem}
          </p>
        ) : null}
        {saveError ? (
          <p className="text-xs text-rose-500" role="alert">
            {saveError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          {isDirty ? (
            <button
              type="button"
              className="h-10 cursor-pointer rounded-xl px-3.5 text-sm font-semibold text-(--muted) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
              onClick={() => {
                update.reset();
                setDraft(saved);
              }}
            >
              Discard
            </button>
          ) : null}
          <Button
            type="submit"
            motion="static"
            disabled={!isDirty || Boolean(firstProblem) || update.isPending}
          >
            {update.isPending ? (
              <CircleNotch size={16} className="animate-spin" />
            ) : null}
            Save legal details
          </Button>
        </div>
      </SettingsSection>
    </form>
  );
}
