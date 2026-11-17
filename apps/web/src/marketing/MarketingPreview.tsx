import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  MARKETING_THEME_COLORS,
  type MarketingAutomationKey,
  type MarketingBlock,
  type MarketingDesign,
} from "@veolms/contracts";
import { DesktopIcon as Desktop } from "@phosphor-icons/react/Desktop";
import { DeviceMobileIcon as DeviceMobile } from "@phosphor-icons/react/DeviceMobile";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { Button } from "../components/Button";
import { marketingKeys, marketingService } from "../services/marketing";
import { surfaceClass } from "../workshops/workshopHelpers";

/**
 * The email as students will get it, made by the same code that sends it
 * (the API renders it), with the inbox line above: subject and preview
 * text. Desktop or phone width.
 */
export function MarketingPreview({
  subject,
  preheader,
  blocks,
  design,
  automationKey = null,
  onSendTest,
  testPending = false,
  testDisabled = false,
  testMessage,
}: {
  subject: string;
  preheader: string;
  blocks: readonly MarketingBlock[];
  design: MarketingDesign;
  automationKey?: MarketingAutomationKey | null;
  onSendTest?: () => void;
  testPending?: boolean;
  testDisabled?: boolean;
  testMessage?: string | null;
}) {
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [input, setInput] = useState({
    subject,
    preheader,
    blocks,
    design,
    automationKey,
  });
  useEffect(() => {
    const timer = window.setTimeout(
      () => setInput({ subject, preheader, blocks, design, automationKey }),
      450,
    );
    return () => window.clearTimeout(timer);
  }, [subject, preheader, blocks, design, automationKey]);

  const preview = useQuery({
    queryKey: [...marketingKeys.all, "preview", JSON.stringify(input)],
    queryFn: () =>
      marketingService.preview({
        subject: input.subject,
        preheader: input.preheader,
        blocks: [...input.blocks],
        design: input.design,
        automationKey: input.automationKey,
      }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  return (
    <aside
      className={`${surfaceClass} flex min-w-0 flex-col`}
      aria-label="Email preview"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-4 py-3">
        <div>
          <h2 className="m-0 text-[15px] font-bold tracking-tight text-(--text)">
            Preview
          </h2>
          <p className="m-0 text-[12px] text-(--muted)">
            Exactly what students get.
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Preview size"
          className="flex items-center gap-0.5 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_80%,var(--surface))] p-0.5"
        >
          {(
            [
              ["desktop", "Desktop", Desktop],
              ["phone", "Phone", DeviceMobile],
            ] as const
          ).map(([value, label, DeviceIcon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={device === value}
              aria-label={label}
              title={label}
              onClick={() => setDevice(value)}
              className={`inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border-none transition-colors ${
                device === value
                  ? "bg-(--card-surface,var(--surface)) text-(--text) shadow-(--card-compact-shadow)"
                  : "bg-transparent text-(--muted) hover:text-(--text)"
              }`}
            >
              <DeviceIcon size={16} />
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-0.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-4 py-3">
        <p className="m-0 truncate text-[13px] font-bold text-(--text)">
          {preview.data?.subject || "Your subject line"}
        </p>
        <p className="m-0 truncate text-[12px] text-(--muted)">
          {preheader.trim() ||
            "Add preview text to show a line here in the inbox."}
        </p>
      </div>

      <div className="flex justify-center bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))] p-3">
        <div
          style={{ backgroundColor: MARKETING_THEME_COLORS[design.theme].page }}
          className={`overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-[width,background-color] duration-200 ${
            device === "phone" ? "w-[375px] max-w-full" : "w-full"
          }`}
        >
          {preview.data ? (
            <iframe
              title="Email preview"
              srcDoc={preview.data.html}
              sandbox=""
              className={`block w-full border-0 ${device === "phone" ? "h-[620px]" : "h-[640px]"}`}
            />
          ) : (
            <div className="grid h-[420px] place-items-center text-[13px] text-(--muted)">
              {preview.isError
                ? "The preview couldn't load. It will try again."
                : "Loading preview…"}
            </div>
          )}
        </div>
      </div>

      {onSendTest ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-4 py-3">
          <p
            className="m-0 min-w-0 flex-1 text-[12px] text-(--muted)"
            aria-live="polite"
          >
            {testMessage ?? "Send it to yourself to check it in your inbox."}
          </p>
          <Button
            variant="quiet"
            onClick={onSendTest}
            disabled={testPending || testDisabled}
          >
            <PaperPlaneTilt size={15} />
            {testPending ? "Sending…" : "Send me a test"}
          </Button>
        </div>
      ) : null}
    </aside>
  );
}
