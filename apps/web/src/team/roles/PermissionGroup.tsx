import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import {
  getPermissionCatalogueEntry,
  type Permission,
  type PermissionCatalogueEntry,
  type PermissionCatalogueGroup,
} from "@veolms/contracts";
import { CheckboxIndicator } from "../../components/Checkbox";
import { chipClassName } from "../TeamBits";

/** "Needs view + edit": the first word of each permission it relies on. */
function needsLabel(entry: PermissionCatalogueEntry): string | null {
  if (entry.implies.length === 0) return null;
  const words = entry.implies.map((key) => {
    const label = getPermissionCatalogueEntry(key)?.label ?? key;
    return label.split(" ")[0]?.toLowerCase() ?? label;
  });
  return `Needs ${[...new Set(words)].join(" + ")}`;
}

/**
 * One area of the permission catalogue as a card that folds: its header
 * shows how much of the area the role holds, its body the permissions in
 * two columns, ticked (editing) or marked (read-only).
 */
export function PermissionGroup({
  group,
  entries,
  selected,
  open,
  onToggleOpen,
  readOnly,
  isLocked,
  isNeeded,
  onToggleKey,
  onSelectAll,
}: {
  group: PermissionCatalogueGroup;
  /** The group's entries left after the search. */
  entries: readonly PermissionCatalogueEntry[];
  selected: ReadonlySet<Permission>;
  open: boolean;
  onToggleOpen: () => void;
  readOnly: boolean;
  isLocked: (key: Permission) => boolean;
  isNeeded: (key: Permission) => boolean;
  onToggleKey: (key: Permission, checked: boolean) => void;
  onSelectAll: (keys: Permission[], checked: boolean) => void;
}) {
  const keys = group.entries.map((entry) => entry.key);
  const held = keys.filter((key) => selected.has(key)).length;
  const allHeld = held === keys.length;
  const panelId = `permission-group-${group.area}`;

  return (
    <section className="overflow-hidden rounded-xl border border-(--border) bg-(--card-surface)">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
        >
          <CaretDown
            size={13}
            weight="bold"
            className={`shrink-0 text-(--muted) transition-transform ${open ? "" : "-rotate-90"}`}
          />
          <span className="truncate text-sm font-semibold text-(--text)">
            {group.label}
          </span>
        </button>
        {readOnly ? null : (
          <button
            type="button"
            onClick={() => onSelectAll(keys, !allHeld)}
            className="cursor-pointer rounded-md px-1.5 py-0.5 text-xs font-semibold text-(--accent) transition-colors hover:bg-(--accent)/10"
          >
            {allHeld ? "Clear" : "Select all"}
          </button>
        )}
        <span
          className={`${chipClassName} tabular-nums ${held > 0 ? "text-(--accent)!" : "text-(--muted)!"}`}
        >
          {held}/{keys.length}
        </span>
      </div>

      {open ? (
        <ul
          id={panelId}
          className="m-0 grid list-none gap-x-6 gap-y-1 border-t border-(--border) px-4 py-3 sm:grid-cols-2"
        >
          {entries.map((entry) => {
            const checked = selected.has(entry.key);
            if (readOnly) {
              return (
                <li key={entry.key} className="flex gap-2.5 py-1">
                  {checked ? (
                    <Check
                      size={14}
                      weight="bold"
                      className="mt-0.5 shrink-0 text-(--accent)"
                    />
                  ) : (
                    <span className="mt-1.5 h-0.5 w-3 shrink-0 rounded bg-[color-mix(in_srgb,var(--text)_22%,transparent)]" />
                  )}
                  <span className={checked ? "" : "opacity-55"}>
                    <span className="block text-sm font-medium text-(--text)">
                      {entry.label}
                    </span>
                    <span className="block text-xs text-(--muted)">
                      {entry.help}
                    </span>
                  </span>
                </li>
              );
            }
            const needed = checked && isNeeded(entry.key);
            const locked = !checked && isLocked(entry.key);
            const needs = needsLabel(entry);
            const inputId = `role-perm-${entry.key}`;
            return (
              <li key={entry.key}>
                <label
                  htmlFor={inputId}
                  className={`-mx-2 flex gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${needed || locked ? "cursor-not-allowed" : "cursor-pointer hover:bg-(--hover)"} ${locked ? "opacity-55" : ""}`}
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    className="peer sr-only"
                    checked={checked}
                    disabled={needed || locked}
                    onChange={(event) =>
                      onToggleKey(entry.key, event.target.checked)
                    }
                  />
                  <CheckboxIndicator
                    checked={checked}
                    className="mt-0.5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--accent)"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-(--text)">
                      {entry.label}
                    </span>
                    <span
                      className={`block text-xs ${!checked && needs && !locked ? "text-(--accent)" : "text-(--muted)"}`}
                    >
                      {needed
                        ? "Needed by another permission you ticked"
                        : locked
                          ? "You do not hold this permission"
                          : checked || !needs
                            ? entry.help
                            : needs}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
