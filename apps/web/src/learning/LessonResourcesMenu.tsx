import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { FolderOpenIcon as FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { useMemo } from "react";
import type { RefObject } from "react";
import type { LessonResource } from "@veolms/contracts";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "../components/ui/popover";
import { LessonResourceIcon } from "../courses/lesson-resources/LessonResourceIcon";
import { toLessonResourceItem } from "../courses/lesson-resources/lessonResourceItem";
import { LESSON_CARD_ACTION_CLASS } from "./lessonCardAction";
import {
  useLessonResourceDownloads,
  type LessonResourceDownloadStatus,
} from "./useLessonResourceDownloads";

interface LessonResourcesMenuProps {
  /** Course slug or id; the download link is resolved for this course. */
  courseKey: string;
  lessonNumber: number;
  lessonTitle: string;
  resources: readonly LessonResource[];
  /** Where the menu is rendered; the fullscreen player needs it inside. */
  portalContainer?: RefObject<HTMLElement | null>;
}

const HEADER_ACTION_CLASS =
  "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-(--text-secondary) transition-colors duration-150 hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) disabled:cursor-default disabled:opacity-60";

export function LessonResourcesMenu({
  courseKey,
  lessonNumber,
  lessonTitle,
  resources,
  portalContainer,
}: LessonResourcesMenuProps) {
  const { statuses, downloadingAll, download, downloadAll } =
    useLessonResourceDownloads({ courseKey, lessonNumber });
  const items = useMemo(
    () =>
      resources.map((resource) => {
        const item = toLessonResourceItem(resource);
        return {
          ...item,
          fileName: resource.mediaAsset?.originalFilename || item.name,
          // The size is only known when the API sends the file's details.
          meta:
            item.sizeBytes === undefined
              ? item.type
              : `${item.type} · ${item.size}`,
        };
      }),
    [resources],
  );
  const failedCount = items.filter(
    (item) => statuses[item.id] === "failed",
  ).length;

  return (
    <Popover>
      <PopoverTrigger
        className={`${LESSON_CARD_ACTION_CLASS} gap-1 bg-[color-mix(in_srgb,#2590f2_28%,var(--canvas))] px-2 text-[#4fa6f6] hover:bg-[color-mix(in_srgb,#2590f2_42%,var(--canvas))] data-popup-open:bg-[color-mix(in_srgb,#2590f2_46%,var(--canvas))] [[data-theme=light]_&]:text-blue-700`}
        aria-label={`Resources for lecture ${lessonNumber}: ${lessonTitle} (${items.length})`}
        title="Resources"
      >
        <FolderOpen size={17} weight="fill" aria-hidden="true" />
        <span className="text-[0.72rem] font-bold tabular-nums">
          {items.length}
        </span>
      </PopoverTrigger>
      <PopoverContent
        arrow
        side="bottom"
        align="end"
        sideOffset={10}
        portalContainer={portalContainer}
        className="flex w-76 flex-col p-0"
      >
        <div className="flex items-center justify-between gap-2 py-2 pr-2 pl-3.5">
          <PopoverTitle className="min-w-0 truncate">
            Resources{" "}
            <span className="font-medium text-(--muted)">({items.length})</span>
          </PopoverTitle>
          <button
            type="button"
            className={HEADER_ACTION_CLASS}
            disabled={downloadingAll}
            aria-label={`Download all ${items.length} resources`}
            title="Download all"
            onClick={() => void downloadAll(items)}
          >
            {downloadingAll ? (
              <CircleNotch size={17} className="animate-spin" />
            ) : (
              <DownloadSimple size={18} weight="bold" />
            )}
          </button>
        </div>
        <ul className="m-0 flex min-h-0 list-none flex-col gap-0.5 overflow-y-auto px-1.5 pb-1.5">
          {items.map((item) => {
            const status = statuses[item.id];
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="group/resource flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-(--hover) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent) disabled:cursor-default"
                  disabled={status === "downloading"}
                  aria-label={`Download ${item.name}`}
                  onClick={() => void download(item)}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--text)_7%,transparent)]">
                    <LessonResourceIcon
                      name={item.fileName}
                      mimeType={item.mimeType}
                      size={20}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.82rem] font-semibold text-(--text)">
                      {item.name}
                    </span>
                    <span className="block truncate text-[0.72rem] text-(--muted)">
                      {status === "failed"
                        ? "Couldn't download. Try again."
                        : item.meta}
                    </span>
                  </span>
                  <ResourceDownloadGlyph status={status} />
                </button>
              </li>
            );
          })}
        </ul>
        <span className="sr-only" role="status">
          {failedCount > 0
            ? `${failedCount} of ${items.length} resources could not be downloaded.`
            : ""}
        </span>
      </PopoverContent>
    </Popover>
  );
}

function ResourceDownloadGlyph({
  status,
}: {
  status: LessonResourceDownloadStatus | undefined;
}) {
  const className = "mr-1 shrink-0";
  if (status === "downloading") {
    return (
      <CircleNotch
        size={17}
        className={`${className} animate-spin text-(--muted)`}
        aria-hidden="true"
      />
    );
  }
  if (status === "done") {
    return (
      <Check
        size={17}
        weight="bold"
        className={`${className} text-(--success)`}
        aria-hidden="true"
      />
    );
  }
  if (status === "failed") {
    return (
      <WarningCircle
        size={17}
        weight="fill"
        className={`${className} text-rose-400`}
        aria-hidden="true"
      />
    );
  }
  return (
    <DownloadSimple
      size={17}
      weight="bold"
      className={`${className} text-(--muted) transition-colors duration-150 group-hover/resource:text-(--text)`}
      aria-hidden="true"
    />
  );
}
