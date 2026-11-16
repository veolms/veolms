import { useState, type FormEvent } from "react";
import {
  RAZORPAY_KEY_ID_PATTERN,
  type AcademyPaymentGateway,
} from "@veolms/contracts";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { EyeSlashIcon as EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { KeyIcon as Key } from "@phosphor-icons/react/Key";
import { LockKeyIcon as LockKey } from "@phosphor-icons/react/LockKey";
import { PlugsIcon as Plugs } from "@phosphor-icons/react/Plugs";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { Button } from "../components/Button";
import { SettingsSection } from "../home-page-settings/homePageSettingsControls";
import { getApiError } from "../lib/api-error";
import {
  useConnectRazorpay,
  useDisconnectRazorpay,
  usePaymentGatewayStatus,
  useRenewWebhookSecret,
} from "../services/payment-gateway";
import { ConfirmActionModal } from "../shell/ConfirmActionModal";
import { fieldClass } from "../workshops/workshopHelpers";
import { PlatformSettingsStatus } from "./PlatformSettingsStatus";

const RAZORPAY_API_KEYS_URL =
  "https://dashboard.razorpay.com/app/website-app-settings/api-keys";
const RAZORPAY_WEBHOOKS_URL =
  "https://dashboard.razorpay.com/app/website-app-settings/webhooks";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function Notice({
  tone,
  children,
}: {
  tone: "info" | "warning" | "success";
  children: React.ReactNode;
}) {
  const styles = {
    info: "border-(--accent)/25 bg-(--accent)/8 text-(--text)",
    warning: "border-amber-500/30 bg-amber-500/10 text-(--text)",
    success: "border-emerald-500/25 bg-emerald-500/10 text-(--text)",
  }[tone];
  const NoticeIcon =
    tone === "warning"
      ? WarningCircle
      : tone === "success"
        ? CheckCircle
        : Info;
  const iconTone =
    tone === "warning"
      ? "text-amber-500"
      : tone === "success"
        ? "text-emerald-500"
        : "text-(--accent)";
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px] leading-5 ${styles}`}
    >
      <NoticeIcon
        size={18}
        weight="fill"
        className={`mt-px shrink-0 ${iconTone}`}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[13px] font-medium text-(--text)">{label}</p>
      <div className="flex min-w-0 items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] px-3.5 py-2.5 font-mono text-[13px] text-(--text)">
          {value}
        </code>
        <Button
          variant="quiet"
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1_800);
            });
          }}
          aria-label={`Copy ${label}`}
        >
          {copied ? (
            <CheckCircle size={16} weight="fill" />
          ) : (
            <Copy size={16} />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function StepList({ steps }: { steps: readonly React.ReactNode[] }) {
  return (
    <ol className="m-0 grid list-none gap-2.5 p-0">
      {steps.map((step, index) => (
        <li
          key={index}
          className="flex items-start gap-3 text-[13px] leading-5 text-(--text)"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-(--accent)/12 text-[12px] font-bold text-(--accent)">
            {index + 1}
          </span>
          <span className="min-w-0 pt-0.5">{step}</span>
        </li>
      ))}
    </ol>
  );
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-semibold text-(--accent) hover:underline"
    >
      {children}
      <ArrowSquareOut size={13} />
    </a>
  );
}

/** Key ID and Key Secret, checked with Razorpay when saved. */
function KeysForm({
  replacing,
  onCancel,
  onConnected,
}: {
  replacing: boolean;
  onCancel?: () => void;
  onConnected: (webhookSecret: string) => void;
}) {
  const connect = useConnectRazorpay();
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const keyIdProblem =
    keyId.trim() && !RAZORPAY_KEY_ID_PATTERN.test(keyId.trim())
      ? "A Key ID starts with rzp_live_ or rzp_test_."
      : null;
  const ready =
    RAZORPAY_KEY_ID_PATTERN.test(keyId.trim()) && keySecret.trim().length >= 16;
  const error = connect.isError ? getApiError(connect.error).message : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready || connect.isPending) return;
    connect.mutate(
      { keyId: keyId.trim(), keySecret: keySecret.trim() },
      {
        onSuccess: (result) => {
          setKeySecret("");
          onConnected(result.webhookSecret);
        },
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      className="grid gap-4"
      noValidate
      autoComplete="off"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <label
            htmlFor="razorpay-key-id"
            className="mb-1.5 block text-[13px] font-medium text-(--text)"
          >
            Key ID
          </label>
          <input
            id="razorpay-key-id"
            type="text"
            value={keyId}
            onChange={(event) => {
              connect.reset();
              setKeyId(event.target.value);
            }}
            placeholder="rzp_live_xxxxxxxxxxxxxx"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={keyIdProblem ? true : undefined}
            className={`${fieldClass} w-full font-mono`}
          />
          {keyIdProblem ? (
            <p className="mt-1 mb-0 text-[12px] text-rose-500">
              {keyIdProblem}
            </p>
          ) : null}
        </div>
        <div className="min-w-0">
          <label
            htmlFor="razorpay-key-secret"
            className="mb-1.5 block text-[13px] font-medium text-(--text)"
          >
            Key Secret
          </label>
          <div className="relative">
            <input
              id="razorpay-key-secret"
              type={showSecret ? "text" : "password"}
              value={keySecret}
              onChange={(event) => {
                connect.reset();
                setKeySecret(event.target.value);
              }}
              placeholder="Paste the secret"
              spellCheck={false}
              autoComplete="new-password"
              className={`${fieldClass} w-full pr-11! font-mono`}
            />
            <button
              type="button"
              onClick={() => setShowSecret((shown) => !shown)}
              aria-label={showSecret ? "Hide the secret" : "Show the secret"}
              className="absolute top-1/2 right-2 inline-flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-(--muted) hover:text-(--text)"
            >
              {showSecret ? <EyeSlash size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
      </div>
      <p className="m-0 flex items-center gap-1.5 text-[12px] text-(--muted)">
        <LockKey size={14} />
        Encrypted before it is stored. Nobody can see the secret again,
        including you and us.
      </p>
      {error ? <Notice tone="warning">{error}</Notice> : null}
      <div className="flex flex-wrap items-center gap-2.5">
        <Button type="submit" disabled={!ready || connect.isPending}>
          <Plugs size={16} weight="bold" />
          {connect.isPending
            ? "Checking with Razorpay…"
            : replacing
              ? "Save new keys"
              : "Save and check"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function ConnectedSummary({ gateway }: { gateway: AcademyPaymentGateway }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-500">
          <CheckCircle size={20} weight="fill" />
        </span>
        <div>
          <p className="m-0 text-sm font-semibold text-(--text)">
            Razorpay connected
          </p>
          <p className="m-0 text-[12px] text-(--muted)">
            {gateway.connectedBy ? `By ${gateway.connectedBy}` : "Connected"}
            {gateway.connectedAt
              ? ` · ${formatDate(gateway.updatedAt ?? gateway.connectedAt)}`
              : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            gateway.mode === "live"
              ? "border border-emerald-500/20 bg-emerald-500/12 text-emerald-500"
              : "border border-amber-500/25 bg-amber-500/12 text-amber-500"
          }`}
        >
          {gateway.mode === "live" ? "Live" : "Test mode"}
        </span>
        <code className="font-mono text-[13px] text-(--text-secondary,var(--text))">
          {gateway.keyId}
        </code>
      </div>
    </div>
  );
}

