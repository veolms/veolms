import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import {
  LEGAL_PAGE_LIMITS,
  type LegalPage,
  type LegalPageContent,
  type LegalPageSlug,
} from "@veolms/contracts";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Button } from "../../components/Button";
import { CenteredLoadingSpinner } from "../../components/LoadingSpinner";
import { TimeAgo } from "../../components/TimeAgo";
import { CourseDescriptionEditor } from "../../courses/CourseDescriptionEditor";
import {
  SettingsSection,
  TextField,
  surfaceClass,
} from "../../home-page-settings/homePageSettingsControls";
import { useBeforeUnloadWarning } from "../../hooks/useBeforeUnloadWarning";
import type { LegalDocument } from "../../legal/legalDocument";
import {
  legalDocumentFromPage,
  parseLegalMarkdown,
} from "../../legal/legalMarkdown";
import { LegalArticle } from "../../legal/LegalPageLayout";
import { getApiError } from "../../lib/api-error";
import { useSaveLegalPage } from "../../services/legal-pages";
import { builtInLegalMarkdown } from "./builtInLegalMarkdown";

type Draft = LegalPageContent;

const FIELDS = [
  "title",
  "description",
  "heading",
  "effective",
  "markdown",
] as const;

function sameDraft(a: Draft, b: Draft) {
  return FIELDS.every((field) => a[field].trim() === b[field].trim());
}

/**
 * The built-in document's text as a draft: its head fields as they are, its
 * body converted to Markdown from the document as it renders (read from a
 * hidden copy, then dropped).
 */
function useBuiltInDraft(builtIn: LegalDocument, needed: boolean) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [failed, setFailed] = useState(false);
  const introRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!needed || draft) return;
    const intro = introRef.current;
    const body = bodyRef.current;
    if (!intro || !body) return;
    let cancelled = false;
    builtInLegalMarkdown(intro, body).then(
      (markdown) => {
        if (cancelled) return;
        setDraft({
          title: builtIn.title,
          description: builtIn.description,
          heading: builtIn.heading,
          effective: builtIn.effective ?? "",
          markdown,
        });
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [builtIn, draft, needed]);

  // The copy carries the document's own ids, so it stays out of the page
  // (and of the accessibility tree) and is removed once read.
  const source =
    needed && !draft ? (
      <div hidden aria-hidden="true">
        <div ref={introRef}>{builtIn.intro}</div>
        <div ref={bodyRef}>{builtIn.body}</div>
      </div>
    ) : null;

  return { draft, failed, source };
}

/**
 * One legal page's text: the browser title and meta description, the
 * heading and effective date, and the body in Markdown, written in one tab
 * and read back in the other exactly as the page will show it.
 */
export function LegalPageForm({
  slug,
  name,
  builtIn,
  saved,
  setNotice,
}: {
  slug: LegalPageSlug;
  name: string;
  builtIn: LegalDocument;
  saved: LegalPage | null;
  setNotice?: (message: string) => void;
}) {
  const builtInDraft = useBuiltInDraft(builtIn, !saved);
  const savedDraft = useMemo<Draft | null>(
    () =>
      saved
        ? {
            title: saved.title,
            description: saved.description,
            heading: saved.heading,
            effective: saved.effective,
            markdown: saved.markdown,
          }
        : null,
    [saved],
  );
  const start = savedDraft ?? builtInDraft.draft;

  if (!start) {
    return (
      <>
        {builtInDraft.source}
        {builtInDraft.failed ? (
          <p role="alert" className="text-sm text-rose-500">
            The built-in text of this page could not be read. Reload the page to
            try again.
          </p>
        ) : (
          <CenteredLoadingSpinner
            label="Loading the page's text"
            className="min-h-52 py-24"
          />
        )}
      </>
    );
  }

  return (
    <>
      {builtInDraft.source}
      <LegalPageDraftForm
        // A save or reset changes the starting point; the form starts again.
        key={saved?.updatedAt ?? "built-in"}
        slug={slug}
        name={name}
        builtIn={builtIn}
        start={start}
        saved={saved}
        setNotice={setNotice}
      />
    </>
  );
}

