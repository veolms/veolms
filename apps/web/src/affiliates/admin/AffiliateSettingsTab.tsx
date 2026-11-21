import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import {
  AFFILIATE_ATTRIBUTION_WINDOW_DAYS,
  AFFILIATE_BUYER_DISCOUNT_PERCENT,
  AFFILIATE_HOLD_DAYS,
  type AffiliateJoinMode,
  type AffiliateProgramSettings,
  type AffiliateRule,
  type AffiliateRuleTargetType,
} from "@veolms/contracts";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "../../components/Button";
import { ElevatedCard } from "../../components/ElevatedCard";
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
  inputClassName,
  ListSkeleton,
  LoadError,
  PanelBody,
  PanelFooter,
  secondaryButtonClassName,
} from "../../team/TeamBits";
import { formatAffiliateRate } from "../affiliateFormat";
import { FilterPills } from "./adminBits";

const JOIN_MODES: readonly { id: AffiliateJoinMode; label: string }[] = [
  { id: "open_with_approval", label: "Anyone applies, you approve" },
  { id: "open_auto_approve", label: "Anyone joins at once" },
  { id: "invite_only", label: "By invitation only" },
];

/** The program's settings, its default rate and the more specific rules. */
export function AffiliateSettingsTab() {
  const settings = useAffiliateAdminSettings();
  if (settings.isPending) return <ListSkeleton rows={4} />;
  if (settings.isError || !settings.data) {
    return (
      <LoadError
        icon={GearSix}
        title="Couldn't load the settings"
        onRetry={() => void settings.refetch()}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ProgramForm initial={settings.data.settings} />
      <RulesCard defaultRule={settings.data.defaultRule} />
    </div>
  );
}

function ProgramForm({ initial }: { initial: AffiliateProgramSettings }) {
  const { can } = useCapabilities();
  const canManage = can("affiliate.manage");
  const save = useUpdateAffiliateSettings();
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(false);
  useEffect(() => setForm(initial), [initial]);
  const set = <K extends keyof AffiliateProgramSettings>(
    key: K,
    value: AffiliateProgramSettings[K],
  ) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const changed = (
    Object.keys(form) as (keyof AffiliateProgramSettings)[]
  ).filter((key) => form[key] !== initial[key]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!changed.length) return;
    save.mutate(Object.fromEntries(changed.map((key) => [key, form[key]])), {
      onSuccess: () => setSaved(true),
    });
  }

  return (
    <ElevatedCard padded>
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-base font-semibold text-(--text)">
              The program
            </h2>
            <p className="m-0 mt-1 text-sm text-(--muted)">
              Off: links stop earning. Commissions already earned still mature
              and are paid.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-(--text)">
            <input
              type="checkbox"
              role="switch"
              className="size-4 accent-(--accent)"
              checked={form.enabled}
              disabled={!canManage}
              onChange={(event) => set("enabled", event.target.checked)}
            />
            {form.enabled ? "On" : "Off"}
          </label>
        </div>

        <fieldset
          disabled={!canManage}
          className="m-0 flex flex-col gap-5 border-0 p-0"
        >
          <Row label="Who can join">
            <FilterPills
              label="Who can join"
              options={JOIN_MODES}
              value={form.joinMode}
              onChange={(value) => set("joinMode", value)}
            />
          </Row>
          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            <NumberField
              label="A click counts for (days)"
              hint="The last link clicked within this time gets the sale."
              value={form.attributionWindowDays}
              min={AFFILIATE_ATTRIBUTION_WINDOW_DAYS.min}
              max={AFFILIATE_ATTRIBUTION_WINDOW_DAYS.max}
              onChange={(value) => set("attributionWindowDays", value)}
            />
            <NumberField
              label="Hold commissions for (days)"
              hint="Your refund window. New commissions only."
              value={form.holdDays}
              min={AFFILIATE_HOLD_DAYS.min}
              max={AFFILIATE_HOLD_DAYS.max}
              onChange={(value) => set("holdDays", value)}
            />
            <NumberField
              label="Smallest payout (₹)"
              value={form.minPayoutMinor / 100}
              min={0}
              max={1_000_000}
              onChange={(value) =>
                set("minPayoutMinor", Math.round(value * 100))
              }
            />
            <NumberField
              label="Buyer discount with an affiliate's code (%)"
              hint="Above zero, every approved affiliate's code is also a coupon."
              value={form.buyerDiscountPercent}
              min={AFFILIATE_BUYER_DISCOUNT_PERCENT.min}
              max={AFFILIATE_BUYER_DISCOUNT_PERCENT.max}
              onChange={(value) => set("buyerDiscountPercent", value)}
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-(--text)">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-(--accent)"
              checked={form.tdsEnabled}
              onChange={(event) => set("tdsEnabled", event.target.checked)}
            />
            <span>
              <span className="font-semibold">Suggest TDS on payouts</span>
              <span className="block text-xs text-(--muted)">
                2% (20% without a PAN) once an affiliate&apos;s commissions pass
                ₹20,000 in a financial year. Only some academies must deduct it;
                ask your accountant.
              </span>
            </span>
          </label>
          <Row label="Terms affiliates accept">
            <textarea
              className={`${inputClassName} min-h-40 py-2`}
              value={form.termsText}
              maxLength={10_000}
              onChange={(event) => set("termsText", event.target.value)}
            />
          </Row>
        </fieldset>
        {save.error ? (
          <p role="alert" className="m-0 text-sm text-rose-500">
            {save.error.message}
          </p>
        ) : null}
        {canManage ? (
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              elevation="flat"
              motion="static"
              disabled={!changed.length || save.isPending}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
            {saved && !changed.length ? (
              <span role="status" className="text-sm text-(--muted)">
                Saved.
              </span>
            ) : null}
          </div>
        ) : null}
      </form>
    </ElevatedCard>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-(--text)">{label}</span>
      {children}
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold text-(--text)">
      {label}
      <input
        type="number"
        className={inputClassName}
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        onChange={(event) =>
          onChange(
            Math.min(max, Math.max(min, Number(event.target.value) || 0)),
          )
        }
      />
      {hint ? (
        <span className="text-xs font-normal text-(--muted)">{hint}</span>
      ) : null}
    </label>
  );
}