/**
 * Platform → Payments: the academy connects its own Razorpay account, so
 * every sale is paid straight into it.
 */
export function PlatformPaymentsTab({
  setNotice,
}: {
  setNotice?: (message: string) => void;
}) {
  const query = usePaymentGatewayStatus();
  const renew = useRenewWebhookSecret();
  const disconnect = useDisconnectRazorpay();
  const [replacing, setReplacing] = useState(false);
  const [freshSecret, setFreshSecret] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"renew" | "remove" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const gateway = query.data?.gateways.find(
    (item) => item.provider === "razorpay",
  );

  return (
    <div className="settings-content">
      <header className="settings-detail__header">
        <div>
          <h2>Payments</h2>
          <p>
            Connect your Razorpay account. Every sale is paid straight into it:
            VeoLMS never holds your money and adds no fee.
          </p>
        </div>
      </header>

      {!gateway ? (
        <PlatformSettingsStatus
          isError={query.isError}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <div className="grid gap-4">
          <SettingsSection
            id="platform-payments-razorpay"
            title="Razorpay"
            description="UPI, cards, net banking and wallets. Money reaches your bank on Razorpay's usual schedule."
          >
            <div className="grid gap-4">
              {gateway.connected ? (
                <>
                  <ConnectedSummary gateway={gateway} />
                  {gateway.mode === "test" ? (
                    <Notice tone="warning">
                      <strong>Test mode:</strong> payments are not real. Try a
                      purchase with Razorpay&apos;s test card, then replace
                      these with your live keys when you&apos;re ready to sell.
                    </Notice>
                  ) : null}
                  {replacing ? (
                    <KeysForm
                      replacing
                      onCancel={() => setReplacing(false)}
                      onConnected={(secret) => {
                        setReplacing(false);
                        setFreshSecret(secret);
                        setNotice?.(
                          "New keys saved. Update the webhook secret in Razorpay too.",
                        );
                      }}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Button
                        variant="quiet"
                        onClick={() => setReplacing(true)}
                      >
                        <Key size={16} />
                        Replace keys
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => setConfirm("remove")}
                      >
                        Disconnect
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {gateway.usingServerKeys ? (
                    <Notice tone="info">
                      Right now payments use this site&apos;s built-in Razorpay
                      keys, set up by the platform team. Connect your own
                      account to be paid into it directly.
                    </Notice>
                  ) : (
                    <Notice tone="warning">
                      <strong>Payments are off</strong> until you connect an
                      account. Free courses and workshops still work.
                    </Notice>
                  )}
                  <StepList
                    steps={[
                      <>
                        Open{" "}
                        <ExternalLink href={RAZORPAY_API_KEYS_URL}>
                          Razorpay → Account &amp; Settings → API Keys
                        </ExternalLink>
                        .
                      </>,
                      <>
                        Choose <strong>Test mode</strong> to try it first, or{" "}
                        <strong>Live mode</strong> to sell, and generate a key.
                      </>,
                      "Paste the Key ID and Key Secret below. We check them with Razorpay before saving.",
                    ]}
                  />
                  <KeysForm
                    replacing={false}
                    onConnected={(secret) => {
                      setFreshSecret(secret);
                      setNotice?.(
                        "Razorpay connected. One more step: add the webhook.",
                      );
                    }}
                  />
                </>
              )}
            </div>
          </SettingsSection>

          {gateway.connected ? (
            <SettingsSection
              id="platform-payments-webhook"
              title="Webhook"
              description="Confirms payments even when a buyer closes the page early, and keeps refunds up to date."
            >
              <div className="grid gap-4">
                <StepList
                  steps={[
                    <>
                      Open{" "}
                      <ExternalLink href={RAZORPAY_WEBHOOKS_URL}>
                        Razorpay → Account &amp; Settings → Webhooks
                      </ExternalLink>{" "}
                      and press <strong>Add new webhook</strong>.
                    </>,
                    "Paste the webhook URL and the secret below.",
                    <>
                      Tick these events:{" "}
                      {gateway.webhookEvents.map((event, index) => (
                        <span key={event}>
                          <code className="font-mono text-[12px]">{event}</code>
                          {index < gateway.webhookEvents.length - 1
                            ? ", "
                            : "."}
                        </span>
                      ))}
                    </>,
                  ]}
                />
                <CopyRow label="Webhook URL" value={gateway.webhookUrl} />
                {freshSecret ? (
                  <div className="grid gap-2">
                    <CopyRow label="Webhook secret" value={freshSecret} />
                    <Notice tone="warning">
                      <strong>Copy it now.</strong> It is shown only this once.
                      Paste it into the webhook in Razorpay before you leave
                      this page.
                    </Notice>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] px-4 py-3">
                    <p className="m-0 flex items-center gap-2 text-[13px] text-(--text)">
                      <LockKey size={16} className="text-(--muted)" />
                      Webhook secret{" "}
                      {gateway.hasWebhookSecret
                        ? "is set (hidden)"
                        : "is missing"}
                    </p>
                    <Button variant="quiet" onClick={() => setConfirm("renew")}>
                      Make a new secret
                    </Button>
                  </div>
                )}
              </div>
            </SettingsSection>
          ) : null}

          {actionError ? <Notice tone="warning">{actionError}</Notice> : null}
        </div>
      )}

      <ConfirmActionModal
        id="payments-renew-secret"
        isOpen={confirm === "renew"}
        isPending={renew.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() =>
          renew.mutate(undefined, {
            onSuccess: (result) => {
              setConfirm(null);
              setFreshSecret(result.webhookSecret);
              setNotice?.(
                "New webhook secret made. Paste it into Razorpay now.",
              );
            },
            onError: (error) => {
              setConfirm(null);
              setActionError(getApiError(error).message);
            },
          })
        }
        icon={Key}
        title="Make a new webhook secret?"
        description="The old secret stops working at once. Until you paste the new one into the webhook in Razorpay, Razorpay's payment updates are refused."
        cancelLabel="Cancel"
        confirmLabel="Make a new secret"
        pendingLabel="Making…"
      />
      <ConfirmActionModal
        id="payments-disconnect"
        isOpen={confirm === "remove"}
        isPending={disconnect.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() =>
          disconnect.mutate(undefined, {
            onSuccess: (result) => {
              setConfirm(null);
              setFreshSecret(null);
              setNotice?.(
                result.usingServerKeys
                  ? "Razorpay disconnected. Payments use the site's built-in keys again."
                  : "Razorpay disconnected. Payments are off until you connect an account.",
              );
            },
            onError: (error) => {
              setConfirm(null);
              setActionError(getApiError(error).message);
            },
          })
        }
        icon={Plugs}
        tone="danger"
        title="Disconnect Razorpay?"
        description="Your keys are deleted from VeoLMS. Students can't pay until you connect an account again. Payments already made stay in your Razorpay account."
        cancelLabel="Keep connected"
        confirmLabel="Disconnect"
        pendingLabel="Disconnecting…"
      />
    </div>
  );
}
