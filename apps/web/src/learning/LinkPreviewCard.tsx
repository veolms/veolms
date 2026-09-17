import React from "react";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { GlobeIcon as Globe } from "@phosphor-icons/react/Globe";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { LinkPreviewResponse } from "@veolms/contracts";

interface LinkPreviewCardProps {
  preview: LinkPreviewResponse;
  onRemove?: () => void;
  className?: string;
  compact?: boolean;
}

export function LinkPreviewCard({
  preview,
  onRemove,
  className = "",
  compact = false,
}: LinkPreviewCardProps) {
  if (!preview.url) return null;

  let hostname = preview.siteName;
  try {
    hostname = hostname || new URL(preview.url).hostname;
  } catch {
    hostname = preview.siteName || preview.url;
  }

  return (
    <div
      data-testid="link-preview-card"
      className={`group relative overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_92%,var(--canvas))] transition-colors hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] ${className}`}
    >
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove link preview"
          title="Remove preview"
          className="absolute top-2 right-2 z-10 grid size-6 place-items-center rounded-full bg-black/60 text-white backdrop-blur-xs transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-(--accent)"
        >
          <X size={13} weight="bold" />
        </button>
      )}

      <a
        href={preview.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex ${compact ? "flex-row items-center gap-3 p-2.5" : "flex-col"} text-inherit no-underline focus-visible:outline-2 focus-visible:outline-(--accent)`}
      >
        {preview.imageUrl && (
          <div
            className={`relative overflow-hidden bg-black/5 dark:bg-white/5 ${
              compact
                ? "h-16 w-20 shrink-0 rounded-md"
                : "h-36 w-full sm:h-44"
            }`}
          >
            <img
              src={preview.imageUrl}
              alt=""
              className="size-full object-cover transition-transform duration-300 group-hover:scale-103"
              loading="lazy"
            />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col justify-center p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-(--muted)">
            <Globe size={13} className="shrink-0 text-(--accent)" />
            <span className="truncate">{hostname}</span>
            <ArrowSquareOut size={12} className="ml-auto shrink-0 opacity-60 group-hover:opacity-100" />
          </div>

          {preview.title && (
            <h4 className="mt-1 line-clamp-1 text-xs font-semibold text-(--text) sm:text-sm">
              {preview.title}
            </h4>
          )}

          {preview.description && (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-(--muted) sm:text-xs">
              {preview.description}
            </p>
          )}
        </div>
      </a>
    </div>
  );
}