const TARGET_LABELS: Record<AffiliateRuleTargetType, string> = {
  course: "Course",
  bundle: "Bundle",
  workshop: "Workshop",
  quiz: "Quiz pass",
};

function ruleScope(rule: AffiliateRule): string {
  const who = rule.affiliateCode ? rule.affiliateCode : "Every affiliate";
  const what = rule.targetType
    ? `${TARGET_LABELS[rule.targetType]}: ${rule.targetTitle ?? "removed"}`
    : "every product";
  return `${who}, ${what}`;
}

function RulesCard({ defaultRule }: { defaultRule: AffiliateRule | null }) {
  const { can } = useCapabilities();
  const canManage = can("affiliate.manage");
  const rules = useAffiliateRules();
  const remove = useDeleteAffiliateRule();
  const [editing, setEditing] = useState<"default" | "new" | null>(null);
  const specific = (rules.data?.items ?? []).filter(
    (rule) => rule.id !== defaultRule?.id,
  );
  return (
    <ElevatedCard padded className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-base font-semibold text-(--text)">
            Commission rates
          </h2>
          <p className="m-0 mt-1 text-sm text-(--muted)">
            The most specific rate wins: affiliate and product, then affiliate,
            then product, then the default. A changed rate applies to new sales
            only.
          </p>
        </div>
        {canManage ? (
          <Button
            elevation="flat"
            motion="static"
            onClick={() => setEditing("new")}
          >
            <Plus size={16} weight="bold" aria-hidden="true" /> Add a rate
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-(--surface-strong) px-4 py-3 text-sm">
        <span className="text-(--text)">
          <span className="font-semibold">Default</span> ·{" "}
          {defaultRule
            ? formatAffiliateRate(defaultRule)
            : "none yet (set when the program is switched on)"}
        </span>
        {canManage ? (
          <button
            type="button"
            className={secondaryButtonClassName}
            onClick={() => setEditing("default")}
          >
            Change
          </button>
        ) : null}
      </div>
      {specific.length ? (
        <ul className="m-0 flex list-none flex-col divide-y divide-(--border) p-0">
          {specific.map((rule) => (
            <li
              key={rule.id}
              className="flex items-center justify-between gap-3 py-2.5 text-sm"
            >
              <span className="min-w-0 text-(--text)">{ruleScope(rule)}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-semibold text-(--text)">
                  {formatAffiliateRate(rule)}
                </span>
                {canManage ? (
                  <button
                    type="button"
                    aria-label={`Remove the rate for ${ruleScope(rule)}`}
                    className="flex size-8 items-center justify-center rounded-lg text-(--muted) hover:bg-(--hover) hover:text-rose-500"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(rule.id)}
                  >
                    <Trash size={16} aria-hidden="true" />
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {editing ? (
        <RulePanel
          isDefault={editing === "default"}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </ElevatedCard>
  );
}

function RulePanel({
  isDefault,
  onClose,
}: {
  isDefault: boolean;
  onClose: () => void;
}) {
  const save = useSetAffiliateRule();
  const products = useAffiliateProductOptions(!isDefault);
  const [affiliateSearch, setAffiliateSearch] = useState("");
  const affiliates = useAdminAffiliates({
    status: "approved",
    q: affiliateSearch.trim() || undefined,
  });
  const [affiliateId, setAffiliateId] = useState("");
  const [product, setProduct] = useState("");
  const [rateType, setRateType] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("");
  const amount = Number(value);
  const rateValue = Math.round(amount * 100);
  const valid =
    value !== "" &&
    Number.isFinite(amount) &&
    amount >= 0 &&
    (rateType === "fixed" || amount <= 100) &&
    (isDefault || affiliateId || product);

  function submit() {
    const [targetType, targetId] = product
      ? (product.split(":") as [AffiliateRuleTargetType, string])
      : [null, null];
    save.mutate(
      {
        affiliateId: isDefault ? null : affiliateId || null,
        targetType: isDefault ? null : targetType,
        targetId: isDefault ? null : targetId,
        rateType,
        rateValue,
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
          {!isDefault ? (
            <>
              <label className="flex flex-col gap-1.5 font-semibold text-(--text)">
                For an affiliate (optional)
                <input
                  className={inputClassName}
                  placeholder="Search by code or name"
                  value={affiliateSearch}
                  onChange={(event) => setAffiliateSearch(event.target.value)}
                />
                <select
                  className={inputClassName}
                  value={affiliateId}
                  onChange={(event) => setAffiliateId(event.target.value)}
                >
                  <option value="">Every affiliate</option>
                  {(
                    affiliates.data?.pages.flatMap((page) => page.items) ?? []
                  ).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.code}
                      {row.name ? ` · ${row.name}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 font-semibold text-(--text)">
                For a product (optional)
                <select
                  className={inputClassName}
                  value={product}
                  onChange={(event) => setProduct(event.target.value)}
                >
                  <option value="">Every product</option>
                  {(products.data?.items ?? []).map((option) => (
                    <option
                      key={`${option.targetType}:${option.targetId}`}
                      value={`${option.targetType}:${option.targetId}`}
                    >
                      {TARGET_LABELS[option.targetType]}: {option.title}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          <FilterPills
            label="Kind of rate"
            options={[
              { id: "percent", label: "Percentage" },
              { id: "fixed", label: "Fixed amount (₹)" },
            ]}
            value={rateType}
            onChange={setRateType}
          />
          <label className="flex flex-col gap-1.5 font-semibold text-(--text)">
            {rateType === "percent"
              ? "Percent of the price, before tax"
              : "Rupees per sale (never more than the price)"}
            <input
              className={inputClassName}
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <p className="m-0 text-xs text-(--muted)">
            0% leaves a product out of the program.
          </p>
          {save.error ? (
            <p role="alert" className="m-0 text-rose-500">
              {save.error.message}
            </p>
          ) : null}
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
