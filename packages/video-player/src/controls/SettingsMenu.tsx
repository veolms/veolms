import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { PaletteIcon as Palette } from "@phosphor-icons/react/Palette";
import type { VideoQuality, VideoTextTrack } from "../core/types";
import {
  formatPlaybackRate,
  playbackRatesMatch,
} from "../playback/playbackRates";
import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
import { usePlayerTheme, usePlayerThemes } from "../themes/PlayerThemeContext";
import { createThemedIcon } from "../themes/playerThemes";
import { PlayerThemeSwatch } from "../themes/PlayerThemeSwatch";
import {
  PlayerMenuItem,
  PopoverMenu,
  type PopoverMenuMobilePresentation,
  type PopoverMenuSide,
} from "./menus";
import { PlaybackRateSlider } from "./PlaybackRateSlider";
import {
  hasDesignedSettingsMenu,
  SettingsCards,
  SettingsChips,
  SettingsHeader,
  SettingsOption,
  SettingsRows,
  SettingsSubmenuHeader,
  SettingsTitle,
  type SettingsChoiceGroup,
  type SettingsEntry,
  type SettingsMenuToggle,
} from "./SettingsMenuLayouts";
import { classNames } from "../utils/classNames";
import { usePlayerMobileInteraction } from "../react/PlayerInteractionMode";

const SETTINGS_OPEN_TURN_DEGREES = 30;
/** The speeds a chips menu offers in place. */
const CHIP_PLAYBACK_RATES = [
  0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3,
] as const;
/** The speeds a list row picks from in place (`inlineSpeed`). */
const INLINE_PLAYBACK_RATES = [0.5, 1, 1.5, 2] as const;
/** Columns of the theme grid, for moving up and down it with the keys. */
const THEME_GRID_COLUMNS = 3;
/** The Theme row's icon for themes that do not bring one. */
const DefaultThemeIcon = createThemedIcon(Palette, "regular", "fill");
/** From this height up a quality is marked HD, as YouTube marks it. */
const HD_MIN_HEIGHT = 1080;

const isHdQuality = (quality: VideoQuality | undefined) => {
  if (!quality) return false;
  const height =
    quality.height ?? Number(/(\d+)p/u.exec(quality.label)?.[1] ?? 0);
  return height >= HD_MIN_HEIGHT;
};

const baseCaptionName = (track: VideoTextTrack) =>
  track.label || track.language || "Caption track";

/** A track's name, with "(CC)" where another track has the same name. */
const kindCaptionName = (
  track: VideoTextTrack,
  tracks: readonly VideoTextTrack[],
) => {
  const name = baseCaptionName(track);
  const shared = tracks.some(
    (other) => other.id !== track.id && baseCaptionName(other) === name,
  );
  return shared && track.kind === "captions" ? `${name} (CC)` : name;
};

/**
 * A caption track's name, told apart from another of the same name by its
 * kind (a video can carry "English" subtitles and "English" captions), and
 * by its language where the names still match.
 */
const captionTrackName = (
  track: VideoTextTrack,
  tracks: readonly VideoTextTrack[],
) => {
  const name = kindCaptionName(track, tracks);
  const stillShared = tracks.some(
    (other) => other.id !== track.id && kindCaptionName(other, tracks) === name,
  );
  return stillShared && track.language ? `${name} · ${track.language}` : name;
};

/** The raised "HD" after a quality's name, in the theme's colour. */
function HdMark() {
  return (
    <sup className="ml-0.5 text-[0.5625rem] font-bold leading-none text-(--video-player-accent)">
      HD
    </sup>
  );
}

/** A quality's name, marked HD when it is. */
function QualityName({ quality }: { quality: VideoQuality }) {
  return (
    <>
      {quality.label}
      {isHdQuality(quality) ? <HdMark /> : null}
    </>
  );
}

