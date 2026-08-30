import {
  CaretDown,
  ClosedCaptioning,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "@phosphor-icons/react";
import {
  FullscreenButton,
  PlayerIconButton,
  PlayerMenuItem,
  PlayButton,
  SettingsMenu,
  TimeDisplay,
  Timeline,
  VolumeControl,
  usePlayerController,
  usePlayerState,
} from "@veolms/video-player";
import type { ReactNode } from "react";

const PLAYER_SURFACE_CLASS =
  "bg-[color-mix(in_srgb,#05070b_70%,var(--accent)_6%)] text-white shadow-[0_5px_16px_rgba(0,0,0,0.28)]";
const PLAYER_INNER_CONTROL_CLASS =
  "!rounded-full !bg-transparent transition-colors duration-150 ease-out hover:!bg-white/10 active:!bg-[color-mix(in_srgb,white_10%,var(--accent)_6%)] focus-visible:!bg-white/16 focus-visible:!outline-none";
const PLAYER_ICON_PILL_CLASS =
  "!h-8 !w-auto !rounded-full !bg-transparent !px-2 !shadow-none drop-shadow-none transition-colors duration-150 ease-out hover:!bg-transparent active:!bg-white/14 focus-visible:!bg-transparent focus-visible:!outline-none sm:!h-9 sm:!bg-white/6 sm:!px-3 sm:hover:!bg-white/16 sm:active:!bg-[color-mix(in_srgb,white_12%,var(--accent)_6%)] sm:focus-visible:!bg-white/16";
const PLAYER_VOLUME_ICON_CLASS =
  "!rounded-full !bg-transparent transition-colors duration-150 ease-out hover:!bg-transparent active:!bg-transparent focus-visible:!bg-white/16 focus-visible:!outline-none";

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
  onAmbientEnabledChange: (enabled: boolean) => void;
  onAutoplayEnabledChange: (enabled: boolean) => void;
  onGoNext: () => void;
  onGoPrevious: () => void;
  onMinimize?: () => void;
}

