import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { ChecksIcon as Checks } from "@phosphor-icons/react/Checks";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";

import { cn } from "../lib/utils";

/**
 * WhatsApp's ticks on your own message: a clock while sending, one grey
 * tick once sent, two grey ticks once delivered (in a group: to everyone),
 * two blue ticks once read (in a group: by everyone). `deliveredSeq` /
 * `readSeq` are how far the others have got; null when there is nobody
 * else, or read receipts are off.
 */
export function StatusTicks({
  seq,
  deliveredSeq,
  readSeq,
  className,
}: {
  seq: number;
  deliveredSeq: number | null;
  readSeq: number | null;
  className?: string;
}) {
  if (seq <= 0) {
    return (
      <Clock
        size={13}
        className={cn("shrink-0", className)}
        aria-label="Sending"
      />
    );
  }
  if (readSeq !== null && readSeq >= seq) {
    return (
      <Checks
        size={16}
        weight="bold"
        className={cn("shrink-0 text-(--chat-read)", className)}
        aria-label="Read"
      />
    );
  }
  if (deliveredSeq !== null && deliveredSeq >= seq) {
    return (
      <Checks
        size={16}
        weight="bold"
        className={cn("shrink-0", className)}
        aria-label="Delivered"
      />
    );
  }
  return (
    <Check
      size={14}
      weight="bold"
      className={cn("shrink-0", className)}
      aria-label="Sent"
    />
  );
}
