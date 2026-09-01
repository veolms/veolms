import {
  FullscreenButton,
  PlayerIconButton,
  PlayerMenuItem,
  PlayButton,
  SettingsMenu,
  TimeDisplay,
  Timeline,
  VolumeControl,
  ZoomLevelIndicator,
  usePlayerController,
  usePlayerState,
  usePlayerTheme,
} from "@veolms/video-player";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import type { ReactNode } from "react";

const PLAYER_SURFACE_CLASS =
  "bg-(--video-player-control-surface) text-(--video-player-control-text) shadow-(--video-player-control-shadow)";
const PLAYER_INNER_CONTROL_CLASS =
  "!rounded-full !bg-transparent transition-colors duration-150 ease-out hover:!bg-(--video-player-control-surface-hover) active:!bg-(--video-player-control-surface-active) focus-visible:!bg-(--video-player-control-surface-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-control-text)";
const PLAYER_ICON_PILL_CLASS =
  "!h-8 !w-auto !rounded-full !bg-transparent !px-2 !shadow-none drop-shadow-none transition-colors duration-150 ease-out hover:!bg-transparent active:!bg-(--video-player-control-surface-active) focus-visible:!bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-control-text) sm:!h-9 sm:!bg-[color-mix(in_srgb,var(--video-player-control-text)_4%,transparent)] sm:!px-3 sm:hover:!bg-(--video-player-control-surface-hover) sm:active:!bg-(--video-player-control-surface-active) sm:focus-visible:!bg-(--video-player-control-surface-hover)";

function PlayerControlSurface({
  children,
  className,
  cluster,
}: {
  children: ReactNode;
  className: string;
  cluster?: string;
}) {
  return (
    <div
      className={`${PLAYER_SURFACE_CLASS} ${className}`}
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
  courseLessonsOpen?: boolean;
  onAmbientEnabledChange: (enabled: boolean) => void;
  onAutoplayEnabledChange: (enabled: boolean) => void;
  onCourseLessonsToggle?: () => void;
  onGoNext: () => void;
  onGoPrevious: () => void;
  onMinimize?: () => void;
}

function CourseLessonsButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <PlayerControlSurface
      cluster="course-lessons"
      className="inline-flex h-9 items-center rounded-full p-0.5"
    >
      <button
        type="button"
        aria-label={open ? "Close lessons" : "Open lessons"}
        aria-expanded={open}
        aria-controls="lesson-drawer-curriculum-scrollport"
        data-player-control=""
        className={`${PLAYER_INNER_CONTROL_CLASS} inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 !text-[13px] font-semibold tracking-[0.01em]`}
        onClick={onToggle}
      >
        <span>Lessons</span>
        <CaretDown
          aria-hidden="true"
          size={15}
          className={`transition-transform duration-240 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
            open ? "-rotate-180" : "rotate-0"
          }`}
        />
      </button>
    </PlayerControlSurface>
  );
}

function AutoplayToggle({
  enabled,
  onEnabledChange,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  const { icons } = usePlayerTheme();
  const Icon = enabled ? icons.play : icons.pause;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Autoplay next lesson"
      title={enabled ? "Autoplay is on" : "Autoplay is off"}
      data-player-control=""
      className={`group/autoplay relative inline-flex h-8 w-auto shrink-0 items-center justify-center px-2 text-white !shadow-none drop-shadow-none max-sm:hover:!bg-transparent max-sm:active:!bg-white/14 max-sm:focus-visible:!bg-transparent sm:h-9 sm:px-3 ${PLAYER_INNER_CONTROL_CLASS}`}
      onClick={() => onEnabledChange(!enabled)}
    >
      <span
        aria-hidden="true"
        className="relative block h-3.5 w-8 rounded-full border-0 bg-black/40 transition-colors duration-150 sm:h-4 sm:w-9"
        data-autoplay-track=""
        data-autoplay-track-state={enabled ? "on" : "off"}
      >
        <span
          className={`absolute top-1/2 grid size-4.5 -translate-y-1/2 place-items-center rounded-full shadow-[0_1px_5px_rgba(0,0,0,0.38)] transition-[left,background-color,color] sm:size-5 ${
            enabled
              ? "left-3.5 bg-white text-black sm:left-4.5"
              : "-left-0.5 bg-white/42 text-white"
          }`}
          data-autoplay-knob=""
        >
          <Icon size={11} active={enabled} className="sm:size-3" />
        </span>
      </span>
    </button>
  );
}

