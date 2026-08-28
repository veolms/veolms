import { CaretDown } from "@phosphor-icons/react";
import type { ReactNode } from "react";

interface MenuTriggerContentProps {
  icon: ReactNode;
  value: ReactNode;
}

export function MenuTriggerContent({ icon, value }: MenuTriggerContentProps) {
  return (
    <>
      <span
        className="grid size-4 shrink-0 place-items-center text-white/72"
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0 truncate">{value}</span>
      <CaretDown
        className="size-3.5 shrink-0 text-white/64"
        aria-hidden="true"
      />
    </>
  );
}
