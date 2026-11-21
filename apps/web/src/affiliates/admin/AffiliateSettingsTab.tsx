import { useEffect, useState } from "react";
import {
  AFFILIATE_ATTRIBUTION_WINDOW_DAYS,
  AFFILIATE_BUYER_DISCOUNT_PERCENT,
  AFFILIATE_HOLD_DAYS,
  AFFILIATE_TERMS_MAX,
  type AffiliateJoinMode,
  type AffiliateProgramSettings,
  type AffiliateRule,
  type AffiliateRuleTargetType,
  type UpdateAffiliateProgramSettingsRequest,
} from "@veolms/contracts";
import { CalendarCheckIcon as CalendarCheck } from "@phosphor-icons/react/CalendarCheck";
import { CursorClickIcon as CursorClick } from "@phosphor-icons/react/CursorClick";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { HandshakeIcon as Handshake } from "@phosphor-icons/react/Handshake";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { PercentIcon as Percent } from "@phosphor-icons/react/Percent";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { ReceiptIcon as Receipt } from "@phosphor-icons/react/Receipt";
import { SealPercentIcon as SealPercent } from "@phosphor-icons/react/SealPercent";
import { TagIcon as Tag } from "@phosphor-icons/react/Tag";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { UserPlusIcon as UserPlus } from "@phosphor-icons/react/UserPlus";
import { WalletIcon as Wallet } from "@phosphor-icons/react/Wallet";

import { Button } from "../../components/Button";
import { SlideOverPanel } from "../../components/SlideOverPanel";
import { useCapabilities } from "../../services/authorization";
import {
  useAdminAffiliates,
  useAffiliateAdminSettings,
  useAffiliateProductOptions,
  useAffiliateRules,
  useDeleteAffiliateRule,
  useSetAffiliateRule,
  useUpdateAffiliateSettings,
} from "../../services/affiliates";
import {
  SettingRow,
  SettingsToggle,
  StatusNote,
} from "../../settings/SettingsControls";
import {
  PanelBody,
  PanelFooter,
  secondaryButtonClassName,
} from "../../team/TeamBits";
import { ThemedSelect, type ThemedSelectOption } from "../../ThemedSelect";
import { PlatformSettingsStatus } from "../../platform/PlatformSettingsStatus";
import { formatAffiliateRate } from "../affiliateFormat";
import { fieldLabel, inputClassName, PanelMessage } from "./adminBits";

// The rows' controls drop under their text on a phone, as in Platform.
const ROW_CLASS =
  "max-[480px]:[grid-template-columns:2rem_minmax(0,1fr)] max-[480px]:[&_.settings-row__control]:col-start-2";

/** Every select in a row: one width, a full-height field, the app's look. */
const SELECT_TRIGGER =
  "w-[13.5rem]! max-[480px]:w-full! min-h-10! rounded-xl! px-3.5! text-sm! font-semibold! justify-between";

const JOIN_OPTIONS: readonly ThemedSelectOption<AffiliateJoinMode>[] = [
  ["open_with_approval", "Anyone applies, you approve"],
  ["open_auto_approve", "Anyone joins at once"],
  ["invite_only", "By invitation only"],
];

const days = (count: number) => (count === 1 ? "1 day" : `${count} days`);

/** Preset choices, plus the saved value when it is none of them. */
function presetOptions(
  presets: readonly number[],
  current: number,
  label: (value: number) => string,
  range: { min: number; max: number },
): readonly ThemedSelectOption[] {
  const values = [...new Set([...presets, current])]
    .filter((value) => value >= range.min && value <= range.max)
    .sort((a, b) => a - b);
  return values.map((value) => [String(value), label(value)] as const);
}

const rupeeLabel = (minor: number) =>
  minor === 0 ? "No minimum" : `₹${(minor / 100).toLocaleString("en-IN")}`;