export interface SettingsMenuProps {
  includePictureInPicture?: boolean;
  mobilePresentation?: PopoverMenuMobilePresentation;
  /** Opens as the bottom sheet outside the phone layout too. */
  forceSheet?: boolean;
  mobileSheetPanelClassName?: string;
  mobileSheetPortalTarget?: HTMLElement | null;
  /** Inline styles for the sheet, such as where a forced one sits. */
  mobileSheetStyle?: CSSProperties;
  /** Application-specific settings appended to the main settings view. */
  extraMainItems?: ReactNode;
  /**
   * On/off settings of the app, for the designed menus (which draw them as
   * switches in their own way); YouTube's menu shows `extraMainItems`.
   */
  toggles?: readonly SettingsMenuToggle[];
  triggerClassName?: string;
  side?: PopoverMenuSide;
  /** Called with the quality the viewer picks, or null for Auto. */
  onQualityChange?: (quality: VideoQuality | null) => void;
  /**
   * Offers the registered player themes in a Theme view; the app stores the
   * choice and passes the chosen theme back to the player.
   */
  onThemeChange?: (themeId: string) => void;
  /**
   * Shows a theme on the player without keeping it, while the arrow keys
   * move through the theme grid; null puts the kept theme back. Enter or a
   * click keeps the theme (`onThemeChange`), as in the app's colour menu.
   */
  onThemePreview?: (themeId: string | null) => void;
}

