import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { QrCodeIcon as QrCode } from "@phosphor-icons/react/QrCode";
import { SignatureIcon as Signature } from "@phosphor-icons/react/Signature";
import { TextAlignCenterIcon as TextAlignCenter } from "@phosphor-icons/react/TextAlignCenter";
import { TextAlignLeftIcon as TextAlignLeft } from "@phosphor-icons/react/TextAlignLeft";
import { TextAlignRightIcon as TextAlignRight } from "@phosphor-icons/react/TextAlignRight";
import {
  CERTIFICATE_FONT_LABELS,
  DEFAULT_CERTIFICATE_LAYOUT,
  type CertificateDesign,
  type CertificateDesignLayout,
  type CertificateFont,
  type CertificateTextField,
} from "@veolms/contracts/certificate-design";
import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { Button } from "../../components/Button";
import { Switch } from "../../home-page-settings/homePageSettingsControls";
import { ThemedSelect } from "../../ThemedSelect";
import {
  certificateDesignsService,
  useCertificateAcademySettings,
  useCertificateSignatureImage,
  useUpdateCertificateDesign,
} from "../../services/certificates";
import { certificateInputClass } from "../certificateUi";
import { useDesignImage } from "./useDesignImage";

type TextKey = "name" | "course" | "date" | "code" | "verifyText";
type FieldKey = TextKey | "qr" | "signature";

type SignatureField = NonNullable<CertificateDesignLayout["signature"]>;
/** A layout with every detail present, as the editor works on it. */
type EditorLayout = CertificateDesignLayout & { signature: SignatureField };

/** Layouts saved before signatures have none: shown switched off. */
function editable(layout: CertificateDesignLayout): EditorLayout {
  return {
    ...structuredClone(layout),
    signature: layout.signature
      ? { ...layout.signature }
      : { ...DEFAULT_CERTIFICATE_LAYOUT.signature!, enabled: false },
  };
}

const FIELDS: { key: FieldKey; label: string }[] = [
  { key: "name", label: "Learner's name" },
  { key: "course", label: "Course line" },
  { key: "date", label: "Issue date" },
  { key: "code", label: "Certificate ID" },
  { key: "qr", label: "Verify QR code" },
  { key: "verifyText", label: "Verify address" },
  { key: "signature", label: "Signature" },
];

/** Made-up details, as the PDF preview prints them. */
const SAMPLE: Record<TextKey, (layout: CertificateDesignLayout) => string> = {
  name: () => "Aarav Sharma",
  course: (layout) =>
    layout.course.text.replaceAll("{course}", "The Complete JavaScript Course"),
  date: () => "November 26, 2026",
  code: () => "7P5S-1588-Z9M0-4ASG",
  verifyText: () => "Verify at example.com/verify/7P5S-1588-Z9M0-4ASG",
};

/** Close stand-ins for the PDF's fonts; "Preview PDF" shows the real ones. */
const FONT_STYLES: Record<CertificateFont, React.CSSProperties> = {
  lobster: {
    fontFamily: '"Lobster", "Brush Script MT", cursive',
    fontStyle: "italic",
    fontWeight: 700,
  },
  arimo: { fontFamily: "Arimo, Arial, sans-serif" },
  oswald: {
    fontFamily: '"Oswald", "Arial Narrow", sans-serif',
    fontWeight: 700,
  },
  montserrat: { fontFamily: "Montserrat, sans-serif", fontWeight: 600 },
};

const A4_WIDTH_PT = 841.89;
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const round = (value: number) => Math.round(value * 10000) / 10000;

/**
 * Places the certificate's details on an uploaded sheet: drag each one
 * where it belongs (or select it and use the arrow keys), then set its
 * font, size, colour, alignment and width. The sheet picture uses close
 * stand-in fonts; "Preview PDF" draws the real certificate.
 */
