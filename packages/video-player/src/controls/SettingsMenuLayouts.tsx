import type { ReactNode } from "react";
import { classNames } from "../utils/classNames";
import type {
  PlayerThemeDefinition,
  PlayerThemeSettingsMenu,
} from "../themes/playerThemes";

/*
 * The settings menu as the designed themes draw it (see each theme's
 * `settingsMenu`): a header, then the choices as rows, cards or chips. The
 * YouTube theme keeps the plain rows in `SettingsMenu`. Every part carries a
 * `data-settings-*` attribute so a theme's stylesheet can restyle it.
 */

/** An on/off setting the app adds to the menu (ambient mode, say). */
export interface SettingsMenuToggle {
  id: string;
  label: string;
  /** A line under the label, e.g. what the setting does. */
  description?: string;
  icon?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** One thing the main view offers, in the order it shows them. */
export type SettingsEntry =
  | {
      kind: "submenu";
      id: string;
      label: string;
      value: ReactNode;
      icon: ReactNode;
      onOpen: () => void;
    }
  | {
      kind: "action";
      id: string;
      label: string;
      description: string;
      icon: ReactNode;
      onSelect: () => void;
    }
  | ({ kind: "toggle" } & SettingsMenuToggle);

export interface SettingsChoice {
  id: string;
  label: ReactNode;
  selected: boolean;
  onSelect: () => void;
}

/** A group of chips: quality, speed, captions, audio. */
export interface SettingsChoiceGroup {
  id: string;
  label: string;
  choices: SettingsChoice[];
}

const rowFocusClass =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--video-player-menu-text)";

const hoverSurfaceClass =
  "hover:bg-(--video-player-menu-row-active,rgb(255_255_255/0.08)) focus-visible:bg-(--video-player-menu-row-active,rgb(255_255_255/0.08))";

export function SettingsHeader({
  closeIcon,
  menu,
  onClose,
}: {
  closeIcon: ReactNode;
  menu: PlayerThemeSettingsMenu;
  onClose: () => void;
}) {
  return (
    <div
      data-settings-header=""
      className="flex min-h-10 items-center gap-2 pr-0.5 pb-1.5 pl-2.5"
    >
      <SettingsTitle menu={menu} />
      {menu.closeHint ? (
        <span
          data-settings-close-hint=""
          className="shrink-0 text-[0.6875rem] text-(--video-player-menu-text-muted)"
        >
          {menu.closeHint}
        </span>
      ) : null}
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        aria-label="Close settings"
        data-menu-keep-open=""
        data-settings-close=""
        className={`grid size-7 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_8%,transparent)] text-(--video-player-menu-text) transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_16%,transparent)] ${rowFocusClass}`}
        onClick={onClose}
      >
        {closeIcon}
      </button>
    </div>
  );
}

/** The menu's title with the theme's prompt and cursor, if any. */
export function SettingsTitle({ menu }: { menu: PlayerThemeSettingsMenu }) {
  return (
    <span
      data-settings-title=""
      className="flex min-w-0 flex-1 items-center truncate text-[0.9375rem] font-bold text-(--video-player-menu-text)"
    >
      {menu.titlePrefix ? (
        <span
          data-settings-title-prefix=""
          className="mr-1.5 shrink-0 text-(--video-player-accent)"
        >
          {menu.titlePrefix}
        </span>
      ) : null}
      <span className="truncate">{menu.title}</span>
      {menu.titleCursor ? (
        <span
          aria-hidden="true"
          data-settings-title-cursor=""
          className="ml-1.5 inline-block h-[1.05em] w-[0.55em] shrink-0 bg-(--video-player-accent) motion-safe:animate-[pulse_1.1s_steps(2,start)_infinite]"
        />
      ) : null}
    </span>
  );
}

