import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import {
  emptyLegalPlaceholders,
  fillLegalTemplate,
  LEGAL_PAGE_PLACEHOLDERS,
  legalPageContentSchema,
  type AdminLegalPageResponse,
  type LegalPageContent,
  type LegalPagePlaceholder,
  type LegalPageSlug,
} from "@veolms/contracts";
import { useMemo, useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { ConfirmDeleteModal } from "../../ConfirmDeleteModal";
import { CourseDescriptionEditor } from "../../courses/CourseDescriptionEditor";
import {
  SettingsSection,
  TextField,
} from "../../home-page-settings/homePageSettingsControls";
import { LEGAL_PROSE_CLASS } from "../../legal/LegalPageLayout";
import { legalDocumentFromContent } from "../../legal/legalMarkdownDocument";
import { getApiError } from "../../lib/api-error";
import {
  useAdminLegalPage,
  useResetLegalPage,
  useSaveLegalPage,
} from "../../services/legal-pages";
import { PlatformSettingsStatus } from "../PlatformSettingsStatus";
import { PLACEHOLDER_LABELS } from "./legalPlaceholders";

const MAX_MARKDOWN = 100_000;

function sameContent(a: LegalPageContent, b: LegalPageContent) {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.heading === b.heading &&
    (a.effective ?? "") === (b.effective ?? "") &&
    a.markdown === b.markdown
  );
}