export function CertificateDesignEditor({
  design,
  onClose,
  setNotice,
}: {
  design: CertificateDesign;
  onClose: () => void;
  setNotice?: (message: string) => void;
}) {
  const sheet = useDesignImage(design);
  const save = useUpdateCertificateDesign();
  const academy = useCertificateAcademySettings();
  const signatureImage = useCertificateSignatureImage(
    academy.data?.signature?.updatedAt ?? null,
  );
  const [layout, setLayout] = useState<EditorLayout>(() =>
    editable(design.layout),
  );
  const [selected, setSelected] = useState<FieldKey>("name");
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    key: FieldKey;
    startX: number;
    startY: number;
    fromX: number;
    fromY: number;
  } | null>(null);
  const dirty =
    JSON.stringify(layout) !== JSON.stringify(editable(design.layout));

  const patch = (key: FieldKey, values: Record<string, unknown>) =>
    setLayout((current) => ({
      ...current,
      [key]: { ...current[key], ...values },
    }));

  const startDrag = (key: FieldKey, event: ReactPointerEvent) => {
    event.preventDefault();
    setSelected(key);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = {
      key,
      startX: event.clientX,
      startY: event.clientY,
      fromX: layout[key].x,
      fromY: layout[key].y,
    };
  };
  const moveDrag = (event: ReactPointerEvent) => {
    const current = drag.current;
    const box = canvasRef.current?.getBoundingClientRect();
    if (!current || !box) return;
    patch(current.key, {
      x: round(
        clamp(current.fromX + (event.clientX - current.startX) / box.width),
      ),
      y: round(
        clamp(current.fromY + (event.clientY - current.startY) / box.height),
      ),
    });
  };
  const endDrag = () => {
    drag.current = null;
  };
  const nudge = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 0.01 : 0.002;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    patch(selected, {
      x: round(clamp(layout[selected].x + move[0])),
      y: round(clamp(layout[selected].y + move[1])),
    });
  };

  const preview = async () => {
    setPreviewError(null);
    // Opened now, while the click still counts, so no pop-up blocker stops it.
    const tab = window.open("", "_blank");
    setPreviewing(true);
    try {
      const blob = await certificateDesignsService.preview(design.id, layout);
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      tab?.close();
      setPreviewError(
        error instanceof Error ? error.message : "The preview failed.",
      );
    } finally {
      setPreviewing(false);
    }
  };

  const field = layout[selected];
  const textField =
    selected === "qr" || selected === "signature"
      ? null
      : (field as CertificateTextField);

  return (
    <section
      className="flex flex-col gap-4 rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-4 shadow-(--card-shadow) sm:p-5"
      aria-label={`Place details on ${design.name}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-0 text-[1.05rem] font-bold text-(--text)">
            Place details · {design.name}
          </h3>
          <p className="m-0 mt-0.5 text-[0.82rem] text-(--muted)">
            Drag each detail where it belongs, or select it and use the arrow
            keys (Shift for bigger steps). The picture uses similar fonts;
            Preview PDF shows the real certificate.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="quiet"
            className="h-9 rounded-lg px-3 text-sm"
            disabled={previewing}
            onClick={() => void preview()}
          >
            <Eye size={16} aria-hidden="true" />
            {previewing ? "Preparing…" : "Preview PDF"}
          </Button>
          <Button
            variant="quiet"
            className="h-9 rounded-lg px-3 text-sm"
            onClick={onClose}
            disabled={save.isPending}
          >
            {dirty ? "Discard" : "Close"}
          </Button>
          <Button
            className="h-9 rounded-lg px-4 text-sm"
            disabled={!dirty || save.isPending}
            onClick={() =>
              save.mutate(
                { id: design.id, layout },
                {
                  onSuccess: () => {
                    setNotice?.(`Saved the layout of ${design.name}.`);
                    onClose();
                  },
                },
              )
            }
          >
            {save.isPending ? "Saving…" : "Save layout"}
          </Button>
        </div>
      </div>
      {save.error || previewError ? (
        <p className="m-0 text-[0.82rem] text-rose-500" role="alert">
          {save.error?.message ?? previewError}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* The sheet, as wide as it may be, keeping its shape. */}
        <div
          ref={canvasRef}
          tabIndex={0}
          onKeyDown={nudge}
          aria-label="Certificate sheet. Arrow keys move the selected detail."
          className="@container relative w-full touch-none overflow-hidden rounded-lg bg-white shadow-[0_0_0_1px_color-mix(in_srgb,var(--text)_12%,transparent)] outline-none select-none focus-visible:ring-2 focus-visible:ring-(--accent)"
          style={{ aspectRatio: `${design.pageWidth} / ${design.pageHeight}` }}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {sheet.data ? (
            <img
              src={sheet.data}
              alt=""
              draggable={false}
              className="absolute inset-0 size-full object-fill"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-sm text-(--muted)">
              {sheet.error
                ? "The sheet could not be shown."
                : "Loading the sheet…"}
            </div>
          )}

          {FIELDS.map(({ key, label }) => {
            const item = layout[key];
            if (!item.enabled) return null;
            const isSelected = key === selected;
            const ring = isSelected
              ? "outline-2 outline-(--accent) outline-offset-2"
              : "outline-1 outline-dashed outline-[color-mix(in_srgb,var(--accent)_55%,transparent)] outline-offset-2";
            if (key === "signature") {
              const mark = layout.signature;
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={`${label}: drag to move`}
                  onPointerDown={(event) => startDrag(key, event)}
                  onFocus={() => setSelected(key)}
                  className={`absolute grid cursor-grab place-items-center rounded-sm border-0 bg-transparent p-0 active:cursor-grabbing ${ring}`}
                  style={{
                    left: `${mark.x * 100}%`,
                    top: `${mark.y * 100}%`,
                    width: `${mark.width * 100}cqw`,
                    // Centred across; y is its bottom edge.
                    transform: "translate(-50%, -100%)",
                    ...(signatureImage.data ? {} : { aspectRatio: "3 / 1" }),
                  }}
                >
                  {signatureImage.data ? (
                    <img
                      src={signatureImage.data}
                      alt=""
                      draggable={false}
                      className="block w-full"
                    />
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[1.6cqw] font-semibold text-neutral-500">
                      <Signature size="1.4em" aria-hidden="true" />
                      Signature
                    </span>
                  )}
                </button>
              );
            }
            if (key === "qr") {
              const qr = layout.qr;
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={`${label}: drag to move`}
                  onPointerDown={(event) => startDrag(key, event)}
                  onFocus={() => setSelected(key)}
                  className={`absolute grid cursor-grab place-items-center rounded-sm border-0 bg-white/80 p-0 active:cursor-grabbing ${ring}`}
                  style={{
                    left: `${qr.x * 100}%`,
                    top: `${qr.y * 100}%`,
                    width: `${qr.size * 100}cqw`,
                    aspectRatio: "1",
                    transform: "translateX(-50%)",
                    color: qr.color,
                  }}
                >
                  <QrCode size="80%" weight="fill" aria-hidden="true" />
                </button>
              );
            }
            const text = item as CertificateTextField;
            const shift =
              text.align === "center"
                ? "-50%"
                : text.align === "right"
                  ? "-100%"
                  : "0%";
            return (
              <button
                key={key}
                type="button"
                aria-label={`${label}: drag to move`}
                onPointerDown={(event) => startDrag(key, event)}
                onFocus={() => setSelected(key)}
                className={`absolute cursor-grab rounded-sm border-0 bg-transparent p-0 leading-[1.15] active:cursor-grabbing ${ring} ${
                  key === "course" ? "whitespace-normal" : "whitespace-nowrap"
                }`}
                style={{
                  ...FONT_STYLES[text.font],
                  left: `${text.x * 100}%`,
                  top: `${text.y * 100}%`,
                  // y is the baseline: lift the line by its ascent.
                  transform: `translate(${shift}, -0.82em)`,
                  fontSize: `${(text.size * 100) / A4_WIDTH_PT}cqw`,
                  color: text.color,
                  textAlign: text.align,
                  ...(key === "course"
                    ? { width: `${text.width * 100}cqw` }
                    : { maxWidth: `${text.width * 100}cqw` }),
                }}
              >
                {SAMPLE[key as TextKey](layout)}
              </button>
            );
          })}
        </div>

        {/* The details, and the selected one's settings. */}
        <div className="flex flex-col gap-3">
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {FIELDS.map(({ key, label }) => (
              <li
                key={key}
                className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 ${
                  key === selected
                    ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
                    : ""
                }`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-pointer truncate border-0 bg-transparent p-0 text-left text-sm font-semibold text-(--text)"
                  onClick={() => setSelected(key)}
                >
                  {label}
                </button>
                <Switch
                  checked={layout[key].enabled}
                  onChange={(enabled) => patch(key, { enabled })}
                  label={`Print the ${label.toLowerCase()}`}
                />
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-3">
            {textField ? (
              <>
                <label className="flex flex-col gap-1 text-[0.78rem] font-semibold text-(--text-secondary)">
                  Font
                  <ThemedSelect<CertificateFont>
                    value={textField.font}
                    onValueChange={(font) => patch(selected, { font })}
                    options={
                      Object.entries(CERTIFICATE_FONT_LABELS) as [
                        CertificateFont,
                        string,
                      ][]
                    }
                    ariaLabel="Font"
                    className="w-full"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-[0.78rem] font-semibold text-(--text-secondary)">
                    Size (pt)
                    <input
                      type="number"
                      min={4}
                      max={120}
                      step={0.5}
                      value={textField.size}
                      onChange={(event) => {
                        const size = Number(event.target.value);
                        if (size >= 4 && size <= 120) patch(selected, { size });
                      }}
                      className={`${certificateInputClass} h-10`}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[0.78rem] font-semibold text-(--text-secondary)">
                    Colour
                    <input
                      type="color"
                      value={textField.color}
                      onChange={(event) =>
                        patch(selected, {
                          color: event.target.value.toUpperCase(),
                        })
                      }
                      className="h-10 w-full cursor-pointer rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-transparent p-1"
                    />
                  </label>
                </div>
                <div className="flex flex-col gap-1 text-[0.78rem] font-semibold text-(--text-secondary)">
                  Alignment
                  <div
                    className="flex gap-1"
                    role="group"
                    aria-label="Alignment"
                  >
                    {(
                      [
                        ["left", TextAlignLeft],
                        ["center", TextAlignCenter],
                        ["right", TextAlignRight],
                      ] as const
                    ).map(([align, Icon]) => (
                      <button
                        key={align}
                        type="button"
                        aria-pressed={textField.align === align}
                        aria-label={`Align ${align}`}
                        onClick={() => patch(selected, { align })}
                        className={`inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border-0 ${
                          textField.align === align
                            ? "bg-(--accent) text-(--on-accent)"
                            : "bg-(--surface-strong) text-(--muted) hover:text-(--text)"
                        }`}
                      >
                        <Icon size={17} />
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex flex-col gap-1 text-[0.78rem] font-semibold text-(--text-secondary)">
                  Widest it may run: {Math.round(textField.width * 100)}% of the
                  page
                  <input
                    type="range"
                    min={5}
                    max={100}
                    value={Math.round(textField.width * 100)}
                    onChange={(event) =>
                      patch(selected, {
                        width: Number(event.target.value) / 100,
                      })
                    }
                    className="accent-(--accent)"
                  />
                </label>
                {selected === "course" ? (
                  <label className="flex flex-col gap-1 text-[0.78rem] font-semibold text-(--text-secondary)">
                    Sentence ({"{course}"} is the course title)
                    <input
                      value={layout.course.text}
                      maxLength={200}
                      onChange={(event) =>
                        patch("course", { text: event.target.value })
                      }
                      aria-invalid={!layout.course.text.includes("{course}")}
                      className={`${certificateInputClass} h-10 text-sm`}
                    />
                  </label>
                ) : null}
                {selected === "name" ? (
                  <div className="flex items-center justify-between gap-2 text-[0.78rem] font-semibold text-(--text-secondary)">
                    Dotted line under the name
                    <Switch
                      checked={layout.name.underline}
                      onChange={(underline) => patch("name", { underline })}
                      label="Dotted line under the name"
                    />
                  </div>
                ) : null}
              </>
            ) : selected === "signature" ? (
              <>
                <label className="flex flex-col gap-1 text-[0.78rem] font-semibold text-(--text-secondary)">
                  Width: {Math.round(layout.signature.width * 100)}% of the page
                  <input
                    type="range"
                    min={3}
                    max={60}
                    value={Math.round(layout.signature.width * 100)}
                    onChange={(event) =>
                      patch("signature", {
                        width: Number(event.target.value) / 100,
                      })
                    }
                    className="accent-(--accent)"
                  />
                </label>
                <p className="m-0 text-[0.78rem] text-(--muted)">
                  {academy.data?.signature
                    ? "The signature uploaded in Certificate settings, above. Its bottom edge sits where you place it."
                    : "Upload a signature in Certificate settings, above, to print it here. Until then nothing is printed."}
                </p>
              </>
            ) : (
              <>
                <label className="flex flex-col gap-1 text-[0.78rem] font-semibold text-(--text-secondary)">
                  Size: {Math.round(layout.qr.size * 100)}% of the page width
                  <input
                    type="range"
                    min={3}
                    max={30}
                    value={Math.round(layout.qr.size * 100)}
                    onChange={(event) =>
                      patch("qr", { size: Number(event.target.value) / 100 })
                    }
                    className="accent-(--accent)"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[0.78rem] font-semibold text-(--text-secondary)">
                  Colour (keep it dark on a light sheet, so phones can read it)
                  <input
                    type="color"
                    value={layout.qr.color}
                    onChange={(event) =>
                      patch("qr", { color: event.target.value.toUpperCase() })
                    }
                    className="h-10 w-full cursor-pointer rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-transparent p-1"
                  />
                </label>
              </>
            )}
          </div>
          <Button
            variant="quiet"
            className="h-9 rounded-lg px-3 text-sm"
            onClick={() =>
              setLayout(
                editable({
                  ...DEFAULT_CERTIFICATE_LAYOUT,
                  name: {
                    ...DEFAULT_CERTIFICATE_LAYOUT.name,
                    underline: false,
                  },
                }),
              )
            }
          >
            <ArrowCounterClockwise size={15} aria-hidden="true" />
            Start from the default places
          </Button>
        </div>
      </div>
    </section>
  );
}
