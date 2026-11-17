import "@puckeditor/core/puck.css";
import "./website-editor.css";

import { Puck, type Data } from "@puckeditor/core";
import {
  DEFAULT_SITE_LOOK,
  type SiteLook,
  type SitePageResponse,
} from "@veolms/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/Button";
import { CenteredLoadingSpinner } from "../components/LoadingSpinner";
import { getApiError } from "../lib/api-error";
import type { NavigateTo } from "../routing/navigation";
import { useAcademyBrand } from "../services/academy";
import {
  usePublishWebsitePage,
  useSaveWebsiteDraft,
  useWebsiteCourseCards,
  useWebsiteOverview,
  useWebsitePage,
} from "../services/website";
import { checkPage, toPuckData } from "./puckAdapter";
import {
  createWebsitePuckConfig,
  type WebsiteEditorMetadata,
} from "./puckConfig";
import { WebsiteEditorChoicesContext } from "./WebsiteFieldControls";
import {
  WebsiteEditorBar,
  WebsiteEditorBarContext,
  type WebsiteEditorBarState,
} from "./WebsiteEditorBar";
import { WebsiteVersionsPanel } from "./WebsiteVersionsPanel";
import { WEBSITE_PATH, livePageUrl } from "./websiteHelpers";

const AUTOSAVE_DELAY_MS = 1200;

/** Our bar replaces Puck's header (a stable component; see WebsiteEditorBar). */
const PUCK_OVERRIDES = { header: WebsiteEditorBar };

const VIEWPORTS = [
  {
    width: 375,
    height: "auto" as const,
    label: "Phone",
    icon: "Smartphone" as const,
  },
  {
    width: 768,
    height: "auto" as const,
    label: "Tablet",
    icon: "Tablet" as const,
  },
  {
    width: 1280,
    height: "auto" as const,
    label: "Desktop",
    icon: "Monitor" as const,
  },
];

type SaveState =
  | { kind: "saved" }
  | { kind: "pending" }
  | { kind: "saving" }
  | { kind: "invalid"; problems: string[] }
  | { kind: "conflict" }
  | { kind: "error"; message: string };

export interface WebsiteEditorProps {
  pageId: string;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

function saveStateLabel(state: SaveState): string {
  switch (state.kind) {
    case "saved":
      return "All changes saved";
    case "pending":
    case "saving":
      return "Saving…";
    case "invalid":
      return "Not saved: fix the marked field";
    case "conflict":
      return "Changed in another tab";
    case "error":
      return "Not saved";
  }
}

/**
 * The page editor: Puck as the editing shell over our own sections. Every
 * change autosaves as a draft; Publish freezes it and puts it live.
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
  const saveDraft = useSaveWebsiteDraft();
  const publish = usePublishWebsitePage();

  const [current, setCurrent] = useState<SitePageResponse>(initial);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "saved" });
  const [previewMode, setPreviewMode] = useState<"light" | "dark">("light");
  const [showVersions, setShowVersions] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const initialData = useMemo(() => toPuckData(initial.document), [initial]);
  const latestData = useRef<Data>(initialData);
  const baseUpdatedAt = useRef<string>(initial.draftUpdatedAt);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);

  const look: SiteLook = overview.data?.look ?? DEFAULT_SITE_LOOK;
  const config = useMemo(
    () => createWebsitePuckConfig(look.themeId),
    [look.themeId],
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
  const metadata = useMemo(
    (): WebsiteEditorMetadata => ({
      academyName: brand.data?.name ?? "Your academy",
      courses: [...(courses ?? [])],
      pages: (overview.data?.pages ?? []).map(({ id, slug }) => ({ id, slug })),
      look: { ...look, colourMode: previewMode },
    }),
    [brand.data?.name, courses, overview.data?.pages, look, previewMode],
  );

  /** Saves what is on screen now. True when the server has it. */
  const saveNow = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inFlight.current) await inFlight.current;
    const checked = checkPage(latestData.current);
    if (!checked.ok) {
      setSaveState({ kind: "invalid", problems: checked.problems });
      return false;
    }
    setSaveState({ kind: "saving" });
    const run = (async () => {
      try {
        const saved = await saveDraft.mutateAsync({
          id: pageId,
          body: {
            document: checked.document,
            baseUpdatedAt: baseUpdatedAt.current,
          },
        });
        baseUpdatedAt.current = saved.draftUpdatedAt;
        setCurrent(saved);
        // A newer change may have arrived while this one was saving.
        setSaveState(timer.current ? { kind: "pending" } : { kind: "saved" });
        return true;
      } catch (failure) {
        const error = getApiError(failure);
        setSaveState(
          error.status === 409
            ? { kind: "conflict" }
            : { kind: "error", message: error.message },
        );
        return false;
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return await run;
  }, [pageId, saveDraft]);

  const onChange = useCallback(
    (data: Data) => {
      latestData.current = data;
      if (timer.current) clearTimeout(timer.current);
      setSaveState((state) =>
        state.kind === "conflict" ? state : { kind: "pending" },
      );
      timer.current = setTimeout(() => {
        timer.current = null;
        void saveNow();
      }, AUTOSAVE_DELAY_MS);
    },
    [saveNow],
  );

  // Save what's left when leaving the editor.
  useEffect(
    () => () => {
      if (timer.current) void saveNow();
    },
    [saveNow],
  );

  async function publishPage() {
    setPublishError(null);
    if (saveState.kind !== "saved" && !(await saveNow())) {
      setPublishError("Fix what isn’t saved, then publish.");
      return;
    }
    try {
      const published = await publish.mutateAsync(pageId);
      setCurrent(published);
      baseUpdatedAt.current = published.draftUpdatedAt;
      setNotice?.("Your page is live.");
    } catch (failure) {
      setPublishError(getApiError(failure).message);
    }
  }

  const liveUrl = livePageUrl(current.page);
  const status = current.page.status;

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
    title: current.page.title,
    slug: current.page.slug,
    status,
    saveLabel: saveStateLabel(saveState),
    previewMode,
    liveUrl,
    publishLabel: publish.isPending
      ? "Publishing…"
      : status === "draft"
        ? "Publish"
        : status === "changed"
          ? "Publish changes"
          : "Published",
    publishDisabled:
      publish.isPending ||
      saveState.kind === "conflict" ||
      (status === "published" && saveState.kind === "saved"),
    notice,
    onBack: () => onNavigatePage?.(WEBSITE_PATH),
    onTogglePreviewMode: () =>
      setPreviewMode((mode) => (mode === "light" ? "dark" : "light")),
    onOpenVersions: () => setShowVersions(true),
    onPublish: () => void publishPage(),
  };

  return (
    <WebsiteEditorChoicesContext.Provider value={choices}>
      <WebsiteEditorBarContext.Provider value={bar}>
        <div className="website-editor h-full min-h-130 overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface)">
          <Puck
            config={config}
            data={initialData}
            onChange={onChange}
            metadata={metadata}
            viewports={VIEWPORTS}
            iframe={{ enabled: true, syncHostStyles: false }}
            headerTitle={current.page.title}
            height="100%"
            overrides={PUCK_OVERRIDES}
          />
        </div>
      </WebsiteEditorBarContext.Provider>
      <WebsiteVersionsPanel
        isOpen={showVersions}
        onClose={() => setShowVersions(false)}
        page={current}
        onChanged={(next) => {
          setCurrent(next);
          setNotice?.("The live page changed.");
        }}
      />
    </WebsiteEditorChoicesContext.Provider>
  );
}
