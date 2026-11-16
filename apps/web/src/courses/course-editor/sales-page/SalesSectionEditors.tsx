import { useEffect, useRef, useState } from "react";
import {
  COURSE_PAGE_LIMITS,
  type CoursePageContent,
  type CoursePageSection,
} from "@veolms/contracts";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { ImageSquareIcon as ImageSquare } from "@phosphor-icons/react/ImageSquare";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { Checkbox } from "../../../components/Checkbox";
import { mediaService } from "../../../services/media";
import { inputClass } from "../../../workshops/workshopHelpers";
import { waitForCourseThumbnailCdnUrl } from "../../courseMedia";
import { newItemId } from "./salesPageMeta";

/**
 * The fields of each section in the Sales page step. Each editor shows the
 * section's content and reports every change; the card around it saves.
 */

const fieldLabelClasses =
  "mb-1.5 block text-[12.5px] font-medium text-(--muted)";
const iconButtonClasses =
  "inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-(--muted) transition-colors hover:bg-rose-500/10 hover:text-rose-500 disabled:pointer-events-none disabled:opacity-30";
const addButtonClasses =
  "inline-flex h-9 w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--text)_18%,transparent)] bg-transparent px-3 text-[13px] font-semibold text-(--text-secondary,var(--text)) transition-colors hover:border-(--accent)/50 hover:text-(--accent) disabled:pointer-events-none disabled:opacity-40";
const textareaClasses = `${inputClass} h-auto! w-full resize-y py-2.5 leading-6`;
const itemCardClasses =
  "grid gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] p-3";

function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span className="text-[11.5px] text-(--muted) tabular-nums">
      {value.length}/{max}
    </span>
  );
}

/** A list of short points: add, edit, remove. */
function PointsList({
  id,
  label,
  points,
  max,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  points: readonly string[];
  max: number;
  placeholder: string;
  onChange: (points: string[]) => void;
}) {
  const shown = points.length ? points : [""];
  // The point to focus once the list has re-rendered: the one Enter or
  // "Add a point" made, or the one before a point Backspace removed.
  const focusNext = useRef<number | null>(null);
  useEffect(() => {
    if (focusNext.current === null) return;
    document.getElementById(`${id}-${focusNext.current}`)?.focus();
    focusNext.current = null;
  });
  const addAfter = (index: number) => {
    if (shown.length >= max) return;
    focusNext.current = index + 1;
    onChange([...shown.slice(0, index + 1), "", ...shown.slice(index + 1)]);
  };
  return (
    <div className="grid gap-2">
      <span className={fieldLabelClasses}>{label}</span>
      <ul className="m-0 grid list-none gap-2 p-0">
        {shown.map((point, index) => (
          <li key={index} className="flex items-center gap-2">
            <input
              id={`${id}-${index}`}
              type="text"
              value={point}
              maxLength={COURSE_PAGE_LIMITS.pointLength}
              onChange={(event) => {
                const next = [...shown];
                next[index] = event.target.value;
                onChange(next);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter") {
                  event.preventDefault();
                  addAfter(index);
                } else if (
                  event.key === "Backspace" &&
                  !point &&
                  shown.length > 1
                ) {
                  event.preventDefault();
                  focusNext.current = Math.max(0, index - 1);
                  onChange(shown.filter((_, at) => at !== index));
                }
              }}
              placeholder={placeholder}
              aria-label={`${label}, point ${index + 1}`}
              className={`${inputClass} min-w-0 flex-1`}
            />
            <button
              type="button"
              className={iconButtonClasses}
              disabled={shown.length === 1 && !point}
              onClick={() => onChange(shown.filter((_, at) => at !== index))}
              aria-label={`Remove point ${index + 1}`}
              title="Remove"
            >
              <Trash size={15} />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={addButtonClasses}
        disabled={shown.length >= max}
        onClick={() => addAfter(shown.length - 1)}
      >
        <Plus size={14} weight="bold" />
        Add a point
      </button>
      {shown.length >= max ? (
        <p className="m-0 text-[12px] text-(--muted)">Up to {max} points.</p>
      ) : null}
    </div>
  );
}

/** An image upload for a testimonial's photo (public, through the CDN). */
function PhotoField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) {
      setState("error");
      setMessage("Choose an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setState("error");
      setMessage("Choose an image under 8 MB.");
      return;
    }
    setState("uploading");
    try {
      const presigned = await mediaService.presignMediaUpload({
        filename: file.name,
        contentType: file.type,
        fileSize: file.size,
        type: "image",
        visibility: "public",
      });
      await mediaService.uploadFileToPresignedUrl(presigned.uploadUrl, file);
      await mediaService.confirmUpload(presigned.mediaAssetId);
      const url = await waitForCourseThumbnailCdnUrl(presigned.mediaAssetId);
      if (!url || !url.startsWith("https://")) {
        throw new Error("The photo couldn't be published. Try again.");
      }
      onChange(url);
      setState("idle");
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "The photo couldn't be uploaded.",
      );
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-(--muted)">
        {value ? (
          <img src={value} alt="" className="size-full object-cover" />
        ) : (
          <ImageSquare size={20} aria-hidden="true" />
        )}
      </span>
      <div className="grid gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`${addButtonClasses} border-solid`}
            disabled={state === "uploading"}
            onClick={() => input.current?.click()}
          >
            {state === "uploading" ? (
              <CircleNotch size={14} className="animate-spin" />
            ) : null}
            {state === "uploading"
              ? "Uploading…"
              : value
                ? "Change photo"
                : "Add photo"}
          </button>
          {value ? (
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent p-0 text-[12.5px] font-semibold text-(--muted) hover:text-rose-500"
              onClick={() => onChange(null)}
            >
              Remove
            </button>
          ) : null}
        </div>
        <span className="text-[11.5px] text-(--muted)">
          {state === "error" ? (
            <span className="text-rose-500">{message}</span>
          ) : (
            "Optional. Their initials show without one."
          )}
        </span>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
    </div>
  );
}

