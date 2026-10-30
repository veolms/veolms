import type { ReactNode } from "react";
import { ChatCircleTextIcon as ChatCircleText } from "@phosphor-icons/react/ChatCircleText";
import { NotePencilIcon as NotePencil } from "@phosphor-icons/react/NotePencil";
import { QuestionIcon as Question } from "@phosphor-icons/react/Question";
import { ThemedSelect } from "../../ThemedSelect";
import { SettingsToggle } from "../../settings/SettingsControls";
import {
  type AccessRulesControlKey,
  AccessRulesControlStatusIndicator,
} from "./statusIndicators";
import type {
  AccessType,
  AccessDurationMode,
  DurationUnit,
  AccessRulesFormState,
} from "./accessRulesState";

export interface AccessRulesStepPanelProps {
  getAccessControlDisplayStatus: (
    controlKey: AccessRulesControlKey,
  ) => "saving" | "saved" | "failed" | null;
  isAccessRulesSaving: boolean;
  savingAccessControls: Set<string>;
  accessRules: AccessRulesFormState;
  handleAccessTypeChange: (type: AccessType) => Promise<void>;
  handleDurationModeChange: (mode: AccessDurationMode) => Promise<void>;
  handleFixedDurationValueChange: (val: number) => void;
  flushFixedDurationPersistence: () => Promise<void>;
  handleFixedDurationUnitChange: (unit: DurationUnit) => void;
  handleToggleQA: () => Promise<void>;
  handleToggleComments: () => Promise<void>;
  handleToggleNotes: () => Promise<void>;
  /** Sections plugins added to this step (PluginCourseEditorSections). */
  children?: ReactNode;
}

