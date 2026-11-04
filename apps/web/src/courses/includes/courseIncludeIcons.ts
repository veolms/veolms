import { BookOpenIcon } from "@phosphor-icons/react/BookOpen";
import { BriefcaseIcon } from "@phosphor-icons/react/Briefcase";
import { CalendarCheckIcon } from "@phosphor-icons/react/CalendarCheck";
import { CertificateIcon } from "@phosphor-icons/react/Certificate";
import { ChartLineUpIcon } from "@phosphor-icons/react/ChartLineUp";
import { ChatsCircleIcon } from "@phosphor-icons/react/ChatsCircle";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { ClockIcon } from "@phosphor-icons/react/Clock";
import { CodeIcon } from "@phosphor-icons/react/Code";
import { DevicesIcon } from "@phosphor-icons/react/Devices";
import { DownloadSimpleIcon } from "@phosphor-icons/react/DownloadSimple";
import { FileTextIcon } from "@phosphor-icons/react/FileText";
import { FolderOpenIcon } from "@phosphor-icons/react/FolderOpen";
import { GiftIcon } from "@phosphor-icons/react/Gift";
import { GraduationCapIcon } from "@phosphor-icons/react/GraduationCap";
import { HeadsetIcon } from "@phosphor-icons/react/Headset";
import { InfinityIcon } from "@phosphor-icons/react/Infinity";
import { LifebuoyIcon } from "@phosphor-icons/react/Lifebuoy";
import { LightningIcon } from "@phosphor-icons/react/Lightning";
import { MedalIcon } from "@phosphor-icons/react/Medal";
import { MonitorPlayIcon } from "@phosphor-icons/react/MonitorPlay";
import { PuzzlePieceIcon } from "@phosphor-icons/react/PuzzlePiece";
import { RocketIcon } from "@phosphor-icons/react/Rocket";
import { ShieldCheckIcon } from "@phosphor-icons/react/ShieldCheck";
import { StarIcon } from "@phosphor-icons/react/Star";
import { TargetIcon } from "@phosphor-icons/react/Target";
import { TerminalWindowIcon } from "@phosphor-icons/react/TerminalWindow";
import { TrophyIcon } from "@phosphor-icons/react/Trophy";
import { UsersThreeIcon } from "@phosphor-icons/react/UsersThree";
import { VideoCameraIcon } from "@phosphor-icons/react/VideoCamera";
import type { Icon } from "@phosphor-icons/react";
import {
  COURSE_INCLUDE_PALETTE,
  type CourseIncludeIcon,
} from "@veolms/contracts";

/** The glyph of each icon a "This course includes" line can carry. */
export const COURSE_INCLUDE_ICON_GLYPHS: Record<CourseIncludeIcon, Icon> = {
  "calendar-check": CalendarCheckIcon,
  "monitor-play": MonitorPlayIcon,
  certificate: CertificateIcon,
  "chats-circle": ChatsCircleIcon,
  devices: DevicesIcon,
  "check-circle": CheckCircleIcon,
  "download-simple": DownloadSimpleIcon,
  code: CodeIcon,
  rocket: RocketIcon,
  "puzzle-piece": PuzzlePieceIcon,
  infinity: InfinityIcon,
  "users-three": UsersThreeIcon,
  briefcase: BriefcaseIcon,
  headset: HeadsetIcon,
  trophy: TrophyIcon,
  lightning: LightningIcon,
  target: TargetIcon,
  star: StarIcon,
  "book-open": BookOpenIcon,
  "file-text": FileTextIcon,
  "folder-open": FolderOpenIcon,
  clock: ClockIcon,
  "chart-line-up": ChartLineUpIcon,
  "shield-check": ShieldCheckIcon,
  gift: GiftIcon,
  "video-camera": VideoCameraIcon,
  "terminal-window": TerminalWindowIcon,
  "graduation-cap": GraduationCapIcon,
  medal: MedalIcon,
  lifebuoy: LifebuoyIcon,
};

/** The glyph for a stored icon key; a check mark for none or an unknown one. */
export function courseIncludeGlyph(icon: string | null | undefined): Icon {
  return (
    COURSE_INCLUDE_ICON_GLYPHS[icon as CourseIncludeIcon] ?? CheckCircleIcon
  );
}

/**
 * Icons whose duotone fill is a plain box behind an open shape (the
 * download arrow, the code brackets, the chart line), which looks like a
 * stray square. They are drawn as outlines; the rest keep the fill, which
 * follows their closed outline.
 */
const OUTLINE_ONLY_ICONS = new Set<string>([
  "download-simple",
  "code",
  "chart-line-up",
]);

/** How an icon is drawn: duotone, or a plain outline for the few above. */
export function courseIncludeIconWeight(
  icon: string | null | undefined,
): "duotone" | "regular" {
  return icon && OUTLINE_ONLY_ICONS.has(icon) ? "regular" : "duotone";
}

/** The colour lines saved before colours existed are drawn in. */
export const FALLBACK_INCLUDE_COLOR = "#2dd4bf";

/**
 * A colour for a new line: the first of the palette no other line uses, so
 * neighbouring icons differ; once all are taken, any of them.
 */
export function pickIncludeColor(used: Iterable<string | null | undefined>) {
  const taken = new Set(
    [...used].filter(Boolean).map((color) => color!.toLowerCase()),
  );
  const free = COURSE_INCLUDE_PALETTE.find((color) => !taken.has(color));
  return (
    free ??
    COURSE_INCLUDE_PALETTE[
      Math.floor(Math.random() * COURSE_INCLUDE_PALETTE.length)
    ]!
  );
}
