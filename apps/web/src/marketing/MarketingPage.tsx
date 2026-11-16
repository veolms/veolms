import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import {
  MARKETING_AUTOMATIONS,
  marketingAutomationKeySchema,
  type MarketingAutomation,
  type MarketingAutomationKey,
  type MarketingEmail,
  type MarketingEmailSummary,
  type MarketingTemplateKey,
} from "@veolms/contracts";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { LightningIcon as Lightning } from "@phosphor-icons/react/Lightning";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { Button } from "../components/Button";
import { CenteredLoadingSpinner } from "../components/LoadingSpinner";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { ConfirmDeleteModal } from "../ConfirmDeleteModal";
import { getApiError } from "../lib/api-error";
import type { NavigateTo } from "../routing/navigation";
import { useCurrentUser } from "../services/auth";
import { useCapabilities } from "../services/authorization";
import {
  useCreateMarketingEmail,
  useDeleteMarketingEmail,
  useMarketingAutomations,
  useMarketingEmail,
  useMarketingEmails,
  useOpenMarketingAutomation,
  useSetMarketingAutomationActive,
} from "../services/marketing";
import { ConfirmActionModal } from "../shell/ConfirmActionModal";
import { useAuthStore } from "../store/auth.store";
import { surfaceClass } from "../workshops/workshopHelpers";
import { MarketingEmailEditor } from "./MarketingEmailEditor";
import { MarketingSentEmail } from "./MarketingSentEmail";
import {
  MARKETING_AUTOMATIONS_PATH,
  MARKETING_PATH,
  TEMPLATE_CHOICES,
  automationTimingSentence,
  emailStatusClass,
  emailStatusLabel,
  formatCount,
  formatWhen,
  marketingAutomationPath,
  marketingEmailPath,
  marketingViewOf,
  rateOf,
} from "./marketingHelpers";