/**
 * The program's settings, laid out as the Platform settings: a row per
 * setting, saved as soon as it is changed. Then the commission rates, and
 * the terms affiliates accept.
 */
export function AffiliateSettingsTab() {
  const query = useAffiliateAdminSettings();
  const { can } = useCapabilities();
  const canManage = can("affiliate.manage");
  const update = useUpdateAffiliateSettings();
  const [saved, setSaved] = useState<string | null>(null);

  if (!query.data) {
    return (
      <PlatformSettingsStatus
        isError={query.isError}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const settings = query.data.settings;
  const save = (
    change: UpdateAffiliateProgramSettingsRequest,
    message: string,
  ) => {
    setSaved(null);
    update.mutate(change, { onSuccess: () => setSaved(message) });
  };
  const disabled = !canManage || update.isPending;

  return (
    <div className="settings-content">
      <header className="settings-detail__header">
        <div>
          <h2>Settings</h2>
          <p>
            How people join, how commissions are earned and paid, and the terms
            they accept. Changes are saved at once.
          </p>
        </div>
      </header>

      {(saved || update.error) && (
        <div aria-live="polite">
          {update.error ? (
            <PanelMessage tone="error">{update.error.message}</PanelMessage>
          ) : (
            <PanelMessage tone="done">{saved}</PanelMessage>
          )}
        </div>
      )}

      <section
        className="settings-section"
        aria-labelledby="affiliate-program-heading"
      >
        <header className="settings-section__heading mb-3">
          <Handshake size={20} weight="duotone" />
          <div>
            <h3 id="affiliate-program-heading">The program</h3>
            <p>
              Off: links stop earning. Commissions already earned still mature
              and are paid.
            </p>
          </div>
        </header>
        <div className="settings-row-list">
          <SettingRow
            className={ROW_CLASS}
            icon={Handshake}
            label="Affiliate program"
            note={
              settings.enabled
                ? "On: approved affiliates earn on sales through their link or code."
                : "Off: nobody can join, and links don't earn."
            }
          >
            <SettingsToggle
              label="Affiliate program"
              checked={settings.enabled}
              disabled={disabled}
              onChange={(enabled) =>
                save(
                  { enabled },
                  enabled
                    ? "The program is on."
                    : "The program is off. Links stopped earning.",
                )
              }
            />
          </SettingRow>
          <SettingRow
            className={ROW_CLASS}
            icon={LinkSimple}
            label="Join page"
            note="Share it on your site, emails or socials. Learners also find it in their profile menu while you take applications."
          >
            <JoinLink />
          </SettingRow>
          <SettingRow
            className={ROW_CLASS}
            icon={UserPlus}
            label="Who can join"
            note="Invitations are always approved once accepted."
          >
            <ThemedSelect
              id="affiliate-join-mode"
              triggerClassName={SELECT_TRIGGER}
              ariaLabel="Who can join"
              value={settings.joinMode}
              options={JOIN_OPTIONS}
              disabled={disabled}
              onValueChange={(joinMode) =>
                save({ joinMode }, "Saved who can join.")
              }
            />
          </SettingRow>
        </div>
      </section>

      <section
        className="settings-section"
        aria-labelledby="affiliate-earning-heading"
      >
        <header className="settings-section__heading mb-3">
          <Percent size={20} weight="duotone" />
          <div>
            <h3 id="affiliate-earning-heading">Earning</h3>
            <p>When a sale counts for an affiliate, and how long it waits.</p>
          </div>
        </header>
        <div className="settings-row-list">
          <SettingRow
            className={ROW_CLASS}
            icon={CursorClick}
            label="A click counts for"
            note="The last affiliate link clicked within this time gets the sale."
          >
            <ThemedSelect
              id="affiliate-attribution-window"
              triggerClassName={SELECT_TRIGGER}
              ariaLabel="A click counts for"
              value={String(settings.attributionWindowDays)}
              options={presetOptions(
                [1, 7, 14, 30, 45, 60, 90, 180, 365],
                settings.attributionWindowDays,
                days,
                AFFILIATE_ATTRIBUTION_WINDOW_DAYS,
              )}
              disabled={disabled}
              onValueChange={(value) =>
                save(
                  { attributionWindowDays: Number(value) },
                  `A click now counts for ${days(Number(value))}.`,
                )
              }
            />
          </SettingRow>
          <SettingRow
            className={ROW_CLASS}
            icon={CalendarCheck}
            label="Hold commissions for"
            note="Your refund window: a commission is owed once it has passed. New commissions only."
          >
            <ThemedSelect
              id="affiliate-hold-days"
              triggerClassName={SELECT_TRIGGER}
              ariaLabel="Hold commissions for"
              value={String(settings.holdDays)}
              options={presetOptions(
                [0, 7, 14, 15, 30, 45, 60, 90],
                settings.holdDays,
                (value) => (value === 0 ? "Owed at once" : days(value)),
                AFFILIATE_HOLD_DAYS,
              )}
              disabled={disabled}
              onValueChange={(value) =>
                save(
                  { holdDays: Number(value) },
                  Number(value) === 0
                    ? "New commissions are owed at once."
                    : `New commissions are held for ${days(Number(value))}.`,
                )
              }
            />
          </SettingRow>
          <SettingRow
            className={ROW_CLASS}
            icon={Tag}
            label="Buyer discount with a code"
            note="Above zero, every approved affiliate's code is also a coupon for this much off."
          >
            <ThemedSelect
              id="affiliate-buyer-discount"
              triggerClassName={SELECT_TRIGGER}
              ariaLabel="Buyer discount with a code"
              value={String(settings.buyerDiscountPercent)}
              options={presetOptions(
                [0, 5, 10, 15, 20, 25, 30, 40, 50],
                settings.buyerDiscountPercent,
                (value) => (value === 0 ? "No discount" : `${value}% off`),
                AFFILIATE_BUYER_DISCOUNT_PERCENT,
              )}
              disabled={disabled}
              onValueChange={(value) =>
                save(
                  { buyerDiscountPercent: Number(value) },
                  Number(value) === 0
                    ? "Affiliate codes give no discount now."
                    : `Affiliate codes now give ${value}% off.`,
                )
              }
            />
          </SettingRow>
        </div>
      </section>

      <section
        className="settings-section"
        aria-labelledby="affiliate-payouts-heading"
      >
        <header className="settings-section__heading mb-3">
          <Wallet size={20} weight="duotone" />
          <div>
            <h3 id="affiliate-payouts-heading">Payouts</h3>
            <p>
              You pay by UPI or bank transfer and record it on the Payouts tab.
            </p>
          </div>
        </header>
        <div className="settings-row-list">
          <SettingRow
            className={ROW_CLASS}
            icon={Wallet}
            label="Smallest payout"
            note="An affiliate can ask to be paid once they are owed this much."
          >
            <ThemedSelect
              id="affiliate-min-payout"
              triggerClassName={SELECT_TRIGGER}
              ariaLabel="Smallest payout"
              value={String(settings.minPayoutMinor)}
              options={presetOptions(
                [0, 10_000, 50_000, 100_000, 200_000, 500_000, 1_000_000],
                settings.minPayoutMinor,
                rupeeLabel,
                { min: 0, max: 100_000_000 },
              )}
              disabled={disabled}
              onValueChange={(value) =>
                save(
                  { minPayoutMinor: Number(value) },
                  `Smallest payout: ${rupeeLabel(Number(value))}.`,
                )
              }
            />
          </SettingRow>
          <SettingRow
            className={ROW_CLASS}
            icon={Receipt}
            label="Suggest TDS on payouts"
            note="2% (20% without a PAN) once an affiliate's commissions pass ₹20,000 in a financial year. Only some academies must deduct it; ask your accountant."
          >
            <SettingsToggle
              label="Suggest TDS on payouts"
              checked={settings.tdsEnabled}
              disabled={disabled}
              onChange={(tdsEnabled) =>
                save(
                  { tdsEnabled },
                  tdsEnabled
                    ? "Payouts now suggest TDS."
                    : "Payouts no longer suggest TDS.",
                )
              }
            />
          </SettingRow>
        </div>
      </section>

      <RatesSection
        defaultRule={query.data.defaultRule}
        canManage={canManage}
      />

      <TermsSection
        settings={settings}
        canManage={canManage}
        pending={update.isPending}
        onSave={(termsText) => save({ termsText }, "Saved the terms.")}
      />
    </div>
  );
}

/** The join page's address, with a copy button. */
function JoinLink() {
  const [copied, setCopied] = useState(false);
  const link =
    typeof window === "undefined"
      ? "/affiliates/join"
      : `${window.location.origin}/affiliates/join`;
  return (
    <div className="flex items-center gap-1.5">
      <a
        href="/affiliates/join"
        target="_blank"
        rel="noreferrer"
        className="max-w-[12rem] truncate font-mono text-xs text-(--accent) hover:underline"
      >
        {link.replace(/^https?:\/\//u, "")}
      </a>
      <button
        type="button"
        aria-label="Copy the join page's address"
        title="Copy"
        onClick={() =>
          void navigator.clipboard?.writeText(link).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          })
        }
        className="grid size-8 place-items-center rounded-lg text-(--muted) hover:bg-(--hover) hover:text-(--text)"
      >
        {copied ? (
          <Check size={15} aria-hidden="true" />
        ) : (
          <Copy size={15} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

const TARGET_LABELS: Record<AffiliateRuleTargetType, string> = {
  course: "Course",
  bundle: "Bundle",
  workshop: "Workshop",
  quiz: "Quiz pass",
};

function ruleScope(rule: AffiliateRule): { who: string; what: string } {
  return {
    who: rule.affiliateCode ?? "Every affiliate",
    what: rule.targetType
      ? `${TARGET_LABELS[rule.targetType]}: ${rule.targetTitle ?? "removed"}`
      : "Every product",
  };
}

function RatesSection({
  defaultRule,
  canManage,
}: {
  defaultRule: AffiliateRule | null;
  canManage: boolean;
}) {
  const rules = useAffiliateRules();
  const remove = useDeleteAffiliateRule();
  const [editing, setEditing] = useState<"default" | "new" | null>(null);
  const specific = (rules.data?.items ?? []).filter(
    (rule) => rule.id !== defaultRule?.id,
  );
  return (
    <section
      className="settings-section"
      aria-labelledby="affiliate-rates-heading"
    >
      <header className="settings-section__heading mb-3">
        <SealPercent size={20} weight="duotone" />
        <div className="min-w-0 flex-1">
          <h3 id="affiliate-rates-heading">Commission rates</h3>
          <p>
            The most specific rate wins: affiliate and product, then affiliate,
            then product, then the default. A changed rate applies to new sales
            only.
          </p>
        </div>
      </header>
      <div className="settings-row-list">
        <SettingRow
          className={ROW_CLASS}
          icon={Percent}
          label="Default rate"
          note={
            defaultRule
              ? "What every affiliate earns on every product, unless a rate below applies."
              : "None yet: set one before switching the program on."
          }
        >
          <div className="flex items-center gap-2">
            <StatusNote>
              {defaultRule ? formatAffiliateRate(defaultRule) : "Not set"}
            </StatusNote>
            {canManage && (
              <button
                type="button"
                className={secondaryButtonClassName}
                onClick={() => setEditing("default")}
              >
                Change
              </button>
            )}
          </div>
        </SettingRow>
        {specific.map((rule) => {
          const scope = ruleScope(rule);
          return (
            <SettingRow
              key={rule.id}
              className={ROW_CLASS}
              icon={rule.affiliateCode ? UserPlus : Tag}
              label={scope.who}
              note={scope.what}
            >
              <div className="flex items-center gap-2">
                <StatusNote>{formatAffiliateRate(rule)}</StatusNote>
                {canManage && (
                  <button
                    type="button"
                    aria-label={`Remove the rate for ${scope.who}, ${scope.what}`}
                    title="Remove"
                    className="grid size-9 place-items-center rounded-lg text-(--muted) hover:bg-(--hover) hover:text-rose-500"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(rule.id)}
                  >
                    <Trash size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            </SettingRow>
          );
        })}
      </div>
      {remove.error && (
        <div className="mt-3">
          <PanelMessage tone="error">{remove.error.message}</PanelMessage>
        </div>
      )}
      {canManage && (
        <div className="mt-3">
          <Button
            elevation="flat"
            motion="static"
            variant="quiet"
            onClick={() => setEditing("new")}
          >
            <Plus size={16} weight="bold" aria-hidden="true" />
            Add a rate for an affiliate or product
          </Button>
        </div>
      )}
      {editing && (
        <RulePanel
          isDefault={editing === "default"}
          current={editing === "default" ? defaultRule : null}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function TermsSection({
  settings,
  canManage,
  pending,
  onSave,
}: {
  settings: AffiliateProgramSettings;
  canManage: boolean;
  pending: boolean;
  onSave: (termsText: string) => void;
}) {
  const [text, setText] = useState(settings.termsText);
  useEffect(() => setText(settings.termsText), [settings.termsText]);
  const changed = text !== settings.termsText;
  return (
    <section
      className="settings-section"
      aria-labelledby="affiliate-terms-heading"
    >
      <header className="settings-section__heading mb-3">
        <FileText size={20} weight="duotone" />
        <div>
          <h3 id="affiliate-terms-heading">Terms affiliates accept</h3>
          <p>Shown on the join page. Plain text.</p>
        </div>
      </header>
      <textarea
        aria-labelledby="affiliate-terms-heading"
        className={`${inputClassName} min-h-48 py-2`}
        value={text}
        maxLength={AFFILIATE_TERMS_MAX}
        disabled={!canManage}
        onChange={(event) => setText(event.target.value)}
      />
      {canManage && (
        <div className="mt-3 flex items-center gap-3">
          <Button
            elevation="flat"
            motion="static"
            disabled={!changed || pending}
            onClick={() => onSave(text)}
          >
            {pending ? "Saving…" : "Save terms"}
          </Button>
          {changed && (
            <button
              type="button"
              className={secondaryButtonClassName}
              onClick={() => setText(settings.termsText)}
            >
              Discard
            </button>
          )}
          <span className="ml-auto text-xs text-(--muted) tabular-nums">
            {text.length.toLocaleString("en-IN")} /{" "}
            {AFFILIATE_TERMS_MAX.toLocaleString("en-IN")}
          </span>
        </div>
      )}
    </section>
  );
}

const EVERY = "every";

function RulePanel({
  isDefault,
  current,
  onClose,
}: {
  isDefault: boolean;
  current: AffiliateRule | null;
  onClose: () => void;
}) {
  const save = useSetAffiliateRule();
  const products = useAffiliateProductOptions(!isDefault);
  const affiliates = useAdminAffiliates(
    { statuses: "approved", sort: "earned", pageSize: 50 },
    { enabled: !isDefault },
  );
  const [affiliateId, setAffiliateId] = useState(EVERY);
  const [product, setProduct] = useState(EVERY);
  const [rateType, setRateType] = useState<"percent" | "fixed">(
    current?.rateType ?? "percent",
  );
  const [value, setValue] = useState(
    current ? String(current.rateValue / 100) : "",
  );
  const amount = Number(value);
  const valid =
    value !== "" &&
    Number.isFinite(amount) &&
    amount >= 0 &&
    (rateType === "fixed" || amount <= 100) &&
    (isDefault || affiliateId !== EVERY || product !== EVERY);

  const affiliateOptions: readonly ThemedSelectOption[] = [
    [EVERY, "Every affiliate"],
    ...(affiliates.data?.items ?? []).map(
      (row) =>
        [row.id, row.name ? `${row.code} · ${row.name}` : row.code] as const,
    ),
  ];
  const productOptions: readonly ThemedSelectOption[] = [
    [EVERY, "Every product"],
    ...(products.data?.items ?? []).map(
      (option) =>
        [
          `${option.targetType}:${option.targetId}`,
          `${TARGET_LABELS[option.targetType]}: ${option.title}`,
        ] as const,
    ),
  ];

  function submit() {
    const [targetType, targetId] =
      product !== EVERY
        ? (product.split(":") as [AffiliateRuleTargetType, string])
        : [null, null];
    save.mutate(
      {
        affiliateId: isDefault || affiliateId === EVERY ? null : affiliateId,
        targetType: isDefault ? null : targetType,
        targetId: isDefault ? null : targetId,
        rateType,
        rateValue: Math.round(amount * 100),
        currency: rateType === "fixed" ? "INR" : null,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <SlideOverPanel
      label="Rate"
      title={isDefault ? "The default rate" : "Add a rate"}
      onClose={onClose}
    >
      <PanelBody>
        <div className="flex flex-col gap-4 text-sm">
          {!isDefault && (
            <>
              <div className={fieldLabel}>
                <span id="rule-affiliate-label">For an affiliate</span>
                <div className="rounded-xl border border-(--border) px-3">
                  <ThemedSelect
                    id="rule-affiliate"
                    ariaLabel="For an affiliate"
                    value={affiliateId}
                    options={affiliateOptions}
                    onValueChange={setAffiliateId}
                    searchable
                    searchPlaceholder="Find an affiliate"
                    triggerClassName="min-h-11! w-full p-0! bg-transparent! shadow-none! border-0!"
                  />
                </div>
              </div>
              <div className={fieldLabel}>
                <span>For a product</span>
                <div className="rounded-xl border border-(--border) px-3">
                  <ThemedSelect
                    id="rule-product"
                    ariaLabel="For a product"
                    value={product}
                    options={productOptions}
                    onValueChange={setProduct}
                    searchable
                    searchPlaceholder="Find a product"
                    triggerClassName="min-h-11! w-full p-0! bg-transparent! shadow-none! border-0!"
                  />
                </div>
              </div>
              <p className="m-0 text-xs text-(--muted)">
                Choose an affiliate, a product, or both.
              </p>
            </>
          )}
          <div
            role="radiogroup"
            aria-label="Kind of rate"
            className="grid grid-cols-2 gap-1 rounded-xl border border-(--border) p-1"
          >
            {(
              [
                ["percent", "Percentage"],
                ["fixed", "Fixed amount (₹)"],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={rateType === kind}
                onClick={() => setRateType(kind)}
                className={`h-9 rounded-lg text-sm font-semibold ${rateType === kind ? "bg-(--accent) text-(--on-accent)" : "text-(--text-secondary) hover:bg-(--hover)"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className={fieldLabel}>
            {rateType === "percent"
              ? "Percent of the price, before tax"
              : "Rupees per sale (never more than the price)"}
            <input
              className={`${inputClassName} font-normal`}
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <p className="m-0 text-xs text-(--muted)">
            0% leaves a product out of the program.
          </p>
          {save.error && (
            <p role="alert" className="m-0 text-rose-500">
              {save.error.message}
            </p>
          )}
        </div>
      </PanelBody>
      <PanelFooter>
        <button
          type="button"
          className={secondaryButtonClassName}
          onClick={onClose}
        >
          Cancel
        </button>
        <Button
          elevation="flat"
          motion="static"
          disabled={!valid || save.isPending}
          onClick={submit}
        >
          {save.isPending ? "Saving…" : "Save rate"}
        </Button>
      </PanelFooter>
    </SlideOverPanel>
  );
}