export function SectionEditor({
  section,
  onChange,
}: {
  section: CoursePageSection;
  onChange: (content: CoursePageSection["content"]) => void;
}) {
  const id = `sales-${section.kind}`;
  switch (section.kind) {
    case "outcomes":
      return (
        <PointsList
          id={id}
          label="Points"
          points={section.content.items}
          max={COURSE_PAGE_LIMITS.outcomes}
          placeholder="Build and deploy a REST API with Node.js"
          onChange={(items) => onChange({ items })}
        />
      );
    case "requirements":
      return (
        <PointsList
          id={id}
          label="What students need"
          points={section.content.items}
          max={COURSE_PAGE_LIMITS.requirements}
          placeholder="A laptop with 8 GB RAM"
          onChange={(items) => onChange({ items })}
        />
      );
    case "audience":
      return (
        <div className="grid gap-5 md:grid-cols-2">
          <PointsList
            id={`${id}-for`}
            label="This is for you if"
            points={section.content.forYou}
            max={COURSE_PAGE_LIMITS.audience}
            placeholder="You know basic JavaScript"
            onChange={(forYou) => onChange({ ...section.content, forYou })}
          />
          <PointsList
            id={`${id}-not`}
            label="It's not for you if (optional)"
            points={section.content.notForYou}
            max={COURSE_PAGE_LIMITS.audience}
            placeholder="You want a quick 1-hour overview"
            onChange={(notForYou) =>
              onChange({ ...section.content, notForYou })
            }
          />
        </div>
      );
    case "instructor":
      return (
        <InstructorEditor
          content={section.content}
          onChange={onChange}
          id={id}
        />
      );
    case "testimonials":
      return (
        <TestimonialsEditor
          content={section.content}
          onChange={onChange}
          id={id}
        />
      );
    case "faq":
      return (
        <FaqEditor content={section.content} onChange={onChange} id={id} />
      );
    case "guarantee":
      return (
        <div className="grid gap-3">
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor={`${id}-title`} className={fieldLabelClasses}>
                Headline
              </label>
              <Counter
                value={section.content.title}
                max={COURSE_PAGE_LIMITS.guaranteeTitle}
              />
            </div>
            <input
              id={`${id}-title`}
              type="text"
              value={section.content.title}
              maxLength={COURSE_PAGE_LIMITS.guaranteeTitle}
              onChange={(event) =>
                onChange({ ...section.content, title: event.target.value })
              }
              placeholder="7-day money-back guarantee"
              className={`${inputClass} w-full`}
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor={`${id}-text`} className={fieldLabelClasses}>
                Details
              </label>
              <Counter
                value={section.content.text}
                max={COURSE_PAGE_LIMITS.guaranteeText}
              />
            </div>
            <textarea
              id={`${id}-text`}
              rows={3}
              value={section.content.text}
              maxLength={COURSE_PAGE_LIMITS.guaranteeText}
              onChange={(event) =>
                onChange({ ...section.content, text: event.target.value })
              }
              placeholder="Not happy in the first 7 days? Write to us for a full refund."
              className={textareaClasses}
            />
          </div>
          <p className="m-0 text-[12px] text-(--muted)">
            Keep it in line with your refund policy: the page links to it.
          </p>
        </div>
      );
    case "curriculum":
    case "about":
      return null;
  }
}