function AutoplayToggle({
  enabled,
  onEnabledChange,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
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
        className="relative block h-3.5 w-8 rounded-full bg-white/28 transition-colors sm:h-4 sm:w-9"
        data-autoplay-track=""
      >
        <span
          className={`absolute top-1/2 grid size-4.5 -translate-y-1/2 place-items-center rounded-full shadow-[0_1px_5px_rgba(0,0,0,0.38)] transition-[left,background-color,color] sm:size-5 ${
            enabled
              ? "left-3.5 bg-white text-black sm:left-4.5"
              : "-left-0.5 bg-white/42 text-white"
          }`}
          data-autoplay-knob=""
        >
          {enabled ? (
            <Play size={11} weight="fill" className="sm:size-3" />
          ) : (
            <Pause size={11} weight="fill" className="sm:size-3" />
          )}
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

  return (
    <PlayerIconButton
      label={enabled ? "Turn captions off" : "Turn captions on"}
      pressed={enabled}
      disabled={textTracks.length === 0}
      className={PLAYER_ICON_PILL_CLASS}
      icon={
        <ClosedCaptioning
          data-caption-icon-state={enabled ? "filled" : "outline"}
          size={26}
          weight={enabled ? "fill" : "bold"}
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
  const Icon = direction === "previous" ? SkipBack : SkipForward;
  const shortcut = direction === "previous" ? "Shift+P" : "Shift+N";
  const label = `${direction === "previous" ? "Previous" : "Next"} lesson`;
  return (
    <PlayerIconButton
      label={label}
      aria-keyshortcuts={shortcut}
      title={`${label} (${shortcut})`}
      disabled={disabled}
      className={className}
      icon={<Icon size={iconSize} weight="fill" />}
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
          ? "inline-flex h-9 items-center rounded-full p-0.5"
          : "inline-flex h-10.5 items-center rounded-full p-[3px]"
      }
    >
      <TimeDisplay
        interactive
        className={`${PLAYER_INNER_CONTROL_CLASS} ${
          mobile ? "!h-8 !px-2.5 !text-[11px]" : "!h-9 !px-3 !text-sm"
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
      leading={<AmbientModeIcon enabled={enabled} />}
      trailing={<MenuToggle checked={enabled} />}
      onClick={() => onEnabledChange(!enabled)}
    />
  );
}

function AmbientModeIcon({ enabled }: { enabled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 20"
      className="size-5 overflow-visible"
      data-ambient-mode-icon=""
      aria-hidden="true"
    >
      <rect
        x="3"
        y="4"
        width="18"
        height="12"
        rx="2.5"
        fill={enabled ? "rgba(96, 165, 250, 0.2)" : "none"}
        stroke={enabled ? "#dbeafe" : "#eff6ff"}
        strokeWidth="1.75"
        style={{
          filter:
            "drop-shadow(0 0 2px #60a5fa) drop-shadow(0 0 5px color-mix(in srgb, #3b82f6 72%, var(--accent)))",
        }}
      />
    </svg>
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
          ? "bg-[color-mix(in_srgb,var(--accent)_78%,var(--surface))]"
          : "bg-[color-mix(in_srgb,var(--text)_22%,transparent)]"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 size-4 rounded-full bg-(--surface) shadow-[0_1px_4px_rgba(0,0,0,0.32)] transition-transform duration-150 motion-reduce:transition-none ${
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
  onAmbientEnabledChange,
  onAutoplayEnabledChange,
  onGoNext,
  onGoPrevious,
  onMinimize,
}: LessonPlayerControlsProps) {
  const { controlsVisible, scrubbing, settingsOpen } = usePlayerState(
    ({ ui }) => ({
      controlsVisible: ui.controlsVisible,
      scrubbing: ui.scrubbing,
      settingsOpen: ui.settingsView !== "closed",
    }),
    (left, right) =>
      left.controlsVisible === right.controlsVisible &&
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
            icon={<CaretDown size={22} weight="bold" />}
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
          className={`max-sm:[&_[role=slider]]:h-5 max-sm:[&_[data-timeline-buffered-range]]:rounded-none max-sm:[&_[data-timeline-progress]]:rounded-none max-sm:[&_[data-timeline-track]]:bottom-0 max-sm:[&_[data-timeline-track]]:top-auto max-sm:[&_[data-timeline-track]]:translate-y-0 max-sm:[&_[data-timeline-track]]:rounded-none ${mobileTimelineGeometry}`}
        />
      </div>

      <div
        data-mobile-player-corner="time"
        className="pointer-events-auto absolute bottom-2.5 left-2 flex items-center sm:bottom-2.5 sm:left-3 sm:right-58"
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
            className={`${PLAYER_SURFACE_CLASS} h-10.5 !w-11 shrink-0 rounded-full p-[3px] hover:!w-32 hover:bg-[color-mix(in_srgb,#05070b_76%,var(--accent)_8%)] focus-within:!w-32 focus-within:bg-[color-mix(in_srgb,#05070b_76%,var(--accent)_8%)]`}
            muteButtonClassName={PLAYER_VOLUME_ICON_CLASS}
          />
          <LessonTimeControl />
        </div>
      </div>

      <div
        data-mobile-player-corner="fullscreen"
        className="pointer-events-auto absolute bottom-2.5 right-2 sm:hidden"
      >
        <PlayerControlSurface
          cluster="fullscreen"
          className="inline-flex size-10.5 items-center justify-center rounded-full p-0.5"
        >
          <FullscreenButton
            className={`${PLAYER_ICON_PILL_CLASS} !size-10 !px-0`}
            iconSize={22}
          />
        </PlayerControlSurface>
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
          className="size-10.5 rounded-full p-0.5"
        >
          <LessonNavigationButton
            direction="previous"
            disabled={!canGoPrevious}
            className={`${PLAYER_INNER_CONTROL_CLASS} !size-10`}
            iconSize={20}
            onClick={onGoPrevious}
          />
        </PlayerControlSurface>
        <PlayerControlSurface
          cluster="mobile-play"
          className="size-14 rounded-full p-0.5"
        >
          <PlayButton
            className={`${PLAYER_INNER_CONTROL_CLASS} !size-13`}
            iconSize={26}
          />
        </PlayerControlSurface>
        <PlayerControlSurface
          cluster="mobile-next"
          className="size-10.5 rounded-full p-0.5"
        >
          <LessonNavigationButton
            direction="next"
            disabled={!canGoNext}
            className={`${PLAYER_INNER_CONTROL_CLASS} !size-10`}
            iconSize={20}
            onClick={onGoNext}
          />
        </PlayerControlSurface>
      </div>
    </div>
  );
}