export interface MarketingPageProps {
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

const dividerClass = "border-[color-mix(in_srgb,var(--text)_8%,transparent)]";

function AccessDenied({ onNavigatePage }: { onNavigatePage?: NavigateTo }) {
  return (
    <main className="mx-auto grid w-full max-w-xl place-items-center py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-(--accent)/10 text-(--accent)">
        <LockSimple size={24} weight="bold" />
      </span>
      <h1 className="mt-4 mb-0 text-xl font-bold text-(--text)">
        Marketing is for the academy’s admins
      </h1>
      <p className="mt-2 mb-0 text-sm leading-6 text-(--muted)">
        Ask an admin for the “Send marketing emails” permission if you need it.
      </p>
      <div className="mt-5">
        <Button variant="quiet" onClick={() => onNavigatePage?.("/")}>
          Go home
        </Button>
      </div>
    </main>
  );
}

function Tabs({
  active,
  onNavigatePage,
}: {
  active: "emails" | "automations";
  onNavigatePage?: NavigateTo;
}) {
  const tabs = [
    ["emails", "Emails", EnvelopeSimple, MARKETING_PATH],
    ["automations", "Automations", Lightning, MARKETING_AUTOMATIONS_PATH],
  ] as const;
  return (
    <div
      role="tablist"
      aria-label="Marketing"
      className="flex w-fit items-center gap-1 rounded-[12px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_80%,var(--surface))] p-1 shadow-[inset_0_1px_2px_color-mix(in_srgb,black_10%,transparent)]"
    >
      {tabs.map(([id, label, TabIcon, path]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          onClick={() => onNavigatePage?.(path)}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[8px] border-none px-3.5 py-1.5 text-[13px] font-semibold transition-all ${
            active === id
              ? "bg-(--card-surface,var(--surface)) text-(--text) shadow-(--card-compact-shadow)"
              : "bg-transparent text-(--muted) hover:text-(--text)"
          }`}
        >
          <TabIcon size={15} />
          {label}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="grid place-items-center p-8 text-center sm:p-14">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-(--accent)/10 text-(--accent)">
        <EnvelopeSimple size={24} weight="bold" />
      </span>
      <h3 className="mt-3 mb-0 text-base font-semibold text-(--text)">
        Send your first email
      </h3>
      <p className="mt-1 mb-0 max-w-sm text-[13px] leading-5 text-(--muted)">
        Announce a course, invite students to a workshop or share an offer.
        Start from a template and send it in minutes.
      </p>
      <div className="mt-4">
        <Button onClick={onCreate}>
          <Plus size={16} weight="bold" />
          New email
        </Button>
      </div>
    </div>
  );
}

function EmailRow({
  email,
  onOpen,
  onDelete,
}: {
  email: MarketingEmailSummary;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const sentOrSending =
    email.status === "sent" ||
    email.status === "sending" ||
    email.status === "cancelled";
  const when =
    email.status === "scheduled" && email.scheduledAt
      ? `Sends ${formatWhen(email.scheduledAt)}`
      : email.startedAt
        ? `Sent ${formatWhen(email.startedAt)}`
        : `Edited ${formatWhen(email.updatedAt)}`;
  return (
    <li className="group/row relative">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${email.name}`}
        className="grid w-full cursor-pointer gap-3 border-none bg-transparent px-4 py-3.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] focus-visible:outline-none sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:px-7 sm:py-4"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 truncate text-sm font-semibold text-(--text) sm:text-[15px]">
              {email.name}
            </h3>
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${emailStatusClass(email.status)}`}
            >
              {emailStatusLabel(email.status)}
            </span>
          </div>
          <p className="mt-0.5 mb-0 truncate text-xs text-(--muted)">
            {email.subject || "No subject yet"}
          </p>
          <p className="mt-1 mb-0 text-xs text-(--text-secondary,var(--muted))">
            {when}
          </p>
        </div>
        <div className="flex items-center gap-5 pr-8 sm:pr-10">
          {sentOrSending ? (
            <dl className="m-0 grid grid-cols-3 gap-5 text-right">
              {(
                [
                  ["Sent", formatCount(email.stats.sent)],
                  ["Opened", rateOf(email.stats.opened, email.stats)],
                  ["Clicked", rateOf(email.stats.clicked, email.stats)],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] text-(--muted)">{label}</dt>
                  <dd className="m-0 text-sm font-semibold text-(--text)">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-(--accent)">
              Edit
              <ArrowRight size={14} weight="bold" />
            </span>
          )}
        </div>
      </button>
      {email.status !== "sending" ? (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${email.name}`}
          title="Delete"
          className="absolute top-1/2 right-3 inline-flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-(--muted) opacity-0 transition-colors group-hover/row:opacity-100 hover:bg-rose-500/10 hover:text-rose-500 focus-visible:opacity-100 max-[768px]:opacity-100 sm:right-5"
        >
          <Trash size={16} />
        </button>
      ) : null}
    </li>
  );
}