function InstructorEditor({
  id,
  content,
  onChange,
}: {
  id: string;
  content: CoursePageContent<"instructor">;
  onChange: (content: CoursePageContent<"instructor">) => void;
}) {
  return (
    <div className="grid gap-3">
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor={`${id}-headline`} className={fieldLabelClasses}>
            Headline
          </label>
          <Counter value={content.headline} max={COURSE_PAGE_LIMITS.headline} />
        </div>
        <input
          id={`${id}-headline`}
          type="text"
          value={content.headline}
          maxLength={COURSE_PAGE_LIMITS.headline}
          onChange={(event) =>
            onChange({ ...content, headline: event.target.value })
          }
          placeholder="Senior engineer, taught 20,000+ students"
          className={`${inputClass} w-full`}
        />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor={`${id}-bio`} className={fieldLabelClasses}>
            Bio for this course (optional)
          </label>
          <Counter value={content.bio} max={COURSE_PAGE_LIMITS.bio} />
        </div>
        <textarea
          id={`${id}-bio`}
          rows={4}
          value={content.bio}
          maxLength={COURSE_PAGE_LIMITS.bio}
          onChange={(event) =>
            onChange({ ...content, bio: event.target.value })
          }
          placeholder="Leave empty to use the bio from your profile."
          className={textareaClasses}
        />
      </div>
      <p className="m-0 text-[12px] text-(--muted)">
        Your name and photo come from your profile. If you hide your name in the
        course settings, this section is hidden too.
      </p>
    </div>
  );
}

