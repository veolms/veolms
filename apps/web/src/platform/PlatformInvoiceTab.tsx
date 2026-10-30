import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import {
  platformInvoiceSettingsSchema,
  type PlatformInvoiceSettings,
} from "@veolms/contracts";
import { useState, type FormEvent } from "react";
import { Button } from "../components/Button";
import {
  SettingsSection,
  Switch,
  TextField,
} from "../home-page-settings/homePageSettingsControls";
import { getApiError } from "../lib/api-error";
import {
  usePlatformSettings,
  useUpdatePlatformSettings,
} from "../services/platform";
import { PlatformSettingsStatus } from "./PlatformSettingsStatus";

type Field = keyof PlatformInvoiceSettings;

/**
 * What the academy prints on the invoices students download: the seller's
 * details, how invoice numbers start, and the lines at the foot. Saved
 * together with one button, as the General tab's name and logo are.
 */
export function PlatformInvoiceTab({
  setNotice,
}: {
  setNotice?: (message: string) => void;
}) {
  const query = usePlatformSettings();
  // Kept here rather than in the form: the form starts afresh after a save,
  // and the save's notice must still reach the admin.
  const update = useUpdatePlatformSettings();
  const saved = query.data?.settings.invoice;

  return (
    <div className="settings-content">
      <header className="settings-detail__header">
        <div>
          <h2>Invoice</h2>
          <p>
            The details printed on the PDF invoice a student downloads for a
            paid order. Each invoice is made when the order is paid, so a change
            here applies to orders paid from now on.
          </p>
        </div>
      </header>
      {saved ? (
        <InvoiceForm
          // A save the server confirms starts the draft again from what it
          // stored. Keyed on the save time, not the values: those change at
          // once while a save is under way, and back if it fails, and the
          // draft must survive both.
          key={query.data?.updatedAt ?? "defaults"}
          saved={saved}
          update={update}
          setNotice={setNotice}
        />
      ) : (
        <PlatformSettingsStatus
          isError={query.isError}
          onRetry={() => void query.refetch()}
        />
      )}
    </div>
  );
}

/** The first problem with each field, as the API would report it. */
function fieldProblems(
  draft: PlatformInvoiceSettings,
): Partial<Record<Field, string>> {
  const parsed = platformInvoiceSettingsSchema.safeParse(draft);
  if (parsed.success) return {};
  const problems: Partial<Record<Field, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as Field;
    problems[field] ??= issue.message;
  }
  return problems;
}

function InvoiceForm({
  saved,
  update,
  setNotice,
}: {
  saved: PlatformInvoiceSettings;
  update: ReturnType<typeof useUpdatePlatformSettings>;
  setNotice?: (message: string) => void;
}) {
  const [draft, setDraft] = useState(saved);

  const isDirty = (Object.keys(saved) as Field[]).some(
    (field) => draft[field] !== saved[field],
  );
  const problems = fieldProblems(draft);
  const firstProblem = Object.values(problems)[0] ?? null;
  const saveError = update.isError ? getApiError(update.error).message : null;

  const set = <K extends Field>(
    field: K,
    value: PlatformInvoiceSettings[K],
  ) => {
    update.reset();
    setDraft((current) => ({ ...current, [field]: value }));
  };
  const text = (field: Exclude<Field, "showLogo">) => ({
    value: draft[field],
    onChange: (value: string) => set(field, value),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (firstProblem || !isDirty || update.isPending) return;
    update.mutate(
      { invoice: draft },
      { onSuccess: () => setNotice?.("Invoice details saved.") },
    );
  };

  const prefix = draft.numberPrefix.trim();
  const sampleNumber = [prefix, new Date().getFullYear(), "000001"]
    .filter(Boolean)
    .join("/");

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <SettingsSection
        id="platform-invoice-company-heading"
        title="Company details"
        description="Printed at the top of every invoice, under the logo."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="platform-invoice-company"
            label="Company name"
            {...text("companyName")}
            maxLength={120}
            placeholder="PROCODRR LABS LLP"
            hint="The seller's legal name. Leave empty to use the academy's name."
          />
          <TextField
            id="platform-invoice-gstin"
            label="GSTIN"
            {...text("gstin")}
            maxLength={15}
            placeholder="29ABCDE1234F1Z5"
            hint={
              problems.gstin ?? "Leave empty if you are not registered for GST."
            }
          />
        </div>
        <TextField
          id="platform-invoice-address"
          label="Address"
          {...text("address")}
          maxLength={400}
          multiline
          placeholder="No 235, 2nd Floor, 13th Cross Road, Indiranagar, Bengaluru, Karnataka 560038"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="platform-invoice-email"
            label="Email"
            {...text("email")}
            maxLength={254}
            placeholder="billing@example.com"
            hint={problems.email}
          />
          <TextField
            id="platform-invoice-phone"
            label="Phone"
            {...text("phone")}
            maxLength={30}
            placeholder="+91 99999 99999"
            hint={problems.phone}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        id="platform-invoice-numbers-heading"
        title="Invoice numbers"
        description="Each paid order gets the next number of its year, counted from 1 every January."
      >
        <TextField
          id="platform-invoice-prefix"
          label="Number prefix"
          {...text("numberPrefix")}
          maxLength={12}
          placeholder="INV"
          hint={
            problems.numberPrefix ??
            `New invoices read ${sampleNumber}. Invoices already issued keep their number.`
          }
        />
      </SettingsSection>

      <SettingsSection
        id="platform-invoice-footer-heading"
        title="Logo and footer"
        description="The academy logo comes from the General tab."
      >
        <label className="flex items-center justify-between gap-4 text-sm font-medium text-(--text)">
          <span>Print the academy logo</span>
          <Switch
            checked={draft.showLogo}
            onChange={(checked) => set("showLogo", checked)}
            label="Print the academy logo on invoices"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="platform-invoice-signatory"
            label="Signatory line"
            {...text("signatoryLabel")}
            maxLength={60}
            placeholder="Authorised signatory"
            hint="Printed under “For <company name>”."
          />
          <TextField
            id="platform-invoice-footer"
            label="Footer note"
            {...text("footerNote")}
            maxLength={200}
            placeholder="This is computer generated receipt and does not require physical signature"
          />
        </div>
      </SettingsSection>

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
          Save invoice details
        </Button>
      </div>
    </form>
  );
}
