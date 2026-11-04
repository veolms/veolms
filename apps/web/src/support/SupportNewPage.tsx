import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { MapPinIcon as MapPin } from "@phosphor-icons/react/MapPin";
import { PaperPlaneRightIcon as PaperPlaneRight } from "@phosphor-icons/react/PaperPlaneRight";
import { SealCheckIcon as SealCheck } from "@phosphor-icons/react/SealCheck";
import type {
  SupportTicketCategory,
  SupportTicketKind,
} from "@veolms/contracts/support";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { Checkbox } from "../components/Checkbox";
import { ElevatedCard } from "../components/ElevatedCard";
import { useCurrentUser } from "../services/auth";
import { useEnrolledCourses } from "../services/enrollments";
import { useCreateSupportTicket } from "../services/support";
import { SupportComposer } from "./SupportComposer";
import { SupportPageHeader } from "./SupportTabs";
import { SupportSelect } from "./SupportSelect";
import {
  FEEDBACK_CATEGORY_ORDER,
  PROBLEM_CATEGORY_ORDER,
  RatingFace,
  SUPPORT_CATEGORIES,
  SUPPORT_RATINGS,
} from "./supportCatalog";
import { supportFieldLabelClasses, supportPageClasses } from "./supportLayout";
import { readTechnicalDetails } from "./technicalDetails";
import { useSupportDraft } from "./useSupportDraft";

const NO_COURSE = "none";