/** On or off, the way the theme draws it. */
export function SettingsSwitch({
  checked,
  menu,
}: {
  checked: boolean;
  menu: PlayerThemeSettingsMenu;
}) {
  if (menu.switchStyle === "segmented") {
    return (
      <span
        aria-hidden="true"
        data-settings-switch="segmented"
        data-settings-switch-state={checked ? "on" : "off"}
        className="flex shrink-0 ring-1 ring-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_40%,transparent)] ring-inset"
      >
        {(["off", "on"] as const).map((state) => {
          const active = (state === "on") === checked;
          return (
            <span
              key={state}
              className={classNames(
                "px-2.5 py-1.5 text-[0.625rem] leading-none font-semibold tracking-[0.14em] uppercase",
                active
                  ? "bg-(--video-player-accent) text-(--video-player-accent-contrast)"
                  : "text-(--video-player-menu-text-muted)",
              )}
            >
              {state}
            </span>
          );
        })}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      data-settings-switch="switch"
      data-settings-switch-state={checked ? "on" : "off"}
      className={classNames(
        "relative block h-5 w-9 shrink-0 rounded-full transition-colors duration-150",
        checked
          ? "bg-(--video-player-accent)"
          : "bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_22%,transparent)]",
      )}
    >
      <span
        data-settings-switch-knob=""
        className={classNames(
          "absolute top-0.5 size-4 rounded-full transition-[left,background-color] duration-150",
          checked
            ? "left-[1.125rem] bg-(--video-player-switch-knob,var(--video-player-accent-contrast))"
            : "left-0.5 bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_75%,transparent)]",
        )}
      />
    </span>
  );
}

function EntryIcon({
  icon,
  menu,
}: {
  icon: ReactNode;
  menu: PlayerThemeSettingsMenu;
}) {
  return (
    <span
      aria-hidden="true"
      data-settings-icon={menu.iconTiles ? "tile" : ""}
      className={classNames(
        "grid shrink-0 place-items-center",
        menu.iconTiles
          ? "size-8 rounded-lg bg-[color-mix(in_srgb,var(--video-player-accent)_14%,transparent)] text-(--video-player-accent)"
          : "size-5 text-(--video-player-menu-text-muted)",
      )}
    >
      {icon}
    </span>
  );
}

/** The rows of the list and panel layouts. */
export function SettingsRows({
  disclosureIcon,
  entries,
  inlineSpeed,
  menu,
}: {
  disclosureIcon: ReactNode;
  entries: SettingsEntry[];
  /** Replaces the speed row with steps chosen in place. */
  inlineSpeed?: { icon: ReactNode; choices: SettingsChoice[] };
  menu: PlayerThemeSettingsMenu;
}) {
  const stacked = menu.layout === "panel";
  const rows = entries.map((entry) => {
    if (entry.id === "speed" && inlineSpeed) {
      return (
        <div
          key={entry.id}
          role="group"
          aria-label={entry.label}
          data-settings-row="inline"
          className="flex min-h-11 items-center gap-3 rounded-lg px-2.5 py-1.5"
        >
          <EntryIcon icon={inlineSpeed.icon} menu={menu} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-(--video-player-menu-text)">
            Speed
          </span>
          <span
            data-settings-segments=""
            className="flex shrink-0 gap-0.5 rounded-lg bg-[color-mix(in_srgb,var(--video-player-menu-text,#000)_8%,transparent)] p-0.5"
          >
            {inlineSpeed.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                role="menuitemradio"
                tabIndex={-1}
                aria-checked={choice.selected}
                data-menu-keep-open=""
                data-settings-segment=""
                className={classNames(
                  "min-w-8 rounded-md px-2 py-1.5 text-xs leading-none font-semibold tabular-nums transition-colors duration-150",
                  rowFocusClass,
                  choice.selected
                    ? "bg-(--video-player-accent) text-(--video-player-accent-contrast)"
                    : "text-(--video-player-menu-text) hover:bg-[color-mix(in_srgb,var(--video-player-menu-text,#000)_8%,transparent)]",
                )}
                onClick={choice.onSelect}
              >
                {choice.label}
              </button>
            ))}
          </span>
        </div>
      );
    }

    const toggle = entry.kind === "toggle";
    const label = entry.label;
    const value =
      entry.kind === "submenu"
        ? entry.value
        : entry.kind === "action"
          ? entry.description
          : entry.description;
    const trailing = toggle ? (
      <SettingsSwitch checked={entry.checked} menu={menu} />
    ) : (
      <span
        aria-hidden="true"
        className="shrink-0 text-(--video-player-menu-text-muted)"
      >
        {disclosureIcon}
      </span>
    );

    return (
      <button
        key={entry.id}
        type="button"
        role={toggle ? "menuitemcheckbox" : "menuitem"}
        tabIndex={-1}
        aria-checked={toggle ? entry.checked : undefined}
        data-menu-keep-open={entry.kind === "action" ? undefined : ""}
        data-settings-row={entry.id}
        data-settings-checked={toggle && entry.checked ? "" : undefined}
        className={classNames(
          "group/row flex w-full items-center gap-3 text-left text-(--video-player-menu-text) transition-colors duration-150",
          rowFocusClass,
          stacked
            ? "min-h-16 border-b border-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_12%,transparent)] px-0.5 py-3 last:border-b-0"
            : classNames(
                "min-h-11 rounded-lg px-2.5 py-1.5",
                hoverSurfaceClass,
              ),
        )}
        onClick={
          entry.kind === "submenu"
            ? entry.onOpen
            : entry.kind === "action"
              ? entry.onSelect
              : () => entry.onCheckedChange(!entry.checked)
        }
      >
        {stacked ? null : <EntryIcon icon={entry.icon} menu={menu} />}
        {stacked ? (
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span
              data-settings-label=""
              className="truncate text-[0.6875rem] leading-none font-semibold tracking-[0.14em] text-(--video-player-menu-text-muted) uppercase"
            >
              {label}
            </span>
            {toggle ? null : (
              <span
                data-settings-value=""
                className="truncate text-sm leading-tight"
              >
                {value}
              </span>
            )}
          </span>
        ) : (
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              data-settings-label=""
              className="truncate text-sm font-semibold"
            >
              {label}
            </span>
            {entry.kind !== "submenu" && value ? (
              <span
                data-settings-description=""
                className="mt-0.5 truncate text-xs text-(--video-player-menu-text-muted)"
              >
                {value}
              </span>
            ) : null}
          </span>
        )}
        {!stacked && entry.kind === "submenu" ? (
          <span
            data-settings-value=""
            className={classNames(
              "max-w-[45%] shrink-0 truncate text-[0.8125rem] font-semibold tabular-nums",
              menu.accentValues
                ? "text-(--video-player-accent)"
                : "text-(--video-player-menu-text-muted)",
            )}
          >
            {value}
          </span>
        ) : null}
        {trailing}
      </button>
    );
  });

  if (menu.grouped) {
    return (
      <div
        data-settings-group=""
        className="overflow-hidden rounded-2xl bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_6%,transparent)] [&>*]:rounded-none [&>*:not(:last-child)]:shadow-[inset_0_-1px_0_color-mix(in_srgb,var(--video-player-menu-text,#fff)_9%,transparent)]"
      >
        {rows}
      </div>
    );
  }
  return <div className="flex flex-col gap-0.5">{rows}</div>;
}

