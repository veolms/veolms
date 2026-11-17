import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/ArrowDown";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/ArrowUp";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import type {
  SiteButton,
  SiteCourseCard,
  SiteImage,
  SiteLink,
  SitePageSummary,
} from "@veolms/contracts";
import { useId, useState } from "react";
import { Checkbox } from "../../components/Checkbox";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import { ThemedSelect } from "../../ThemedSelect";
import {
  addButtonClasses,
  fieldLabelClasses,
  iconButtonClasses,
  panelCardClasses,
  segmentClasses,
  segmentGroupClasses,
  selectTriggerClasses,
  textareaClasses,
  textInputClasses,
} from "./editorStyles";
import { ImageField } from "./ImageField";
import type { ConditionalField, FieldSpec } from "./sectionCatalog";

export interface FieldChoices {
  courses: readonly SiteCourseCard[];
  /** The site's other pages, for links between pages. */
  pages: readonly SitePageSummary[];
}

type Values = Record<string, unknown>;

/**
 * One field of a section's Content tab, drawn from its description in the
 * section catalogue. `onChange` receives the field's new value; typing
 * edits share `coalesceKey` so they undo together.
 */
export function FieldControl({
  field,
  value,
  onChange,
  choices,
}: {
  field: FieldSpec;
  value: unknown;
  onChange: (value: unknown, options?: { typing?: boolean }) => void;
  choices: FieldChoices;
}) {
  const id = useId();
  switch (field.kind) {
    case "text":
      return (
        <label className="block" htmlFor={id}>
          <span className={fieldLabelClasses}>{field.label}</span>
          <input
            id={id}
            className={textInputClasses}
            value={String(value ?? "")}
            maxLength={field.max}
            placeholder={field.placeholder}
            onChange={(event) => onChange(event.target.value, { typing: true })}
          />
        </label>
      );
    case "textarea":
      return (
        <label className="block" htmlFor={id}>
          <span className={fieldLabelClasses}>{field.label}</span>
          <textarea
            id={id}
            className={textareaClasses}
            rows={field.rows ?? 3}
            value={String(value ?? "")}
            maxLength={field.max}
            placeholder={field.placeholder}
            onChange={(event) => onChange(event.target.value, { typing: true })}
          />
        </label>
      );
    case "toggle":
      return (
        <div className="flex items-start justify-between gap-3">
          <span className="grid gap-0.5">
            <span className="text-[13px] font-semibold text-(--text)">
              {field.label}
            </span>
            {field.help ? (
              <span className="text-[11.5px] leading-snug text-(--muted)">
                {field.help}
              </span>
            ) : null}
          </span>
          <ToggleSwitch
            checked={Boolean(value)}
            onChange={(checked) => onChange(checked)}
            label={field.label}
          />
        </div>
      );
    case "choice":
      return (
        <div>
          <span className={fieldLabelClasses}>{field.label}</span>
          <Segmented
            label={field.label}
            value={String(value ?? "")}
            options={field.options}
            onChange={(next) => onChange(next)}
          />
        </div>
      );
    case "number":
      return (
        <label className="block" htmlFor={id}>
          <span className={fieldLabelClasses}>{field.label}</span>
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={field.min}
            max={field.max}
            className={`${textInputClasses} max-w-28`}
            value={Number(value ?? field.min)}
            onChange={(event) => {
              const next = Math.round(Number(event.target.value));
              if (Number.isFinite(next)) {
                onChange(Math.min(field.max, Math.max(field.min, next)));
              }
            }}
          />
        </label>
      );
    case "image":
      return (
        <ImageField
          label={field.label}
          value={(value as SiteImage | undefined) ?? { src: "", alt: "" }}
          onChange={(next, typing) => onChange(next, { typing })}
        />
      );
    case "button":
      return (
        <ButtonField
          label={field.label}
          value={
            (value as SiteButton | undefined) ?? {
              label: "",
              link: { kind: "none" },
            }
          }
          onChange={onChange}
          choices={choices}
        />
      );
    case "link":
      return (
        <LinkField
          label={field.label}
          value={(value as SiteLink | undefined) ?? { kind: "none" }}
          onChange={onChange}
          choices={choices}
        />
      );
    case "courses":
      return (
        <CoursesField
          label={field.label}
          value={(value as string[] | undefined) ?? []}
          onChange={(next) => onChange(next)}
          choices={choices}
        />
      );
    case "list":
      return (
        <ListField
          field={field}
          value={(value as Values[] | undefined) ?? []}
          onChange={onChange}
          choices={choices}
        />
      );
  }
}

