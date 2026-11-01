import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type { CourseWizardStepId } from "./wizardSteps";

export interface CourseEditorMobileStepStatusProps {
  activeStep: CourseWizardStepId;
  basicsOverallStatus: "saving" | "failed" | "saved" | null;
  bottomNavHidden: boolean;
  curriculumOverallStatus: "saving" | "failed" | "saved" | null;
  accessRulesOverallStatus: "saving" | "failed" | "saved" | null;
  pricingOverallStatus: "saving" | "failed" | "saved" | null;
  extrasOverallStatus: "saving" | "failed" | "saved" | null;
  publishOverallStatus: "saving" | "failed" | "saved" | null;
}

export function CourseEditorMobileStepStatus({
  activeStep,
  basicsOverallStatus,
  bottomNavHidden,
  curriculumOverallStatus,
  accessRulesOverallStatus,
  pricingOverallStatus,
  extrasOverallStatus,
  publishOverallStatus,
}: CourseEditorMobileStepStatusProps) {
  // prettier-ignore
  return (
    <>
      {activeStep === "basics" && basicsOverallStatus && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-[136] pointer-events-none min-[641px]:hidden transition-all duration-200 select-none ${
            bottomNavHidden
              ? "opacity-0 translate-y-3 pointer-events-none"
              : "opacity-100 translate-y-0"
          }`}
          style={{
            bottom:
              "calc(58px + var(--app-viewport-safe-area-bottom, 0px) + 72px)",
          }}
          data-testid="basics-overall-save-status-mobile"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.75rem] font-medium bg-[color-mix(in_srgb,var(--surface-strong)_95%,transparent)] border border-[color-mix(in_srgb,var(--border)_80%,transparent)] shadow-md backdrop-blur-sm">
            {basicsOverallStatus === "saving" && (
              <>
                <CircleNotch
                  size={13}
                  className="animate-spin text-(--accent)"
                />
                <span className="text-(--text-secondary)">
                  Saving changes...
                </span>
              </>
            )}
            {basicsOverallStatus === "failed" && (
              <>
                <WarningCircle
                  size={13}
                  weight="fill"
                  className="text-rose-500 shrink-0"
                />
                <span className="text-rose-500">Save failed</span>
              </>
            )}
            {basicsOverallStatus === "saved" && (
              <>
                <CheckCircle
                  size={13}
                  weight="fill"
                  className="text-emerald-500 shrink-0"
                />
                <span className="text-emerald-500">All changes saved</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sticky / Fixed Bottom Save Status Pill (Curriculum only, above mobile bar) */}
      {activeStep === "curriculum" && curriculumOverallStatus && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-[136] pointer-events-none min-[641px]:hidden transition-all duration-200 select-none ${
            bottomNavHidden
              ? "opacity-0 translate-y-3 pointer-events-none"
              : "opacity-100 translate-y-0"
          }`}
          style={{
            bottom:
              "calc(58px + var(--app-viewport-safe-area-bottom, 0px) + 72px)",
          }}
          data-testid="curriculum-overall-save-status-mobile"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.75rem] font-medium bg-[color-mix(in_srgb,var(--surface-strong)_95%,transparent)] border border-[color-mix(in_srgb,var(--border)_80%,transparent)] shadow-md backdrop-blur-sm">
            {curriculumOverallStatus === "saving" && (
              <>
                <CircleNotch
                  size={13}
                  className="animate-spin text-(--accent)"
                />
                <span className="text-(--text-secondary)">
                  Saving changes...
                </span>
              </>
            )}
            {curriculumOverallStatus === "failed" && (
              <>
                <WarningCircle
                  size={13}
                  weight="fill"
                  className="text-rose-500 shrink-0"
                />
                <span className="text-rose-500">Save failed</span>
              </>
            )}
            {curriculumOverallStatus === "saved" && (
              <>
                <CheckCircle
                  size={13}
                  weight="fill"
                  className="text-emerald-500 shrink-0"
                />
                <span className="text-emerald-500">All changes saved</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sticky / Fixed Bottom Save Status Pill (Access Rules only, above mobile bar) */}
      {activeStep === "access-rules" && accessRulesOverallStatus && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-[136] pointer-events-none min-[641px]:hidden transition-all duration-200 select-none ${
            bottomNavHidden
              ? "opacity-0 translate-y-3 pointer-events-none"
              : "opacity-100 translate-y-0"
          }`}
          style={{
            bottom:
              "calc(58px + var(--app-viewport-safe-area-bottom, 0px) + 72px)",
          }}
          data-testid="access-rules-overall-save-status-mobile"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.75rem] font-medium bg-[color-mix(in_srgb,var(--surface-strong)_95%,transparent)] border border-[color-mix(in_srgb,var(--border)_80%,transparent)] shadow-md backdrop-blur-sm">
            {accessRulesOverallStatus === "saving" && (
              <>
                <CircleNotch
                  size={13}
                  className="animate-spin text-(--accent)"
                />
                <span className="text-(--text-secondary)">
                  Saving changes...
                </span>
              </>
            )}
            {accessRulesOverallStatus === "failed" && (
              <>
                <WarningCircle
                  size={13}
                  weight="fill"
                  className="text-rose-500 shrink-0"
                />
                <span className="text-rose-500">Save failed</span>
              </>
            )}
            {accessRulesOverallStatus === "saved" && (
              <>
                <CheckCircle
                  size={13}
                  weight="fill"
                  className="text-emerald-500 shrink-0"
                />
                <span className="text-emerald-500">All changes saved</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sticky / Fixed Bottom Save Status Pill (Pricing only, above mobile bar) */}
      {activeStep === "pricing" && pricingOverallStatus && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-[136] pointer-events-none min-[641px]:hidden transition-all duration-200 select-none ${
            bottomNavHidden
              ? "opacity-0 translate-y-3 pointer-events-none"
              : "opacity-100 translate-y-0"
          }`}
          style={{
            bottom:
              "calc(58px + var(--app-viewport-safe-area-bottom, 0px) + 72px)",
          }}
          data-testid="pricing-overall-save-status-mobile"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.75rem] font-medium bg-[color-mix(in_srgb,var(--surface-strong)_95%,transparent)] border border-[color-mix(in_srgb,var(--border)_80%,transparent)] shadow-md backdrop-blur-sm">
            {pricingOverallStatus === "saving" && (
              <>
                <CircleNotch
                  size={13}
                  className="animate-spin text-(--accent)"
                />
                <span className="text-(--text-secondary)">
                  Saving changes...
                </span>
              </>
            )}
            {pricingOverallStatus === "failed" && (
              <>
                <WarningCircle
                  size={13}
                  weight="fill"
                  className="text-rose-500 shrink-0"
                />
                <span className="text-rose-500">Save failed</span>
              </>
            )}
            {pricingOverallStatus === "saved" && (
              <>
                <CheckCircle
                  size={13}
                  weight="fill"
                  className="text-emerald-500 shrink-0"
                />
                <span className="text-emerald-500">All changes saved</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sticky / Fixed Bottom Save Status Pill (Extras only, above mobile bar) */}
      {activeStep === "extras" && extrasOverallStatus && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-[136] pointer-events-none min-[641px]:hidden transition-all duration-200 select-none ${
            bottomNavHidden
              ? "opacity-0 translate-y-3 pointer-events-none"
              : "opacity-100 translate-y-0"
          }`}
          style={{
            bottom:
              "calc(58px + var(--app-viewport-safe-area-bottom, 0px) + 72px)",
          }}
          data-testid="extras-overall-save-status-mobile"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.75rem] font-medium bg-[color-mix(in_srgb,var(--surface-strong)_95%,transparent)] border border-[color-mix(in_srgb,var(--border)_80%,transparent)] shadow-md backdrop-blur-sm">
            {extrasOverallStatus === "saving" && (
              <>
                <CircleNotch
                  size={13}
                  className="animate-spin text-(--accent)"
                />
                <span className="text-(--text-secondary)">
                  Saving changes...
                </span>
              </>
            )}
            {extrasOverallStatus === "failed" && (
              <>
                <WarningCircle
                  size={13}
                  weight="fill"
                  className="text-rose-500 shrink-0"
                />
                <span className="text-rose-500">Save failed</span>
              </>
            )}
            {extrasOverallStatus === "saved" && (
              <>
                <CheckCircle
                  size={13}
                  weight="fill"
                  className="text-emerald-500 shrink-0"
                />
                <span className="text-emerald-500">All changes saved</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sticky / Fixed Bottom Save Status Pill (Publish only, above mobile bar) */}
      {activeStep === "publish" && publishOverallStatus && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-[136] pointer-events-none min-[641px]:hidden transition-all duration-200 select-none ${
            bottomNavHidden
              ? "opacity-0 translate-y-3 pointer-events-none"
              : "opacity-100 translate-y-0"
          }`}
          style={{
            bottom:
              "calc(58px + var(--app-viewport-safe-area-bottom, 0px) + 72px)",
          }}
          data-testid="publish-overall-save-status-mobile"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.75rem] font-medium bg-[color-mix(in_srgb,var(--surface-strong)_95%,transparent)] border border-[color-mix(in_srgb,var(--border)_80%,transparent)] shadow-md backdrop-blur-sm">
            {publishOverallStatus === "saving" && (
              <>
                <CircleNotch
                  size={13}
                  className="animate-spin text-(--accent)"
                />
                <span className="text-(--text-secondary)">
                  Saving changes...
                </span>
              </>
            )}
            {publishOverallStatus === "failed" && (
              <>
                <WarningCircle
                  size={13}
                  weight="fill"
                  className="text-rose-500 shrink-0"
                />
                <span className="text-rose-500">Save failed</span>
              </>
            )}
            {publishOverallStatus === "saved" && (
              <>
                <CheckCircle
                  size={13}
                  weight="fill"
                  className="text-emerald-500 shrink-0"
                />
                <span className="text-emerald-500">All changes saved</span>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
