import { useMemo, useState } from "react";
import {
  DEFAULT_MARKETING_AUDIENCE,
  MARKETING_THEME_COLORS,
  type MarketingDesign,
  MARKETING_AUTOMATIONS,
  MARKETING_NAME_MAX,
  MARKETING_PREHEADER_MAX,
  MARKETING_SUBJECT_MAX,
  marketingBlockSchema,
  marketingEmailProblems,
  type MarketingAudience,
  type MarketingAutomationKey,
  type MarketingAutomationSettings,
  type MarketingBlock,
  type MarketingEmail,
  type UpdateMarketingEmailRequest,
} from "@veolms/contracts";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { PaperPlaneRightIcon as PaperPlaneRight } from "@phosphor-icons/react/PaperPlaneRight";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { Button } from "../components/Button";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { ThemedDateTimePicker } from "../ThemedDateTimePicker";
import { ThemedSelect } from "../ThemedSelect";
import { getApiError } from "../lib/api-error";
import { useAutosync } from "../lib/autosync";
import type { NavigateTo } from "../routing/navigation";
import {
  useCancelMarketingEmail,
  useMarketingAudienceCount,
  useMarketingAudienceOptions,
  useScheduleMarketingEmail,
  useSendMarketingTest,
  useSetMarketingAutomationActive,
  useUpdateMarketingEmail,
} from "../services/marketing";
import { ConfirmActionModal } from "../shell/ConfirmActionModal";
import { WorkshopSaveStatus } from "../workshops/WorkshopSaveStatus";
import {
  fieldClass,
  inputClass,
  selectTriggerClass,
  surfaceClass,
} from "../workshops/workshopHelpers";
import { MarketingAudiencePicker } from "./MarketingAudiencePicker";
import { MarketingBlockEditor } from "./MarketingBlockEditor";
import { MarketingDesignPanel } from "./MarketingDesignPanel";
import { MarketingPreview } from "./MarketingPreview";
import { MarketingReport } from "./MarketingReport";
import {
  MARKETING_AUTOMATIONS_PATH,
  MARKETING_PATH,
  audienceIsComplete,
  blockLabel,
  emailStatusClass,
  emailStatusLabel,
  formatCount,
  formatWhen,
} from "./marketingHelpers";

interface FormState {
  name: string;
  subject: string;
  preheader: string;
  blocks: MarketingBlock[];
  design: MarketingDesign;
  audience: MarketingAudience;
  settings: MarketingAutomationSettings | null;
}

function formFrom(email: MarketingEmail): FormState {
  return {
    name: email.name,
    subject: email.subject,
    preheader: email.preheader,
    blocks: email.blocks,
    design: email.design,
    audience: email.audience ?? DEFAULT_MARKETING_AUDIENCE,
    settings: email.settings,
  };
}

/** The first thing that stops the draft from saving, in plain words. */
function blockProblem(blocks: readonly MarketingBlock[]): string | null {
  for (const [index, block] of blocks.entries()) {
    const parsed = marketingBlockSchema.safeParse(block);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Finish this block";
      return `${blockLabel(block)} (block ${index + 1}): ${message.replace(/^Invalid.*$/u, "finish this block")}`;
    }
  }
  return null;
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <h2 className="m-0 text-base font-bold tracking-tight text-(--text)">
        {title}
      </h2>
      {description ? (
        <p className="mt-0.5 mb-0 text-[13px] text-(--muted)">{description}</p>
      ) : null}
    </div>
  );
}

function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <label
        htmlFor={htmlFor}
        className="block text-[13px] font-medium text-(--text)"
      >
        {children}
      </label>
      {hint ? <span className="text-[12px] text-(--muted)">{hint}</span> : null}
    </div>
  );
}

const SUBJECT_WORDS = [
  ["{first_name}", "First name"],
  ["{academy_name}", "Academy name"],
] as const;

