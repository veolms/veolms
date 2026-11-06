import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import type { AcademyBrandResponse } from "@veolms/contracts";
import { useState, type FormEvent } from "react";
import { Button } from "../components/Button";
import { getApiError } from "../lib/api-error";
import {
  useAcademyBrand,
  useRemoveAcademyLogo,
  useUpdateAcademyBrand,
  useUploadAcademyLogo,
} from "../services/academy";
import { SettingsSection, TextField } from "./homePageSettingsControls";
import { LogoUploadField } from "./LogoUploadField";

/**
 * The academy's name and logo: what its emails (the sign-in code, account
 * notices) show at the top, and what its invoices print. The General tab of
 * the Platform page.
 */
export function AcademyBrandSection({
  setNotice,
}: {
  setNotice?: (message: string) => void;
}) {
  const brandQuery = useAcademyBrand();

  return (
    <SettingsSection
      id="academy-brand-heading"
      title="Academy name and logo"
      description="Shown at the top of the emails your academy sends, such as sign-in codes, and on its invoices."
    >
      {brandQuery.isLoading ? (
        <p className="text-sm text-(--muted)">Loading…</p>
      ) : brandQuery.isError || !brandQuery.data ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-(--muted)">
            The academy&apos;s name and logo could not be loaded.
          </p>
          <Button onClick={() => void brandQuery.refetch()}>Try again</Button>
        </div>
      ) : (
        <>
          <AcademyLogoField saved={brandQuery.data} setNotice={setNotice} />
          <AcademyNameForm
            // A save replaces the saved copy; start the draft from it again.
            key={brandQuery.data.name}
            saved={brandQuery.data}
            setNotice={setNotice}
          />
        </>
      )}
    </SettingsSection>
  );
}

/** The logo, as the top of an email shows it (on the emails' navy). */
function AcademyLogoField({
  saved,
  setNotice,
}: {
  saved: AcademyBrandResponse;
  setNotice?: (message: string) => void;
}) {
  const upload = useUploadAcademyLogo();
  const remove = useRemoveAcademyLogo();
  return (
    <LogoUploadField
      label="Logo"
      inputLabel="Choose a logo image"
      logoUrl={saved.logoUrl}
      alt={saved.name || "Academy logo"}
      surface="dark"
      fallback={
        <span className="text-2xl leading-8 font-bold tracking-[-0.5px] text-[#F3F4F6]">
          <span className="text-[#6E7CFF]">{saved.name.charAt(0)}</span>
          {saved.name.slice(1)}
        </span>
      }
      hint="A PNG or JPEG up to 2 MB, about 64px tall, ideally with a transparent background. Without one, the academy's name is shown instead."
      upload={upload}
      remove={remove}
      uploadedNotice="Academy logo uploaded."
      removedNotice="Academy logo removed."
      setNotice={setNotice}
    />
  );
}

function AcademyNameForm({
  saved,
  setNotice,
}: {
  saved: AcademyBrandResponse;
  setNotice?: (message: string) => void;
}) {
  const [name, setName] = useState(saved.name);
  const updateBrand = useUpdateAcademyBrand();

  const isDirty = name.trim() !== saved.name;
  const problem = !name.trim() ? "Enter the academy's name." : null;
  const saveError = updateBrand.isError
    ? getApiError(updateBrand.error).message
    : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (problem || !isDirty || updateBrand.isPending) return;
    updateBrand.mutate(
      { name: name.trim() },
      { onSuccess: () => setNotice?.("Academy name saved.") },
    );
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <TextField
        id="academy-brand-name"
        label="Academy name"
        value={name}
        onChange={(value) => {
          updateBrand.reset();
          setName(value);
        }}
        maxLength={255}
        required
        hint="Used in email subjects and wherever the logo cannot load."
      />

      {problem && isDirty ? (
        <p className="text-xs text-rose-500" role="alert">
          {problem}
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
              updateBrand.reset();
              setName(saved.name);
            }}
          >
            Discard
          </button>
        ) : null}
        <Button
          type="submit"
          motion="static"
          disabled={!isDirty || Boolean(problem) || updateBrand.isPending}
        >
          {updateBrand.isPending ? (
            <CircleNotch size={16} className="animate-spin" />
          ) : null}
          Save name
        </Button>
      </div>
    </form>
  );
}