function TestimonialsEditor({
  id,
  content,
  onChange,
}: {
  id: string;
  content: CoursePageContent<"testimonials">;
  onChange: (content: CoursePageContent<"testimonials">) => void;
}) {
  const items = content.items;
  const setItem = (index: number, patch: Partial<(typeof items)[number]>) =>
    onChange({
      ...content,
      items: items.map((item, at) =>
        at === index ? { ...item, ...patch } : item,
      ),
    });
  return (
    <div className="grid gap-3">
      {items.map((item, index) => (
        <div key={item.id} className={itemCardClasses}>
          <div className="flex items-start justify-between gap-3">
            <PhotoField
              value={item.photoUrl}
              onChange={(photoUrl) => setItem(index, { photoUrl })}
            />
            <button
              type="button"
              className={iconButtonClasses}
              onClick={() =>
                onChange({
                  ...content,
                  items: items.filter((_, at) => at !== index),
                })
              }
              aria-label={`Remove testimonial ${index + 1}`}
              title="Remove"
            >
              <Trash size={15} />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`${id}-${item.id}-name`}
                className={fieldLabelClasses}
              >
                Name
              </label>
              <input
                id={`${id}-${item.id}-name`}
                type="text"
                value={item.name}
                maxLength={COURSE_PAGE_LIMITS.testimonialName}
                onChange={(event) =>
                  setItem(index, { name: event.target.value })
                }
                placeholder="Asha Rao"
                className={`${inputClass} w-full`}
              />
            </div>
            <div>
              <label
                htmlFor={`${id}-${item.id}-detail`}
                className={fieldLabelClasses}
              >
                About them (optional)
              </label>
              <input
                id={`${id}-${item.id}-detail`}
                type="text"
                value={item.detail}
                maxLength={COURSE_PAGE_LIMITS.testimonialDetail}
                onChange={(event) =>
                  setItem(index, { detail: event.target.value })
                }
                placeholder="Got a job at a startup"
                className={`${inputClass} w-full`}
              />
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label
                htmlFor={`${id}-${item.id}-quote`}
                className={fieldLabelClasses}
              >
                What they said
              </label>
              <Counter
                value={item.quote}
                max={COURSE_PAGE_LIMITS.testimonialQuote}
              />
            </div>
            <textarea
              id={`${id}-${item.id}-quote`}
              rows={3}
              value={item.quote}
              maxLength={COURSE_PAGE_LIMITS.testimonialQuote}
              onChange={(event) =>
                setItem(index, { quote: event.target.value })
              }
              placeholder="Their words, as they wrote them."
              className={textareaClasses}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        className={addButtonClasses}
        disabled={items.length >= COURSE_PAGE_LIMITS.testimonials}
        onClick={() =>
          onChange({
            ...content,
            items: [
              ...items,
              {
                id: newItemId(),
                name: "",
                detail: "",
                quote: "",
                photoUrl: null,
              },
            ],
          })
        }
      >
        <Plus size={14} weight="bold" />
        Add a testimonial
      </button>
      <div className="grid gap-0.5 rounded-xl border border-amber-500/30 bg-amber-500/8 p-1.5">
        <Checkbox
          id={`${id}-genuine`}
          checked={content.confirmedGenuine}
          onCheckedChange={(confirmedGenuine) =>
            onChange({ ...content, confirmedGenuine })
          }
          label="These are real students' words"
          className="font-semibold text-(--text)!"
        />
        <p className="m-0 px-2.5 pb-1.5 text-[12px] leading-5 text-(--muted)">
          Made-up testimonials are against Indian consumer rules. The section
          shows only after you tick this.
        </p>
      </div>
    </div>
  );
}

function FaqEditor({
  id,
  content,
  onChange,
}: {
  id: string;
  content: CoursePageContent<"faq">;
  onChange: (content: CoursePageContent<"faq">) => void;
}) {
  const items = content.items;
  const setItem = (index: number, patch: Partial<(typeof items)[number]>) =>
    onChange({
      items: items.map((item, at) =>
        at === index ? { ...item, ...patch } : item,
      ),
    });
  return (
    <div className="grid gap-3">
      {items.map((item, index) => (
        <div key={item.id} className={itemCardClasses}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <label
                htmlFor={`${id}-${item.id}-q`}
                className={fieldLabelClasses}
              >
                Question {index + 1}
              </label>
              <input
                id={`${id}-${item.id}-q`}
                type="text"
                value={item.question}
                maxLength={COURSE_PAGE_LIMITS.question}
                onChange={(event) =>
                  setItem(index, { question: event.target.value })
                }
                placeholder="Do I get a certificate?"
                className={`${inputClass} w-full`}
              />
            </div>
            <button
              type="button"
              className={`${iconButtonClasses} mt-6`}
              onClick={() =>
                onChange({ items: items.filter((_, at) => at !== index) })
              }
              aria-label={`Remove question ${index + 1}`}
              title="Remove"
            >
              <Trash size={15} />
            </button>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label
                htmlFor={`${id}-${item.id}-a`}
                className={fieldLabelClasses}
              >
                Answer
              </label>
              <Counter value={item.answer} max={COURSE_PAGE_LIMITS.answer} />
            </div>
            <textarea
              id={`${id}-${item.id}-a`}
              rows={3}
              value={item.answer}
              maxLength={COURSE_PAGE_LIMITS.answer}
              onChange={(event) =>
                setItem(index, { answer: event.target.value })
              }
              placeholder="Yes, when you finish every lesson."
              className={textareaClasses}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        className={addButtonClasses}
        disabled={items.length >= COURSE_PAGE_LIMITS.faq}
        onClick={() =>
          onChange({
            items: [...items, { id: newItemId(), question: "", answer: "" }],
          })
        }
      >
        <Plus size={14} weight="bold" />
        Add a question
      </button>
    </div>
  );
}
