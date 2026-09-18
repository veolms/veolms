import { ShieldWarningIcon as ShieldWarning } from "@phosphor-icons/react/ShieldWarning";
import { Button } from "../components/Button";
import type { NavigateTo } from "../routing/navigation";
import { surfaceClass } from "./couponHelpers";

export interface CouponsAccessDeniedProps {
  onNavigatePage?: NavigateTo;
}

export function CouponsAccessDenied({ onNavigatePage }: CouponsAccessDeniedProps) {
  return (
    <main data-coupon-surface="" className="mx-auto grid w-full max-w-[1320px] gap-3.5 sm:gap-6">
      <div className={`${surfaceClass} grid place-items-center p-10 text-center`}>
        <span className="flex size-11 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
          <ShieldWarning size={24} weight="bold" />
        </span>
        <h2 className="mt-3 text-lg font-semibold">Access denied</h2>
        <p className="mt-1 max-w-md text-sm text-(--muted)">
          Coupon management is available to academy administrators and
          instructors.
        </p>
        <div className="mt-4">
          <Button onClick={() => onNavigatePage?.("/courses")}>
            Return to courses
          </Button>
        </div>
      </div>
    </main>
  );
}