/** The fields of a section (or a list item) in order, hiding the ones that don't apply. */
export function FieldList({
  fields,
  values,
  onChange,
  choices,
}: {
  fields: readonly ConditionalField[];
  values: Values;
  onChange: (
    key: string,
    value: unknown,
    options?: { typing?: boolean },
  ) => void;
  choices: FieldChoices;
}) {
  return (
    <div className="grid gap-4">
      {fields
        .filter((field) => !field.showIf || field.showIf(values))
        .map((field) => (
          <FieldControl
            key={field.key}
            field={field}
            value={values[field.key]}
            onChange={(value, options) => onChange(field.key, value, options)}
            choices={choices}
          />
        ))}
    </div>
  );
}

export function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={segmentGroupClasses}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={segmentClasses(option.value === value)}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const LINK_KINDS = [
  ["none", "No link"],
  ["courses", "All courses"],
  ["course", "A course"],
  ["page", "A page of this site"],
  ["url", "A web address"],
] as const;

function LinkField({
  label,
  value,
  onChange,
  choices,
}: {
  label: string;
  value: SiteLink;
  onChange: (value: unknown, options?: { typing?: boolean }) => void;
  choices: FieldChoices;
}) {
  const id = useId();
  const firstCourse = choices.courses[0]?.id;
  const firstPage = choices.pages[0]?.id;
  return (
    <div className="grid gap-2">
      <span className={fieldLabelClasses}>{label}</span>
      <ThemedSelect
        triggerClassName={selectTriggerClasses}
        ariaLabel={label}
        value={value.kind}
        options={LINK_KINDS.map(([kind, name]) => [kind, name] as const)}
        onValueChange={(kind) => {
          switch (kind) {
            case "none":
            case "courses":
              onChange({ kind });
              return;
            case "course":
              onChange(
                firstCourse
                  ? { kind, courseId: firstCourse }
                  : { kind: "none" },
              );
              return;
            case "page":
              onChange(
                firstPage ? { kind, pageId: firstPage } : { kind: "none" },
              );
              return;
            case "url":
              onChange({ kind, href: "https://" });
          }
        }}
      />
      {value.kind === "course" ? (
        <ThemedSelect
          triggerClassName={selectTriggerClasses}
          ariaLabel="Which course"
          value={value.courseId}
          searchable={choices.courses.length > 6}
          options={choices.courses.map(
            (course) => [course.id, course.title] as const,
          )}
          onValueChange={(courseId) => onChange({ kind: "course", courseId })}
        />
      ) : value.kind === "page" ? (
        <ThemedSelect
          triggerClassName={selectTriggerClasses}
          ariaLabel="Which page"
          value={value.pageId}
          options={choices.pages.map((page) => [page.id, page.title] as const)}
          onValueChange={(pageId) => onChange({ kind: "page", pageId })}
        />
      ) : value.kind === "url" ? (
        <input
          id={id}
          aria-label="Web address"
          className={textInputClasses}
          value={value.href}
          inputMode="url"
          placeholder="https://"
          onChange={(event) =>
            onChange(
              { kind: "url", href: event.target.value },
              { typing: true },
            )
          }
        />
      ) : null}
      {(value.kind === "course" && choices.courses.length === 0) ||
      (value.kind === "page" && choices.pages.length === 0) ? (
        <span className="text-[11.5px] text-(--muted)">
          Nothing to link to yet.
        </span>
      ) : null}
    </div>
  );
}

function ButtonField({
  label,
  value,
  onChange,
  choices,
}: {
  label: string;
  value: SiteButton;
  onChange: (value: unknown, options?: { typing?: boolean }) => void;
  choices: FieldChoices;
}) {
  const id = useId();
  return (
    <div className={panelCardClasses}>
      <label className="block" htmlFor={id}>
        <span className={fieldLabelClasses}>{label}: text</span>
        <input
          id={id}
          className={textInputClasses}
          value={value.label}
          maxLength={60}
          placeholder="Leave empty to hide the button"
          onChange={(event) =>
            onChange({ ...value, label: event.target.value }, { typing: true })
          }
        />
      </label>
      <LinkField
        label="Goes to"
        value={value.link}
        onChange={(link, options) => onChange({ ...value, link }, options)}
        choices={choices}
      />
    </div>
  );
}

