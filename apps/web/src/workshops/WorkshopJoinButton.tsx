import type { WorkshopJoinableSession } from "@veolms/contracts";
import { VideoCameraIcon as VideoCamera } from "@phosphor-icons/react/VideoCamera";

import { workshopJoinUrl } from "./workshopHelpers";

/**
 * The Join button for a session whose window is open. It is a plain link to
 * the API's join redirect, opened in a new tab, so the meeting link itself
 * never reaches the page and the click counts as attendance.
 */
export function WorkshopJoinButton({
  workshopId,
  joinable,
  size = "md",
  label = "Join",
}: {
  workshopId: string;
  joinable: WorkshopJoinableSession;
  size?: "sm" | "md";
  label?: string;
}) {
  const sizing = size === "sm" ? "h-9 px-3.5 text-[13px]" : "h-11 px-4 text-sm";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={workshopJoinUrl(workshopId, joinable.sessionId)}
        target="_blank"
        rel="noreferrer"
        className={`inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 font-semibold text-white shadow-sm transition hover:bg-emerald-700 ${sizing}`}
      >
        <VideoCamera size={16} weight="fill" />
        {label}
      </a>
      {joinable.passcode ? (
        <span className="text-[12px] text-(--muted)">
          Passcode{" "}
          <code className="rounded-md bg-(--canvas) px-1.5 py-0.5 font-mono text-[12px] font-semibold text-(--text)">
            {joinable.passcode}
          </code>
        </span>
      ) : null}
    </div>
  );
}