export function AccessRulesStepPanel({
  getAccessControlDisplayStatus,
  isAccessRulesSaving,
  savingAccessControls,
  accessRules,
  handleAccessTypeChange,
  handleDurationModeChange,
  handleFixedDurationValueChange,
  flushFixedDurationPersistence,
  handleFixedDurationUnitChange,
  handleToggleQA,
  handleToggleComments,
  handleToggleNotes,
  children,
}: AccessRulesStepPanelProps) {
  // prettier-ignore
  return (
    <div className="flex w-full flex-col gap-5">
      {/* Top Grid: 1. Who can access & 2. Access duration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-[768px]:gap-3.5 w-full min-w-0">
        {/* Card 1: Who can access this course? */}
        <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
          <div className="mb-4.5 flex items-center justify-between">
            <div>
              <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                1. Who can access this course?
              </h3>
              <p className="m-0 text-(--muted) text-[0.83rem]">
                Choose who is allowed to access this course.
              </p>
            </div>
            <AccessRulesControlStatusIndicator
              status={getAccessControlDisplayStatus("accessType")}
              testId="access-rules-status-accessType"
            />
          </div>

          <div className="flex flex-col gap-3">
            {/* Radio option: Everyone */}
            <label
              className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                isAccessRulesSaving ||
                savingAccessControls.has("accessType")
                  ? "opacity-60 cursor-not-allowed"
                  : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
              } ${
                accessRules.accessType === "everyone"
                  ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
              }`}
              onClick={() => {
                if (
                  !isAccessRulesSaving &&
                  !savingAccessControls.has("accessType")
                ) {
                  handleAccessTypeChange("everyone");
                }
              }}
            >
              <div
                className={`flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                  accessRules.accessType === "everyone"
                    ? "border-(--accent)"
                    : "border-(--muted)"
                }`}
              >
                {accessRules.accessType === "everyone" && (
                  <div className="w-2 h-2 rounded-full bg-(--accent)" />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-0.75">
                <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                  Everyone
                </strong>
                <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                  Anyone with access to the platform can access this
                  course.
                </p>
              </div>
            </label>

            {/* Radio option: Restricted access (Coming soon - Disabled) */}
            <div
              className="relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 opacity-60 cursor-not-allowed select-none border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
              aria-disabled="true"
            >
              <div className="flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--muted)" />
              <div className="flex flex-1 flex-col gap-0.75 min-w-0">
                <div className="flex items-center gap-2">
                  <strong className="text-(--text) text-[0.9rem] font-[650] leading-[18px]">
                    Restricted access
                  </strong>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wide bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                    Coming soon
                  </span>
                </div>
                <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                  Only users who meet the selected requirements can
                  access this course.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Access duration */}
        <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow)">
          <div className="mb-4.5 flex items-center justify-between">
            <div>
              <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                2. Access duration
              </h3>
              <p className="m-0 text-(--muted) text-[0.83rem]">
                Set how long learners can access this course.
              </p>
            </div>
            <AccessRulesControlStatusIndicator
              status={getAccessControlDisplayStatus("durationMode")}
              testId="access-rules-status-durationMode"
            />
          </div>

          <div className="flex flex-col gap-3">
            {/* Option 1: Lifetime access */}
            <div
              className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                isAccessRulesSaving ||
                savingAccessControls.has("durationMode")
                  ? "opacity-60 cursor-not-allowed"
                  : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
              } ${
                accessRules.durationMode === "lifetime"
                  ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
              }`}
              onClick={() =>
                !isAccessRulesSaving &&
                !savingAccessControls.has("durationMode") &&
                handleDurationModeChange("lifetime")
              }
            >
              <div
                className={`flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                  accessRules.durationMode === "lifetime"
                    ? "border-(--accent)"
                    : "border-(--muted)"
                }`}
              >
                {accessRules.durationMode === "lifetime" && (
                  <div className="w-2 h-2 rounded-full bg-(--accent)" />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-0.75">
                <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                  Lifetime access
                </strong>
                <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                  Learners can access this course forever.
                </p>
              </div>
            </div>

            {/* Option 2: Fixed duration */}
            <div
              className={`relative flex items-center gap-3.5 border rounded-xl p-3.5 px-4 transition-[border-color,background-color] duration-150 ease-out select-none ${
                isAccessRulesSaving ||
                savingAccessControls.has("durationMode")
                  ? "opacity-60 cursor-not-allowed"
                  : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
              } ${
                accessRules.durationMode === "fixed"
                  ? "is-selected border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
              }`}
              onClick={() =>
                !isAccessRulesSaving &&
                !savingAccessControls.has("durationMode") &&
                handleDurationModeChange("fixed")
              }
            >
              <div
                className={`flex w-4.5 h-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                  accessRules.durationMode === "fixed"
                    ? "border-(--accent)"
                    : "border-(--muted)"
                }`}
              >
                {accessRules.durationMode === "fixed" && (
                  <div className="w-2 h-2 rounded-full bg-(--accent)" />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-0.75">
                <strong className="text-(--text) text-[0.9rem] font-[650] leading-4.5">
                  Fixed duration
                </strong>
                <p className="m-0 text-(--muted) text-[0.8rem] leading-[1.4]">
                  Set a duration for how long learners can access
                  this course.
                </p>

                {accessRules.durationMode === "fixed" && (
                  <div
                    className="flex items-center gap-2.5 mt-3 flex-wrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="number"
                      disabled={
                        isAccessRulesSaving ||
                        savingAccessControls.has("durationMode")
                      }
                      className="w-[80px] h-9 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg px-3 py-0 text-(--text) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.84rem] font-semibold outline-none transition-[border-color] duration-150 hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] focus:border-(--accent) box-border text-center disabled:opacity-60 disabled:cursor-not-allowed"
                      min={1}
                      value={accessRules.fixedDurationValue}
                      onChange={(e) =>
                        handleFixedDurationValueChange(
                          parseInt(e.target.value, 10),
                        )
                      }
                      onBlur={() => {
                        void flushFixedDurationPersistence();
                      }}
                    />
                    <ThemedSelect
                      disabled={
                        isAccessRulesSaving ||
                        savingAccessControls.has("durationMode") ||
                        savingAccessControls.has("fixedDuration")
                      }
                      value={accessRules.fixedDurationUnit}
                      onValueChange={(val) =>
                        handleFixedDurationUnitChange(
                          val as DurationUnit,
                        )
                      }
                      options={[
                        ["Days", "Days"],
                        ["Weeks", "Weeks"],
                        ["Months", "Months"],
                        ["Years", "Years"],
                      ]}
                      ariaLabel="Select duration unit"
                      triggerClassName="!w-[130px] !h-9 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-lg !px-3.5 !py-0 !text-(--text) !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.84rem] font-semibold hover:!border-[color-mix(in_srgb,var(--text)_24%,transparent)] transition-all flex items-center justify-between disabled:!opacity-60 disabled:!cursor-not-allowed"
                    />
                    <AccessRulesControlStatusIndicator
                      status={getAccessControlDisplayStatus(
                        "fixedDuration",
                      )}
                      testId="access-rules-status-fixedDuration"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Card: 3. Learner interactions */}
      <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow) w-full">
        <div className="mb-4.5">
          <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
            3. Learner interactions
          </h3>
          <p className="m-0 text-(--muted) text-[0.83rem]">
            Manage how learners can interact within this course.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {/* Toggle 1: Q&A */}
          <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4.5 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
            <div className="flex items-center gap-3.5 min-w-0 pr-3">
              <div className="flex w-[38px] h-[38px] items-center justify-center rounded-[10px] text-(--accent) bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shrink-0">
                <Question size={20} weight="bold" />
              </div>
              <div className="min-w-0">
                <strong className="block mb-0.5 text-(--text) text-[0.9rem] font-[650]">
                  Q&A
                </strong>
                <p className="m-0 text-(--muted) text-[0.8rem]">
                  Allow learners to ask questions about lessons.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <AccessRulesControlStatusIndicator
                status={getAccessControlDisplayStatus("enableQA")}
                testId="access-rules-status-enableQA"
              />
              <SettingsToggle
                checked={accessRules.enableQA}
                disabled={
                  isAccessRulesSaving ||
                  savingAccessControls.has("enableQA")
                }
                onChange={handleToggleQA}
                label="Toggle Q&A"
              />
            </div>
          </div>

          {/* Toggle 2: Comments */}
          <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4.5 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
            <div className="flex items-center gap-3.5 min-w-0 pr-3">
              <div className="flex w-[38px] h-[38px] items-center justify-center rounded-[10px] text-(--accent) bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shrink-0">
                <ChatCircleText size={20} weight="fill" />
              </div>
              <div className="min-w-0">
                <strong className="block mb-0.5 text-(--text) text-[0.9rem] font-[650]">
                  Comments
                </strong>
                <p className="m-0 text-(--muted) text-[0.8rem]">
                  Allow learners to comment on course content.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <AccessRulesControlStatusIndicator
                status={getAccessControlDisplayStatus(
                  "enableComments",
                )}
                testId="access-rules-status-enableComments"
              />
              <SettingsToggle
                checked={accessRules.enableComments}
                disabled={
                  isAccessRulesSaving ||
                  savingAccessControls.has("enableComments")
                }
                onChange={handleToggleComments}
                label="Toggle Comments"
              />
            </div>
          </div>

          {/* Toggle 3: Notes */}
          <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4.5 py-3.5 bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]">
            <div className="flex items-center gap-3.5 min-w-0 pr-3">
              <div className="flex w-[38px] h-[38px] items-center justify-center rounded-[10px] text-(--accent) bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shrink-0">
                <NotePencil size={20} weight="bold" />
              </div>
              <div className="min-w-0">
                <strong className="block mb-0.5 text-(--text) text-[0.9rem] font-[650]">
                  Notes
                </strong>
                <p className="m-0 text-(--muted) text-[0.8rem]">
                  Allow learners to take notes while learning.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <AccessRulesControlStatusIndicator
                status={getAccessControlDisplayStatus(
                  "enableNotes",
                )}
                testId="access-rules-status-enableNotes"
              />
              <SettingsToggle
                checked={accessRules.enableNotes}
                disabled={
                  isAccessRulesSaving ||
                  savingAccessControls.has("enableNotes")
                }
                onChange={handleToggleNotes}
                label="Toggle Notes"
              />
            </div>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
