import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { StackIcon as Stack } from "@phosphor-icons/react/Stack";
import { PaletteIcon as Palette } from "@phosphor-icons/react/Palette";
import {
  DEFAULT_SITE_LOOK,
  type SiteLook,
  type SitePageResponse,
  type SiteSectionType,
} from "@veolms/contracts";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/Button";
import { CenteredLoadingSpinner } from "../components/LoadingSpinner";
import { getApiError } from "../lib/api-error";
import { cn } from "../lib/utils";
import type { NavigateTo } from "../routing/navigation";
import { useAcademyBrand } from "../services/academy";
import {
  useSaveWebsiteLook,
  useWebsiteCourseCards,
  useWebsiteOverview,
  useWebsitePage,
} from "../services/website";
import { EditorCanvas, type EditorDevice } from "./editor/EditorCanvas";
import { EditorInspector } from "./editor/EditorInspector";
import { EditorSidePanel, type SidePanelTab } from "./editor/EditorSidePanel";
import { SECTION_CATALOG } from "./editor/sectionCatalog";
import { saveStateLabel, useWebsiteEditor } from "./editor/useWebsiteEditor";
import {
  WebsiteEditorBar,
  type WebsiteEditorBarState,
} from "./WebsiteEditorBar";
import { WebsiteVersionsPanel } from "./WebsiteVersionsPanel";
import {
  WEBSITE_PATH,
  editorRenderContext,
  livePageUrl,
} from "./websiteHelpers";

export interface WebsiteEditorProps {
  pageId: string;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

/**
 * The page editor (builder-research/PLAN.md §3.1): sections on the left,
 * the real page in the middle, the selected section's settings on the
 * right. Every change autosaves as a draft; Publish puts it live.
 */
export function WebsiteEditor({
  pageId,
  onNavigatePage,
  setNotice,
}: WebsiteEditorProps) {
  const page = useWebsitePage(pageId);
  if (page.isLoading) {
    return (
      <CenteredLoadingSpinner label="Opening the page" className="min-h-80" />
    );
  }
  if (page.isError || !page.data) {
    return (
      <div className="grid place-items-center p-10 text-center">
        <p className="m-0 text-sm text-(--muted)">This page couldn’t open.</p>
        <div className="mt-3">
          <Button
            variant="quiet"
            onClick={() => onNavigatePage?.(WEBSITE_PATH)}
          >
            Back to Website
          </Button>
        </div>
      </div>
    );
  }
  return (
    <LoadedEditor
      key={pageId}
      initial={page.data}
      onNavigatePage={onNavigatePage}
      setNotice={setNotice}
    />
  );
}

/** Typing in a field must not trigger the editor's shortcuts. */
function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(
    element &&
    (element.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)),
  );
}