/** The cards layout: a two-column grid, a card per setting. */
export function SettingsCards({
  disclosureIcon,
  entries,
  menu,
}: {
  disclosureIcon: ReactNode;
  entries: SettingsEntry[];
  menu: PlayerThemeSettingsMenu;
}) {
  return (
    <div data-settings-cards="" className="grid grid-cols-2 gap-2">
      {entries.map((entry) => {
        const toggle = entry.kind === "toggle";
        const value =
          entry.kind === "submenu"
            ? entry.value
            : entry.kind === "action"
              ? "Play above apps"
              : entry.checked
                ? "On"
                : "Off";
        return (
          <button
            key={entry.id}
            type="button"
            role={toggle ? "menuitemcheckbox" : "menuitem"}
            tabIndex={-1}
            aria-checked={toggle ? entry.checked : undefined}
            data-menu-keep-open={entry.kind === "action" ? undefined : ""}
            data-settings-card={entry.id}
            data-settings-checked={toggle && entry.checked ? "" : undefined}
            className={classNames(
              "flex min-w-0 flex-col gap-2.5 rounded-2xl p-3 text-left text-(--video-player-menu-text) ring-1 transition-[background-color,box-shadow] duration-150 ring-inset",
              rowFocusClass,
              toggle && entry.checked
                ? "bg-[color-mix(in_srgb,var(--video-player-accent)_12%,transparent)] ring-[color-mix(in_srgb,var(--video-player-accent)_55%,transparent)]"
                : "bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_5%,transparent)] ring-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_9%,transparent)] hover:bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_9%,transparent)]",
            )}
            onClick={
              entry.kind === "submenu"
                ? entry.onOpen
                : entry.kind === "action"
                  ? entry.onSelect
                  : () => entry.onCheckedChange(!entry.checked)
            }
          >
            <span className="flex items-center justify-between gap-2">
              <EntryIcon
                icon={entry.icon}
                menu={{ ...menu, iconTiles: true }}
              />
              {toggle ? (
                <SettingsSwitch checked={entry.checked} menu={menu} />
              ) : (
                <span
                  aria-hidden="true"
                  className="text-(--video-player-menu-text-muted)"
                >
                  {disclosureIcon}
                </span>
              )}
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span
                data-settings-label=""
                className="truncate text-xs text-(--video-player-menu-text-muted)"
              >
                {entry.label}
              </span>
              <span
                data-settings-value=""
                className="truncate text-[0.9375rem] leading-tight font-bold"
              >
                {value}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The chips layout: quality, speed and tracks picked in place. */
export function SettingsChips({
  disclosureIcon,
  entries,
  groups,
  menu,
}: {
  disclosureIcon: ReactNode;
  /** Everything that is not a group: picture in picture, toggles, theme. */
  entries: SettingsEntry[];
  groups: SettingsChoiceGroup[];
  menu: PlayerThemeSettingsMenu;
}) {
  return (
    <div className="flex flex-col gap-3 px-1">
      <div
        data-settings-chip-groups=""
        className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2.5 px-1"
      >
        {groups.map((group) => (
          <div
            key={group.id}
            role="group"
            aria-label={group.label}
            className="contents"
          >
            <span
              data-settings-chip-label=""
              className="text-[0.6875rem] font-semibold tracking-[0.14em] text-(--video-player-menu-text-muted) uppercase"
            >
              {group.label}
            </span>
            <span className="flex flex-wrap gap-1.5">
              {group.choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  role="menuitemradio"
                  tabIndex={-1}
                  aria-checked={choice.selected}
                  data-menu-keep-open=""
                  data-settings-chip=""
                  className={classNames(
                    "h-8 rounded-full px-2.5 text-[0.8125rem] leading-none font-semibold whitespace-nowrap tabular-nums ring-1 transition-colors duration-150 ring-inset",
                    rowFocusClass,
                    choice.selected
                      ? "bg-(--video-player-accent) text-(--video-player-accent-contrast) ring-(--video-player-accent)"
                      : "text-(--video-player-menu-text) ring-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_22%,transparent)] hover:bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_9%,transparent)]",
                  )}
                  onClick={choice.onSelect}
                >
                  {choice.label}
                </button>
              ))}
            </span>
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="h-px bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_12%,transparent)]"
      />
      <div data-settings-chip-cards="" className="grid grid-cols-2 gap-2">
        {entries.map((entry) => {
          const toggle = entry.kind === "toggle";
          return (
            <button
              key={entry.id}
              type="button"
              role={toggle ? "menuitemcheckbox" : "menuitem"}
              tabIndex={-1}
              aria-checked={toggle ? entry.checked : undefined}
              data-menu-keep-open={entry.kind === "action" ? undefined : ""}
              data-settings-chip-card={entry.id}
              data-settings-checked={toggle && entry.checked ? "" : undefined}
              className={classNames(
                "flex min-h-13 min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-left text-(--video-player-menu-text) ring-1 transition-colors duration-150 ring-inset",
                rowFocusClass,
                "ring-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_14%,transparent)] hover:bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_7%,transparent)]",
              )}
              onClick={
                entry.kind === "submenu"
                  ? entry.onOpen
                  : entry.kind === "action"
                    ? entry.onSelect
                    : () => entry.onCheckedChange(!entry.checked)
              }
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  data-settings-label=""
                  className="truncate text-[0.8125rem] font-semibold"
                >
                  {entry.label}
                </span>
                <span
                  data-settings-description=""
                  className="truncate text-[0.6875rem] text-(--video-player-menu-text-muted)"
                >
                  {entry.kind === "submenu"
                    ? entry.value
                    : entry.kind === "action"
                      ? entry.description
                      : (entry.description ?? (entry.checked ? "On" : "Off"))}
                </span>
              </span>
              {toggle ? (
                <SettingsSwitch checked={entry.checked} menu={menu} />
              ) : entry.kind === "action" ? (
                <span
                  data-settings-open=""
                  className="shrink-0 text-[0.6875rem] font-bold tracking-[0.12em] text-(--video-player-accent) uppercase"
                >
                  {menu.openLabel ?? "Open"}
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="shrink-0 text-(--video-player-menu-text-muted)"
                >
                  {disclosureIcon}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The back row of a submenu: back, its title, and the current value. */
export function SettingsSubmenuHeader({
  backIcon,
  menu,
  title,
  value,
  onBack,
}: {
  backIcon: ReactNode;
  menu: PlayerThemeSettingsMenu;
  title: string;
  value?: ReactNode;
  onBack: () => void;
}) {
  return (
    <div
      data-settings-submenu-header=""
      className="mb-1 flex min-h-10 items-center gap-1.5 border-b border-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_10%,transparent)] pb-1.5"
    >
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        aria-label={`Back from ${title}`}
        data-menu-keep-open=""
        data-video-player-settings-back=""
        className={`grid size-7 shrink-0 place-items-center rounded-lg text-(--video-player-menu-text) transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_10%,transparent)] ${rowFocusClass}`}
        onClick={onBack}
      >
        {backIcon}
      </button>
      <span
        data-settings-title=""
        className={classNames(
          "min-w-0 flex-1 truncate font-bold text-(--video-player-menu-text)",
          menu.layout === "panel"
            ? "text-[0.6875rem] tracking-[0.18em] uppercase"
            : "text-sm",
        )}
      >
        {title}
      </span>
      {value ? (
        <span
          data-settings-submenu-value=""
          className="shrink-0 pr-1.5 text-[0.6875rem] font-bold text-(--video-player-accent)"
        >
          {value}
        </span>
      ) : null}
    </div>
  );
}

/** An option of a submenu, marked the theme's way when picked. */
export function SettingsOption({
  checkIcon,
  hint,
  label,
  menu,
  selected,
  onSelect,
}: {
  checkIcon: ReactNode;
  hint?: ReactNode;
  label: ReactNode;
  menu: PlayerThemeSettingsMenu;
  selected: boolean;
  onSelect: () => void;
}) {
  const mark = menu.selectedMark ?? "check";
  return (
    <button
      type="button"
      role="menuitemradio"
      tabIndex={-1}
      aria-checked={selected}
      data-settings-option=""
      className={classNames(
        "flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[0.8125rem] text-(--video-player-menu-text) transition-colors duration-150",
        rowFocusClass,
        selected ? "font-bold" : "font-semibold",
        selected
          ? "bg-(--video-player-menu-row-active,rgb(255_255_255/0.1))"
          : hoverSurfaceClass,
        menu.layout === "panel" &&
          "rounded-none border-b border-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_12%,transparent)] last:border-b-0",
      )}
      onClick={onSelect}
    >
      <span
        aria-hidden="true"
        data-settings-mark={mark}
        className="grid size-4 shrink-0 place-items-center text-(--video-player-accent)"
      >
        {mark === "square" ? (
          <span
            className={classNames(
              "block size-2 border border-current",
              selected && "bg-current",
            )}
          />
        ) : mark === "dot" ? (
          selected ? (
            <span className="block size-1.5 rounded-full bg-current" />
          ) : null
        ) : selected ? (
          checkIcon
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint ? (
        <span
          data-settings-hint=""
          className="shrink-0 text-[0.6875rem] font-semibold text-(--video-player-menu-text-muted)"
        >
          {hint}
        </span>
      ) : null}
    </button>
  );
}

/** Whether a theme draws the designed menu instead of YouTube's rows. */
export function hasDesignedSettingsMenu(theme: PlayerThemeDefinition): boolean {
  return Boolean(theme.settingsMenu?.layout || theme.settingsMenu?.title);
}