function EmailsTab({ onNavigatePage, setNotice }: MarketingPageProps) {
  const list = useMarketingEmails();
  const create = useCreateMarketingEmail();
  const remove = useDeleteMarketingEmail();
  const [picking, setPicking] = useState(false);
  const [template, setTemplate] = useState<MarketingTemplateKey>("blank");
  const [deleting, setDeleting] = useState<MarketingEmailSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    try {
      const created = await create.mutateAsync(template);
      setPicking(false);
      onNavigatePage?.(marketingEmailPath(created.id));
    } catch (failure) {
      setError(getApiError(failure).message);
    }
  }

  const emails = list.data?.emails ?? [];
  return (
    <>
      <section className={surfaceClass} aria-label="Emails">
        <div
          className={`flex flex-wrap items-start justify-between gap-3 border-b ${dividerClass} px-4 py-3 sm:px-7 sm:py-5`}
        >
          <div>
            <h2 className="m-0 text-base font-bold tracking-tight text-(--text) sm:text-lg">
              Emails
            </h2>
            <p className="mt-0.5 mb-0 text-xs text-(--muted)">
              Write once, send to the right students, see what worked.
            </p>
          </div>
          <Button onClick={() => setPicking(true)}>
            <Plus size={16} weight="bold" />
            New email
          </Button>
        </div>
        {error ? (
          <p className="m-0 px-7 pt-3 text-sm text-rose-500">{error}</p>
        ) : null}
        {list.isLoading ? (
          <CenteredLoadingSpinner
            label="Loading emails"
            className="min-h-40 py-16"
          />
        ) : list.isError ? (
          <div className="grid place-items-center p-10 text-center">
            <p className="m-0 text-sm text-(--muted)">
              The emails couldn’t load.
            </p>
            <div className="mt-3">
              <Button variant="quiet" onClick={() => void list.refetch()}>
                Try again
              </Button>
            </div>
          </div>
        ) : emails.length === 0 ? (
          <EmptyState onCreate={() => setPicking(true)} />
        ) : (
          <ul
            className={`m-0 list-none divide-y p-0 ${dividerClass} divide-[color-mix(in_srgb,var(--text)_8%,transparent)]`}
          >
            {emails.map((email) => (
              <EmailRow
                key={email.id}
                email={email}
                onOpen={() => onNavigatePage?.(marketingEmailPath(email.id))}
                onDelete={() => setDeleting(email)}
              />
            ))}
          </ul>
        )}
      </section>

      <ConfirmActionModal
        id="marketing-template"
        isOpen={picking}
        isPending={create.isPending}
        onClose={() => setPicking(false)}
        onConfirm={() => void start()}
        icon={EnvelopeSimple}
        title="Start a new email"
        description="Pick a starting point. You can change every word."
        cancelLabel="Cancel"
        confirmLabel="Start writing"
        pendingLabel="Creating…"
      >
        <div
          role="radiogroup"
          aria-label="Template"
          className="grid gap-2 text-left sm:grid-cols-2"
        >
          {TEMPLATE_CHOICES.map((choice) => (
            <button
              key={choice.key}
              type="button"
              role="radio"
              aria-checked={template === choice.key}
              onClick={() => setTemplate(choice.key)}
              className={`cursor-pointer rounded-xl border px-3.5 py-3 text-left transition-colors ${
                template === choice.key
                  ? "border-(--accent) bg-(--accent)/8"
                  : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-transparent hover:border-(--accent)/40"
              }`}
            >
              <span className="block text-[13px] font-semibold text-(--text)">
                {choice.title}
              </span>
              <span className="mt-0.5 block text-[12px] leading-snug text-(--muted)">
                {choice.description}
              </span>
            </button>
          ))}
        </div>
      </ConfirmActionModal>

      <ConfirmDeleteModal
        isOpen={deleting !== null}
        title="Delete this email?"
        message={
          deleting?.status === "scheduled"
            ? "It is scheduled; deleting it means it won't be sent."
            : "Its draft or results are removed from this list."
        }
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (!target) return;
          void remove
            .mutateAsync(target.id)
            .then(() => setNotice?.(`Deleted “${target.name}”.`))
            .catch((failure: unknown) =>
              setError(getApiError(failure).message),
            );
        }}
      />
    </>
  );
}

