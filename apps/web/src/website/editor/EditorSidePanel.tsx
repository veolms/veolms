import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react/DotsSixVertical";
import { EyeSlashIcon as EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import {
  SITE_THEME_IDS,
  SITE_THEMES,
  type SiteLook,
  type SiteSectionType,
} from "@veolms/contracts";
import { useId, useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import { ThemeSwatch } from "../WebsiteThemePicker";
import {
  fieldLabelClasses,
  textareaClasses,
  textInputClasses,
} from "./editorStyles";
import { Segmented } from "./FieldControls";
import type { EditablePage, PageEdit } from "./pageDocument";
import { SECTION_CATALOG, SECTION_GROUPS } from "./sectionCatalog";

export type SidePanelTab = "add" | "layers" | "theme" | "page";

const TABS: ReadonlyArray<{ value: SidePanelTab; label: string }> = [
  { value: "add", label: "Add" },
  { value: "layers", label: "Layers" },
  { value: "theme", label: "Theme" },
  { value: "page", label: "Page" },
];

/** A section's first words, to tell sections of one kind apart in Layers. */
function sectionSummary(settings: Record<string, unknown>): string {
  for (const key of ["heading", "name", "tagline", "eyebrow"]) {
    const value = settings[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function EditorSidePanel({
  tab,
  onTab,
  page,
  look,
  selectedId,
  insertLabel,
  savingLook,
  onAdd,
  onSelect,
  onEdit,
  onLook,
}: {
  tab: SidePanelTab;
  onTab: (tab: SidePanelTab) => void;
  page: EditablePage;
  look: SiteLook;
  selectedId: string | null;
  /** Where a new section goes, in words ("after Hero", "at the end"). */
  insertLabel: string;
  savingLook: boolean;
  onAdd: (type: SiteSectionType) => void;
  onSelect: (sectionId: string) => void;
  onEdit: (edit: PageEdit) => void;
  onLook: (look: SiteLook) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-3 pt-3">
        <Segmented
          label="Panel"
          value={tab}
          options={TABS}
          onChange={(next) => onTab(next as SidePanelTab)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-6">
        {tab === "add" ? (
          <AddTab insertLabel={insertLabel} onAdd={onAdd} />
        ) : tab === "layers" ? (
          <LayersTab
            page={page}
            selectedId={selectedId}
            onSelect={onSelect}
            onEdit={onEdit}
          />
        ) : tab === "theme" ? (
          <ThemeTab look={look} saving={savingLook} onLook={onLook} />
        ) : (
          <PageTab page={page} onEdit={onEdit} />
        )}
      </div>
    </div>
  );
}

function AddTab({
  insertLabel,
  onAdd,
}: {
  insertLabel: string;
  onAdd: (type: SiteSectionType) => void;
}) {
  const [query, setQuery] = useState("");
  const entries = useMemo(() => {
    const words = query.trim().toLowerCase();
    return (Object.keys(SECTION_CATALOG) as SiteSectionType[]).filter(
      (type) => {
        const meta = SECTION_CATALOG[type];
        return (
          !words ||
          `${meta.label} ${meta.description}`.toLowerCase().includes(words)
        );
      },
    );
  }, [query]);
  return (
    <div className="grid gap-4">
      <div className="relative">
        <MagnifyingGlass
          size={15}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--muted)"
          aria-hidden="true"
        />
        <input
          aria-label="Find a section"
          className={`${textInputClasses} pl-9!`}
          placeholder="Find a section"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <p className="m-0 text-[12px] text-(--muted)">Adds it {insertLabel}.</p>
      {SECTION_GROUPS.map((group) => {
        const inGroup = entries.filter(
          (type) => SECTION_CATALOG[type].group === group.id,
        );
        if (inGroup.length === 0) return null;
        return (
          <div key={group.id} className="grid gap-2">
            <h3 className="m-0 text-[11px] font-bold tracking-[0.08em] text-(--muted) uppercase">
              {group.label}
            </h3>
            {inGroup.map((type) => {
              const meta = SECTION_CATALOG[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onAdd(type)}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_9%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] p-3 text-left transition-colors hover:border-(--accent)/50 hover:bg-(--hover)"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-(--accent)/12 text-(--accent)">
                    <meta.Icon size={18} aria-hidden="true" />
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <span className="text-[13.5px] font-semibold text-(--text)">
                      {meta.label}
                    </span>
                    <span className="text-[12px] leading-snug text-(--muted)">
                      {meta.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function LayersTab({
  page,
  selectedId,
  onSelect,
  onEdit,
}: {
  page: EditablePage;
  selectedId: string | null;
  onSelect: (sectionId: string) => void;
  onEdit: (edit: PageEdit) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  if (page.sections.length === 0) {
    return (
      <p className="m-0 text-[13px] text-(--muted)">
        No sections yet. Add one from the Add tab.
      </p>
    );
  }
  return (
    <ol className="m-0 grid list-none gap-1.5 p-0">
      {page.sections.map((section, index) => {
        const meta = SECTION_CATALOG[section.type];
        const summary = sectionSummary(
          section.settings as Record<string, unknown>,
        );
        const hidden =
          section.settings.hideOn && section.settings.hideOn !== "none";
        return (
          <li
            key={section.id}
            draggable
            onDragStart={(event) => {
              setDragging(section.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(index);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragging) {
                onEdit({ type: "move", sectionId: dragging, toIndex: index });
              }
              setDragging(null);
              setOver(null);
            }}
            className={cn(
              "rounded-xl border transition-colors",
              section.id === selectedId
                ? "border-(--accent) bg-(--accent)/8"
                : "border-[color-mix(in_srgb,var(--text)_9%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]",
              over === index &&
                dragging !== section.id &&
                "border-(--accent)/60",
              dragging === section.id && "opacity-50",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(section.id)}
              className="flex w-full cursor-pointer items-center gap-2.5 border-none bg-transparent px-2.5 py-2.5 text-left"
            >
              <DotsSixVertical
                size={16}
                className="shrink-0 cursor-grab text-(--muted)"
                aria-hidden="true"
              />
              <meta.Icon
                size={16}
                className="shrink-0 text-(--accent)"
                aria-hidden="true"
              />
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-[13px] font-semibold text-(--text)">
                  {meta.label}
                </span>
                {summary ? (
                  <span className="truncate text-[11.5px] text-(--muted)">
                    {summary}
                  </span>
                ) : null}
              </span>
              {hidden ? (
                <EyeSlash
                  size={14}
                  className="shrink-0 text-(--muted)"
                  aria-label={`Hidden on ${section.settings.hideOn}`}
                />
              ) : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

const MODE_CHOICES = [
  { value: "system", label: "Visitor's" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const MOTION_CHOICES = [
  { value: "", label: "Theme's" },
  { value: "off", label: "Off" },
  { value: "subtle", label: "Subtle" },
  { value: "lively", label: "Lively" },
];

function ThemeTab({
  look,
  saving,
  onLook,
}: {
  look: SiteLook;
  saving: boolean;
  onLook: (look: SiteLook) => void;
}) {
  return (
    <div className="grid gap-5">
      <p className="m-0 text-[12px] leading-snug text-(--muted)">
        The theme dresses every page of your site. Live pages change right away;
        your words stay as they are.
        {saving ? " Saving…" : ""}
      </p>
      <div
        role="radiogroup"
        aria-label="Theme"
        className="grid grid-cols-2 gap-2"
      >
        {SITE_THEME_IDS.map((themeId) => {
          const on = look.themeId === themeId;
          return (
            <button
              key={themeId}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onLook({ ...look, themeId })}
              className={cn(
                "grid cursor-pointer gap-1.5 rounded-xl border bg-transparent p-1.5 text-left transition-colors",
                on
                  ? "border-(--accent) shadow-[0_0_0_1px_var(--accent)]"
                  : "border-[color-mix(in_srgb,var(--text)_9%,transparent)] hover:border-(--accent)/50",
              )}
            >
              <ThemeSwatch
                themeId={themeId}
                dark={look.colourMode === "dark"}
              />
              <span className="px-1 pb-0.5 text-[12.5px] font-semibold text-(--text)">
                {SITE_THEMES[themeId].name}
              </span>
            </button>
          );
        })}
      </div>
      <div>
        <span className={fieldLabelClasses}>Light or dark</span>
        <Segmented
          label="Light or dark"
          value={look.colourMode}
          options={MODE_CHOICES}
          onChange={(value) =>
            onLook({ ...look, colourMode: value as SiteLook["colourMode"] })
          }
        />
      </div>
      <div>
        <span className={fieldLabelClasses}>Movement</span>
        <Segmented
          label="Movement"
          value={look.motion ?? ""}
          options={MOTION_CHOICES}
          onChange={(value) => {
            const { motion: _motion, ...rest } = look;
            onLook(
              value
                ? { ...rest, motion: value as NonNullable<SiteLook["motion"]> }
                : rest,
            );
          }}
        />
        <p className="m-0 mt-1.5 text-[11.5px] text-(--muted)">
          How sections come into view and how cards react to the mouse. Visitors
          who ask their phone for less motion get none.
        </p>
      </div>
    </div>
  );
}

function PageTab({
  page,
  onEdit,
}: {
  page: EditablePage;
  onEdit: (edit: PageEdit) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <div className="grid gap-4">
      <label className="block" htmlFor={titleId}>
        <span className={fieldLabelClasses}>Title in search results</span>
        <input
          id={titleId}
          className={textInputClasses}
          value={page.seo.title}
          maxLength={70}
          onChange={(event) =>
            onEdit({
              type: "seo",
              patch: { title: event.target.value },
              coalesceKey: "seo:title",
            })
          }
        />
      </label>
      <label className="block" htmlFor={descriptionId}>
        <span className={fieldLabelClasses}>Description in search results</span>
        <textarea
          id={descriptionId}
          className={textareaClasses}
          rows={4}
          value={page.seo.description}
          maxLength={170}
          onChange={(event) =>
            onEdit({
              type: "seo",
              patch: { description: event.target.value },
              coalesceKey: "seo:description",
            })
          }
        />
      </label>
      <p className="m-0 text-[11.5px] text-(--muted)">
        Search engines show these. Keep the title under 60 letters and the
        description under 160.
      </p>
    </div>
  );
}
