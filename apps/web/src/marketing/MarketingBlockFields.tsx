import { useRef, useState } from "react";
import {
  MARKETING_BUTTON_LABEL_MAX,
  MARKETING_CARD_TEXT_MAX,
  MARKETING_CARD_TITLE_MAX,
  MARKETING_COUPON_CODE_MAX,
  MARKETING_COURSE_LINK,
  MARKETING_HEADING_MAX,
  MARKETING_QUOTE_MAX,
  MARKETING_TEXT_MAX,
  type MarketingAlign,
  type MarketingBlock,
} from "@veolms/contracts";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { TextAlignCenterIcon as TextAlignCenter } from "@phosphor-icons/react/TextAlignCenter";
import { TextAlignLeftIcon as TextAlignLeft } from "@phosphor-icons/react/TextAlignLeft";
import { TextAlignRightIcon as TextAlignRight } from "@phosphor-icons/react/TextAlignRight";
import { TextBIcon as TextB } from "@phosphor-icons/react/TextB";
import { UserIcon as User } from "@phosphor-icons/react/User";
import { ThemedSelect } from "../ThemedSelect";
import { getApiError } from "../lib/api-error";
import { useCouponsList } from "../services/coupons";
import {
  useMarketingAudienceOptions,
  useMarketingCardFill,
} from "../services/marketing";
import {
  fieldClass,
  inputClass,
  selectTriggerClass,
} from "../workshops/workshopHelpers";
import { ColorChoice, SegmentedChoice } from "./MarketingControls";
import { MarketingImageField } from "./MarketingImageField";
import { ACCENT_CHOICES, isWebAddress } from "./marketingHelpers";

type Block<Type extends MarketingBlock["type"]> = Extract<
  MarketingBlock,
  { type: Type }
>;

const ALIGN_OPTIONS = [
  { value: "left", label: "Left", icon: TextAlignLeft },
  { value: "center", label: "Centre", icon: TextAlignCenter },
  { value: "right", label: "Right", icon: TextAlignRight },
] as const satisfies readonly {
  value: MarketingAlign;
  label: string;
  icon: unknown;
}[];

function SmallLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-[12px] font-medium text-(--muted)"
    >
      {children}
    </label>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 mb-0 text-[12px] text-rose-500">{children}</p>;
}

/** The row of style options under a block's fields. */
function StyleRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[color-mix(in_srgb,var(--text)_7%,transparent)] px-3 py-2.5">
      {children}
    </div>
  );
}