function AutomationCard({
  automation,
  onOpen,
  onToggle,
  pending,
}: {
  automation: MarketingAutomation;
  onOpen: () => void;
  onToggle: (active: boolean) => void;
  pending: boolean;
}) {
  const meta = MARKETING_AUTOMATIONS[automation.key];
  const email = automation.email;
  const active = email?.status === "active";
  const timing = automationTimingSentence(
    automation.key,
    automation.settings.wait,
    meta.unit,
  );
  return (
    <li className={`${surfaceClass} flex flex-col gap-4 p-5`}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
          <Lightning size={20} weight="duotone" />
        </span>
        <ToggleSwitch
          checked={active}
          onChange={onToggle}
          label={`${meta.title}: ${active ? "turn off" : "turn on"}`}
          disabled={pending}
        />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="m-0 text-[15px] font-bold tracking-tight text-(--text)">
          {meta.title}
        </h3>
        <p className="mt-1 mb-0 text-[13px] leading-5 text-(--muted)">
          {meta.description}
        </p>
        <p className="mt-2 mb-0 text-[12px] font-medium text-(--text-secondary,var(--text))">
          {timing}
          {meta.stopsWhen
            ? `. Skipped if ${meta.stopsWhen.toLowerCase()}.`
            : "."}
        </p>
      </div>
      <div
        className={`flex items-center justify-between gap-3 border-t pt-3 ${dividerClass}`}
      >
        <span className="text-[12px] text-(--muted)">
          {email && email.stats.sent
            ? `${formatCount(email.stats.sent)} sent · ${rateOf(email.stats.opened, email.stats)} opened`
            : active
              ? "On. Nothing sent yet."
              : "Off"}
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-[13px] font-semibold text-(--accent) hover:underline"
        >
          Edit email
          <ArrowRight size={14} weight="bold" />
        </button>
      </div>
    </li>
  );
}