export function SettingsMenu({
  extraMainItems,
  forceSheet = false,
  includePictureInPicture = false,
  mobilePresentation = "popover",
  mobileSheetPanelClassName,
  mobileSheetPortalTarget,
  mobileSheetStyle,
  triggerClassName,
  side = "top",
  onQualityChange,
  onThemeChange,
  onThemePreview,
  toggles = [],
}: SettingsMenuProps = {}) {
  const controller = usePlayerController();
  const mobileInteraction = usePlayerMobileInteraction();
  const theme = usePlayerTheme();
  const themes = usePlayerThemes();
  const ThemeIcon = theme.icons.theme ?? DefaultThemeIcon;
  const {
    audio: AudioIcon,
    back: BackIcon,
    captions: CaptionsIcon,
    close: CloseIcon,
    disclosure: DisclosureIcon,
    pictureInPicture: PictureInPictureIcon,
    playbackRate: PlaybackRateIcon,
    quality: QualityIcon,
    settings: SettingsIcon,
  } = theme.icons;
  const { media, pictureInPictureActive, pictureInPictureAvailable, view } =
    usePlayerState(
      (snapshot) => ({
        media: snapshot.media,
        pictureInPictureActive: snapshot.ui.pictureInPicture,
        pictureInPictureAvailable: snapshot.capabilities.pictureInPicture,
        view: snapshot.ui.settingsView,
      }),
      (left, right) =>
        left.media === right.media &&
        left.pictureInPictureActive === right.pictureInPictureActive &&
        left.pictureInPictureAvailable === right.pictureInPictureAvailable &&
        left.view === right.view,
    );

  const activeQuality =
    media.qualities.find((item) => item.active) ??
    media.qualities.find((item) => item.id === media.selectedQualityId);
  const selectedQuality = media.qualities.find(
    (item) => item.id === media.selectedQualityId,
  );

  const autoQualityLabel = activeQuality?.label ? (
    <>
      Auto (<QualityName quality={activeQuality} />)
    </>
  ) : (
    "Auto"
  );
  const shownQuality = selectedQuality ?? activeQuality;
  const qualityLabel = media.autoQuality ? (
    autoQualityLabel
  ) : shownQuality ? (
    <QualityName quality={shownQuality} />
  ) : (
    "Auto"
  );
  // The picture now playing is HD, picked or chosen by Auto: the gear says
  // so, as YouTube's does.
  const playingHd = isHdQuality(activeQuality);
  const audioLabel =
    media.audioTracks.find((item) => item.id === media.selectedAudioTrackId)
      ?.label ??
    media.audioTracks[0]?.label ??
    "Default";
  const activeTextTrack =
    media.textTracks.find((item) => item.id === media.selectedTextTrackId) ??
    media.textTracks.find((item) => item.active);
  const captionsLabel =
    activeTextTrack?.label || activeTextTrack?.language || "Off";

  const openView = (next: typeof view) => controller.setSettingsView(next);
  const settingsOpen = view !== "closed";

  const themeOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const previewingThemeRef = useRef(false);
  // Leaving the theme view without keeping a theme puts the kept one back.
  useEffect(() => {
    if (view === "theme" || !previewingThemeRef.current) return;
    previewingThemeRef.current = false;
    onThemePreview?.(null);
  }, [onThemePreview, view]);
  // The view opens on the theme in use, ready for the arrow keys.
  useEffect(() => {
    if (view !== "theme") return;
    const index = themes.findIndex((option) => option.id === theme.id);
    themeOptionRefs.current[Math.max(0, index)]?.focus({
      preventScroll: true,
    });
    // Only when the view opens: previews change the theme while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const keepTheme = (themeId: string) => {
    previewingThemeRef.current = false;
    onThemeChange?.(themeId);
  };
  const handleThemeGridKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const count = themes.length;
    if (count === 0) return;
    const focused = themeOptionRefs.current.findIndex(
      (option) => option === document.activeElement,
    );
    const index =
      focused >= 0
        ? focused
        : Math.max(
            0,
            themes.findIndex((option) => option.id === theme.id),
          );
    const column = index % THEME_GRID_COLUMNS;
    const lastInColumn =
      column +
      Math.floor((count - 1 - column) / THEME_GRID_COLUMNS) *
        THEME_GRID_COLUMNS;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % count
        : event.key === "ArrowLeft"
          ? (index - 1 + count) % count
          : event.key === "ArrowDown"
            ? index + THEME_GRID_COLUMNS < count
              ? index + THEME_GRID_COLUMNS
              : column
            : event.key === "ArrowUp"
              ? index - THEME_GRID_COLUMNS >= 0
                ? index - THEME_GRID_COLUMNS
                : lastInColumn
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? count - 1
                  : -1;
    if (next >= 0) {
      event.preventDefault();
      event.stopPropagation();
      const option = themes[next];
      if (!option) return;
      previewingThemeRef.current = true;
      onThemePreview?.(option.id);
      const element = themeOptionRefs.current[next];
      element?.focus({ preventScroll: true });
      // In a short player the grid scrolls: keep the focused theme in sight.
      element?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const option = themes[index];
      if (option) keepTheme(option.id);
      openView("closed");
    }
    // Escape is the menu's: it closes, and the effect above reverts.
  };
  const triggerAppearanceClass =
    triggerClassName ?? "!h-9 !bg-transparent !px-3 hover:!bg-white/12";

  const themeGrid = (
    <div
      className="grid grid-cols-3 gap-1.5 p-0.5"
      data-video-player-theme-grid=""
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End Enter Escape"
      onKeyDown={handleThemeGridKeyDown}
    >
      {themes.map((option, optionIndex) => {
        const selected = option.id === theme.id;
        return (
          <button
            key={option.id}
            ref={(element) => {
              themeOptionRefs.current[optionIndex] = element;
            }}
            type="button"
            role="menuitemradio"
            tabIndex={-1}
            aria-checked={selected}
            aria-label={`${option.label} theme`}
            title={option.description}
            data-menu-keep-open=""
            data-video-player-theme-option={option.id}
            className={`group/theme flex min-w-0 flex-col gap-1 rounded-lg p-1 text-left text-(--video-player-menu-text) transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_10%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_10%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--video-player-menu-text) ${
              selected
                ? "bg-[color-mix(in_srgb,var(--video-player-accent)_14%,transparent)]"
                : ""
            }`}
            onClick={() => keepTheme(option.id)}
          >
            <span className="relative block">
              <PlayerThemeSwatch
                theme={option}
                size="menu"
                className={`ring-1 transition-shadow duration-150 ${
                  selected
                    ? "ring-2 ring-(--video-player-accent)"
                    : "ring-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_12%,transparent)] group-hover/theme:ring-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_30%,transparent)]"
                }`}
              />
              {selected ? (
                <span
                  className="absolute top-0.5 right-0.5 grid size-3.5 place-items-center rounded-full bg-(--video-player-accent) text-(--video-player-accent-contrast) shadow-[0_1px_4px_rgba(0,0,0,0.4)]"
                  aria-hidden="true"
                >
                  <Check size={9} weight="bold" />
                </span>
              ) : null}
            </span>
            <span className="truncate px-0.5 text-[0.6875rem] font-medium leading-4">
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );

  const designed = hasDesignedSettingsMenu(theme);
  const menu = theme.settingsMenu ?? {};
  const layout = menu.layout ?? "list";
  const qualityOptions = media.qualities
    .filter(
      (quality, index, qualities) =>
        qualities.findIndex(
          (candidate) => candidate.label === quality.label,
        ) === index,
    )
    .sort((left, right) => (right.height ?? 0) - (left.height ?? 0));
  const lowestQualityId = qualityOptions.at(-1)?.id;
  const isQualitySelected = (quality: VideoQuality) =>
    !media.autoQuality &&
    (quality.id === media.selectedQualityId ||
      quality.label === selectedQuality?.label);
  const pickQuality = (quality: VideoQuality | null) => {
    controller.selectQuality(quality?.id ?? null);
    onQualityChange?.(quality);
  };
  const designedQualityValue = media.autoQuality
    ? activeQuality?.label
      ? `Auto · ${activeQuality.label}`
      : "Auto"
    : (shownQuality?.label ?? "Auto");
  const designedSpeedValue =
    layout === "cards" && playbackRatesMatch(media.playbackRate, 1)
      ? `${formatPlaybackRate(media.playbackRate)} Normal`
      : formatPlaybackRate(media.playbackRate);
  const speedChoices = (steps: readonly number[]) =>
    steps.map((rate) => ({
      id: String(rate),
      label: formatPlaybackRate(rate),
      selected: playbackRatesMatch(media.playbackRate, rate),
      onSelect: () => controller.setPlaybackRate(rate),
    }));
  const customSpeed = !CHIP_PLAYBACK_RATES.some((rate) =>
    playbackRatesMatch(media.playbackRate, rate),
  );
  const showTheme = Boolean(onThemeChange) && themes.length > 1;

  const qualityEntry: SettingsEntry = {
    kind: "submenu",
    id: "quality",
    label: "Quality",
    value: designedQualityValue,
    icon: <QualityIcon size={17} />,
    onOpen: () => openView("quality"),
  };
  const speedEntry: SettingsEntry = {
    kind: "submenu",
    id: "speed",
    label: "Playback speed",
    value: designedSpeedValue,
    icon: <PlaybackRateIcon size={17} />,
    onOpen: () => openView("playback-rate"),
  };
  const captionsEntry: SettingsEntry | null =
    media.textTracks.length > 0
      ? {
          kind: "submenu",
          id: "captions",
          label: "Captions",
          value: captionsLabel,
          icon: <CaptionsIcon size={17} active={Boolean(activeTextTrack)} />,
          onOpen: () => openView("captions"),
        }
      : null;
  const audioEntry: SettingsEntry | null =
    media.audioTracks.length > 1
      ? {
          kind: "submenu",
          id: "audio",
          label: "Audio",
          value: audioLabel,
          icon: <AudioIcon size={17} />,
          onOpen: () => openView("audio"),
        }
      : null;
  const themeEntry: SettingsEntry | null = showTheme
    ? {
        kind: "submenu",
        id: "theme",
        label: "Theme",
        value: theme.label,
        icon: <ThemeIcon size={17} />,
        onOpen: () => openView("theme"),
      }
    : null;
  const pictureInPictureEntry: SettingsEntry | null =
    includePictureInPicture && pictureInPictureAvailable
      ? {
          kind: "action",
          id: "picture-in-picture",
          label: pictureInPictureActive
            ? "Exit picture in picture"
            : "Picture in picture",
          description: pictureInPictureActive
            ? "Playing above other apps"
            : "Play above other apps",
          icon: (
            <PictureInPictureIcon size={17} active={pictureInPictureActive} />
          ),
          onSelect: () => {
            void controller.togglePictureInPicture();
          },
        }
      : null;
  const toggleEntries: SettingsEntry[] = toggles.map((toggle) => ({
    kind: "toggle",
    ...toggle,
  }));
  const present = (entries: (SettingsEntry | null)[]): SettingsEntry[] =>
    entries.filter((entry): entry is SettingsEntry => entry !== null);

  const disclosureIcon = <DisclosureIcon size={15} />;
  const checkIcon = <Check size={13} weight="bold" />;
  const submenuTitle =
    view === "playback-rate"
      ? "Playback speed"
      : view === "quality"
        ? "Quality"
        : view === "captions"
          ? "Captions"
          : view === "theme"
            ? "Player theme"
            : "Audio";
  const submenuValue =
    view === "quality"
      ? media.autoQuality
        ? "Auto"
        : shownQuality?.label
      : view === "captions"
        ? captionsLabel
        : view === "theme"
          ? theme.label
          : undefined;

  const chipGroups: SettingsChoiceGroup[] = [
    {
      id: "quality",
      label: "Quality",
      choices: [
        {
          id: "auto",
          label: media.autoQuality ? designedQualityValue : "Auto",
          selected: media.autoQuality,
          onSelect: () => pickQuality(null),
        },
        ...qualityOptions.map((quality) => ({
          id: quality.id,
          label: quality.label,
          selected: isQualitySelected(quality),
          onSelect: () => pickQuality(quality),
        })),
      ],
    },
    {
      id: "speed",
      label: "Speed",
      // A quarter apart up to 3×, and one more that opens the slider (up to
      // 16×) and shows a speed set there.
      choices: [
        ...speedChoices(CHIP_PLAYBACK_RATES),
        {
          id: "more",
          label: customSpeed ? formatPlaybackRate(media.playbackRate) : "More",
          selected: customSpeed,
          onSelect: () => openView("playback-rate"),
        },
      ],
      columns: { wide: 6, narrow: 4 },
    },
  ];
  if (media.textTracks.length > 0) {
    chipGroups.push({
      id: "captions",
      label: "Captions",
      choices: [
        {
          id: "off",
          label: "Off",
          selected: !activeTextTrack,
          onSelect: () => controller.selectTextTrack(null),
        },
        ...media.textTracks.map((track) => ({
          id: track.id,
          label: captionTrackName(track, media.textTracks),
          selected: track.id === activeTextTrack?.id,
          onSelect: () => controller.selectTextTrack(track.id),
        })),
      ],
    });
  }
  if (media.audioTracks.length > 1) {
    chipGroups.push({
      id: "audio",
      label: "Audio",
      choices: media.audioTracks.map((track) => ({
        id: track.id,
        label: track.label || track.language,
        selected: track.id === media.selectedAudioTrackId,
        onSelect: () => controller.selectAudioTrack(track.id),
      })),
    });
  }

  const designedMain = (sheet: boolean) => (
    <>
      {sheet ? null : (
        <SettingsHeader
          closeIcon={<CloseIcon size={14} />}
          menu={menu}
          onClose={() => openView("closed")}
        />
      )}
      {layout === "cards" ? (
        <SettingsCards
          disclosureIcon={disclosureIcon}
          entries={present([
            qualityEntry,
            speedEntry,
            captionsEntry,
            audioEntry,
            pictureInPictureEntry,
            ...toggleEntries,
            themeEntry,
          ])}
          menu={menu}
        />
      ) : layout === "chips" ? (
        <SettingsChips
          disclosureIcon={disclosureIcon}
          stacked={sheet}
          groups={chipGroups}
          entries={present([
            pictureInPictureEntry,
            ...toggleEntries,
            themeEntry,
          ])}
          menu={menu}
        />
      ) : (
        <SettingsRows
          disclosureIcon={disclosureIcon}
          entries={present([
            qualityEntry,
            speedEntry,
            captionsEntry,
            audioEntry,
            themeEntry,
            pictureInPictureEntry,
            ...toggleEntries,
          ])}
          inlineSpeed={
            menu.inlineSpeed
              ? {
                  icon: <PlaybackRateIcon size={17} />,
                  choices: speedChoices(INLINE_PLAYBACK_RATES),
                }
              : undefined
          }
          menu={menu}
        />
      )}
    </>
  );

  const designedSubmenu = (
    <>
      <SettingsSubmenuHeader
        backIcon={<BackIcon size={16} />}
        menu={menu}
        title={submenuTitle}
        value={submenuValue}
        onBack={() => openView("main")}
      />
      {view === "quality" ? (
        <>
          <SettingsOption
            checkIcon={checkIcon}
            menu={menu}
            label="Auto"
            hint={activeQuality?.label}
            selected={media.autoQuality}
            onSelect={() => pickQuality(null)}
          />
          {qualityOptions.map((quality) => (
            <SettingsOption
              key={quality.id}
              checkIcon={checkIcon}
              menu={menu}
              label={quality.label}
              hint={
                isHdQuality(quality) ? (
                  <span
                    data-settings-hd=""
                    className="rounded-[4px] bg-(--video-player-accent) px-1.5 py-0.5 text-[0.625rem] font-bold text-(--video-player-accent-contrast)"
                  >
                    HD
                  </span>
                ) : quality.id === lowestQualityId &&
                  qualityOptions.length > 1 ? (
                  "Data saver"
                ) : undefined
              }
              selected={isQualitySelected(quality)}
              onSelect={() => pickQuality(quality)}
            />
          ))}
        </>
      ) : null}
      {view === "playback-rate" ? (
        <PlaybackRateSlider
          playbackRate={media.playbackRate}
          onRateChange={(rate) => controller.setPlaybackRate(rate)}
        />
      ) : null}
      {view === "captions" ? (
        <>
          <SettingsOption
            checkIcon={checkIcon}
            menu={menu}
            label="Off"
            selected={!activeTextTrack}
            onSelect={() => controller.selectTextTrack(null)}
          />
          {media.textTracks.map((track) => (
            <SettingsOption
              key={track.id}
              checkIcon={checkIcon}
              menu={menu}
              label={captionTrackName(track, media.textTracks)}
              hint={track.label ? track.language : undefined}
              selected={track.id === activeTextTrack?.id}
              onSelect={() => controller.selectTextTrack(track.id)}
            />
          ))}
        </>
      ) : null}
      {view === "audio"
        ? media.audioTracks.map((track) => (
            <SettingsOption
              key={track.id}
              checkIcon={checkIcon}
              menu={menu}
              label={track.label || track.language}
              hint={track.label ? track.language : undefined}
              selected={track.id === media.selectedAudioTrackId}
              onSelect={() => controller.selectAudioTrack(track.id)}
            />
          ))
        : null}
    </>
  );

  return (
    <PopoverMenu
      label="Settings"
      menuLabel="Video settings"
      mobilePresentation={mobilePresentation}
      forceSheet={forceSheet}
      mobileSheetPanelClassName={mobileSheetPanelClassName}
      mobileSheetPortalTarget={mobileSheetPortalTarget}
      mobileSheetStyle={mobileSheetStyle}
      align="end"
      side={side}
      placement={
        view === "theme"
          ? "corner"
          : designed && layout === "panel"
            ? "side"
            : "anchored"
      }
      sheetTitle={
        designed && menu.title ? <SettingsTitle menu={menu} /> : undefined
      }
      panelClassName={
        view === "theme"
          ? mobileInteraction || forceSheet
            ? undefined
            : "!mb-8 !w-[min(22rem,calc(100%-1.5rem))] !p-2 [--video-player-menu-lift:2rem]"
          : classNames(
              mobileInteraction
                ? undefined
                : designed && layout === "panel"
                  ? "!m-0 !w-[min(18rem,100%)] !rounded-none !p-5"
                  : side === "top"
                    ? "!mb-8 [--video-player-menu-lift:2rem]"
                    : "",
              // A popover's width; a sheet takes the width it is given
              // (its parent's), which these would cap.
              designed &&
                !mobileInteraction &&
                !forceSheet &&
                (layout === "chips"
                  ? "!w-[min(36rem,calc(100vw-1.5rem))] !p-3"
                  : layout === "cards"
                    ? "!w-[min(21.5rem,calc(100vw-1.5rem))] !p-3"
                    : layout === "list"
                      ? "!w-[min(19.5rem,calc(100vw-1.5rem))] !p-2"
                      : undefined),
            )
      }
      closeOnItemSelect={
        !(mobilePresentation === "sheet" && (mobileInteraction || forceSheet))
      }
      triggerClassName={`player-control !w-auto !min-h-0 !border-0 !py-0 ${triggerAppearanceClass}`}
      open={settingsOpen}
      onOpenChange={(open) => openView(open ? "main" : "closed")}
      trigger={
        <span className="relative inline-grid place-items-center">
          <SettingsIcon
            data-settings-icon={theme.id === "youtube" ? "gear-six" : theme.id}
            data-settings-icon-state={settingsOpen ? "open" : "closed"}
            size={22}
            className={`origin-center transition-transform duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] max-sm:size-5 motion-reduce:transition-none ${mobileInteraction ? "size-5" : ""}`}
            style={{
              transform: `rotate(${theme.motion.settingsClosedRotation + (settingsOpen ? (theme.motion.settingsOpenTurn ?? SETTINGS_OPEN_TURN_DEGREES) : 0)}deg)`,
            }}
            active={settingsOpen}
          />
          {playingHd ? (
            <span
              className="pointer-events-none absolute -top-0.5 -right-1 rounded-[2px] bg-(--video-player-accent) px-[2px] text-[7px] font-bold leading-[9px] text-(--video-player-accent-contrast)"
              aria-hidden="true"
            >
              HD
            </span>
          ) : null}
        </span>
      }
    >
      {({ sheet }) =>
        view === "theme" ? (
          // One look and one size in every theme, so moving through them
          // with the keys never moves the grid under the pointer.
          <div data-settings-layout="theme" className="p-0.5">
            <SettingsSubmenuHeader
              backIcon={<BackIcon size={16} />}
              menu={{}}
              title="Player theme"
              value={theme.label}
              onBack={() => openView("main")}
            />
            {themeGrid}
          </div>
        ) : designed ? (
          <div
            data-settings-layout={layout}
            className={classNames(
              "p-0.5",
              layout === "chips" && !sheet && "min-w-[28rem]",
            )}
          >
            {view === "main" ? designedMain(sheet) : designedSubmenu}
          </div>
        ) : (
          <div
            className={`[&_button]:min-h-11 sm:[&_button]:min-h-10 ${
              mobileInteraction ? "[&_button]:!min-h-11" : ""
            } ${view === "playback-rate" ? "min-w-72" : "min-w-60"}`}
          >
            {view !== "main" ? (
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                data-menu-keep-open=""
                data-video-player-settings-back=""
                className={`-mx-2 mb-1 flex min-h-10 w-[calc(100%+1rem)] items-center gap-2 rounded-none border-b border-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_10%,transparent)] px-5 pb-2 text-left text-sm font-semibold text-(--video-player-menu-text) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--video-player-menu-text) sm:-mx-1.5 sm:w-[calc(100%+0.75rem)] sm:px-4.5 ${
                  mobileInteraction ? "!-mx-2 !w-[calc(100%+1rem)] !px-5" : ""
                }`}
                onClick={() => openView("main")}
              >
                <BackIcon size={18} />
                {view === "playback-rate"
                  ? "Playback speed"
                  : view === "quality"
                    ? "Quality"
                    : view === "captions"
                      ? "Captions"
                      : "Audio"}
              </button>
            ) : null}

            {view === "main" ? (
              <>
                <PlayerMenuItem
                  data-menu-keep-open=""
                  label="Quality"
                  description={qualityLabel}
                  leading={<QualityIcon size={19} />}
                  trailing={<DisclosureIcon size={17} />}
                  onClick={() => openView("quality")}
                />
                <PlayerMenuItem
                  data-menu-keep-open=""
                  label="Playback speed"
                  description={formatPlaybackRate(media.playbackRate)}
                  leading={<PlaybackRateIcon size={19} />}
                  trailing={<DisclosureIcon size={17} />}
                  onClick={() => openView("playback-rate")}
                />
                {media.textTracks.length > 0 ? (
                  <PlayerMenuItem
                    data-menu-keep-open=""
                    aria-label={`Captions ${captionsLabel}`}
                    label="Captions"
                    description={captionsLabel}
                    leading={
                      <CaptionsIcon
                        data-caption-icon-state={
                          activeTextTrack ? "filled" : "outline"
                        }
                        size={19}
                        active={Boolean(activeTextTrack)}
                      />
                    }
                    trailing={<DisclosureIcon size={17} />}
                    onClick={() => openView("captions")}
                  />
                ) : null}
                {media.audioTracks.length > 1 ? (
                  <PlayerMenuItem
                    data-menu-keep-open=""
                    label="Audio"
                    description={audioLabel}
                    leading={<AudioIcon size={19} />}
                    trailing={<DisclosureIcon size={17} />}
                    onClick={() => openView("audio")}
                  />
                ) : null}
                {onThemeChange && themes.length > 1 ? (
                  <PlayerMenuItem
                    data-menu-keep-open=""
                    label="Theme"
                    description={theme.label}
                    leading={<ThemeIcon size={19} />}
                    trailing={<DisclosureIcon size={17} />}
                    onClick={() => openView("theme")}
                  />
                ) : null}
                {includePictureInPicture && pictureInPictureAvailable ? (
                  <PlayerMenuItem
                    label={
                      pictureInPictureActive
                        ? "Exit picture in picture"
                        : "Picture in picture"
                    }
                    description={
                      pictureInPictureActive
                        ? "Playing above other apps"
                        : "Play above other apps"
                    }
                    leading={
                      <PictureInPictureIcon
                        size={19}
                        active={pictureInPictureActive}
                      />
                    }
                    onClick={() => {
                      void controller.togglePictureInPicture();
                    }}
                  />
                ) : null}
                {extraMainItems}
              </>
            ) : null}

            {view === "quality" ? (
              <>
                <PlayerMenuItem
                  label={media.autoQuality ? autoQualityLabel : "Auto"}
                  selected={media.autoQuality}
                  onClick={() => {
                    controller.selectQuality(null);
                    onQualityChange?.(null);
                  }}
                />
                {media.qualities
                  .filter(
                    (quality, index, qualities) =>
                      qualities.findIndex(
                        (candidate) => candidate.label === quality.label,
                      ) === index,
                  )
                  .sort(
                    (left, right) => (right.height ?? 0) - (left.height ?? 0),
                  )
                  .map((quality) => (
                    <PlayerMenuItem
                      key={quality.id}
                      label={<QualityName quality={quality} />}
                      selected={
                        !media.autoQuality &&
                        (quality.id === media.selectedQualityId ||
                          quality.label === selectedQuality?.label)
                      }
                      onClick={() => {
                        controller.selectQuality(quality.id);
                        onQualityChange?.(quality);
                      }}
                    />
                  ))}
              </>
            ) : null}

            {view === "playback-rate" ? (
              <PlaybackRateSlider
                playbackRate={media.playbackRate}
                onRateChange={(rate) => controller.setPlaybackRate(rate)}
              />
            ) : null}

            {view === "captions" ? (
              <>
                <PlayerMenuItem
                  label="Off"
                  selected={!activeTextTrack}
                  onClick={() => {
                    controller.selectTextTrack(null);
                  }}
                />
                {media.textTracks.map((track) => (
                  <PlayerMenuItem
                    key={track.id}
                    aria-label={
                      track.language
                        ? `${track.label || "Caption track"} ${track.language}`
                        : track.label || "Caption track"
                    }
                    label={track.label || track.language || "Caption track"}
                    description={track.language || undefined}
                    selected={track.id === activeTextTrack?.id}
                    onClick={() => {
                      controller.selectTextTrack(track.id);
                    }}
                  />
                ))}
              </>
            ) : null}

            {view === "audio"
              ? media.audioTracks.map((track) => (
                  <PlayerMenuItem
                    key={track.id}
                    label={track.label || track.language}
                    description={track.language}
                    selected={track.id === media.selectedAudioTrackId}
                    onClick={() => {
                      controller.selectAudioTrack(track.id);
                    }}
                  />
                ))
              : null}
          </div>
        )
      }
    </PopoverMenu>
  );
}