/** One page of the Legal pages tab, with its words open for editing. */
export function LegalPageEditor({
  slug,
  onBack,
  setNotice,
}: {
  slug: LegalPageSlug;
  onBack: () => void;
  setNotice?: (message: string) => void;
}) {
  const query = useAdminLegalPage(slug);

  return (
    <div className="grid gap-4">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl px-2.5 text-sm font-semibold text-(--text-secondary) hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
        >
          <ArrowLeft size={16} weight="bold" />
          All legal pages
        </button>
      </div>
      {query.data ? (
        <EditorForm
          // A fresh form for each page, and after a restore.
          key={`${slug}:${query.data.updatedAt ?? "default"}`}
          page={query.data}
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

function EditorForm({
  page,
  setNotice,
}: {
  page: AdminLegalPageResponse;
  setNotice?: (message: string) => void;
}) {
  const save = useSaveLegalPage();
  const reset = useResetLegalPage();
  const [draft, setDraft] = useState<LegalPageContent>(page.content);
  const [preview, setPreview] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const isDirty = !sameContent(draft, page.content);
  const parsed = legalPageContentSchema.safeParse(draft);
  const problem = parsed.success ? null : parsed.error.issues[0]!.message;
  const saveError = save.isError ? getApiError(save.error).message : null;
  const resetError = reset.isError ? getApiError(reset.error).message : null;

  const set = <K extends keyof LegalPageContent>(
    field: K,
    value: LegalPageContent[K],
  ) => {
    save.reset();
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const allText = [
    draft.title,
    draft.heading,
    draft.effective ?? "",
    draft.markdown,
  ].join("\n");
  const missing = emptyLegalPlaceholders(allText, page.values);

  const previewDocument = useMemo(() => {
    if (!preview) return null;
    // A detail that is not set shows as a marker here, so the gap is seen
    // before visitors meet a sentence with a word missing.
    const values = Object.fromEntries(
      LEGAL_PAGE_PLACEHOLDERS.map((name) => [
        name,
        page.values[name] || `[${PLACEHOLDER_LABELS[name]} not set]`,
      ]),
    ) as typeof page.values;
    const filled = (text: string) =>
      fillLegalTemplate(text, {
        ...values,
        postalAddress: values.postalAddress.replace(/\r?\n/gu, "  \n"),
      });
    return legalDocumentFromContent(`/${page.slug}`, {
      title: filled(draft.title),
      description: filled(draft.description),
      heading: filled(draft.heading),
      effective: draft.effective ? filled(draft.effective) : null,
      markdown: filled(draft.markdown),
    });
  }, [preview, draft, page]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!parsed.success || !isDirty || save.isPending) return;
    save.mutate(
      { slug: page.slug, page: parsed.data },
      { onSuccess: () => setNotice?.("Page saved. Visitors see it now.") },
    );
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <SettingsSection
        id={`platform-legal-${page.slug}-heading`}
        title={fillLegalTemplate(page.content.heading, page.values)}
        description={
          page.customized
            ? "Your own words. Restore the default to start again from the template."
            : "The default text, written for an Indian online academy. Read it through and make it yours before you rely on it."
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id={`platform-legal-${page.slug}-page-heading`}
            label="Heading"
            value={draft.heading}
            onChange={(value) => set("heading", value)}
            maxLength={160}
            required
          />
          <TextField
            id={`platform-legal-${page.slug}-title`}
            label="Browser tab title"
            value={draft.title}
            onChange={(value) => set("title", value)}
            maxLength={160}
            required
          />
        </div>
        <TextField
          id={`platform-legal-${page.slug}-effective`}
          label="Date line"
          value={draft.effective ?? ""}
          onChange={(value) => set("effective", value.trim() ? value : null)}
          maxLength={160}
          placeholder="Effective date: 1 January 2027"
          hint="Shown under the heading. Leave empty for none."
        />
        <TextField
          id={`platform-legal-${page.slug}-description`}
          label="Search description"
          value={draft.description}
          onChange={(value) => set("description", value)}
          maxLength={300}
          multiline
          hint="What search engines and shared links show under the title."
        />
      </SettingsSection>

      <SettingsSection
        id={`platform-legal-${page.slug}-text-heading`}
        title="Page text"
        description="Start a section with a Heading 2 line (## in the text): each one is numbered and listed under “On this page”."
      >
        <PlaceholderHelp page={page} missing={missing} />

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={preview ? "quiet" : "primary"}
            motion="static"
            onClick={() => setPreview(false)}
            aria-pressed={!preview}
          >
            Edit
          </Button>
          <Button
            type="button"
            variant={preview ? "primary" : "quiet"}
            motion="static"
            onClick={() => setPreview(true)}
            aria-pressed={preview}
          >
            Preview
          </Button>
        </div>

        {previewDocument ? (
          <div className="rounded-2xl border border-(--border) bg-(--canvas) p-5 sm:p-6">
            <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-[-0.025em] text-(--text)">
              {previewDocument.heading}
            </h1>
            {previewDocument.effective ? (
              <p className="mt-2 text-[13px] text-(--muted)">
                {previewDocument.effective}
              </p>
            ) : null}
            <div className="mt-4 text-[15px] leading-[1.7] text-(--text-secondary) [&_p]:mb-3">
              {previewDocument.intro}
            </div>
            <div className={`mt-6 ${LEGAL_PROSE_CLASS}`}>
              {previewDocument.body}
            </div>
          </div>
        ) : (
          <CourseDescriptionEditor
            id={`platform-legal-${page.slug}-markdown`}
            label="Text"
            value={draft.markdown}
            onChange={(value) => set("markdown", value)}
            maxLength={MAX_MARKDOWN}
            documentTools
            counter="words"
            minHeightClassName="min-h-[420px]"
            placeholder="The page's opening paragraph, then its sections."
          />
        )}
      </SettingsSection>

      {problem && isDirty ? (
        <p className="text-xs text-rose-500" role="alert">
          {problem}
        </p>
      ) : null}
      {saveError || resetError ? (
        <p className="text-xs text-rose-500" role="alert">
          {saveError ?? resetError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <a
            href={`/${page.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-(--text-secondary) no-underline hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
          >
            <ArrowSquareOut size={16} />
            Open the page
          </a>
          {page.customized ? (
            <button
              type="button"
              disabled={reset.isPending}
              onClick={() => setConfirmReset(true)}
              className="h-10 cursor-pointer rounded-xl px-3 text-sm font-semibold text-(--muted) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent) disabled:cursor-default disabled:opacity-60"
            >
              Restore the default
            </button>
          ) : null}
        </div>
        <div className="flex gap-2">
          {isDirty ? (
            <button
              type="button"
              className="h-10 cursor-pointer rounded-xl px-3.5 text-sm font-semibold text-(--muted) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
              onClick={() => {
                save.reset();
                setDraft(page.content);
              }}
            >
              Discard
            </button>
          ) : null}
          <Button
            type="submit"
            motion="static"
            disabled={!isDirty || Boolean(problem) || save.isPending}
          >
            {save.isPending ? (
              <CircleNotch size={16} className="animate-spin" />
            ) : null}
            Save page
          </Button>
        </div>
      </div>

      <ConfirmDeleteModal
        isOpen={confirmReset}
        title="Restore the default text?"
        message="Your words for this page are removed and visitors see the default template again. This cannot be undone."
        confirmLabel="Restore"
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          reset.mutate(page.slug, {
            onSuccess: () => setNotice?.("Default text restored."),
          });
        }}
      />
    </form>
  );
}

/** The placeholders the text may use, each with what it reads as now. */
function PlaceholderHelp({
  page,
  missing,
}: {
  page: AdminLegalPageResponse;
  missing: LegalPagePlaceholder[];
}) {
  return (
    <details className="group rounded-xl border border-(--border) bg-(--surface) text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 font-medium text-(--text) [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-(--accent)">
        <span>Details the text fills in</span>
        {missing.length > 0 ? (
          <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            {missing.length} not set
          </span>
        ) : null}
      </summary>
      <div className="grid gap-2 px-4 pb-4">
        <p className="text-xs text-(--muted)">
          Type a name in double braces and the page shows its value there.
          Change the values under Legal details, on the list of pages.
        </p>
        <dl className="grid gap-1.5">
          {LEGAL_PAGE_PLACEHOLDERS.map((name) => (
            <div
              key={name}
              className="grid gap-x-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]"
            >
              <dt className="font-mono text-xs text-(--text-secondary)">
                {`{{${name}}}`}
                <span className="ml-2 font-sans text-(--muted)">
                  {PLACEHOLDER_LABELS[name]}
                </span>
              </dt>
              <dd
                className={`min-w-0 truncate text-xs ${
                  page.values[name]
                    ? "text-(--text)"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {page.values[name].split("\n")[0] || "Not set"}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
