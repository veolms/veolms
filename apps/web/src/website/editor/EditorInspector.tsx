import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/ArrowDown";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/ArrowUp";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { XIcon as X } from "@phosphor-icons/react/X";
import {
  SITE_SECTION_LAYOUTS,
  SITE_THEMES,
  type SiteLook,
  type SiteSection,
} from "@veolms/contracts";
import { useState } from "react";
import { cn } from "../../lib/utils";
import { ThemedSelect } from "../../ThemedSelect";
import {
  fieldLabelClasses,
  iconButtonClasses,
  selectTriggerClasses,
} from "./editorStyles";
import { FieldList, Segmented, type FieldChoices } from "./FieldControls";
import { LayoutThumb } from "./LayoutThumb";
import type { PageEdit } from "./pageDocument";
import {
  ANIMATION_CHOICES,
  LAYOUT_LABELS,
  SECTION_CATALOG,
} from "./sectionCatalog";

type Tab = "content" | "design";

/**
 * The selected section's settings: Content (its words, pictures, links)
 * and Design (layout, colours, spacing, motion, where it shows).
 */
export function EditorInspector({
  section,
  index,
  count,
  look,
  choices,
  onEdit,
  onClose,
}: {
  section: SiteSection;
  index: number;
  count: number;
  look: SiteLook;
  choices: FieldChoices;
  onEdit: (edit: PageEdit) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("content");
  const meta = SECTION_CATALOG[section.type];
  const settings = section.settings as Record<string, unknown>;
  const patch = (key: string, value: unknown, typing?: boolean) =>
    onEdit({
      type: "settings",
      sectionId: section.id,
      patch: { [key]: value },
      ...(typing ? { coalesceKey: `${section.id}:${key}` } : {}),
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-4 py-3">
        <meta.Icon
          size={18}
          className="shrink-0 text-(--accent)"
          aria-hidden="true"
        />
        <h2 className="m-0 min-w-0 flex-1 truncate text-[15px] font-bold text-(--text)">
          {meta.label}
        </h2>
        <button
          type="button"
          className={iconButtonClasses}
          aria-label="Move section up"
          title="Move up"
          disabled={index === 0}
          onClick={() =>
            onEdit({ type: "move", sectionId: section.id, toIndex: index - 1 })
          }
        >
          <ArrowUp size={15} />
        </button>
        <button
          type="button"
          className={iconButtonClasses}
          aria-label="Move section down"
          title="Move down"
          disabled={index === count - 1}
          onClick={() =>
            onEdit({ type: "move", sectionId: section.id, toIndex: index + 1 })
          }
        >
          <ArrowDown size={15} />
        </button>
        <button
          type="button"
          className={iconButtonClasses}
          aria-label="Duplicate section"
          title="Duplicate"
          onClick={() => onEdit({ type: "duplicate", sectionId: section.id })}
        >
          <Copy size={15} />
        </button>
        <button
          type="button"
          className={`${iconButtonClasses} hover:bg-rose-500/10! hover:text-rose-500!`}
          aria-label="Delete section"
          title="Delete (Ctrl+Z brings it back)"
          onClick={() => onEdit({ type: "remove", sectionId: section.id })}
        >
          <Trash size={15} />
        </button>
        <button
          type="button"
          className={iconButtonClasses}
          aria-label="Close"
          title="Close"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </div>

      <div className="px-4 pt-3">
        <Segmented
          label="Settings"
          value={tab}
          options={[
            { value: "content", label: "Content" },
            { value: "design", label: "Design" },
          ]}
          onChange={(next) => setTab(next as Tab)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6">
        {tab === "content" ? (
          <FieldList
            fields={meta.fields}
            values={settings}
            onChange={(key, value, options) =>
              patch(key, value, options?.typing)
            }
            choices={choices}
          />
        ) : (
          <DesignTab
            section={section}
            look={look}
            onEdit={onEdit}
            patch={patch}
          />
        )}
      </div>
    </div>
  );
}

function DesignTab({
  section,
  look,
  onEdit,
  patch,
}: {
  section: SiteSection;
  look: SiteLook;
  onEdit: (edit: PageEdit) => void;
  patch: (key: string, value: unknown) => void;
}) {
  const settings = section.settings;
  const colours =
    SITE_THEMES[look.themeId][look.colourMode === "dark" ? "dark" : "light"];
  const tones = [
    { value: "default", label: "Page", bg: colours.bg, fg: colours.text },
    { value: "muted", label: "Soft", bg: colours.surface, fg: colours.text },
    { value: "accent", label: "Tint", bg: colours.soft, fg: colours.text },
    {
      value: "brand",
      label: "Brand",
      bg: colours.accent,
      fg: colours.onAccent,
    },
    {
      value: "inverse",
      label: "Dark",
      bg: colours.inverseBg,
      fg: colours.inverseText,
    },
  ];
  const layouts = SITE_SECTION_LAYOUTS[section.type] as readonly string[];

  return (
    <div className="grid gap-5">
      {layouts.length > 1 ? (
        <div>
          <span className={fieldLabelClasses}>Layout</span>
          <div className="grid grid-cols-2 gap-2">
            {layouts.map((layout) => {
              const on = section.layout === layout;
              return (
                <button
                  key={layout}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onEdit({ type: "layout", sectionId: section.id, layout })
                  }
                  className={cn(
                    "grid cursor-pointer gap-1.5 rounded-xl border bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] p-2 text-left text-(--muted) transition-colors",
                    on
                      ? "border-(--accent) text-(--text) shadow-[0_0_0_1px_var(--accent)]"
                      : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-(--accent)/50",
                  )}
                >
                  <LayoutThumb layout={layout} />
                  <span className="text-[12px] font-semibold">
                    {LAYOUT_LABELS[layout] ?? layout}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div>
        <span className={fieldLabelClasses}>Colours</span>
        <div
          role="radiogroup"
          aria-label="Colours"
          className="grid grid-cols-5 gap-2"
        >
          {tones.map((tone) => {
            const on = settings.tone === tone.value;
            return (
              <button
                key={tone.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => patch("tone", tone.value)}
                className="grid cursor-pointer justify-items-center gap-1 border-none bg-transparent p-0 text-[11.5px] font-semibold text-(--muted)"
              >
                <span
                  className={cn(
                    "grid size-10 place-items-center rounded-full text-[12px] font-bold shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_14%,transparent)]",
                    on && "outline-2 outline-offset-2 outline-(--accent)",
                  )}
                  style={{ background: tone.bg, color: tone.fg }}
                >
                  Aa
                </span>
                <span className={on ? "text-(--text)" : undefined}>
                  {tone.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className={fieldLabelClasses}>Space above and below</span>
        <Segmented
          label="Space above and below"
          value={settings.spacing}
          options={[
            { value: "sm", label: "Small" },
            { value: "md", label: "Medium" },
            { value: "lg", label: "Large" },
          ]}
          onChange={(value) => patch("spacing", value)}
        />
      </div>

      <div>
        <span className={fieldLabelClasses}>How it comes into view</span>
        <ThemedSelect
          ariaLabel="How it comes into view"
          triggerClassName={selectTriggerClasses}
          value={settings.animation ?? ""}
          options={ANIMATION_CHOICES.map(
            ({ value, label }) => [value, label] as const,
          )}
          onValueChange={(value) => patch("animation", value || undefined)}
        />
      </div>

      <div>
        <span className={fieldLabelClasses}>Show on</span>
        <Segmented
          label="Show on"
          value={settings.hideOn ?? "none"}
          options={[
            { value: "none", label: "All" },
            { value: "desktop", label: "Phone" },
            { value: "phone", label: "Computer" },
          ]}
          onChange={(value) =>
            patch("hideOn", value === "none" ? undefined : value)
          }
        />
      </div>
    </div>
  );
}