function LinkField({
  id,
  value,
  onChange,
  disabled,
  aboutCourse,
  label,
  optional = false,
}: {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled: boolean;
  aboutCourse: boolean;
  label: string;
  optional?: boolean;
}) {
  const toCourse = value === MARKETING_COURSE_LINK;
  const text = value ?? "";
  const invalid = !toCourse && text.length > 8 && !isWebAddress(text);
  return (
    <div className="min-w-0">
      <SmallLabel htmlFor={id}>{label}</SmallLabel>
      {aboutCourse ? (
        <div className={`${fieldClass} mb-2 flex w-full items-center`}>
          <ThemedSelect
            id={`${id}-kind`}
            value={toCourse ? "course" : "address"}
            onValueChange={(choice) =>
              onChange(
                choice === "course"
                  ? MARKETING_COURSE_LINK
                  : optional
                    ? null
                    : "https://",
              )
            }
            options={[
              ["course", "Their course"],
              ["address", "A web address"],
            ]}
            disabled={disabled}
            ariaLabel={`${label}: where it goes`}
            triggerClassName={selectTriggerClass}
          />
        </div>
      ) : null}
      {toCourse ? (
        <p className="m-0 text-[12px] text-(--muted)">
          Opens the course this email is about.
        </p>
      ) : (
        <>
          <input
            id={id}
            type="url"
            inputMode="url"
            value={text}
            onChange={(event) => {
              const next = event.target.value.trim();
              onChange(optional && !next ? null : event.target.value);
            }}
            placeholder={
              optional
                ? "Optional: https://..."
                : "https://... a page, a document, a form"
            }
            disabled={disabled}
            aria-invalid={invalid || undefined}
            className={`${inputClass} w-full`}
          />
          {invalid ? (
            <FieldError>
              Use a full web address starting with https://
            </FieldError>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Text with a small toolbar: bold, a link, the student's first name. */
function TextField({
  block,
  onChange,
  disabled,
}: {
  block: Block<"text">;
  onChange: (block: MarketingBlock) => void;
  disabled: boolean;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [linking, setLinking] = useState<{
    words: string;
    url: string;
    start: number;
    end: number;
  } | null>(null);
  const id = `block-${block.id}`;

  function replaceSelection(make: (selected: string) => string) {
    const element = area.current;
    const start = element?.selectionStart ?? block.text.length;
    const end = element?.selectionEnd ?? block.text.length;
    const selected = block.text.slice(start, end);
    const inserted = make(selected);
    const text = (
      block.text.slice(0, start) +
      inserted +
      block.text.slice(end)
    ).slice(0, MARKETING_TEXT_MAX);
    onChange({ ...block, text });
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(
        start + inserted.length,
        start + inserted.length,
      );
    });
  }

  function startLink() {
    const element = area.current;
    const start = element?.selectionStart ?? block.text.length;
    const end = element?.selectionEnd ?? block.text.length;
    setLinking({
      words: block.text.slice(start, end),
      url: "https://",
      start,
      end,
    });
  }

  function addLink() {
    if (!linking) return;
    const words = linking.words.trim() || linking.url;
    const inserted = `[${words.replace(/[[\]]/gu, "")}](${linking.url.trim()})`;
    const text = (
      block.text.slice(0, linking.start) +
      inserted +
      block.text.slice(linking.end)
    ).slice(0, MARKETING_TEXT_MAX);
    onChange({ ...block, text });
    setLinking(null);
  }

  const toolButton =
    "inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border-none bg-transparent px-2 text-[12px] font-semibold text-(--muted) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text) disabled:opacity-40";
  const linkValid =
    linking !== null &&
    isWebAddress(linking.url.trim()) &&
    linking.url.trim().length > 8;

  return (
    <div className="grid gap-2 p-3">
      <div
        role="toolbar"
        aria-label="Text tools"
        className="flex flex-wrap items-center gap-0.5"
      >
        <button
          type="button"
          className={toolButton}
          disabled={disabled}
          onClick={() =>
            replaceSelection((selected) => `**${selected || "bold words"}**`)
          }
          title="Bold: select words first"
        >
          <TextB size={14} weight="bold" />
          Bold
        </button>
        <button
          type="button"
          className={toolButton}
          disabled={disabled}
          onClick={startLink}
          aria-expanded={linking !== null}
          title="Link: select words first"
        >
          <LinkSimple size={14} />
          Link
        </button>
        <button
          type="button"
          className={toolButton}
          disabled={disabled}
          onClick={() => replaceSelection(() => "{first_name}")}
          title="Their first name"
        >
          <User size={14} />
          First name
        </button>
      </div>
      <textarea
        ref={area}
        id={id}
        value={block.text}
        maxLength={MARKETING_TEXT_MAX}
        onChange={(event) => onChange({ ...block, text: event.target.value })}
        placeholder="Write your message. Leave a blank line for a new paragraph."
        disabled={disabled}
        rows={Math.min(12, Math.max(3, block.text.split("\n").length + 1))}
        aria-label="Text"
        className={`${inputClass} h-auto! w-full resize-y py-2.5 leading-6`}
      />
      {linking ? (
        <div className="grid gap-2 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--canvas)/50 p-2.5 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] sm:items-end">
          <div className="min-w-0">
            <SmallLabel htmlFor={`${id}-link-words`}>Words to show</SmallLabel>
            <input
              id={`${id}-link-words`}
              type="text"
              value={linking.words}
              onChange={(event) =>
                setLinking({ ...linking, words: event.target.value })
              }
              placeholder="the guide"
              className={`${inputClass} w-full`}
            />
          </div>
          <div className="min-w-0">
            <SmallLabel htmlFor={`${id}-link-url`}>Opens</SmallLabel>
            <input
              id={`${id}-link-url`}
              type="url"
              inputMode="url"
              value={linking.url}
              onChange={(event) =>
                setLinking({ ...linking, url: event.target.value })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && linkValid) {
                  event.preventDefault();
                  addLink();
                }
              }}
              placeholder="https://... a page, a PDF, a form"
              className={`${inputClass} w-full`}
              autoFocus
            />
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setLinking(null)}
              className="h-9 cursor-pointer rounded-lg border-none bg-transparent px-3 text-[12.5px] font-semibold text-(--muted) hover:text-(--text) sm:h-10"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!linkValid}
              onClick={addLink}
              className="h-9 cursor-pointer rounded-lg border-none bg-(--accent) px-3.5 text-[12.5px] font-semibold text-white disabled:opacity-40 sm:h-10"
            >
              Add link
            </button>
          </div>
        </div>
      ) : (
        <p className="m-0 text-[11.5px] text-(--muted)">
          Blank line = new paragraph · select words, then Bold or Link
        </p>
      )}
    </div>
  );
}

function CouponFields({
  block,
  onChange,
  disabled,
}: {
  block: Block<"coupon">;
  onChange: (block: MarketingBlock) => void;
  disabled: boolean;
}) {
  const id = `block-${block.id}`;
  const coupons = useCouponsList({ limit: 50 });
  const list = (coupons.data?.pages ?? []).flatMap((page) => page.items ?? []);
  const codeInvalid =
    block.code.length > 0 && !/^[A-Za-z0-9_-]+$/u.test(block.code);
  return (
    <div className="grid gap-3 p-3">
      {list.length ? (
        <div className="min-w-0">
          <SmallLabel htmlFor={`${id}-pick`}>
            Use one of your coupons
          </SmallLabel>
          <div className={`${fieldClass} flex w-full items-center`}>
            <ThemedSelect
              id={`${id}-pick`}
              value={
                list.find((coupon) => coupon.code === block.code)?.id ?? ""
              }
              onValueChange={(couponId) => {
                const coupon = list.find((item) => item.id === couponId);
                if (!coupon) return;
                const off =
                  coupon.discountType === "percentage"
                    ? `${coupon.discountValue}% off`
                    : `₹${coupon.discountValue.toLocaleString("en-IN")} off`;
                const ends = new Intl.DateTimeFormat("en-IN", {
                  day: "numeric",
                  month: "long",
                }).format(new Date(coupon.expiresAt));
                onChange({
                  ...block,
                  code: coupon.code,
                  note: `${off} · ends ${ends}`,
                });
              }}
              options={[
                ["", "Choose a coupon"],
                ...list.map(
                  (coupon) =>
                    [
                      coupon.id,
                      `${coupon.code}${coupon.description ? ` · ${coupon.description}` : ""}`,
                    ] as const,
                ),
              ]}
              searchable={list.length > 8}
              searchPlaceholder="Search coupons"
              disabled={disabled}
              ariaLabel="Use one of your coupons"
              triggerClassName={selectTriggerClass}
            />
          </div>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <SmallLabel htmlFor={`${id}-code`}>Code</SmallLabel>
          <input
            id={`${id}-code`}
            type="text"
            value={block.code}
            maxLength={MARKETING_COUPON_CODE_MAX}
            onChange={(event) =>
              onChange({
                ...block,
                code: event.target.value.toUpperCase().replace(/\s+/gu, ""),
              })
            }
            placeholder="SAVE20"
            disabled={disabled}
            aria-invalid={codeInvalid || undefined}
            className={`${inputClass} w-full font-mono font-semibold tracking-wider`}
          />
          {codeInvalid ? (
            <FieldError>Letters, numbers, - and _ only.</FieldError>
          ) : null}
        </div>
        <div className="min-w-0">
          <SmallLabel htmlFor={`${id}-title`}>Label above it</SmallLabel>
          <input
            id={`${id}-title`}
            type="text"
            value={block.title}
            maxLength={120}
            onChange={(event) =>
              onChange({ ...block, title: event.target.value })
            }
            placeholder="Your code"
            disabled={disabled}
            className={`${inputClass} w-full`}
          />
        </div>
      </div>
      <div className="min-w-0">
        <SmallLabel htmlFor={`${id}-note`}>Small print</SmallLabel>
        <input
          id={`${id}-note`}
          type="text"
          value={block.note}
          maxLength={200}
          onChange={(event) => onChange({ ...block, note: event.target.value })}
          placeholder="20% off any course · ends 30 November"
          disabled={disabled}
          className={`${inputClass} w-full`}
        />
      </div>
    </div>
  );
}

function CardFields({
  block,
  onChange,
  disabled,
  aboutCourse,
}: {
  block: Block<"card">;
  onChange: (block: MarketingBlock) => void;
  disabled: boolean;
  aboutCourse: boolean;
}) {
  const id = `block-${block.id}`;
  const options = useMarketingAudienceOptions({
    enabled: block.source !== "custom",
  });
  const fill = useMarketingCardFill();
  const [error, setError] = useState<string | null>(null);
  const items =
    block.source === "course"
      ? (options.data?.courses ?? [])
      : block.source === "workshop"
        ? (options.data?.workshops ?? [])
        : [];

  async function pick(sourceId: string) {
    if (block.source === "custom" || !sourceId) return;
    setError(null);
    try {
      const card = await fill.mutateAsync({
        source: block.source,
        id: sourceId,
      });
      onChange({
        ...block,
        sourceId,
        title: card.title.slice(0, MARKETING_CARD_TITLE_MAX),
        meta: card.meta,
        text: card.text.slice(0, MARKETING_CARD_TEXT_MAX),
        imageUrl: card.imageUrl,
        url: card.url,
        buttonLabel: card.buttonLabel,
      });
    } catch (problem) {
      setError(getApiError(problem).message);
    }
  }

  return (
    <div className="grid gap-3 p-3">
      {block.source !== "custom" ? (
        <div className="min-w-0">
          <SmallLabel htmlFor={`${id}-source`}>
            {block.source === "course" ? "Course" : "Workshop"}
          </SmallLabel>
          <div className={`${fieldClass} flex w-full items-center`}>
            <ThemedSelect
              id={`${id}-source`}
              value={block.sourceId ?? ""}
              onValueChange={(value) => void pick(value)}
              options={[
                [
                  "",
                  block.source === "course"
                    ? "Choose a course"
                    : "Choose a workshop",
                ],
                ...items.map((item) => [item.id, item.title] as const),
              ]}
              searchable={items.length > 8}
              searchPlaceholder="Search"
              disabled={disabled || fill.isPending}
              ariaLabel={block.source === "course" ? "Course" : "Workshop"}
              triggerClassName={selectTriggerClass}
            />
          </div>
          <p
            className="mt-1 mb-0 text-[11.5px] text-(--muted)"
            aria-live="polite"
          >
            {fill.isPending
              ? "Filling in the card…"
              : error
                ? error
                : "Picking one fills in the card. You can still change any word."}
          </p>
        </div>
      ) : null}
      <MarketingImageField
        label="Picture"
        value={block.imageUrl}
        onChange={(imageUrl) => onChange({ ...block, imageUrl })}
        disabled={disabled}
        optional
        compact
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <SmallLabel htmlFor={`${id}-title`}>Title</SmallLabel>
          <input
            id={`${id}-title`}
            type="text"
            value={block.title}
            maxLength={MARKETING_CARD_TITLE_MAX}
            onChange={(event) =>
              onChange({ ...block, title: event.target.value })
            }
            disabled={disabled}
            className={`${inputClass} w-full font-semibold`}
          />
        </div>
        <div className="min-w-0">
          <SmallLabel htmlFor={`${id}-meta`}>Small line above</SmallLabel>
          <input
            id={`${id}-meta`}
            type="text"
            value={block.meta}
            maxLength={120}
            onChange={(event) =>
              onChange({ ...block, meta: event.target.value })
            }
            placeholder="Live · Sat 30 Nov, 7 pm"
            disabled={disabled}
            className={`${inputClass} w-full`}
          />
        </div>
      </div>
      <div className="min-w-0">
        <SmallLabel htmlFor={`${id}-text`}>Description</SmallLabel>
        <textarea
          id={`${id}-text`}
          value={block.text}
          maxLength={MARKETING_CARD_TEXT_MAX}
          rows={2}
          onChange={(event) => onChange({ ...block, text: event.target.value })}
          placeholder="One or two lines on why it's worth it."
          disabled={disabled}
          className={`${inputClass} h-auto! w-full resize-y py-2 leading-6`}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <SmallLabel htmlFor={`${id}-button`}>Button text</SmallLabel>
          <input
            id={`${id}-button`}
            type="text"
            value={block.buttonLabel}
            maxLength={MARKETING_BUTTON_LABEL_MAX}
            onChange={(event) =>
              onChange({ ...block, buttonLabel: event.target.value })
            }
            disabled={disabled}
            className={`${inputClass} w-full`}
          />
        </div>
        <LinkField
          id={`${id}-url`}
          label="Opens"
          value={block.url}
          onChange={(url) => onChange({ ...block, url: url ?? "" })}
          disabled={disabled}
          aboutCourse={aboutCourse}
        />
      </div>
    </div>
  );
}

/** One block's fields, then its style options. */
export function MarketingBlockFields({
  block,
  onChange,
  disabled,
  aboutCourse,
  accentColor,
}: {
  block: MarketingBlock;
  onChange: (block: MarketingBlock) => void;
  disabled: boolean;
  aboutCourse: boolean;
  /** The email's accent, which a button uses unless it has its own. */
  accentColor: string;
}) {
  const id = `block-${block.id}`;
  switch (block.type) {
    case "heading":
      return (
        <>
          <div className="p-3">
            <input
              id={id}
              type="text"
              value={block.text}
              maxLength={MARKETING_HEADING_MAX}
              onChange={(event) =>
                onChange({ ...block, text: event.target.value })
              }
              placeholder="A clear headline"
              disabled={disabled}
              aria-label="Heading"
              className={`${inputClass} w-full font-semibold`}
            />
          </div>
          <StyleRow>
            <SegmentedChoice
              label="Size"
              showLabel
              value={block.size}
              options={[
                { value: "large", label: "L" },
                { value: "medium", label: "M" },
                { value: "small", label: "S" },
              ]}
              onChange={(size) => onChange({ ...block, size })}
              disabled={disabled}
            />
            <SegmentedChoice
              label="Align"
              value={block.align}
              options={ALIGN_OPTIONS}
              onChange={(align) => onChange({ ...block, align })}
              disabled={disabled}
            />
          </StyleRow>
        </>
      );
    case "text":
      return (
        <>
          <TextField block={block} onChange={onChange} disabled={disabled} />
          <StyleRow>
            <SegmentedChoice
              label="Align"
              value={block.align}
              options={ALIGN_OPTIONS}
              onChange={(align) => onChange({ ...block, align })}
              disabled={disabled}
            />
          </StyleRow>
        </>
      );
    case "button":
      return (
        <>
          <div className="grid gap-3 p-3 sm:grid-cols-2">
            <div className="min-w-0">
              <SmallLabel htmlFor={`${id}-label`}>Button text</SmallLabel>
              <input
                id={`${id}-label`}
                type="text"
                value={block.label}
                maxLength={MARKETING_BUTTON_LABEL_MAX}
                onChange={(event) =>
                  onChange({ ...block, label: event.target.value })
                }
                placeholder="Start learning"
                disabled={disabled}
                className={`${inputClass} w-full`}
              />
            </div>
            <LinkField
              id={`${id}-url`}
              label="Opens"
              value={block.url}
              onChange={(url) => onChange({ ...block, url: url ?? "" })}
              disabled={disabled}
              aboutCourse={aboutCourse}
            />
          </div>
          <StyleRow>
            <SegmentedChoice
              label="Style"
              showLabel
              value={block.style}
              options={[
                { value: "filled", label: "Filled" },
                { value: "outline", label: "Outline" },
              ]}
              onChange={(style) => onChange({ ...block, style })}
              disabled={disabled}
            />
            <SegmentedChoice
              label="Width"
              value={block.fullWidth ? "full" : "fit"}
              options={[
                { value: "fit", label: "Fit text" },
                { value: "full", label: "Full width" },
              ]}
              onChange={(width) =>
                onChange({ ...block, fullWidth: width === "full" })
              }
              disabled={disabled}
            />
            {!block.fullWidth ? (
              <SegmentedChoice
                label="Align"
                value={block.align}
                options={ALIGN_OPTIONS}
                onChange={(align) => onChange({ ...block, align })}
                disabled={disabled}
              />
            ) : null}
            <div className="basis-full">
              <ColorChoice
                label="Colour"
                value={block.color}
                options={ACCENT_CHOICES}
                onChange={(color) => onChange({ ...block, color })}
                defaultColor={accentColor}
                defaultLabel="The email's accent"
                disabled={disabled}
              />
            </div>
          </StyleRow>
        </>
      );
    case "image":
      return (
        <>
          <div className="grid gap-3 p-3">
            <MarketingImageField
              label="Image"
              value={block.url === "https://" ? null : block.url}
              onChange={(url) => onChange({ ...block, url: url ?? "https://" })}
              disabled={disabled}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <SmallLabel htmlFor={`${id}-alt`}>
                  Describe the image
                </SmallLabel>
                <input
                  id={`${id}-alt`}
                  type="text"
                  value={block.alt}
                  maxLength={200}
                  onChange={(event) =>
                    onChange({ ...block, alt: event.target.value })
                  }
                  placeholder="Shown if the image doesn't load"
                  disabled={disabled}
                  className={`${inputClass} w-full`}
                />
              </div>
              <LinkField
                id={`${id}-link`}
                label="Opens when tapped"
                value={block.link}
                onChange={(link) => onChange({ ...block, link })}
                disabled={disabled}
                aboutCourse={aboutCourse}
                optional
              />
            </div>
          </div>
          <StyleRow>
            <SegmentedChoice
              label="Size"
              showLabel
              value={block.size}
              options={[
                { value: "full", label: "Full" },
                { value: "medium", label: "Medium" },
                { value: "small", label: "Small" },
              ]}
              onChange={(size) => onChange({ ...block, size })}
              disabled={disabled}
            />
            {block.size !== "full" ? (
              <SegmentedChoice
                label="Align"
                value={block.align}
                options={ALIGN_OPTIONS}
                onChange={(align) => onChange({ ...block, align })}
                disabled={disabled}
              />
            ) : null}
          </StyleRow>
        </>
      );
    case "divider":
      return (
        <div className="px-4 py-3.5" aria-hidden="true">
          <div className="h-px bg-[color-mix(in_srgb,var(--text)_14%,transparent)]" />
        </div>
      );
    case "spacer":
      return (
        <div className="p-3">
          <SegmentedChoice
            label="Height"
            showLabel
            value={block.size}
            options={[
              { value: "small", label: "Small" },
              { value: "medium", label: "Medium" },
              { value: "large", label: "Large" },
            ]}
            onChange={(size) => onChange({ ...block, size })}
            disabled={disabled}
          />
        </div>
      );
    case "coupon":
      return (
        <CouponFields block={block} onChange={onChange} disabled={disabled} />
      );
    case "card":
      return (
        <CardFields
          block={block}
          onChange={onChange}
          disabled={disabled}
          aboutCourse={aboutCourse}
        />
      );
    case "quote":
      return (
        <div className="grid gap-3 p-3">
          <div className="min-w-0">
            <SmallLabel htmlFor={`${id}-text`}>Quote</SmallLabel>
            <textarea
              id={`${id}-text`}
              value={block.text}
              maxLength={MARKETING_QUOTE_MAX}
              rows={2}
              onChange={(event) =>
                onChange({ ...block, text: event.target.value })
              }
              placeholder="What a student said about you"
              disabled={disabled}
              className={`${inputClass} h-auto! w-full resize-y py-2 leading-6`}
            />
          </div>
          <div className="min-w-0">
            <SmallLabel htmlFor={`${id}-name`}>Who said it</SmallLabel>
            <input
              id={`${id}-name`}
              type="text"
              value={block.name}
              maxLength={120}
              onChange={(event) =>
                onChange({ ...block, name: event.target.value })
              }
              placeholder="Priya, Web Development student"
              disabled={disabled}
              className={`${inputClass} w-full`}
            />
          </div>
        </div>
      );
  }
}
