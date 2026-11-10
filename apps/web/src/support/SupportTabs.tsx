import { ChatCircleTextIcon as ChatCircleText } from "@phosphor-icons/react/ChatCircleText";
import { ChatsCircleIcon as ChatsCircle } from "@phosphor-icons/react/ChatsCircle";
import { FlagIcon as Flag } from "@phosphor-icons/react/Flag";
import type { Icon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import {
  handleRovingTabKeyDown,
  scrollKeyboardFocusedTabIntoView,
} from "../accessibility/rovingTabFocus";
import { PageHeading } from "../components/PageHeading";
import { useSettingsTabShortcuts } from "../settings/useSettingsTabShortcuts";
import { useExtensionPageBack } from "../shell/extensionPageOutlet";

export type SupportTab = "problem" | "feedback" | "mine";

const TABS: readonly {
  id: SupportTab;
  label: string;
  icon: Icon;
  /** A colour from the shared page-tabs palette (base/foundation.css). */
  tone: string;
}[] = [
  { id: "problem", label: "Report a problem", icon: Flag, tone: "orange" },
  {
    id: "feedback",
    label: "Send feedback",
    icon: ChatCircleText,
    tone: "blue",
  },
  { id: "mine", label: "Your reports", icon: ChatsCircle, tone: "green" },
];

const TAB_IDS: readonly SupportTab[] = TABS.map(({ id }) => id);

/** Switching between the two forms replaces the entry; Your reports is its own. */
const replacesEntry = (from: SupportTab, to: SupportTab) =>
  to !== "mine" && from !== "mine";

/**
 * Where each tab leads. The two forms keep the page the learner came from
 * (`from`, `fromLabel`, `courseId`), so switching between them does not
 * lose it.
 */
function tabHref(id: SupportTab, search: string): string {
  if (id === "mine") return "/support";
  const params = new URLSearchParams(search);
  const next = new URLSearchParams({ type: id });
  for (const key of ["from", "fromLabel", "courseId", "category"]) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  return `/support/new?${next.toString()}`;
}

/**
 * Your reports and the forms are different pages, so a tab reached with the
 * arrow keys is drawn anew; this carries the keyboard focus over to it.
 */
let focusTabAfterSwitch = false;

/**
 * Help and feedback's tabs, drawn like the Discussions page's: an icon and
 * a label, the open one underlined and filled in its colour, the line under
 * them running out into the page's gutters.
 */
export function SupportTabs({ active }: { active: SupportTab }) {
  // The shell's record of where the learner came from rides along, so the
  // back button still leads there after switching tabs.
  const { search, state } = useLocation();
  const navigate = useNavigate();
  // Alt+1-3 open a tab and the arrow keys step through them, as on Settings.
  const getCurrentTab = useCallback(() => active, [active]);
  const openTab = useCallback(
    (id: SupportTab) => {
      if (id === active) return;
      void navigate(tabHref(id, search), {
        replace: replacesEntry(active, id),
        state,
      });
    },
    [active, navigate, search, state],
  );
  useSettingsTabShortcuts({
    tabIds: TAB_IDS,
    getCurrentTab,
    onNavigate: openTab,
  });
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focusTabAfterSwitch) return;
    focusTabAfterSwitch = false;
    navRef.current
      ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      ?.focus({ preventScroll: true });
  }, [active]);
  return (
    <nav
      ref={navRef}
      aria-label="Help and feedback"
      role="tablist"
      className="page-tabs -mx-(--application-page-inline-gutter,0px) flex min-w-0 gap-2 overflow-x-auto border-b px-(--application-page-inline-gutter,0px) border-[color-mix(in_srgb,var(--surface-strong)_72%,transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map(({ id, label, icon: TabIcon, tone }, index) => {
        const current = id === active;
        return (
          <Link
            key={id}
            to={tabHref(id, search)}
            replace={replacesEntry(active, id)}
            state={state}
            // A tab, like the Discussions page's: the shared page-tabs
            // colours apply to tabs.
            role="tab"
            aria-selected={current}
            aria-current={current ? "page" : undefined}
            aria-keyshortcuts={`Alt+${index + 1}`}
            // Roving focus: Tab reaches the open tab, the arrows the others.
            tabIndex={current ? 0 : -1}
            onKeyDown={(event) => {
              handleRovingTabKeyDown(event);
              if (event.defaultPrevented) focusTabAfterSwitch = true;
            }}
            onFocus={scrollKeyboardFocusedTabIntoView}
            data-page-tab-tone={tone}
            className="group inline-flex min-h-11.5 shrink-0 items-center gap-2 rounded-t-lg border-b-2 border-transparent px-3.5 text-[0.82rem] font-semibold text-(--muted) no-underline transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent) aria-[current=page]:border-(--page-tab-active-indicator) aria-[current=page]:text-(--page-tab-active-ink) max-sm:min-h-10.75"
          >
            <span className="inline-flex origin-bottom items-center gap-2 transition-transform duration-150 ease-out group-active:scale-[0.985] motion-reduce:duration-[0.01ms]">
              <TabIcon size={17} weight={current ? "fill" : "regular"} />
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/** The heading and tabs every Help and feedback page starts with. */
export function SupportPageHeader({ active }: { active: SupportTab }) {
  const navigateBack = useExtensionPageBack();
  return (
    <div className="flex flex-col gap-4">
      <PageHeading
        id="support-title"
        onNavigateBack={navigateBack}
        title="Help and feedback"
        description="Report a problem or share an idea. The team's replies show up in Your reports."
      />
      <SupportTabs active={active} />
    </div>
  );
}