function CaptionsButton() {
  const controller = usePlayerController();
  const { selectedTextTrackId, textTracks } = usePlayerState(
    ({ media }) => ({
      selectedTextTrackId: media.selectedTextTrackId,
      textTracks: media.textTracks,
    }),
    (left, right) =>
      left.selectedTextTrackId === right.selectedTextTrackId &&
      left.textTracks === right.textTracks,
  );
  const enabled = selectedTextTrackId !== null;
  const CaptionsIcon = usePlayerTheme().icons.captions;

  return (
    <PlayerIconButton
      label={enabled ? "Turn captions off" : "Turn captions on"}
      pressed={enabled}
      disabled={textTracks.length === 0}
      className={PLAYER_ICON_PILL_CLASS}
      icon={
        <CaptionsIcon
          data-caption-icon-state={enabled ? "filled" : "outline"}
          size={26}
          active={enabled}
          className="max-sm:size-5.5"
        />
      }
      onClick={() =>
        controller.selectTextTrack(enabled ? null : (textTracks[0]?.id ?? null))
      }
    />
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
  return (
    <PlayerControlSurface
      cluster="time"
      className={
        mobile
          ? "inline-flex items-center overflow-hidden rounded-full p-0"
          : "inline-flex h-9.5 items-center rounded-full p-[3px]"
      }
    >
      <TimeDisplay
        interactive
        className={`${PLAYER_INNER_CONTROL_CLASS} ${
          mobile
            ? "!inline-flex !h-auto !items-center !px-2 !py-1 !text-xs !leading-4"
            : "!inline-flex !h-8 !items-center !px-3.5 !text-sm"
        }`}
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
  const AmbientIcon = usePlayerTheme().icons.ambient;
  return (
    <AmbientIcon
      size={20}
      active={enabled}
      className="overflow-visible"
      data-ambient-mode-icon=""
      style={{
        filter:
          "drop-shadow(0 0 2px var(--video-player-accent)) drop-shadow(0 2px 5px rgb(0 0 0 / 0.28))",
      }}
      aria-hidden="true"
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
  courseLessonsOpen = false,
  onAmbientEnabledChange,
  onAutoplayEnabledChange,
  onCourseLessonsToggle,
  onGoNext,
  onGoPrevious,
  onMinimize,
}: LessonPlayerControlsProps) {
  const MinimizeIcon = usePlayerTheme().icons.minimize;
  const { controlsVisible, previewTime, scrubbing, settingsOpen } =
    usePlayerState(
      ({ ui }) => ({
        controlsVisible: ui.controlsVisible,
        previewTime: ui.previewTime,
        scrubbing: ui.scrubbing,
        settingsOpen: ui.settingsView !== "closed",
      }),
      (left, right) =>
        left.controlsVisible === right.controlsVisible &&
        left.previewTime === right.previewTime &&
        left.scrubbing === right.scrubbing &&
        left.settingsOpen === right.settingsOpen,
    );
  const visible = controlsVisible || settingsOpen;
  const mobileTimelineGeometry = scrubbing
    ? "max-sm:[&_[data-timeline-track]]:!h-0.75 max-sm:[&_[data-timeline-thumb]]:top-[calc(100%-1.5px)]"
    : "max-sm:[&_[data-timeline-track]]:!h-0.5 max-sm:[&_[data-timeline-thumb]]:top-[calc(100%-1px)]";

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-30 text-white transition-opacity duration-200 motion-reduce:transition-none ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden={visible ? undefined : true}
      inert={visible ? undefined : true}
      data-lesson-player-controls=""
    >
      <div
        aria-hidden="true"
        data-mobile-player-vignette="top"
        className="absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,color-mix(in_srgb,#05070b_50%,var(--accent)_4%)_0%,color-mix(in_srgb,#05070b_20%,var(--accent)_2%)_58%,transparent_100%)] sm:hidden"
      />
      <div
        aria-hidden="true"
        data-mobile-player-vignette="bottom"
        className="absolute inset-x-0 bottom-0 h-18 bg-[linear-gradient(180deg,transparent_0%,color-mix(in_srgb,#05070b_20%,var(--accent)_2%)_42%,color-mix(in_srgb,#05070b_54%,var(--accent)_4%)_100%)] sm:hidden"
      />

      {onMinimize ? (
        <div className="pointer-events-auto absolute left-2 top-2 sm:hidden">
          <PlayerIconButton
            label="Minimize video"
            className="!size-9 !rounded-full !bg-transparent !shadow-none drop-shadow-none"
            icon={<MinimizeIcon size={22} />}
            onClick={onMinimize}
          />
        </div>
      ) : null}

      <PlayerControlSurface
        cluster="player-actions"
        className="pointer-events-auto absolute right-2 top-2 flex h-8 items-center gap-1 rounded-full p-0 max-sm:!bg-transparent max-sm:!shadow-none sm:bottom-2.5 sm:top-auto sm:h-10.5 sm:p-[3px]"
      >
        <AutoplayToggle
          enabled={autoplayEnabled}
          onEnabledChange={onAutoplayEnabledChange}
        />
        <ZoomLevelIndicator />
        <CaptionsButton />
        <SettingsMenu
          includePictureInPicture
          mobilePresentation="sheet"
          triggerClassName={PLAYER_ICON_PILL_CLASS}
          extraMainItems={
            <AmbientSettingsItem
              enabled={ambientEnabled}
              onEnabledChange={onAmbientEnabledChange}
            />
          }
        />
        <span className="hidden sm:inline-flex">
          <FullscreenButton className={PLAYER_ICON_PILL_CLASS} iconSize={24} />
        </span>
      </PlayerControlSurface>

      <div
        data-player-timeline-wrap=""
        className="pointer-events-auto absolute inset-x-0 bottom-0 z-50 sm:inset-x-3 sm:bottom-13"
      >
        <Timeline
          className={`max-sm:[&_[role=slider]]:h-5 max-sm:[&_[data-video-player-preview]]:!bottom-3.5 max-sm:[&_[data-video-player-preview]]:!mb-0 max-sm:[&_[data-timeline-buffered-range]]:rounded-none max-sm:[&_[data-timeline-progress]]:rounded-none max-sm:[&_[data-timeline-track]]:bottom-0 max-sm:[&_[data-timeline-track]]:top-auto max-sm:[&_[data-timeline-track]]:translate-y-0 max-sm:[&_[data-timeline-track]]:rounded-none ${mobileTimelineGeometry}`}
        />
      </div>

      <div
        data-mobile-player-corner="time"
        data-preview-obscured={previewTime !== null ? "true" : "false"}
        className={`pointer-events-auto absolute bottom-2.5 left-2 flex h-10 items-center transition-opacity duration-150 ease-out motion-reduce:transition-none sm:bottom-2.5 sm:left-3 sm:right-58 sm:h-auto ${
          previewTime !== null
            ? "max-sm:pointer-events-none max-sm:opacity-0"
            : "max-sm:opacity-100"
        }`}
      >
        <div className="sm:hidden">
          <LessonTimeControl mobile />
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <PlayerControlSurface
            cluster="playback"
            className="inline-flex size-10.5 items-center justify-center rounded-full p-[3px]"
          >
            <PlayButton className={PLAYER_INNER_CONTROL_CLASS} iconSize={23} />
          </PlayerControlSurface>
          <PlayerControlSurface
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
            className={`${PLAYER_SURFACE_CLASS} h-10.5 !w-10.5 shrink-0 rounded-full p-1 hover:!w-31.5 hover:bg-(--video-player-control-surface-hover) focus-within:!w-31.5 focus-within:bg-(--video-player-control-surface-hover) [&_.player-volume-slider]:!h-8.5`}
            muteButtonClassName={`${PLAYER_INNER_CONTROL_CLASS} !size-8.5`}
          />
          <LessonTimeControl />
        </div>
      </div>

      <div
        data-mobile-player-corner="fullscreen"
        data-preview-obscured={previewTime !== null ? "true" : "false"}
        className={`pointer-events-auto absolute bottom-2.5 right-2 z-60 transition-opacity duration-150 ease-out motion-reduce:transition-none sm:hidden ${
          previewTime !== null
            ? "max-sm:pointer-events-none max-sm:opacity-0"
            : "max-sm:opacity-100"
        }`}
      >
        <div className="inline-flex items-center gap-1.5">
          {onCourseLessonsToggle ? (
            <CourseLessonsButton
              open={courseLessonsOpen}
              onToggle={onCourseLessonsToggle}
            />
          ) : null}
          <div
            className="inline-flex size-10 items-center justify-center"
            data-player-control-cluster="fullscreen"
          >
            <FullscreenButton
              className={`${PLAYER_ICON_PILL_CLASS} !size-10 !bg-transparent !px-0`}
              iconContainerClassName="pointer-events-none grid size-7 place-items-center rounded-full bg-(--video-player-control-surface) shadow-(--video-player-control-shadow)"
              iconSize={22}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export interface LessonCentralControlsProps {
  canGoNext: boolean;
  canGoPrevious: boolean;
  onGoNext: () => void;
  onGoPrevious: () => void;
}

export function LessonCentralControls({
  canGoNext,
  canGoPrevious,
  onGoNext,
  onGoPrevious,
}: LessonCentralControlsProps) {
  const visible = usePlayerState(({ ui }) => ui.controlsVisible);

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-20 hidden place-items-center transition-opacity duration-200 max-sm:grid ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden={visible ? undefined : true}
      inert={visible ? undefined : true}
      data-lesson-central-controls=""
    >
      <div className="pointer-events-auto flex items-center gap-6">
        <PlayerControlSurface
          cluster="mobile-previous"
          className="grid size-11.5 place-items-center rounded-full !border-0 p-0"
        >
          <LessonNavigationButton
            direction="previous"
            disabled={!canGoPrevious}
            className={`${PLAYER_INNER_CONTROL_CLASS} !size-11.5`}
            iconSize={22}
            onClick={onGoPrevious}
          />
        </PlayerControlSurface>
        <PlayerControlSurface
          cluster="mobile-play"
          className="grid size-15.5 place-items-center rounded-full !border-0 p-0"
        >
          <PlayButton
            className={`${PLAYER_INNER_CONTROL_CLASS} !size-15.5`}
            hideControlsOnPlay
            iconSize={29}
          />
        </PlayerControlSurface>
        <PlayerControlSurface
          cluster="mobile-next"
          className="grid size-11.5 place-items-center rounded-full !border-0 p-0"
        >
          <LessonNavigationButton
            direction="next"
            disabled={!canGoNext}
            className={`${PLAYER_INNER_CONTROL_CLASS} !size-11.5`}
            iconSize={22}
            onClick={onGoNext}
          />
        </PlayerControlSurface>
      </div>
    </div>
  );
}