function LoadedEditor({
  initial,
  onNavigatePage,
  setNotice,
}: {
  initial: SitePageResponse;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}) {
  const pageId = initial.page.id;
  const overview = useWebsiteOverview();
  const courseCards = useWebsiteCourseCards();
  const brand = useAcademyBrand();
  const saveLook = useSaveWebsiteLook();
  const editor = useWebsiteEditor(initial);
  const { page, edit, undo, redo } = editor;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<SidePanelTab>("add");
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [selectIndexAfterAdd, setSelectIndexAfterAdd] = useState<number | null>(
    null,
  );
  const [device, setDevice] = useState<EditorDevice>("desktop");
  const [previewMode, setPreviewMode] = useState<"light" | "dark">("light");
  const [showVersions, setShowVersions] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [lookDraft, setLookDraft] = useState<SiteLook | null>(null);
  // On a narrow screen the panels slide over the page, one at a time.
  const [mobilePanel, setMobilePanel] = useState<"side" | "inspector" | null>(
    null,
  );

  const look: SiteLook = lookDraft ?? overview.data?.look ?? DEFAULT_SITE_LOOK;
  const previewLook = useMemo(
    (): SiteLook => ({ ...look, colourMode: previewMode }),
    [look, previewMode],
  );

  const otherPages = useMemo(
    () => (overview.data?.pages ?? []).filter((entry) => entry.id !== pageId),
    [overview.data?.pages, pageId],
  );
  const courses = courseCards.data?.courses;
  const choices = useMemo(
    () => ({ courses: courses ?? [], pages: otherPages }),
    [courses, otherPages],
  );
  const renderContext = useMemo(
    () =>
      editorRenderContext({
        academyName: brand.data?.name ?? "Your academy",
        courses: courses ?? [],
        pages: (overview.data?.pages ?? []).map(({ id, slug }) => ({
          id,
          slug,
        })),
      }),
    [brand.data?.name, courses, overview.data?.pages],
  );

  const selectedIndex = page.sections.findIndex(
    (entry) => entry.id === selectedId,
  );
  const selected = selectedIndex >= 0 ? page.sections[selectedIndex]! : null;
  const problemIds = useMemo(
    () =>
      new Set(
        editor.saveState.kind === "invalid" ? editor.saveState.sectionIds : [],
      ),
    [editor.saveState],
  );

  // A section that was just added becomes the selected one.
  useEffect(() => {
    if (selectIndexAfterAdd === null) return;
    const added = page.sections[selectIndexAfterAdd];
    if (added) {
      setSelectedId(added.id);
      setMobilePanel((panel) => (panel ? "inspector" : panel));
    }
    setSelectIndexAfterAdd(null);
  }, [page.sections, selectIndexAfterAdd]);

  // A deleted (or undone) section can't stay selected.
  useEffect(() => {
    if (selectedId && selectedIndex < 0) setSelectedId(null);
  }, [selectedId, selectedIndex]);

  // Undo, redo, delete and Escape from the keyboard.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (
        modifier &&
        event.key.toLowerCase() === "z" &&
        !isTypingTarget(event.target)
      ) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (
        modifier &&
        event.key.toLowerCase() === "y" &&
        !isTypingTarget(event.target)
      ) {
        event.preventDefault();
        redo();
      } else if (event.key === "Escape") {
        setSelectedId(null);
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedId &&
        !isTypingTarget(event.target)
      ) {
        event.preventDefault();
        edit({ type: "remove", sectionId: selectedId });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [edit, redo, selectedId, undo]);

  const insertIndex =
    insertAt ?? (selectedIndex >= 0 ? selectedIndex + 1 : page.sections.length);
  const insertLabel =
    insertIndex >= page.sections.length
      ? "at the end of the page"
      : insertIndex === 0
        ? "at the top of the page"
        : `after ${SECTION_CATALOG[page.sections[insertIndex - 1]!.type].label}`;

  function addSection(type: SiteSectionType) {
    edit({
      type: "add",
      sectionType: type,
      themeId: look.themeId,
      index: insertIndex,
    });
    setSelectIndexAfterAdd(insertIndex);
    setInsertAt(null);
  }

  async function changeLook(next: SiteLook) {
    setLookDraft(next);
    try {
      await saveLook.mutateAsync(next);
    } catch (failure) {
      setLookDraft(null);
      setNotice?.(getApiError(failure).message);
    }
  }

  async function publishPage() {
    setPublishError(null);
    const problem = await editor.publish();
    if (problem) setPublishError(problem);
    else setNotice?.("Your page is live.");
  }

  const status = editor.current.page.status;
  const { saveState } = editor;
  const notice =
    saveState.kind === "invalid" ? (
      <ul className="m-0 list-disc pl-5">
        {saveState.problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    ) : saveState.kind === "conflict" ? (
      <span>
        This page was changed in another tab.{" "}
        <button
          type="button"
          className="cursor-pointer border-none bg-transparent p-0 font-semibold text-inherit underline"
          onClick={() => window.location.reload()}
        >
          Reload to see it
        </button>
      </span>
    ) : saveState.kind === "error" ? (
      <span>{saveState.message}</span>
    ) : publishError ? (
      <span>{publishError}</span>
    ) : null;

  const bar: WebsiteEditorBarState = {
    title: editor.current.page.title,
    slug: editor.current.page.slug,
    status,
    saveLabel: saveStateLabel(saveState),
    previewMode,
    device,
    canUndo: editor.canUndo,
    canRedo: editor.canRedo,
    liveUrl: livePageUrl(editor.current.page),
    publishLabel: editor.publishing
      ? "Publishing…"
      : status === "draft"
        ? "Publish"
        : status === "changed"
          ? "Publish changes"
          : "Published",
    publishDisabled:
      editor.publishing ||
      saveState.kind === "conflict" ||
      (status === "published" && saveState.kind === "saved"),
    notice,
    onBack: () => onNavigatePage?.(WEBSITE_PATH),
    onUndo: undo,
    onRedo: redo,
    onDevice: setDevice,
    onTogglePreviewMode: () =>
      setPreviewMode((mode) => (mode === "light" ? "dark" : "light")),
    onOpenVersions: () => setShowVersions(true),
    onPublish: () => void publishPage(),
  };

  const sidePanel = (
    <EditorSidePanel
      tab={panelTab}
      onTab={setPanelTab}
      page={page}
      look={look}
      selectedId={selectedId}
      insertLabel={insertLabel}
      savingLook={saveLook.isPending}
      onAdd={addSection}
      onSelect={(id) => {
        setSelectedId(id);
        setMobilePanel((panel) => (panel ? "inspector" : panel));
      }}
      onEdit={edit}
      onLook={(next) => void changeLook(next)}
    />
  );
  const inspector = selected ? (
    <EditorInspector
      key={selected.id}
      section={selected}
      index={selectedIndex}
      count={page.sections.length}
      look={previewLook}
      choices={choices}
      onEdit={edit}
      onClose={() => {
        setSelectedId(null);
        setMobilePanel(null);
      }}
    />
  ) : null;

  const panelBorder = "border-[color-mix(in_srgb,var(--text)_8%,transparent)]";

  return (
    <>
      <div className="flex h-full min-h-130 flex-col overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface)">
        <WebsiteEditorBar bar={bar} />
        <div className="relative flex min-h-0 flex-1">
          <aside
            className={cn(
              "hidden w-76 shrink-0 border-r bg-(--surface) lg:block",
              panelBorder,
            )}
          >
            {sidePanel}
          </aside>
          <EditorCanvas
            page={page}
            look={previewLook}
            context={renderContext}
            device={device}
            selectedId={selectedId}
            problemIds={problemIds}
            onSelect={(id) => {
              setSelectedId(id);
              setInsertAt(null);
              if (id)
                setMobilePanel((panel) =>
                  panel === null ? panel : "inspector",
                );
            }}
            onInsertAt={(index) => {
              setInsertAt(index);
              setPanelTab("add");
              setMobilePanel("side");
            }}
          />
          {inspector ? (
            <aside
              className={cn(
                "hidden w-84 shrink-0 border-l bg-(--surface) lg:block",
                panelBorder,
              )}
            >
              {inspector}
            </aside>
          ) : null}

          {/* Narrow screens: one panel at a time, over the page. */}
          {mobilePanel ? (
            <div className="absolute inset-0 z-10 flex lg:hidden">
              <button
                type="button"
                aria-label="Close the panel"
                className="absolute inset-0 cursor-default border-none bg-black/35"
                onClick={() => setMobilePanel(null)}
              />
              <div className="relative ml-auto h-full w-[min(380px,100%)] bg-(--surface) shadow-[-12px_0_40px_-20px_rgb(0_0_0/.5)]">
                {mobilePanel === "inspector" && inspector
                  ? inspector
                  : sidePanel}
              </div>
            </div>
          ) : null}
        </div>
        <div
          className={cn(
            "flex items-center justify-around gap-1 border-t p-1.5 lg:hidden",
            panelBorder,
          )}
        >
          {[
            { tab: "add" as const, label: "Add", Icon: Plus },
            { tab: "layers" as const, label: "Layers", Icon: Stack },
            { tab: "theme" as const, label: "Theme", Icon: Palette },
          ].map(({ tab, label, Icon }) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setPanelTab(tab);
                setMobilePanel("side");
              }}
              className="flex h-11 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-none bg-transparent text-[11px] font-semibold text-(--muted) hover:bg-(--hover) hover:text-(--text)"
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </button>
          ))}
          {selected ? (
            <button
              type="button"
              onClick={() => setMobilePanel("inspector")}
              className="flex h-11 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-none bg-(--accent)/12 text-[11px] font-semibold text-(--accent)"
            >
              <span className="text-[13px] leading-none font-bold">Edit</span>
              {SECTION_CATALOG[selected.type].label}
            </button>
          ) : null}
        </div>
      </div>
      <WebsiteVersionsPanel
        isOpen={showVersions}
        onClose={() => setShowVersions(false)}
        page={editor.current}
        onChanged={(next) => {
          editor.setCurrent(next);
          setNotice?.("The live page changed.");
        }}
      />
    </>
  );
}