function tomorrowAtTen(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T10:00`;
}

export function MarketingEmailEditor({
  email,
  onNavigatePage,
  setNotice,
}: {
  email: MarketingEmail;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}) {
  const isAutomation = email.kind === "automation";
  const automationKey = (email.automationKey ??
    null) as MarketingAutomationKey | null;
  const meta = automationKey ? MARKETING_AUTOMATIONS[automationKey] : null;
  const update = useUpdateMarketingEmail();
  const schedule = useScheduleMarketingEmail();
  const cancel = useCancelMarketingEmail();
  const sendTest = useSendMarketingTest();
  const setActive = useSetMarketingAutomationActive();
  const options = useMarketingAudienceOptions({
    enabled: Boolean(meta?.perCourse),
  });
  const [confirm, setConfirm] = useState<"now" | "later" | null>(null);
  const [sendAt, setSendAt] = useState(tomorrowAtTen());
  const [actionError, setActionError] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const autosync = useAutosync<FormState, MarketingEmail>({
    key: { entity: "marketing-email", entityId: email.id, scope: "editor" },
    initialValue: formFrom(email),
    debounceMs: 1_200,
    maxWaitMs: 30_000,
    validate: (draft) => {
      if (!draft.name.trim())
        return { valid: false, message: "Name the email to save it" };
      const problem = blockProblem(draft.blocks);
      return problem ? { valid: false, message: problem } : true;
    },
    sync: async (draft) => {
      const body: UpdateMarketingEmailRequest = {
        name: draft.name,
        subject: draft.subject,
        preheader: draft.preheader,
        blocks: draft.blocks,
        design: draft.design,
        ...(!isAutomation && audienceIsComplete(draft.audience)
          ? { audience: draft.audience }
          : {}),
        ...(isAutomation && draft.settings ? { settings: draft.settings } : {}),
      };
      return update.mutateAsync({ id: email.id, body });
    },
    onSynced: (saved, submitted) => ({
      ...formFrom(saved),
      audience: submitted.audience,
    }),
  });
  const form = autosync.value;
  const patch = (changes: Partial<FormState>) =>
    autosync.update((current) => ({ ...current, ...changes }));

  const problems = useMemo(
    () => [
      ...marketingEmailProblems({ subject: form.subject, blocks: form.blocks }),
      ...(blockProblem(form.blocks) ? ["Finish the blocks marked above."] : []),
      ...(!isAutomation && !audienceIsComplete(form.audience)
        ? ["Choose who gets this email."]
        : []),
    ],
    [form, isAutomation],
  );
  const count = useMarketingAudienceCount(
    !isAutomation && confirm && audienceIsComplete(form.audience)
      ? form.audience
      : null,
  );

  const scheduled = email.status === "scheduled";
  const backPath = isAutomation ? MARKETING_AUTOMATIONS_PATH : MARKETING_PATH;

  async function runSchedule() {
    setActionError(null);
    try {
      await autosync.flush();
      const when = confirm === "later" ? new Date(sendAt).toISOString() : null;
      const saved = await schedule.mutateAsync({ id: email.id, sendAt: when });
      setConfirm(null);
      setNotice?.(
        when
          ? `Scheduled for ${formatWhen(saved.scheduledAt ?? when)}.`
          : "Sending now. You can follow it here.",
      );
    } catch (error) {
      setActionError(getApiError(error).message);
    }
  }

  async function runTest() {
    setTestMessage(null);
    try {
      await autosync.flush();
      const result = await sendTest.mutateAsync(email.id);
      setTestMessage(`Test sent to ${result.sentTo}.`);
    } catch (error) {
      setTestMessage(getApiError(error).message);
    }
  }

  async function toggleAutomation(next: boolean) {
    if (!automationKey) return;
    setActionError(null);
    try {
      await autosync.flush();
      await setActive.mutateAsync({ key: automationKey, active: next });
      setNotice?.(
        next
          ? `${meta?.title ?? "Automation"} is on.`
          : `${meta?.title ?? "Automation"} is off.`,
      );
    } catch (error) {
      setActionError(getApiError(error).message);
    }
  }

  return (
    <main
      className="mx-auto grid w-full max-w-[1800px] gap-6"
      aria-labelledby="marketing-editor-title"
    >
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onNavigatePage?.(backPath)}
            className="mb-4 inline-flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-sm font-medium text-(--muted) hover:text-(--text)"
          >
            <ArrowLeft size={16} weight="bold" />
            {isAutomation ? "Back to automations" : "Back to emails"}
          </button>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1
              id="marketing-editor-title"
              className="m-0 min-w-0 truncate text-[clamp(1.6rem,2.2vw,2rem)] font-bold leading-tight tracking-[-0.035em] text-(--text)"
            >
              {meta?.title ?? (form.name || "Untitled email")}
            </h1>
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${emailStatusClass(email.status)}`}
            >
              {emailStatusLabel(email.status)}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="m-0 text-[0.88rem] leading-6 text-(--muted)">
              {meta
                ? meta.description
                : "Write it, choose who gets it, then send it now or schedule it."}
            </p>
            <WorkshopSaveStatus
              status={autosync.status}
              error={autosync.error}
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <Button
            variant="quiet"
            className="xl:hidden"
            onClick={() =>
              document
                .getElementById("marketing-preview")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            <Eye size={16} />
            Preview
          </Button>
          {isAutomation ? (
            <label className="inline-flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--surface) px-4 py-2.5">
              <span className="text-sm font-semibold text-(--text)">
                {email.status === "active"
                  ? "On: sending automatically"
                  : "Off"}
              </span>
              <ToggleSwitch
                checked={email.status === "active"}
                onChange={(next) => void toggleAutomation(next)}
                label={email.status === "active" ? "Turn off" : "Turn on"}
                disabled={
                  setActive.isPending ||
                  (email.status !== "active" && problems.length > 0)
                }
              />
            </label>
          ) : scheduled ? (
            <>
              <Button
                variant="quiet"
                onClick={() =>
                  void cancel
                    .mutateAsync(email.id)
                    .catch((error: unknown) =>
                      setActionError(getApiError(error).message),
                    )
                }
                disabled={cancel.isPending}
              >
                Unschedule
              </Button>
              <Button
                onClick={() => setConfirm("now")}
                disabled={problems.length > 0}
              >
                <PaperPlaneRight size={16} weight="bold" />
                Send now instead
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="quiet"
                onClick={() => setConfirm("later")}
                disabled={problems.length > 0}
              >
                <CalendarBlank size={16} />
                Schedule
              </Button>
              <Button
                onClick={() => setConfirm("now")}
                disabled={problems.length > 0}
              >
                <PaperPlaneRight size={16} weight="bold" />
                Send now
              </Button>
            </>
          )}
        </div>
      </header>

      {scheduled && email.scheduledAt ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-(--accent)/25 bg-(--accent)/8 px-4 py-3 text-sm text-(--text)">
          <CalendarBlank size={18} className="shrink-0 text-(--accent)" />
          <span>
            Scheduled for <strong>{formatWhen(email.scheduledAt)}</strong>. You
            can still edit it until then.
          </span>
        </div>
      ) : null}

      {actionError ? (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500"
        >
          <WarningCircle size={18} weight="bold" className="shrink-0" />
          <span>{actionError}</span>
        </div>
      ) : null}

      <div className="grid w-full min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.8fr)]">
        <div className="grid min-w-0 gap-5">
          <section
            className={`${surfaceClass} grid gap-5 p-5 sm:p-6`}
            aria-label="Details"
          >
            <SectionTitle
              title="Details"
              description="What people see in their inbox before they open it."
            />
            {!isAutomation ? (
              <div className="min-w-0">
                <FieldLabel
                  htmlFor="marketing-name"
                  hint="Only your team sees this"
                >
                  Email name
                </FieldLabel>
                <input
                  id="marketing-name"
                  type="text"
                  value={form.name}
                  maxLength={MARKETING_NAME_MAX}
                  onChange={(event) => patch({ name: event.target.value })}
                  placeholder="November launch"
                  className={`${fieldClass} w-full`}
                />
              </div>
            ) : null}
            <div className="min-w-0">
              <FieldLabel
                htmlFor="marketing-subject"
                hint={`${form.subject.length}/${MARKETING_SUBJECT_MAX}`}
              >
                Subject line
              </FieldLabel>
              <input
                id="marketing-subject"
                type="text"
                value={form.subject}
                maxLength={MARKETING_SUBJECT_MAX}
                onChange={(event) => patch({ subject: event.target.value })}
                placeholder="Hi {first_name}, our new course is open"
                className={`${fieldClass} w-full`}
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] text-(--muted)">Insert:</span>
                {SUBJECT_WORDS.map(([token, label]) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() =>
                      patch({
                        subject:
                          `${form.subject}${form.subject.endsWith(" ") || !form.subject ? "" : " "}${token}`.slice(
                            0,
                            MARKETING_SUBJECT_MAX,
                          ),
                      })
                    }
                    className="cursor-pointer rounded-md border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-transparent px-2 py-0.5 text-[11.5px] font-semibold text-(--text-secondary,var(--text)) hover:border-(--accent)/40 hover:text-(--accent)"
                  >
                    {label}
                  </button>
                ))}
                {meta?.aboutCourse ? (
                  <button
                    type="button"
                    onClick={() =>
                      patch({
                        subject: `${form.subject} {course_title}`
                          .trim()
                          .slice(0, MARKETING_SUBJECT_MAX),
                      })
                    }
                    className="cursor-pointer rounded-md border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-transparent px-2 py-0.5 text-[11.5px] font-semibold text-(--text-secondary,var(--text)) hover:border-(--accent)/40 hover:text-(--accent)"
                  >
                    Course name
                  </button>
                ) : null}
              </div>
            </div>
            <div className="min-w-0">
              <FieldLabel htmlFor="marketing-preheader" hint="Optional">
                Preview text
              </FieldLabel>
              <input
                id="marketing-preheader"
                type="text"
                value={form.preheader}
                maxLength={MARKETING_PREHEADER_MAX}
                onChange={(event) => patch({ preheader: event.target.value })}
                placeholder="The grey line after the subject in Gmail"
                className={`${inputClass} h-11 w-full rounded-xl`}
              />
            </div>
          </section>

          <section
            className={`${surfaceClass} grid gap-4 p-5 sm:p-6`}
            aria-label="Design"
          >
            <SectionTitle
              title="Design"
              description="Pick a look. Colours, font and logo apply to the whole email."
            />
            <MarketingDesignPanel
              design={form.design}
              onChange={(design) => patch({ design })}
            />
          </section>

          <section
            className={`${surfaceClass} grid gap-4 p-5 sm:p-6`}
            aria-label="Content"
          >
            <SectionTitle
              title="Content"
              description="Build the email from blocks. Use + to add one anywhere; drag or use the arrows to reorder."
            />
            <MarketingBlockEditor
              blocks={form.blocks}
              onChange={(blocks) => patch({ blocks })}
              aboutCourse={Boolean(meta?.aboutCourse)}
              accentColor={
                form.design.accent ??
                MARKETING_THEME_COLORS[form.design.theme].accent
              }
            />
          </section>

          {isAutomation && meta && form.settings ? (
            <section
              className={`${surfaceClass} grid gap-4 p-5 sm:p-6`}
              aria-label="When it sends"
            >
              <SectionTitle
                title="When it sends"
                description={
                  meta.stopsWhen
                    ? `Each person gets it once. It's skipped if: ${meta.stopsWhen.toLowerCase()}.`
                    : "Each person gets it once."
                }
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <FieldLabel
                    htmlFor="marketing-wait"
                    hint={`${meta.min}–${meta.max} ${meta.unit}`}
                  >
                    {meta.waitLabel}
                  </FieldLabel>
                  <div className="flex items-center gap-2">
                    <input
                      id="marketing-wait"
                      type="number"
                      inputMode="numeric"
                      min={meta.min}
                      max={meta.max}
                      value={form.settings.wait}
                      onChange={(event) => {
                        const value = Math.max(
                          meta.min,
                          Math.min(
                            meta.max,
                            Math.round(Number(event.target.value) || 0),
                          ),
                        );
                        patch({ settings: { ...form.settings!, wait: value } });
                      }}
                      className={`${fieldClass} w-28`}
                    />
                    <span className="text-sm text-(--muted)">
                      {meta.unit}
                      {meta.unit === "hours" && form.settings.wait === 0
                        ? " (right away)"
                        : ""}
                    </span>
                  </div>
                </div>
                {meta.perCourse ? (
                  <div className="min-w-0">
                    <FieldLabel htmlFor="marketing-course">For</FieldLabel>
                    <div className={`${fieldClass} flex w-full items-center`}>
                      <ThemedSelect
                        id="marketing-course"
                        value={form.settings.courseId ?? ""}
                        onValueChange={(courseId) =>
                          patch({
                            settings: {
                              ...form.settings!,
                              courseId: courseId || null,
                            },
                          })
                        }
                        options={[
                          ["", "Any course"],
                          ...(options.data?.courses ?? []).map(
                            (course) => [course.id, course.title] as const,
                          ),
                        ]}
                        searchable={(options.data?.courses.length ?? 0) > 8}
                        searchPlaceholder="Search courses"
                        ariaLabel="For"
                        triggerClassName={selectTriggerClass}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
              <p className="m-0 text-[12px] text-(--muted)">
                Only what happens after you switch it on counts, so nobody gets
                an email about the past.
              </p>
            </section>
          ) : null}

          {!isAutomation ? (
            <section
              className={`${surfaceClass} grid gap-4 p-5 sm:p-6`}
              aria-label="Audience"
            >
              <SectionTitle
                title="Audience"
                description="Who gets this email."
              />
              <MarketingAudiencePicker
                audience={form.audience}
                onChange={(audience) => patch({ audience })}
              />
            </section>
          ) : null}

          {problems.length ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] text-(--text)">
              <WarningCircle
                size={18}
                weight="fill"
                className="mt-0.5 shrink-0 text-amber-500"
              />
              <div>
                <p className="m-0 font-semibold">
                  Before you {isAutomation ? "switch it on" : "send"}:
                </p>
                <ul className="m-0 mt-1 list-disc pl-4">
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {isAutomation ? <MarketingReport email={email} compact /> : null}
        </div>

        <div
          id="marketing-preview"
          className="min-w-0 scroll-mt-4 xl:sticky xl:top-4"
        >
          <MarketingPreview
            subject={form.subject}
            preheader={form.preheader}
            blocks={form.blocks}
            design={form.design}
            automationKey={automationKey}
            onSendTest={() => void runTest()}
            testPending={sendTest.isPending}
            testDisabled={Boolean(blockProblem(form.blocks))}
            testMessage={testMessage}
          />
        </div>
      </div>

      <ConfirmActionModal
        id="marketing-send-confirm"
        isOpen={confirm !== null}
        isPending={schedule.isPending}
        onClose={() => {
          setConfirm(null);
          setActionError(null);
        }}
        onConfirm={() => void runSchedule()}
        icon={confirm === "later" ? CalendarBlank : PaperPlaneRight}
        title={
          confirm === "later" ? "Schedule this email" : "Send this email now?"
        }
        description={
          <span>
            {count.data
              ? `It goes to ${formatCount(count.data.count)} ${count.data.count === 1 ? "person" : "people"}.`
              : "Counting who it goes to…"}{" "}
            {confirm === "later"
              ? "You can edit or unschedule it until it starts."
              : "Once it starts, it can be stopped but not changed."}
          </span>
        }
        cancelLabel="Cancel"
        confirmLabel={confirm === "later" ? "Schedule" : "Send now"}
        pendingLabel={confirm === "later" ? "Scheduling…" : "Starting…"}
        confirmDisabled={
          confirm === "later" &&
          (!sendAt || new Date(sendAt).getTime() <= Date.now())
        }
      >
        {confirm === "later" ? (
          <div className="grid gap-1.5 text-left">
            <label
              htmlFor="marketing-send-at"
              className="text-[13px] font-medium text-(--text)"
            >
              Send on
            </label>
            <ThemedDateTimePicker
              id="marketing-send-at"
              value={sendAt}
              onChange={setSendAt}
              ariaLabel="Send on"
              triggerClassName={`${fieldClass} w-full`}
            />
            <p className="m-0 text-[12px] text-(--muted)">In your time zone.</p>
          </div>
        ) : null}
      </ConfirmActionModal>
    </main>
  );
}