function CoursesField({
  label,
  value,
  onChange,
  choices,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  choices: FieldChoices;
}) {
  if (choices.courses.length === 0) {
    return (
      <p className="m-0 text-[12.5px] text-(--muted)">
        Publish a course first, then pick it here.
      </p>
    );
  }
  return (
    <fieldset className="m-0 grid gap-1.5 border-0 p-0">
      <legend className={`${fieldLabelClasses} p-0`}>{label}</legend>
      {choices.courses.map((course) => {
        const on = value.includes(course.id);
        return (
          <Checkbox
            key={course.id}
            checked={on}
            className="w-full"
            onCheckedChange={() =>
              onChange(
                on
                  ? value.filter((id) => id !== course.id)
                  : [...value, course.id].slice(0, 12),
              )
            }
            label={
              course.priceLabel
                ? `${course.title} (${course.priceLabel})`
                : course.title
            }
          />
        );
      })}
    </fieldset>
  );
}

function ListField({
  field,
  value,
  onChange,
  choices,
}: {
  field: Extract<FieldSpec, { kind: "list" }>;
  value: Values[];
  onChange: (value: unknown, options?: { typing?: boolean }) => void;
  choices: FieldChoices;
}) {
  const [open, setOpen] = useState<number | null>(
    value.length === 1 ? 0 : null,
  );
  const update = (index: number, next: Values, typing?: boolean) =>
    onChange(
      value.map((item, at) => (at === index ? next : item)),
      { typing },
    );
  const move = (index: number, by: number) => {
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    onChange(next);
    setOpen(index + by);
  };
  return (
    <div className="grid gap-2">
      <span className={`${fieldLabelClasses} mb-0`}>
        {field.label} ({value.length})
      </span>
      {value.map((item, index) => {
        const title = String(item[field.titleKey] ?? "").trim();
        const isOpen = open === index;
        return (
          <div
            key={index}
            className="rounded-xl border border-[color-mix(in_srgb,var(--text)_9%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))]"
          >
            <div className="flex items-center gap-1 py-1 pr-1 pl-3">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : index)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-none bg-transparent py-1.5 text-left text-[13px] font-semibold text-(--text)"
              >
                <CaretDown
                  size={13}
                  className={`shrink-0 text-(--muted) transition-transform ${isOpen ? "" : "-rotate-90"}`}
                  aria-hidden="true"
                />
                <span className="truncate">
                  {title || `${field.itemLabel} ${index + 1}`}
                </span>
              </button>
              <button
                type="button"
                className={iconButtonClasses}
                aria-label={`Move ${field.itemLabel.toLowerCase()} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                className={iconButtonClasses}
                aria-label={`Move ${field.itemLabel.toLowerCase()} down`}
                disabled={index === value.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                className={`${iconButtonClasses} hover:bg-rose-500/10! hover:text-rose-500!`}
                aria-label={`Remove ${field.itemLabel.toLowerCase()}`}
                onClick={() => {
                  onChange(value.filter((_, at) => at !== index));
                  setOpen(null);
                }}
              >
                <Trash size={14} />
              </button>
            </div>
            {isOpen ? (
              <div className="border-t border-[color-mix(in_srgb,var(--text)_7%,transparent)] p-3">
                <FieldList
                  fields={field.fields}
                  values={item}
                  onChange={(key, next, options) =>
                    update(index, { ...item, [key]: next }, options?.typing)
                  }
                  choices={choices}
                />
              </div>
            ) : null}
          </div>
        );
      })}
      <button
        type="button"
        className={addButtonClasses}
        disabled={value.length >= field.max}
        onClick={() => {
          onChange([...value, field.newItem()]);
          setOpen(value.length);
        }}
      >
        <Plus size={14} weight="bold" aria-hidden="true" />
        Add {field.itemLabel.toLowerCase()}
      </button>
    </div>
  );
}
