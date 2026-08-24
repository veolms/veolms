import {
  ArrowRight,
  CheckIcon,
  ClockIcon,
  Copy as CopyIcon,
  DeviceMobile,
  EnvelopeSimple,
  KeyIcon,
  LockIcon,
  ShieldCheckIcon,
  StarIcon,
  UserCircleIcon,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  ArrowRight as ArrowRightGlyph,
  Check,
  CircleAlert,
  CircleUserRound,
  Clock,
  Copy,
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
  arrowRight: { lucide: ArrowRightGlyph, phosphor: ArrowRight },
  verified: { lucide: Check, phosphor: CheckIcon },
  person: { lucide: CircleUserRound, phosphor: UserCircleIcon },
  passkey: { lucide: UserRoundKey, phosphor: KeyIcon },
  authenticator: { lucide: Lock, phosphor: LockIcon },
  recommended: { lucide: Star, phosphor: StarIcon },
  shield: { lucide: ShieldCheck, phosphor: ShieldCheckIcon },
  refreshTimer: { lucide: Clock, phosphor: ClockIcon },
  copy: { lucide: Copy, phosphor: CopyIcon },
} as const satisfies Record<string, Record<IconPack, IconGlyph>>;

export type IconName = keyof typeof iconRegistry;