function LegalPageDraftForm({
  slug,
  name,
  builtIn,
  start,
  saved,
  setNotice,
}: {
  slug: LegalPageSlug;
  name: string;
  builtIn: LegalDocument;
  start: Draft;
  saved: LegalPage | null;
  setNotice?: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(start);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [confirmReset, setConfirmReset] = useState(false);
  const save = useSaveLegalPage();

  const isDirty = !sameDraft(draft, start);
  useBeforeUnloadWarning(isDirty || save.isPending);

  // The preview and the anchor checks follow the text a moment behind the
  // typing, so a long page stays quick to edit.
  const deferredMarkdown = useDeferredValue(draft.markdown);
  const parsed = useMemo(
    () => parseLegalMarkdown(deferredMarkdown),
    [deferredMarkdown],
  );
  const missing = FIELDS.filter(
    (field) => field !== "effective" && !draft[field].trim(),
  );
  const problem =
    missing.length > 0
      ? "Fill in the title, description, heading and text."
      : (parsed.problems[0] ?? null);
  const saveError = save.isError ? getApiError(save.error).message : null;

  const set = (field: keyof Draft) => (value: string) => {
    save.reset();
    setConfirmReset(false);
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (problem || !isDirty || save.isPending) return;
    save.mutate(
      { slug, content: draft },
      {
        onSuccess: () =>
          setNotice?.(
            `${name} saved. The public page shows it once the rebuild below finishes.`,
          ),
      },
    );
  };

  const reset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    save.mutate(
      { slug, content: null },
      {
        onSuccess: () => {
          setConfirmReset(false);
          setNotice?.(
            `${name} uses its built-in text again once the rebuild below finishes.`,
          );
        },
      },
    );
  };

  const previewDocument = useMemo(
    () =>
      legalDocumentFromPage(
        builtIn,
        { ...draft, markdown: deferredMarkdown },
        parsed,
      ),
    [builtIn, draft, deferredMarkdown, parsed],
  );

  const tabClass = (active: boolean) =>
    `flex cursor-pointer items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[0.82rem] font-bold transition-colors ${
      active
        ? "border-(--accent) text-(--accent)"
        : "border-transparent text-(--muted) hover:text-(--text)"
    }`;

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <p className="text-sm text-(--muted)">
        {saved ? (
          <>
            Showing the text saved here, changed{" "}
            <TimeAgo value={saved.updatedAt} />.
          </>
        ) : (
          "Showing the built-in text. Saving here replaces it."
        )}
      </p>

      <SettingsSection
        id={`platform-legal-${slug}-search-heading`}
        title="Search and browser tab"
        description="What search engines and the browser tab show for this page."
      >
        <TextField
          id={`platform-legal-${slug}-title`}
          label="Page title"
          value={draft.title}
          onChange={set("title")}
          maxLength={LEGAL_PAGE_LIMITS.title}
          required
        />
        <TextField
          id={`platform-legal-${slug}-description`}
          label="Meta description"
          value={draft.description}
          onChange={set("description")}
          maxLength={LEGAL_PAGE_LIMITS.description}
          multiline
          required
          hint="Shown under the title in search results. Around 150 characters reads best."
        />
        <div className="min-w-0 overflow-hidden rounded-xl border border-(--border) p-3.5">
          <p className="text-xs font-medium text-(--muted)">
            Search result preview
          </p>
          <p className="mt-1.5 truncate text-[15px] font-semibold text-(--accent)">
            {draft.title || "Page title"}
          </p>
          <p className="truncate text-xs text-(--muted)">
            procodrr.com{builtIn.path}
          </p>
          <p className="mt-1 line-clamp-2 text-[13px] text-(--text-secondary)">
            {draft.description}
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        id={`platform-legal-${slug}-page-heading`}
        title="Page"
        description="The heading at the top of the page and the date under it."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id={`platform-legal-${slug}-heading`}
            label="Heading"
            value={draft.heading}
            onChange={set("heading")}
            maxLength={LEGAL_PAGE_LIMITS.heading}
            required
          />
          <TextField
            id={`platform-legal-${slug}-effective`}
            label="Effective date line"
            value={draft.effective}
            onChange={set("effective")}
            maxLength={LEGAL_PAGE_LIMITS.effective}
            placeholder="Effective date: November 27, 2026"
            hint="Leave empty to show no date."
          />
        </div>
      </SettingsSection>

      <section
        aria-label={`${name} text`}
        className={`${surfaceClass} flex flex-col overflow-hidden`}
      >
        <div
          role="tablist"
          aria-label="Page text"
          className="flex items-center border-b border-(--border) px-3"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "write"}
            onClick={() => setMode("write")}
            className={tabClass(mode === "write")}
          >
            <PencilSimple size={15} weight="bold" />
            <span>Write</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "preview"}
            onClick={() => setMode("preview")}
            className={tabClass(mode === "preview")}
          >
            <Eye size={15} weight="bold" />
            <span>Preview</span>
          </button>
        </div>
        <div className="p-3 sm:p-5">
          {mode === "write" ? (
            <div className="grid gap-2">
              <p className="text-xs leading-5 text-(--muted)">
                Start each section with a line such as{" "}
                <code className="text-(--text)">
                  ## Refund Policy {"{#refund-policy}"}
                </code>
                : the words are its heading and the part in braces is its
                anchor, the address its link in &ldquo;On this page&rdquo; uses.
                Add an old anchor after it, as in{" "}
                <code className="text-(--text)">
                  {"{#refund-policy #refund-and-cancellation-policy}"}
                </code>
                , so links to it still work. Sections are numbered in order.
              </p>
              <CourseDescriptionEditor
                id={`platform-legal-${slug}-markdown`}
                label="Page text"
                value={draft.markdown}
                onChange={set("markdown")}
                maxLength={LEGAL_PAGE_LIMITS.markdown}
                documentTools
                minHeightClassName="min-h-[420px]"
                counter="words"
              />
            </div>
          ) : (
            <div className="min-w-0 rounded-xl bg-(--canvas) p-4 text-(--text-secondary) sm:p-8">
              <LegalArticle document={previewDocument} alwaysShowContents />
            </div>
          )}
        </div>
      </section>

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

      <div className="flex flex-wrap items-center justify-end gap-2">
        {saved ? (
          <Button
            variant="danger"
            motion="static"
            className="mr-auto"
            disabled={save.isPending}
            onClick={reset}
          >
            <ArrowCounterClockwise size={16} weight="bold" />
            {confirmReset
              ? "Confirm: use the built-in text"
              : "Use the built-in text"}
          </Button>
        ) : null}
        {confirmReset ? (
          <button
            type="button"
            className="h-10 cursor-pointer rounded-xl px-3.5 text-sm font-semibold text-(--muted) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
            onClick={() => setConfirmReset(false)}
          >
            Keep saved text
          </button>
        ) : null}
        {isDirty ? (
          <button
            type="button"
            className="h-10 cursor-pointer rounded-xl px-3.5 text-sm font-semibold text-(--muted) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
            onClick={() => {
              save.reset();
              setDraft(start);
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
          Save and publish
        </Button>
      </div>
    </form>
  );
}