function AutomationsTab({ onNavigatePage, setNotice }: MarketingPageProps) {
  const automations = useMarketingAutomations();
  const setActive = useSetMarketingAutomationActive();
  const [error, setError] = useState<string | null>(null);

  return (
    <section aria-label="Automations" className="grid gap-4">
      <div>
        <h2 className="m-0 text-base font-bold tracking-tight text-(--text) sm:text-lg">
          Emails that send themselves
        </h2>
        <p className="mt-0.5 mb-0 text-[13px] text-(--muted)">
          Switch one on and it emails each student at the right moment, once.
          Only what happens after you switch it on counts.
        </p>
      </div>
      {error ? (
        <p className="m-0 text-sm text-rose-500" role="alert">
          {error}
        </p>
      ) : null}
      {automations.isLoading ? (
        <CenteredLoadingSpinner
          label="Loading automations"
          className="min-h-40 py-16"
        />
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 2xl:grid-cols-3">
          {(automations.data?.automations ?? []).map((automation) => (
            <AutomationCard
              key={automation.key}
              automation={automation}
              pending={setActive.isPending}
              onOpen={() =>
                onNavigatePage?.(marketingAutomationPath(automation.key))
              }
              onToggle={(active) => {
                setError(null);
                void setActive
                  .mutateAsync({ key: automation.key, active })
                  .then(() =>
                    setNotice?.(
                      `${MARKETING_AUTOMATIONS[automation.key].title} is ${active ? "on" : "off"}.`,
                    ),
                  )
                  .catch((failure: unknown) =>
                    setError(getApiError(failure).message),
                  );
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function EmailView({
  id,
  onNavigatePage,
  setNotice,
}: MarketingPageProps & { id: string }) {
  const query = useMarketingEmail(id);
  if (query.isLoading)
    return (
      <CenteredLoadingSpinner
        label="Loading email"
        className="min-h-52 py-24"
      />
    );
  if (!query.data) {
    return (
      <main className="grid place-items-center py-20 text-center">
        <p className="m-0 text-sm text-(--muted)">
          This email was not found. It may have been deleted.
        </p>
        <div className="mt-4">
          <Button
            variant="quiet"
            onClick={() => onNavigatePage?.(MARKETING_PATH)}
          >
            Back to emails
          </Button>
        </div>
      </main>
    );
  }
  const email: MarketingEmail = query.data;
  if (
    email.kind === "broadcast" &&
    (email.status === "draft" || email.status === "scheduled")
  ) {
    return (
      <MarketingEmailEditor
        key={email.id}
        email={email}
        onNavigatePage={onNavigatePage}
        setNotice={setNotice}
      />
    );
  }
  if (email.kind === "automation" && email.automationKey) {
    return (
      <AutomationView
        automationKey={email.automationKey}
        onNavigatePage={onNavigatePage}
        setNotice={setNotice}
      />
    );
  }
  return (
    <MarketingSentEmail
      email={email}
      onNavigatePage={onNavigatePage}
      setNotice={setNotice}
    />
  );
}

function AutomationView({
  automationKey,
  onNavigatePage,
  setNotice,
}: MarketingPageProps & { automationKey: MarketingAutomationKey }) {
  const open = useOpenMarketingAutomation();
  const [emailId, setEmailId] = useState<string | null>(null);
  const requested = useRef<string | null>(null);
  useEffect(() => {
    if (requested.current === automationKey) return;
    requested.current = automationKey;
    open.mutate(automationKey, { onSuccess: (email) => setEmailId(email.id) });
  }, [automationKey, open]);
  const query = useMarketingEmail(emailId);
  if (open.isError) {
    return (
      <main className="grid place-items-center py-20 text-center">
        <p className="m-0 text-sm text-(--muted)">
          {getApiError(open.error).message}
        </p>
      </main>
    );
  }
  if (!query.data)
    return (
      <CenteredLoadingSpinner
        label="Loading automation"
        className="min-h-52 py-24"
      />
    );
  return (
    <MarketingEmailEditor
      key={query.data.id}
      email={query.data}
      onNavigatePage={onNavigatePage}
      setNotice={setNotice}
    />
  );
}

/**
 * Marketing: the academy's emails (`/marketing`), the ready automations
 * (`/marketing/automations`), one email (`/marketing/emails/:id`) and one
 * automation (`/marketing/automations/:key`).
 */
export function MarketingPage({
  onNavigatePage,
  setNotice,
}: MarketingPageProps) {
  const { pathname } = useLocation();
  const { data: authUser, isFetched } = useCurrentUser();
  const storeUser = useAuthStore((state) => state.user);
  const user = isFetched ? authUser : storeUser;
  const { can, isLoading: capabilitiesLoading } = useCapabilities({
    enabled: Boolean(user),
  });
  const view = marketingViewOf(pathname);

  if ((!storeUser && !isFetched) || (user && capabilitiesLoading)) {
    return (
      <CenteredLoadingSpinner
        label="Loading marketing"
        className="min-h-52 py-24"
      />
    );
  }
  if (!user || !can("marketing.manage"))
    return <AccessDenied onNavigatePage={onNavigatePage} />;

  if (view.kind === "email") {
    return (
      <EmailView
        id={view.id}
        onNavigatePage={onNavigatePage}
        setNotice={setNotice}
      />
    );
  }
  if (view.kind === "automation") {
    const key = marketingAutomationKeySchema.safeParse(view.key);
    if (!key.success) return <AccessDenied onNavigatePage={onNavigatePage} />;
    return (
      <AutomationView
        automationKey={key.data}
        onNavigatePage={onNavigatePage}
        setNotice={setNotice}
      />
    );
  }

  return (
    <main
      className="mx-auto grid w-full max-w-[1800px] gap-6"
      aria-labelledby="marketing-page-title"
    >
      <header
        className={`flex flex-col gap-4 border-b ${dividerClass} pt-2 pb-4.5 sm:pt-0 sm:pb-6 lg:flex-row lg:items-end lg:justify-between`}
      >
        <div>
          <h1
            id="marketing-page-title"
            className="m-0 text-[clamp(1.8rem,2.4vw,2.15rem)] font-bold leading-tight tracking-[-0.035em] text-(--text)"
          >
            Marketing
          </h1>
          <p className="mt-1.5 mb-0 max-w-2xl text-[0.88rem] leading-6 text-(--muted)">
            Email your students: announcements, offers and automatic follow-ups,
            with the sales each email brings.
          </p>
        </div>
        <Tabs active={view.kind} onNavigatePage={onNavigatePage} />
      </header>
      {view.kind === "automations" ? (
        <AutomationsTab onNavigatePage={onNavigatePage} setNotice={setNotice} />
      ) : (
        <EmailsTab onNavigatePage={onNavigatePage} setNotice={setNotice} />
      )}
    </main>
  );
}
