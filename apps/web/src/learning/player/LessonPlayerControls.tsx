import {
  FullscreenButton,
  MuteButton,
  PlayerIconButton,
  PlayerMenuItem,
  PlayButton,
  SettingsMenu,
  TimeDisplay,
  Timeline,
  VolumeControl,
  ZoomLevelIndicator,
  getPlayerThemeStyle,
  usePlayerMobileInteraction,
  usePlayerState,
  usePlayerTheme,
} from "@veolms/video-player";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  LEARNING_PLAYER_MINIMIZE_LABEL,
  LEARNING_PLAYER_MINIMIZE_SHORTCUT,
  LEARNING_PLAYER_MINIMIZE_TITLE,
} from "./learningPlayerShortcuts";

const PLAYER_SURFACE_CLASS =
  "bg-(--video-player-control-surface) text-(--video-player-control-text) shadow-(--video-player-control-shadow)";
const PLAYER_INNER_CONTROL_CLASS =
  "!rounded-full !bg-transparent transition-colors duration-150 ease-out hover:!bg-(--video-player-control-surface-hover) active:!bg-(--video-player-control-surface-active) focus-visible:!bg-(--video-player-control-surface-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-control-text)";
const PLAYER_ICON_PILL_CLASS =
  "!h-8 !w-auto !rounded-full !bg-transparent !px-2 !shadow-none drop-shadow-none transition-colors duration-150 ease-out hover:!bg-transparent active:!bg-(--video-player-control-surface-active) focus-visible:!bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-control-text) sm:!h-9 sm:!bg-transparent sm:!px-3 sm:hover:!bg-(--video-player-control-surface-hover) sm:active:!bg-(--video-player-control-surface-active) sm:focus-visible:!bg-(--video-player-control-surface-hover)";
const MOBILE_INVISIBLE_HIT_SURFACE_CLASS =
  "[&&&]:!bg-transparent [&&&:hover]:!bg-transparent [&&&:active]:!bg-transparent [&&&:focus-visible]:!bg-transparent [&&&[aria-pressed=true]]:!bg-transparent";
const LANDSCAPE_ORIENTATION_QUERY = "(orientation: landscape)";