/** The page the learner came from, if the address carries a safe one. */
function readOrigin(params: URLSearchParams) {
  const path = params.get("from");
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
  if (path.startsWith("/support")) return null;
  const label = params.get("fromLabel")?.trim().slice(0, 200);
  // Opened from a course (its card's menu): the course goes with the report.
  const courseId = params.get("courseId");
  return {
    path: path.slice(0, 500),
    label: label || path,
    courseId: courseId && UUID_PATTERN.test(courseId) ? courseId : null,
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** /support/new?type=problem|feedback: report a problem or send feedback. */
export function SupportNewPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const kind: SupportTicketKind =
    params.get("type") === "feedback" ? "feedback" : "problem";
  const origin = useMemo(() => readOrigin(params), [params]);
  const { data: user } = useCurrentUser();
  const create = useCreateSupportTicket();
  const draft = useSupportDraft();

  const [problemCategory, setProblemCategory] =
    useState<SupportTicketCategory | null>(null);
  const [feedbackCategory, setFeedbackCategory] =
    useState<SupportTicketCategory>("idea");
  const [rating, setRating] = useState<number | null>(null);
  const [courseId, setCourseId] = useState<string>(
    () => origin?.courseId ?? NO_COURSE,
  );
  const [linkPage, setLinkPage] = useState(true);
  const [includeTechnical, setIncludeTechnical] = useState(true);
  const [showTechnical, setShowTechnical] = useState(false);
  const [contactAllowed, setContactAllowed] = useState(true);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [sent, setSent] = useState<{ id: string; number: number } | null>(null);
  const technical = useMemo(() => readTechnicalDetails(), []);
  const courses = useEnrolledCourses({
    enabled: kind === "feedback" && feedbackCategory === "content",
  });

  const category = kind === "problem" ? problemCategory : feedbackCategory;
  const missingCategory = kind === "problem" && !problemCategory;
  const missingText = !draft.hasText;
  const canSubmit =
    !missingCategory &&
    !missingText &&
    !draft.uploading &&
    !draft.failed &&
    !create.isPending;

  const switchKind = (next: SupportTicketKind) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set("type", next);
    setParams(nextParams, { replace: true });
  };
  // A tab or link switched the form: what was said about the other one goes.
  // A send still under way is left alone: resetting it would let the form
  // send the same report twice.
  const sendingRef = useRef(false);
  const resetCreate = create.reset;
  useEffect(() => {
    if (sendingRef.current) return;
    setTriedSubmit(false);
    resetCreate();
  }, [kind, resetCreate]);

  const leave = () => {
    if (origin) navigate(origin.path);
    else navigate("/support");
  };

  const submit = () => {
    setTriedSubmit(true);
    if (!canSubmit || !category || sendingRef.current) return;
    sendingRef.current = true;
    create.mutate(
      {
        kind,
        category,
        rating: kind === "feedback" ? rating : null,
        content: draft.draft.markdown,
        pagePath: origin && linkPage ? origin.path : null,
        pageLabel: origin && linkPage ? origin.label : null,
        courseId:
          kind === "feedback" && category === "content"
            ? courseId !== NO_COURSE
              ? courseId
              : null
            : origin && linkPage
              ? origin.courseId
              : null,
        technical: kind === "problem" && includeTechnical ? technical : null,
        contactAllowed: kind === "feedback" ? contactAllowed : true,
        attachmentIds: draft.attachmentIds,
      },
      {
        onSuccess: (created) => {
          setSent(created);
          draft.reset();
        },
        onSettled: () => {
          sendingRef.current = false;
        },
      },
    );
  };

  if (sent) {
    return (
      <main className={supportPageClasses} aria-labelledby="support-sent-title">
        <SentCard
          kind={kind}
          number={sent.number}
          ticketId={sent.id}
          email={user?.email ?? null}
          onDone={leave}
        />
      </main>
    );
  }

  const isProblem = kind === "problem";
  const placeholder = category
    ? SUPPORT_CATEGORIES[category].placeholder
    : "What happened? What did you expect to happen instead?";

  return (
    <main className={supportPageClasses} aria-labelledby="support-title">
      <SupportPageHeader active={kind} />

      <ElevatedCard
        as="form"
        padded
        noValidate
        onSubmit={(event: React.FormEvent) => {
          event.preventDefault();
          submit();
        }}
        className="flex flex-col gap-7"
      >
        {isProblem ? (
          <fieldset className="m-0 border-0 p-0">
            <legend className={supportFieldLabelClasses}>
              What&apos;s the problem about?
            </legend>
            <div
              role="radiogroup"
              aria-label="What's the problem about?"
              className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
            >
              {PROBLEM_CATEGORY_ORDER.map((value) => (
                <CategoryTile
                  key={value}
                  category={value}
                  selected={problemCategory === value}
                  onSelect={() => setProblemCategory(value)}
                />
              ))}
            </div>
            {triedSubmit && missingCategory ? (
              <p
                role="alert"
                className="mt-2 mb-0 text-xs font-medium text-rose-500"
              >
                Choose what the problem is about.
              </p>
            ) : null}
          </fieldset>
        ) : (
          <>
            <fieldset className="m-0 border-0 p-0">
              <legend className={supportFieldLabelClasses}>
                How&apos;s your experience with ProCodrr?{" "}
                <span className="font-normal text-(--muted)">(optional)</span>
              </legend>
              <div
                role="radiogroup"
                aria-label="Your rating"
                className="grid grid-cols-5 gap-2"
              >
                {SUPPORT_RATINGS.map((option) => {
                  const selected = rating === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setRating(selected ? null : option.value)}
                      style={selected ? { color: option.color } : undefined}
                      className="flex flex-col items-center gap-2 rounded-xl bg-(--surface-strong) px-1 pt-3.5 pb-3 text-(--muted) ring-1 ring-transparent transition-[background-color,color,box-shadow] ring-inset hover:bg-(--hover) hover:text-(--text-secondary) aria-checked:bg-[color-mix(in_srgb,currentColor_12%,var(--surface-strong))] aria-checked:ring-current"
                    >
                      <RatingFace rating={option.value} size={30} />
                      <span className="text-xs font-semibold max-[420px]:text-[0.68rem]">
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="m-0 border-0 p-0">
              <legend className={supportFieldLabelClasses}>
                What&apos;s it about?
              </legend>
              <div
                role="radiogroup"
                aria-label="What's it about?"
                className="flex flex-wrap gap-2"
              >
                {FEEDBACK_CATEGORY_ORDER.map((value) => {
                  const info = SUPPORT_CATEGORIES[value];
                  const ChipIcon = info.icon;
                  const selected = feedbackCategory === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setFeedbackCategory(value)}
                      className="inline-flex h-10 items-center gap-2 rounded-full bg-(--surface-strong) px-3.5 text-[0.84rem] font-semibold text-(--text-secondary) ring-1 ring-transparent transition-[background-color,color,box-shadow] ring-inset hover:bg-(--hover) hover:text-(--text) aria-checked:bg-(--accent)/12 aria-checked:text-(--text) aria-checked:ring-(--accent)"
                    >
                      <ChipIcon
                        size={17}
                        weight="duotone"
                        style={{ color: info.color }}
                        aria-hidden="true"
                      />
                      {info.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {feedbackCategory === "content" ? (
              <div>
                <label
                  htmlFor="support-course"
                  className={supportFieldLabelClasses}
                >
                  Which course?
                </label>
                <SupportSelect
                  id="support-course"
                  value={courseId}
                  onValueChange={setCourseId}
                  ariaLabel="Which course?"
                  className="w-full sm:max-w-md"
                  options={[
                    [NO_COURSE, "Not about one course"],
                    ...(courses.data?.courses ?? []).map(
                      (course) =>
                        [course.courseId, course.courseTitle] as const,
                    ),
                  ]}
                />
              </div>
            ) : null}
          </>
        )}

        {origin ? (
          <div>
            <span className={supportFieldLabelClasses}>
              {isProblem ? "Where did it happen?" : "Which page is it about?"}
            </span>
            <div
              className={`flex items-center gap-3 rounded-xl px-3.5 py-3 ring-1 ring-[color-mix(in_srgb,var(--text)_8%,transparent)] ring-inset ${linkPage ? "bg-(--surface-strong)" : "bg-transparent"}`}
            >
              <MapPin
                size={19}
                weight="duotone"
                aria-hidden="true"
                className={
                  linkPage
                    ? "shrink-0 text-(--accent)"
                    : "shrink-0 text-(--muted)"
                }
              />
              <div className="min-w-0 flex-1">
                <div
                  className={`truncate text-sm font-semibold ${linkPage ? "text-(--text)" : "text-(--muted) line-through"}`}
                >
                  {origin.label}
                </div>
                <div className="mt-0.5 text-xs text-(--muted)">
                  {linkPage
                    ? "Added from the page you were on"
                    : "Not sent with your message"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLinkPage((value) => !value)}
                className="h-9 shrink-0 rounded-lg px-3 text-[0.8rem] font-semibold text-(--accent) hover:bg-(--hover)"
              >
                {linkPage ? "Remove" : "Add back"}
              </button>
            </div>
          </div>
        ) : null}

        {isProblem ? (
          <div className="rounded-xl bg-(--surface-strong) px-3.5 py-3">
            <div className="flex items-center gap-3.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-(--text)">
                  Include technical details
                </div>
                <div className="mt-0.5 text-xs text-(--muted)">
                  Your browser, system and screen size.{" "}
                  <button
                    type="button"
                    onClick={() => setShowTechnical((value) => !value)}
                    aria-expanded={showTechnical}
                    className="font-semibold text-(--accent) hover:underline"
                  >
                    {showTechnical ? "Hide" : "See what's sent"}
                  </button>
                </div>
              </div>
              <Switch
                checked={includeTechnical}
                onChange={setIncludeTechnical}
                label="Include technical details"
              />
            </div>
            {showTechnical ? (
              <dl className="mt-3 mb-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-3 text-xs">
                {(
                  [
                    ["Browser", technical.browser],
                    ["System", technical.os],
                    ["Screen", technical.screen],
                    ["Page", origin?.path],
                    ["User agent", technical.userAgent],
                  ] as const
                ).map(([term, value]) =>
                  value ? (
                    <div key={term} className="contents">
                      <dt className="text-(--muted)">{term}</dt>
                      <dd className="m-0 truncate text-(--text-secondary)">
                        {value}
                      </dd>
                    </div>
                  ) : null,
                )}
              </dl>
            ) : null}
          </div>
        ) : (
          <Checkbox
            checked={contactAllowed}
            onCheckedChange={setContactAllowed}
            className="-mx-2.5 w-fit"
            label={
              <span>
                <span className="block text-sm text-(--text)">
                  You can contact me about this feedback
                </span>
                {user?.email ? (
                  <span className="block text-xs font-normal text-(--muted)">
                    We may email {user.email} with a follow-up question.
                  </span>
                ) : null}
              </span>
            }
          />
        )}

        <div>
          <span className={supportFieldLabelClasses}>
            {isProblem ? "Describe the problem" : "Your feedback"}
          </span>
          <SupportComposer
            state={draft}
            documentId={`support-new-${kind}`}
            label={isProblem ? "Describe the problem" : "Your feedback"}
            placeholder={placeholder}
            invalid={triedSubmit && missingText}
            minHeightClassName="min-h-40"
            actions={
              <button
                type="submit"
                disabled={create.isPending}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-(--accent) px-4 text-sm font-semibold text-(--on-accent) shadow-[0_7px_18px_color-mix(in_srgb,var(--accent-shadow)_48%,transparent)] transition-colors hover:bg-(--accent-hover) disabled:opacity-55"
              >
                <PaperPlaneRight size={16} weight="fill" aria-hidden="true" />
                {create.isPending
                  ? "Sending…"
                  : draft.uploading
                    ? "Uploading…"
                    : isProblem
                      ? "Submit"
                      : "Send"}
              </button>
            }
          />
          {triedSubmit && missingText ? (
            <p
              role="alert"
              className="mt-2 mb-0 text-xs font-medium text-rose-500"
            >
              {isProblem
                ? "Tell us what happened."
                : "Write a few words before sending."}
            </p>
          ) : null}
          {create.error ? (
            <p
              role="alert"
              className="mt-2 mb-0 rounded-lg bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-500"
            >
              {create.error.message}
            </p>
          ) : null}
          <p className="mt-2.5 mb-0 text-xs leading-5 text-(--muted)">
            {isProblem ? (
              <>
                You&apos;ll see our reply in Your reports
                {user?.email ? <> and at {user.email}</> : null}. Paste or drop
                screenshots and recordings into the box.
              </>
            ) : (
              <>
                Found a bug?{" "}
                <button
                  type="button"
                  onClick={() => switchKind("problem")}
                  className="font-semibold text-(--accent) hover:underline"
                >
                  Report a problem
                </button>
              </>
            )}
          </p>
        </div>
      </ElevatedCard>
    </main>
  );
}

function CategoryTile({
  category,
  selected,
  onSelect,
}: {
  category: SupportTicketCategory;
  selected: boolean;
  onSelect: () => void;
}) {
  const info = SUPPORT_CATEGORIES[category];
  const TileIcon = info.icon;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="relative flex min-h-22 flex-col items-start justify-between gap-3 rounded-xl bg-(--surface-strong) p-3.5 text-left text-[0.84rem] font-semibold text-(--text-secondary) ring-1 ring-transparent transition-[background-color,color,box-shadow] ring-inset hover:bg-(--hover) hover:text-(--text) aria-checked:bg-(--accent)/10 aria-checked:text-(--text) aria-checked:ring-2 aria-checked:ring-(--accent)"
    >
      <span
        className="grid size-9 place-items-center rounded-lg"
        style={{
          color: info.color,
          backgroundColor: `color-mix(in srgb, ${info.color} 15%, transparent)`,
        }}
        aria-hidden="true"
      >
        <TileIcon size={20} weight="duotone" />
      </span>
      {info.label}
      {selected ? (
        <span
          className="absolute top-2.5 right-2.5 grid size-5 place-items-center rounded-full bg-(--accent) text-(--on-accent)"
          aria-hidden="true"
        >
          <Check size={12} weight="bold" />
        </span>
      ) : null}
    </button>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative h-6.5 w-11 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--text)_22%,transparent)] transition-colors aria-checked:bg-(--accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
    >
      <span
        className={`absolute top-0.75 left-0.75 size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4.5" : ""}`}
      />
    </button>
  );
}

function SentCard({
  kind,
  number,
  ticketId,
  email,
  onDone,
}: {
  kind: SupportTicketKind;
  number: number;
  ticketId: string;
  email: string | null;
  onDone: () => void;
}) {
  const isProblem = kind === "problem";
  return (
    <ElevatedCard
      padded
      className="flex flex-col items-center px-8 py-12 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
    >
      <span
        className={`grid size-16 place-items-center rounded-full ${isProblem ? "bg-emerald-400/15 text-emerald-500" : "bg-(--accent)/15 text-(--accent)"}`}
        aria-hidden="true"
      >
        {isProblem ? (
          <Check size={30} weight="bold" />
        ) : (
          <SealCheck size={32} weight="duotone" />
        )}
      </span>
      <h1
        id="support-sent-title"
        className="mt-5 mb-0 text-2xl font-bold tracking-[-0.02em] text-(--text)"
      >
        {isProblem ? "Report sent" : "Thanks for the feedback!"}
      </h1>
      <p className="mt-2 mb-0 max-w-md text-sm leading-6 text-(--text-secondary)">
        {isProblem
          ? `Thanks for letting us know. We'll look into it and reply here${email ? ` and at ${email}` : ""}.`
          : "Every message is read by the ProCodrr team and helps decide what we build and improve next."}
      </p>
      <div className="mt-5 inline-flex items-center gap-2 rounded-xl bg-(--surface-strong) px-4 py-2 text-sm text-(--muted)">
        Reference{" "}
        <span className="font-bold tracking-wide text-(--text)">#{number}</span>
      </div>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link
          to={`/support/${ticketId}`}
          className="inline-flex h-10 items-center rounded-lg bg-(--surface-strong) px-4 text-sm font-semibold text-(--text-secondary) no-underline transition-colors hover:bg-(--hover) hover:text-(--text)"
        >
          {isProblem ? "View my report" : "View my feedback"}
        </Link>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-(--accent) px-5 text-sm font-semibold text-(--on-accent) transition-colors hover:bg-(--accent-hover)"
        >
          Done
        </button>
      </div>
    </ElevatedCard>
  );
}
