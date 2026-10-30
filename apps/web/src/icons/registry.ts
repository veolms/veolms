import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { ClockIcon } from "@phosphor-icons/react/Clock";
import { Copy as CopyIcon } from "@phosphor-icons/react/Copy";
import { DeviceMobile } from "@phosphor-icons/react/DeviceMobile";
import { DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { KeyIcon } from "@phosphor-icons/react/Key";
import { LockIcon } from "@phosphor-icons/react/Lock";
import { ShieldCheckIcon } from "@phosphor-icons/react/ShieldCheck";
import { StarIcon } from "@phosphor-icons/react/Star";
import { UserCircleIcon } from "@phosphor-icons/react/UserCircle";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import {
  ArrowLeft as ArrowLeftGlyph,
  ArrowRight as ArrowRightGlyph,
  Check,
  CircleAlert,
  CircleUserRound,
  Clock,
  Copy,
  Download,
  Lock,
  Mail,
  UserRoundKey,
  ShieldCheck,
  Smartphone,
  Star,
} from "lucide-react";
import type { ComponentType } from "react";

export const ICON_PACKS = ["lucide", "phosphor"] as const;

export type IconPack = (typeof ICON_PACKS)[number];

export type IconEmphasis = "regular" | "bold" | "fill";

export interface IconGlyphProps {
  size?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
  weight?: IconEmphasis;
  strokeWidth?: number;
}

export type IconGlyph = ComponentType<IconGlyphProps>;

export const iconRegistry = {
  email: { lucide: Mail, phosphor: EnvelopeSimple },
  mobile: { lucide: Smartphone, phosphor: DeviceMobile },
  validationError: { lucide: CircleAlert, phosphor: WarningCircle },
  arrowLeft: { lucide: ArrowLeftGlyph, phosphor: ArrowLeft },
  arrowRight: { lucide: ArrowRightGlyph, phosphor: ArrowRight },
  verified: { lucide: Check, phosphor: CheckIcon },
  person: { lucide: CircleUserRound, phosphor: UserCircleIcon },
  passkey: { lucide: UserRoundKey, phosphor: KeyIcon },
  authenticator: { lucide: Lock, phosphor: LockIcon },
  lock: { lucide: Lock, phosphor: LockIcon },
  recommended: { lucide: Star, phosphor: StarIcon },
  shield: { lucide: ShieldCheck, phosphor: ShieldCheckIcon },
  refreshTimer: { lucide: Clock, phosphor: ClockIcon },
  copy: { lucide: Copy, phosphor: CopyIcon },
  download: { lucide: Download, phosphor: DownloadSimple },
} as const satisfies Record<string, Record<IconPack, IconGlyph>>;

export type IconName = keyof typeof iconRegistry;