const subscribeToLandscapeOrientation = (onStoreChange: () => void) => {
  const media = window.matchMedia(LANDSCAPE_ORIENTATION_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
};

const getLandscapeOrientationSnapshot = () =>
  window.matchMedia(LANDSCAPE_ORIENTATION_QUERY).matches;

const getLandscapeOrientationServerSnapshot = () => false;
const MOBILE_TEXT_PILL_HIT_CLASS = `${MOBILE_INVISIBLE_HIT_SURFACE_CLASS} isolate !rounded-full !bg-transparent transition-colors duration-150 ease-out before:pointer-events-none before:absolute before:z-0 before:rounded-full before:bg-(--video-player-control-surface) before:shadow-(--video-player-control-shadow) before:backdrop-blur-sm before:transition-colors before:duration-150 before:ease-out before:content-[''] hover:!bg-transparent hover:before:bg-(--video-player-control-surface-hover) active:!bg-transparent active:before:bg-(--video-player-control-surface-active) focus-visible:!bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-control-text)`;

function getPlayerIconPillClass(mobileInteraction: boolean): string {
  return `${PLAYER_ICON_PILL_CLASS} ${
    mobileInteraction
      ? `${MOBILE_INVISIBLE_HIT_SURFACE_CLASS} sm:!h-8 sm:!bg-transparent sm:!px-2 sm:hover:!bg-transparent sm:focus-visible:!bg-transparent`
      : ""
  }`;
}

function PlayerControlSurface({
  blurred = false,
  children,
  className,
  cluster,
}: {
  blurred?: boolean;
  children: ReactNode;
  className: string;
  cluster?: string;
}) {
  return (
    <div
      className={`${PLAYER_SURFACE_CLASS} box-border border border-solid border-transparent ${blurred ? "backdrop-blur-sm" : ""} ${className}`}
      data-player-control-cluster={cluster}
    >
      {children}
    </div>
  );
}

export interface LessonPlayerControlsProps {
  ambientEnabled: boolean;
  autoplayEnabled: boolean;
  canGoNext: boolean;
  canGoPrevious: boolean;
  controlsSuppressed?: boolean;
  courseLessonsOpen?: boolean;
  courseLessonsPanel?: ReactNode;
  onAmbientEnabledChange: (enabled: boolean) => void;
  onAutoplayEnabledChange: (enabled: boolean) => void;
  onCourseLessonsToggle?: (presentation: "drawer" | "side") => void;
  onGoNext: () => void;
  onGoPrevious: () => void;
  onMinimize?: () => void;
  onMobileLandscapeFullscreenChange?: (active: boolean) => void;
}

function CourseLessonsButton({
  open,
  onToggle,
  sidePanel,
}: {
  open: boolean;
  onToggle: () => void;
  sidePanel: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={open ? "Close lessons" : "Open lessons"}
      aria-expanded={open}
      aria-controls={
        sidePanel
          ? "learning-fullscreen-course-curriculum-scrollport"
          : "lesson-drawer-curriculum-scrollport"
      }
      data-course-lessons-presentation={sidePanel ? "side" : "drawer"}
      data-course-lessons-open={sidePanel && open ? "true" : undefined}
      data-player-control=""
      data-player-control-hit-area="course-lessons"
      className={`${MOBILE_TEXT_PILL_HIT_CLASS} relative inline-flex h-11 items-center gap-1.5 px-4 !text-xs leading-4 font-semibold tracking-[0.01em] before:inset-x-0.5 before:inset-y-1.5 ${
        sidePanel && open
          ? "before:!bg-[color-mix(in_srgb,var(--video-player-control-text)_18%,var(--video-player-control-surface))] hover:before:!bg-[color-mix(in_srgb,var(--video-player-control-text)_24%,var(--video-player-control-surface))] active:before:!bg-[color-mix(in_srgb,var(--video-player-control-text)_28%,var(--video-player-control-surface))]"
          : ""
      }`}
      onClick={onToggle}
    >
      <span className="relative z-10">Lessons</span>
      <span
        className={`learning-curriculum__section-arrow relative z-10${open && !sidePanel ? " is-open" : ""}`}
        aria-hidden="true"
      >
        {sidePanel ? <CaretRight size={15} /> : <CaretDown size={15} />}
      </span>
    </button>
  );
}

function AutoplayToggle({
  enabled,
  mobileInteraction,
  onEnabledChange,
}: {
  enabled: boolean;
  mobileInteraction: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  const { icons } = usePlayerTheme();
  const bootstrappedAutoplay =
    typeof document === "undefined"
      ? undefined
      : document.documentElement.dataset.playerAutoplay;
  const shownEnabled =
    bootstrappedAutoplay === "off"
      ? false
      : bootstrappedAutoplay === "on"
        ? true
        : enabled;
  const OnIcon = icons.play;
  const OffIcon = icons.pause;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={shownEnabled}
      aria-label="Autoplay next lesson"
      title={shownEnabled ? "Autoplay is on" : "Autoplay is off"}
      data-player-control=""
      className={`group/autoplay relative inline-flex h-8 w-auto shrink-0 items-center justify-center px-2 text-white !shadow-none drop-shadow-none max-sm:hover:!bg-transparent max-sm:active:!bg-white/14 max-sm:focus-visible:!bg-transparent sm:h-9 sm:px-3 ${PLAYER_INNER_CONTROL_CLASS} ${mobileInteraction ? "sm:!h-8 sm:!px-2 sm:hover:!bg-transparent sm:active:!bg-white/14 sm:focus-visible:!bg-transparent" : ""}`}
      onClick={() => onEnabledChange(!shownEnabled)}
    >
      <span
        aria-hidden="true"
        className={`relative block h-3.5 w-8 rounded-full border-0 bg-black/40 transition-colors duration-150 sm:h-4 sm:w-9 ${mobileInteraction ? "sm:!h-3.5 sm:!w-8" : ""}`}
        data-autoplay-track=""
        data-autoplay-track-state={shownEnabled ? "on" : "off"}
      >
        <span
          className={`absolute top-1/2 grid size-4.5 -translate-y-1/2 place-items-center rounded-full shadow-[0_1px_5px_rgba(0,0,0,0.38)] transition-[left,background-color,color] sm:size-5 ${mobileInteraction ? "sm:!size-4.5" : ""} ${
            shownEnabled
              ? `left-3.5 bg-white text-black sm:left-4.5 ${mobileInteraction ? "sm:!left-3.5" : ""}`
              : "-left-0.5 bg-white/42 text-white"
          }`}
          data-autoplay-knob=""
        >
          <span
            className={shownEnabled ? "contents" : "hidden"}
            data-autoplay-icon="on"
          >
            <OnIcon
              size={11}
              active
              className={mobileInteraction ? "sm:!size-2.75" : "sm:size-3"}
            />
          </span>
          <span
            className={shownEnabled ? "hidden" : "contents"}
            data-autoplay-icon="off"
          >
            <OffIcon
              size={11}
              active={false}
              className={mobileInteraction ? "sm:!size-2.75" : "sm:size-3"}
            />
          </span>
        </span>
      </span>
    </button>
  );
}

function LessonNavigationButton({
  direction,
  disabled,
  className = PLAYER_INNER_CONTROL_CLASS,
  iconSize = 24,
  onClick,
}: {
  direction: "next" | "previous";
  disabled: boolean;
  className?: string;
  iconSize?: number;
  onClick: () => void;
}) {
  const { icons } = usePlayerTheme();
  const Icon = direction === "previous" ? icons.previous : icons.next;
  const shortcut = direction === "previous" ? "Shift+P" : "Shift+N";
  const label = `${direction === "previous" ? "Previous" : "Next"} lesson`;
  return (
    <PlayerIconButton
      label={label}
      aria-keyshortcuts={shortcut}
      title={`${label} (${shortcut})`}
      disabled={disabled}
      className={className}
      icon={<Icon size={iconSize} active />}
      onClick={onClick}
    />
  );
}

function LessonTimeControl({ mobile = false }: { mobile?: boolean }) {
  if (mobile) {
    return (
      <div
        className="inline-flex h-11 items-center"
        data-player-control-hit-area="time"
      >
        <TimeDisplay
          interactive
          className={`${MOBILE_TEXT_PILL_HIT_CLASS} !relative !inline-flex !h-11 !items-center !px-4 !py-0 !text-xs !leading-4 before:inset-x-0.5 before:inset-y-1.5`}
        />
      </div>
    );
  }

  return (
    <PlayerControlSurface
      blurred
      cluster="time"
      className="inline-flex h-9.5 items-center rounded-full p-[3px]"
    >
      <TimeDisplay
        interactive
        className={`${PLAYER_INNER_CONTROL_CLASS} !inline-flex !h-8 !items-center !px-3.5 !text-sm`}
      />
    </PlayerControlSurface>
  );
}

function AmbientSettingsItem({
  enabled,
  onEnabledChange,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <PlayerMenuItem
      data-menu-keep-open=""
      label="Ambient mode"
      checked={enabled}
      highlightChecked={false}
      leading={<AmbientModeIcon enabled={enabled} />}
      trailing={<MenuToggle checked={enabled} />}
      onClick={() => onEnabledChange(!enabled)}
    />
  );
}

function AmbientModeIcon({ enabled }: { enabled: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-ambient-mode-icon=""
      data-ambient-mode-icon-state={enabled ? "on" : "off"}
      className={`block h-3 w-4.5 rounded-[2px] border border-current text-white transition-[border-color,box-shadow,color] duration-200 ease-out ${
        enabled ? "shadow-[0_0_10.5px_rgba(255,255,255,0.72)]" : "shadow-none"
      }`}
    />
  );
}

function MenuToggle({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-player-menu-toggle=""
      data-player-menu-toggle-state={checked ? "on" : "off"}
      className={`relative inline-flex h-5 w-9 rounded-full transition-colors duration-150 ${
        checked
          ? "bg-[color-mix(in_srgb,var(--video-player-accent)_78%,var(--video-player-menu-surface))]"
          : "bg-[color-mix(in_srgb,var(--video-player-menu-text)_22%,transparent)]"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 size-4 rounded-full bg-(--video-player-menu-text) shadow-[0_1px_4px_rgba(0,0,0,0.32)] transition-transform duration-150 motion-reduce:transition-none ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </span>
  );
}

export function LessonPlayerControls({
  ambientEnabled,
  autoplayEnabled,
  canGoNext,
  canGoPrevious,
  controlsSuppressed = false,
  courseLessonsOpen = false,
  courseLessonsPanel,
  onAmbientEnabledChange,
  onAutoplayEnabledChange,
  onCourseLessonsToggle,
  onGoNext,
  onGoPrevious,
  onMinimize,
  onMobileLandscapeFullscreenChange,
}: LessonPlayerControlsProps) {
  const timelineAnchorRef = useRef<HTMLSpanElement>(null);
  const [timelineHost, setTimelineHost] = useState<HTMLElement | null>(null);
  const [mobileSettingsSheetHost, setMobileSettingsSheetHost] =
    useState<HTMLDivElement | null>(null);
  const playerTheme = usePlayerTheme();
  const MinimizeIcon = playerTheme.icons.minimize;
  const mobileInteraction = usePlayerMobileInteraction();
  const {
    controlsVisible,
    fullscreen,
    lifecycle,
    previewTime,
    scrubbing,
    settingsOpen,
  } = usePlayerState(
    ({ media, ui }) => ({
      controlsVisible: ui.controlsVisible,
      fullscreen: ui.fullscreen,
      lifecycle: media.lifecycle,
      previewTime: ui.previewTime,
      scrubbing: ui.scrubbing,
      settingsOpen: ui.settingsView !== "closed",
    }),
    (left, right) =>
      left.controlsVisible === right.controlsVisible &&
      left.fullscreen === right.fullscreen &&
      left.lifecycle === right.lifecycle &&
      left.previewTime === right.previewTime &&
      left.scrubbing === right.scrubbing &&
      left.settingsOpen === right.settingsOpen,
  );
  const ready = lifecycle === "ready";
  const visible =
    !controlsSuppressed && (controlsVisible || settingsOpen);
  const mobileFullscreen = mobileInteraction && fullscreen;
  const persistentProgressVisible =
    ready && !controlsSuppressed && mobileInteraction && !fullscreen;
  const timelineDisplayed = visible || persistentProgressVisible;
  const landscapeOrientation = useSyncExternalStore(
    subscribeToLandscapeOrientation,
    getLandscapeOrientationSnapshot,
    getLandscapeOrientationServerSnapshot,
  );
  const mobileLandscapeFullscreen = mobileFullscreen && landscapeOrientation;
  const fullscreenCoursePanelVisible =
    mobileLandscapeFullscreen &&
    courseLessonsOpen &&
    Boolean(courseLessonsPanel);
  const mobileTimelineGeometry = scrubbing
    ? "max-sm:[&_[data-timeline-track]]:!h-0.75"
    : "max-sm:[&_[data-timeline-track]]:!h-0.5";
  const forcedMobileTimelineGeometry = mobileInteraction
    ? scrubbing
      ? "[&_[data-timeline-track]]:!h-0.75"
      : "[&_[data-timeline-track]]:!h-0.5"
    : "";

  const mobileVignettes = (
    <>
      <div
        aria-hidden="true"
        data-mobile-player-vignette="top"
        className={`absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,color-mix(in_srgb,#05070b_50%,var(--accent)_4%)_0%,color-mix(in_srgb,#05070b_20%,var(--accent)_2%)_58%,transparent_100%)] sm:hidden ${mobileInteraction ? "sm:!block" : ""}`}
      />
      <div
        aria-hidden="true"
        data-mobile-player-vignette="bottom"
        className={`absolute inset-x-0 bottom-0 h-18 bg-[linear-gradient(180deg,transparent_0%,color-mix(in_srgb,#05070b_20%,var(--accent)_2%)_42%,color-mix(in_srgb,#05070b_54%,var(--accent)_4%)_100%)] sm:hidden ${mobileInteraction ? "sm:!block" : ""}`}
      />
    </>
  );

  useLayoutEffect(() => {
    setTimelineHost(
      timelineAnchorRef.current?.closest<HTMLElement>(".video-shell") ?? null,
    );
  }, []);

  useEffect(() => {
    onMobileLandscapeFullscreenChange?.(mobileLandscapeFullscreen);
  }, [mobileLandscapeFullscreen, onMobileLandscapeFullscreenChange]);

  const timelineLayer = (
    <div
      data-player-timeline-wrap=""
      data-player-timeline-layer=""
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-80 overflow-visible max-sm:z-170 transition-opacity duration-200 motion-reduce:transition-none sm:inset-x-3 sm:bottom-13 ${timelineDisplayed ? "visible opacity-100" : "invisible opacity-0"} ${visible ? "" : "[&_*]:!pointer-events-none"} ${mobileInteraction ? (mobileFullscreen ? (fullscreenCoursePanelVisible ? "!left-(--learning-fullscreen-video-offset-x) !right-auto !bottom-10 !z-170 !w-(--learning-fullscreen-video-width) !max-w-full !translate-x-0 !px-3 sm:!left-(--learning-fullscreen-video-offset-x) sm:!right-auto sm:!bottom-10 sm:!w-(--learning-fullscreen-video-width) sm:!translate-x-0 sm:!px-3" : "!left-1/2 !right-auto !bottom-10 !z-170 !w-[min(100%,calc(100dvh*16/9))] !max-w-full !-translate-x-1/2 !px-3 sm:!left-1/2 sm:!right-auto sm:!bottom-10 sm:!w-[min(100%,calc(100dvh*16/9))] sm:!-translate-x-1/2 sm:!px-3") : "!z-170 sm:!inset-x-0 sm:!bottom-0") : ""}`}
      aria-hidden={visible ? undefined : true}
      inert={visible ? undefined : true}
    >
      <Timeline
        className={`pointer-events-none overflow-visible [&_[role=slider]]:pointer-events-auto max-sm:[&_[role=slider]]:h-9 max-sm:[&_[role=slider]]:translate-y-[calc(100%-10px)] max-sm:[&_[data-timeline-visual]]:translate-y-[calc(-100%+10px)] max-sm:[&_[data-video-player-preview]]:!bottom-3.5 max-sm:[&_[data-video-player-preview]]:!mb-0 max-sm:[&_[data-timeline-buffered-range]]:rounded-none max-sm:[&_[data-timeline-progress]]:rounded-none max-sm:[&_[data-timeline-track]]:bottom-0 max-sm:[&_[data-timeline-track]]:top-auto max-sm:[&_[data-timeline-track]]:translate-y-0 max-sm:[&_[data-timeline-track]]:rounded-none max-sm:[&_[data-timeline-thumb]]:top-full max-sm:[&_[data-timeline-thumb]]:z-80 ${mobileTimelineGeometry} ${forcedMobileTimelineGeometry} ${mobileInteraction ? "[&_[role=slider]]:!h-9 [&_[role=slider]]:!translate-y-[calc(100%-10px)] [&_[data-timeline-visual]]:!translate-y-[calc(-100%+10px)] [&_[data-video-player-preview]]:!bottom-3.5 [&_[data-video-player-preview]]:!mb-0 [&_[data-timeline-buffered-range]]:!rounded-none [&_[data-timeline-progress]]:!rounded-none [&_[data-timeline-track]]:!bottom-0 [&_[data-timeline-track]]:!top-auto [&_[data-timeline-track]]:!translate-y-0 [&_[data-timeline-track]]:!rounded-none [&_[data-timeline-thumb]]:!top-full [&_[data-timeline-thumb]]:!z-80" : ""}`}
      />
    </div>
  );

  const mobileTimeCorner = (
    <div
      data-mobile-player-corner="time"
      data-preview-obscured={previewTime !== null ? "true" : "false"}
      className={`pointer-events-auto absolute bottom-2.5 left-2 flex h-11 items-center transition-opacity duration-150 ease-out motion-reduce:transition-none sm:bottom-2.5 sm:left-3 sm:right-58 sm:h-auto ${mobileInteraction ? `sm:!right-auto sm:!h-11 ${mobileFullscreen ? "!bottom-15 !left-3 sm:!bottom-15 sm:!left-3" : "sm:!left-2"}` : ""} ${
        fullscreenCoursePanelVisible ? "!static sm:!static" : ""
      } ${
        previewTime !== null
          ? `max-sm:pointer-events-none max-sm:opacity-0 ${mobileInteraction ? "sm:!pointer-events-none sm:!opacity-0" : ""}`
          : "max-sm:opacity-100"
      }`}
    >
      <div className={`sm:hidden ${mobileInteraction ? "sm:!block" : ""}`}>
        <LessonTimeControl mobile />
      </div>
      <div
        className={`hidden items-center gap-2 sm:flex ${mobileInteraction ? "sm:!hidden" : ""}`}
      >
        <PlayerControlSurface
          blurred
          cluster="playback"
          className="inline-flex size-10.5 items-center justify-center rounded-full p-[3px]"
        >
          <PlayButton className={PLAYER_INNER_CONTROL_CLASS} iconSize={23} />
        </PlayerControlSurface>
        <PlayerControlSurface
          blurred
          cluster="lesson-navigation"
          className="inline-flex h-10.5 items-center rounded-full p-[3px]"
        >
          <LessonNavigationButton
            direction="previous"
            disabled={!canGoPrevious}
            onClick={onGoPrevious}
          />
          <LessonNavigationButton
            direction="next"
            disabled={!canGoNext}
            onClick={onGoNext}
          />
        </PlayerControlSurface>
        <VolumeControl
          collapsible
          className={`${PLAYER_SURFACE_CLASS} relative isolate h-10.5 !w-10.5 shrink-0 rounded-full p-1 backdrop-blur-sm before:pointer-events-none before:absolute before:inset-0 before:z-0 before:rounded-full before:bg-transparent before:transition-colors before:duration-150 before:ease-out before:content-[''] hover:!w-31.5 hover:before:bg-(--video-player-control-surface-hover) focus-within:!w-31.5 focus-within:before:bg-(--video-player-control-surface-hover) [&>*]:relative [&>*]:z-10 [&_.player-volume-slider]:!h-8.5`}
          muteButtonClassName={`${PLAYER_INNER_CONTROL_CLASS} ${MOBILE_INVISIBLE_HIT_SURFACE_CLASS} !size-8.5`}
        />
        <LessonTimeControl />
      </div>
    </div>
  );

  const mobileFullscreenCorner = (
    <div
      data-mobile-player-corner="fullscreen"
      data-preview-obscured={previewTime !== null ? "true" : "false"}
      className={`pointer-events-auto absolute bottom-2.5 right-2 z-60 transition-opacity duration-150 ease-out motion-reduce:transition-none sm:hidden ${mobileInteraction ? `sm:!block ${mobileFullscreen ? "!bottom-15 !right-3 sm:!bottom-15 sm:!right-3" : ""}` : ""} ${
        fullscreenCoursePanelVisible ? "!static sm:!static" : ""
      } ${
        previewTime !== null
          ? `max-sm:pointer-events-none max-sm:opacity-0 ${mobileInteraction ? "sm:!pointer-events-none sm:!opacity-0" : ""}`
          : "max-sm:opacity-100"
      }`}
    >
      <div className="inline-flex items-center gap-1.5">
        {onCourseLessonsToggle ? (
          <CourseLessonsButton
            open={courseLessonsOpen}
            onToggle={() =>
              onCourseLessonsToggle(
                mobileLandscapeFullscreen ? "side" : "drawer",
              )
            }
            sidePanel={mobileLandscapeFullscreen}
          />
        ) : null}
        <div
          className="inline-flex size-11 items-center justify-center"
          data-player-control-hit-area="fullscreen"
        >
          <FullscreenButton
            className={`${MOBILE_INVISIBLE_HIT_SURFACE_CLASS} group/fullscreen !size-11 !rounded-full !bg-transparent !p-0 !shadow-none drop-shadow-none hover:!bg-transparent active:!bg-transparent focus-visible:!bg-transparent`}
            iconContainerClassName="pointer-events-none relative z-10 grid size-8 place-items-center rounded-full bg-(--video-player-control-surface) shadow-(--video-player-control-shadow) backdrop-blur-sm transition-colors duration-150 ease-out group-hover/fullscreen:bg-(--video-player-control-surface-hover) group-active/fullscreen:bg-(--video-player-control-surface-active) group-focus-visible/fullscreen:bg-(--video-player-control-surface-hover)"
            iconSize={20}
          />
        </div>
      </div>
    </div>
  );

  const bottomCornerControlsLayer = (
    <div
      data-player-bottom-corner-controls-layer=""
      className={`pointer-events-none absolute z-180 text-white transition-opacity duration-200 motion-reduce:transition-none ${
        mobileFullscreen
          ? "inset-y-0 left-1/2 right-auto w-[min(100%,calc(100dvh*16/9))] max-w-full -translate-x-1/2"
          : "inset-0"
      } ${
        visible
          ? "visible opacity-100"
          : "invisible opacity-0 [&_*]:!pointer-events-none"
      }`}
      style={getPlayerThemeStyle(playerTheme)}
      aria-hidden={visible ? undefined : true}
      inert={visible ? undefined : true}
    >
      {mobileTimeCorner}
      {mobileFullscreenCorner}
    </div>
  );

  const fullscreenBottomControlsLayer = (
    <div
      data-player-fullscreen-bottom-controls=""
      className={`pointer-events-none absolute bottom-15 left-(--learning-fullscreen-video-offset-x) z-180 flex h-11 w-(--learning-fullscreen-video-width) max-w-full items-center justify-between px-3 text-white transition-opacity duration-200 motion-reduce:transition-none ${
        visible
          ? "visible opacity-100"
          : "invisible opacity-0 [&_*]:!pointer-events-none"
      }`}
      style={getPlayerThemeStyle(playerTheme)}
      aria-hidden={visible ? undefined : true}
      inert={visible ? undefined : true}
    >
      {mobileTimeCorner}
      {mobileFullscreenCorner}
    </div>
  );

  return (
    <>
      {timelineHost && mobileLandscapeFullscreen
        ? createPortal(
            <div
              ref={setMobileSettingsSheetHost}
              data-learning-mobile-settings-sheet-host=""
              className="pointer-events-none absolute inset-0 z-200 overflow-hidden"
            />,
            timelineHost,
          )
        : null}
      {timelineHost && fullscreenCoursePanelVisible
        ? createPortal(courseLessonsPanel, timelineHost)
        : null}
      {timelineHost && fullscreenCoursePanelVisible
        ? createPortal(fullscreenBottomControlsLayer, timelineHost)
        : null}
      {timelineHost && !fullscreenCoursePanelVisible
        ? createPortal(bottomCornerControlsLayer, timelineHost)
        : null}
      {timelineHost && mobileFullscreen
        ? createPortal(
            <div
              aria-hidden="true"
              data-mobile-player-fullscreen-vignette-layer=""
              className={`pointer-events-none absolute inset-y-0 z-20 ${
                fullscreenCoursePanelVisible
                  ? "left-(--learning-fullscreen-video-offset-x) w-(--learning-fullscreen-video-width)"
                  : "left-0 right-0"
              }`}
              style={getPlayerThemeStyle(playerTheme)}
            >
              {mobileVignettes}
            </div>,
            timelineHost,
          )
        : null}
      <div
        className={`pointer-events-none absolute inset-0 ${settingsOpen ? "z-180" : "z-30"} text-white transition-opacity duration-200 motion-reduce:transition-none ${
          visible
            ? "visible opacity-100"
            : `invisible opacity-0 [&_*]:!pointer-events-none ${
                controlsSuppressed ? "transition-none" : ""
              }`
        }`}
        aria-hidden={visible ? undefined : true}
        inert={visible ? undefined : true}
        data-video-player-control-layer=""
        data-lesson-player-controls=""
      >
        <span ref={timelineAnchorRef} hidden />
        {timelineHost ? createPortal(timelineLayer, timelineHost) : timelineLayer}
        <div
          className={
            mobileFullscreen
              ? fullscreenCoursePanelVisible
                ? "absolute inset-0"
                : "absolute inset-y-0 left-1/2 w-[min(100%,calc(100dvh*16/9))] max-w-full -translate-x-1/2"
              : "absolute inset-0"
          }
          data-player-control-frame=""
          data-player-mobile-fullscreen-frame={
            mobileFullscreen ? "true" : undefined
          }
        >
          {!mobileFullscreen ? mobileVignettes : null}

          {onMinimize ? (
            <div
              className={`pointer-events-auto absolute left-2 top-2 ${mobileFullscreen ? "!left-3 sm:!left-3" : ""}`}
            >
              <PlayerIconButton
                label={LEARNING_PLAYER_MINIMIZE_LABEL}
                title={LEARNING_PLAYER_MINIMIZE_TITLE}
                aria-keyshortcuts={LEARNING_PLAYER_MINIMIZE_SHORTCUT}
                className={`${MOBILE_INVISIBLE_HIT_SURFACE_CLASS} !size-9 !rounded-full !bg-transparent !shadow-none drop-shadow-none`}
                icon={<MinimizeIcon size={22} />}
                onClick={onMinimize}
              />
            </div>
          ) : null}

          <PlayerControlSurface
            cluster="player-actions"
            className={`pointer-events-auto absolute right-2 top-2 flex h-8 items-center gap-1 rounded-full !bg-transparent p-0 !shadow-none before:pointer-events-none before:absolute before:inset-0 before:z-0 before:rounded-full before:bg-(--video-player-control-surface) before:shadow-(--video-player-control-shadow) before:backdrop-blur-sm before:content-[''] [&>*]:relative [&>*]:z-10 max-sm:before:hidden sm:bottom-2.5 sm:top-auto sm:h-10.5 sm:p-[3px] ${mobileInteraction ? "sm:!top-2 sm:!bottom-auto sm:!h-8 sm:!p-0 sm:before:hidden" : ""} ${mobileFullscreen ? "!left-auto !right-3 sm:!left-auto sm:!right-3" : ""}`}
          >
            <ZoomLevelIndicator className="mr-0.5" />
            <AutoplayToggle
              enabled={autoplayEnabled}
              mobileInteraction={mobileInteraction}
              onEnabledChange={onAutoplayEnabledChange}
            />
            <span
              className={`inline-flex sm:hidden ${mobileInteraction ? "sm:!inline-flex" : ""}`}
              data-mobile-volume-control=""
            >
              <MuteButton
                className={getPlayerIconPillClass(mobileInteraction)}
                iconSize={22}
              />
            </span>
            <SettingsMenu
              includePictureInPicture
              mobilePresentation="sheet"
              mobileSheetPanelClassName={
                mobileLandscapeFullscreen
                  ? fullscreenCoursePanelVisible
                    ? "[&&]:!rounded-b-none !inset-x-auto !right-auto !left-[calc(var(--learning-fullscreen-video-offset-x)+var(--learning-fullscreen-video-width)/2)] !w-[min(100dvh,var(--learning-fullscreen-video-width))] !-translate-x-1/2"
                    : "[&&]:!rounded-b-none mx-auto max-w-[100dvh]"
                  : undefined
              }
              mobileSheetPortalTarget={
                mobileLandscapeFullscreen ? mobileSettingsSheetHost : undefined
              }
              triggerClassName={getPlayerIconPillClass(mobileInteraction)}
              extraMainItems={
                <AmbientSettingsItem
                  enabled={ambientEnabled}
                  onEnabledChange={onAmbientEnabledChange}
                />
              }
            />
            <span
              className={`hidden sm:inline-flex ${mobileInteraction ? "sm:!hidden" : ""}`}
            >
              <FullscreenButton
                className={getPlayerIconPillClass(mobileInteraction)}
                iconSize={24}
              />
            </span>
          </PlayerControlSurface>

          {!timelineHost && !fullscreenCoursePanelVisible
            ? mobileTimeCorner
            : null}
          {!timelineHost && !fullscreenCoursePanelVisible
            ? mobileFullscreenCorner
            : null}
        </div>
      </div>
    </>
  );
}

export interface LessonCentralControlsProps {
  canGoNext: boolean;
  canGoPrevious: boolean;
  controlsSuppressed?: boolean;
  onGoNext: () => void;
  onGoPrevious: () => void;
}

export function LessonCentralControls({
  canGoNext,
  canGoPrevious,
  controlsSuppressed = false,
  onGoNext,
  onGoPrevious,
}: LessonCentralControlsProps) {
  const { buffering, controlsVisible, lifecycle } = usePlayerState(
    ({ media, ui }) => ({
      buffering: media.buffering,
      controlsVisible: ui.controlsVisible,
      lifecycle: media.lifecycle,
    }),
    (left, right) =>
      left.buffering === right.buffering &&
      left.controlsVisible === right.controlsVisible &&
      left.lifecycle === right.lifecycle,
  );
  const mobileInteraction = usePlayerMobileInteraction();
  const loading = lifecycle !== "ready" || buffering;
  const visible = !controlsSuppressed && !loading && controlsVisible;

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-20 hidden place-items-center transition-opacity duration-200 max-sm:grid ${mobileInteraction ? "sm:!grid" : ""} ${
        visible
          ? "visible opacity-100"
          : `invisible opacity-0 [&_*]:!pointer-events-none ${
              controlsSuppressed || loading ? "transition-none" : ""
            }`
      }`}
      aria-hidden={visible ? undefined : true}
      inert={visible ? undefined : true}
      data-video-player-control-layer=""
      data-lesson-central-controls=""
      data-player-loading={loading ? "true" : undefined}
    >
      <div className="pointer-events-auto flex items-center gap-6">
        <PlayerControlSurface
          cluster="mobile-previous"
          className="grid size-11.5 place-items-center rounded-full !border-0 p-0 backdrop-blur-none"
        >
          <LessonNavigationButton
            direction="previous"
            disabled={!canGoPrevious}
            className={`${MOBILE_INVISIBLE_HIT_SURFACE_CLASS} ${PLAYER_INNER_CONTROL_CLASS} !size-11.5`}
            iconSize={22}
            onClick={onGoPrevious}
          />
        </PlayerControlSurface>
        <PlayerControlSurface
          cluster="mobile-play"
          className="grid size-15.5 place-items-center rounded-full !border-0 p-0 backdrop-blur-none"
        >
          <PlayButton
            className={`${MOBILE_INVISIBLE_HIT_SURFACE_CLASS} ${PLAYER_INNER_CONTROL_CLASS} !size-15.5`}
            hideControlsOnPlay
            iconSize={29}
          />
        </PlayerControlSurface>
        <PlayerControlSurface
          cluster="mobile-next"
          className="grid size-11.5 place-items-center rounded-full !border-0 p-0 backdrop-blur-none"
        >
          <LessonNavigationButton
            direction="next"
            disabled={!canGoNext}
            className={`${MOBILE_INVISIBLE_HIT_SURFACE_CLASS} ${PLAYER_INNER_CONTROL_CLASS} !size-11.5`}
            iconSize={22}
            onClick={onGoNext}
          />
        </PlayerControlSurface>
      </div>
    </div>
  );
}
