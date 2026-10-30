import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/UploadSimple";
import {
  ACADEMY_LOGO_CONTENT_TYPES,
  ACADEMY_LOGO_MAX_BYTES,
  type AcademyBrandResponse,
} from "@veolms/contracts";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "../components/Button";
import { getApiError } from "../lib/api-error";
import {
  useAcademyBrand,
  useRemoveAcademyLogo,
  useUpdateAcademyBrand,
  useUploadAcademyLogo,
} from "../services/academy";
import { SettingsSection, TextField } from "./homePageSettingsControls";

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

function logoFileProblem(file: File): string | null {
  if (!(ACADEMY_LOGO_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    return "Choose a PNG or JPEG image.";
  }
  if (file.size > ACADEMY_LOGO_MAX_BYTES) {
    return "The logo must be 2 MB or smaller.";
  }
  return null;
}

/**
 * The logo, as the top of an email shows it, with buttons to upload,
 * replace or remove it. Each takes effect at once.
 */
function AcademyLogoField({
  saved,
  setNotice,
}: {
  saved: AcademyBrandResponse;
  setNotice?: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadAcademyLogo();
  const remove = useRemoveAcademyLogo();
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const busy = upload.isPending || remove.isPending;
  const error =
    fileProblem ??
    (upload.isError
      ? getApiError(upload.error).message || "The logo could not be uploaded."
      : remove.isError
        ? getApiError(remove.error).message || "The logo could not be removed."
        : null);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // The same file can be chosen again after a failed upload.
    event.target.value = "";
    if (!file) return;
    upload.reset();
    remove.reset();
    const problem = logoFileProblem(file);
    setFileProblem(problem);
    if (problem) return;
    upload.mutate(file, {
      onSuccess: () => {
        setLogoFailed(false);
        setNotice?.("Academy logo uploaded.");
      },
    });
  };

  const showLogo = saved.logoUrl && !logoFailed;

  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-(--text)">Logo</p>
      {/* How the top of an email will look: the emails' navy, with the logo
          or, without one, the name in the wordmark's style. */}
      <div className="flex min-h-18 items-center rounded-xl bg-[#0B0D12] px-6 py-5">
        {showLogo ? (
          <img
            alt={saved.name || "Academy logo"}
            className="block h-8 w-auto max-w-60"
            onError={() => setLogoFailed(true)}
            src={saved.logoUrl ?? undefined}
          />
        ) : (
          <span className="text-2xl leading-8 font-bold tracking-[-0.5px] text-[#F3F4F6]">
            <span className="text-[#6E7CFF]">{saved.name.charAt(0)}</span>
            {saved.name.slice(1)}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs text-(--muted)">
        {logoFailed
          ? "The logo could not be shown here. Try uploading it again."
          : "A PNG or JPEG up to 2 MB, about 64px tall, ideally with a transparent background. Without one, the academy's name is shown instead."}
      </p>
      {error ? (
        <p className="mt-1.5 text-xs text-rose-500" role="alert">
          {error}
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={ACADEMY_LOGO_CONTENT_TYPES.join(",")}
        className="hidden"
        onChange={chooseFile}
        aria-label="Choose a logo image"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          motion="static"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {upload.isPending ? (
            <CircleNotch size={16} className="animate-spin" />
          ) : (
            <UploadSimple size={16} weight="bold" />
          )}
          {upload.isPending
            ? "Uploading…"
            : saved.logoUrl
              ? "Replace logo"
              : "Upload logo"}
        </Button>
        {saved.logoUrl ? (
          <button
            type="button"
            disabled={busy}
            className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold text-(--muted) hover:text-rose-500 focus-visible:outline-2 focus-visible:outline-(--accent) disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => {
              upload.reset();
              setFileProblem(null);
              remove.mutate(undefined, {
                onSuccess: () => {
                  setLogoFailed(false);
                  setNotice?.("Academy logo removed.");
                },
              });
            }}
          >
            {remove.isPending ? (
              <CircleNotch size={16} className="animate-spin" />
            ) : (
              <Trash size={16} />
            )}
            Remove
          </button>
        ) : null}
      </div>
    </div>
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
