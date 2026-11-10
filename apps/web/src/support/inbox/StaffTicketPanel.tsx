import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useEffect, useRef, useState } from "react";

import { SlideOverFrame } from "../../components/SlideOverPanel";
import {
  SplitFrameGutter,
  SplitFramePane,
  useSplitFrameWidth,
} from "../../components/SplitFramePane";
import { Drawer, DrawerContent } from "../../components/ui/drawer";
import { useSidePanelVariant } from "../../components/useSidePanelVariant";
import { copyTextToClipboard } from "../../lib/clipboard";
import { useBackDismiss } from "../../navigation/useBackDismiss";
import { useSupportTicket } from "../../services/support";
import { SupportTicketView, useRefreshAfterRead } from "../SupportTicketView";
import { TicketActivity } from "./TicketActivity";
import { TicketProperties, type TicketField } from "./TicketProperties";

export interface StaffTicketPanelProps {
  /** The report or feedback shown; none while nothing is open. */
  ticketId: string | null;
  /** Its reference, shown in the panel's header while it loads. */
  ticketNumber: number | null;
  canManage: boolean;
  onClose: () => void;
  /** The desktop gutter was dragged or double-clicked open: show this one
   * again (the last one shown). */
  onReopen: (ticketId: string) => void;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

const LINE = "border-[color-mix(in_srgb,var(--text)_8%,transparent)]";
const ghostIconButtonClasses =
  "grid size-8 shrink-0 place-items-center rounded-lg text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-(--accent)";

/**
 * The report or feedback opened from Support, in the same panel as an open
 * discussion on the Discussions page (and an order on Orders): beside the
 * list on a desktop, over the page from the right on a tablet, a sheet from
 * the bottom on a phone.
 */
export function StaffTicketPanel(props: StaffTicketPanelProps) {
  const variant = useSidePanelVariant();
  usePanelKeys(props);
  if (variant === "desktop") return <DesktopPanel {...props} />;
  if (!props.ticketId) return null;
  if (variant === "tablet") return <TabletPanel {...props} />;
  return <PhonePanel {...props} />;
}

/** Esc closes it; ← and → step through the list. Left to a field (the reply
 * editor among them), a menu or a dialog that has the keyboard. */
function usePanelKeys({
  ticketId,
  onClose,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: StaffTicketPanelProps) {
  useEffect(() => {
    if (!ticketId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable=true], .cm-editor, [role=menu], [role=listbox]",
        ) ||
        document.querySelector("dialog[open], [role=alertdialog]")
      )
        return;
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft" && hasPrev) onPrev();
      else if (event.key === "ArrowRight" && hasNext) onNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ticketId, onClose, hasPrev, hasNext, onPrev, onNext]);
}

function DesktopPanel(props: StaffTicketPanelProps) {
  const { ticketId, onClose, onReopen } = props;
  const open = Boolean(ticketId);
  // The gutter reopens the one shown last.
  const lastIdRef = useRef<string | null>(null);
  if (ticketId) lastIdRef.current = ticketId;
  // The page says whether the panel is open; the gutter can change it too.
  // Following the page must not report back to it as a change of the user's.
  const followingPageRef = useRef(false);
  const {
    paneRef,
    contentRef,
    paneWidth,
    collapsed,
    setCollapsed,
    gutterProps,
  } = useSplitFrameWidth({
    storageKey: "veolms-support-panel-width",
    closedLabel: "Report panel closed",
    defaultCollapsed: !open,
    onCollapsedChange: (nowCollapsed) => {
      if (followingPageRef.current) return;
      if (nowCollapsed) onClose();
      else if (lastIdRef.current) onReopen(lastIdRef.current);
      else setCollapsed(true);
    },
  });
  useEffect(() => {
    if (collapsed === !open) return;
    followingPageRef.current = true;
    setCollapsed(!open);
    followingPageRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follows `open` only
  }, [open]);

  return (
    <SplitFramePane
      aria-label="Report details"
      paneRef={paneRef}
      width={paneWidth}
      slide
      className="flex flex-col"
    >
      <SplitFrameGutter
        aria-label="Resize report panel"
        title={
          collapsed
            ? "Open report panel · drag or double-click"
            : "Resize report panel · double-click to close"
        }
        {...gutterProps}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-[inherit]">
        {/* Never narrower than the pane's minimum, as on the Discussions
            page: while the pane slides, the edge clips the content. */}
        <div
          ref={contentRef}
          className="flex min-h-0 w-full min-w-75 shrink-0 flex-col"
        >
          {!collapsed && ticketId && (
            <PanelContent
              {...props}
              ticketId={ticketId}
              showClose
              stepButtons
            />
          )}
        </div>
      </div>
    </SplitFramePane>
  );
}

function TabletPanel(props: StaffTicketPanelProps) {
  const { onClose } = props;
  // The panel covers the page, so Back closes it rather than leaving Support.
  useBackDismiss({ open: true, onDismiss: onClose });
  return (
    <SlideOverFrame
      label="Report details"
      onClose={onClose}
      className="max-w-[560px]"
      // A light dim, no blur: the list stays readable behind the panel.
      backdropClassName="bg-black/35"
    >
      <PanelContent {...props} ticketId={props.ticketId!} stepButtons />
    </SlideOverFrame>
  );
}

function PhonePanel(props: StaffTicketPanelProps) {
  const { onClose } = props;
  const [open, setOpen] = useState(true);
  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setOpen(false);
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      showSwipeHandle
    >
      <DrawerContent
        aria-label="Report details"
        finalFocus={false}
        className="bg-(--surface) data-[swipe-axis=y]:[--drawer-content-max-height:calc(100dvh-2.5rem)]"
      >
        <PanelContent {...props} ticketId={props.ticketId!} />
      </DrawerContent>
    </Drawer>
  );
}

/** The header (close, previous, next, reference) and the ticket below it. */
function PanelContent({
  ticketId,
  ticketNumber,
  canManage,
  onClose,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  showClose = false,
  stepButtons = false,
}: StaffTicketPanelProps & {
  ticketId: string;
  showClose?: boolean;
  stepButtons?: boolean;
}) {
  const ticket = useSupportTicket(ticketId, { asStaff: true });
  useRefreshAfterRead(ticket.data);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [openField, setOpenField] = useState<TicketField | null>(null);
  const [copied, setCopied] = useState(false);
  // The next one starts at its top, with no picker open.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setOpenField(null);
  }, [ticketId]);
  const number = ticket.data?.number ?? ticketNumber;
  const copyLink = async () => {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("ticket", ticketId);
    if (await copyTextToClipboard(url.toString())) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={`flex h-14 shrink-0 items-center gap-1 border-b ${LINE} px-2.5`}
      >
        {showClose && (
          <>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              title="Close (Esc)"
              className={ghostIconButtonClasses}
            >
              <X size={17} weight="bold" aria-hidden="true" />
            </button>
            {stepButtons && (
              <span
                className="mx-1 h-5 w-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                aria-hidden="true"
              />
            )}
          </>
        )}
        {stepButtons && (
          <>
            <button
              type="button"
              onClick={onPrev}
              disabled={!hasPrev}
              aria-label="Previous"
              title="Previous (←)"
              className={ghostIconButtonClasses}
            >
              <CaretLeft size={15} weight="bold" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              aria-label="Next"
              title="Next (→)"
              className={ghostIconButtonClasses}
            >
              <CaretRight size={15} weight="bold" aria-hidden="true" />
            </button>
          </>
        )}
        {number ? (
          <span className="ml-1.5 min-w-0 truncate text-xs text-(--muted)">
            {ticket.data?.kind === "feedback" ? "Feedback" : "Reports"}
            <span aria-hidden="true"> / </span>
            <span className="font-mono font-semibold text-(--text-secondary)">
              #{number}
            </span>
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void copyLink()}
          aria-label="Copy link"
          title={copied ? "Link copied" : "Copy link"}
          className={`${ghostIconButtonClasses} ml-auto`}
        >
          {copied ? (
            <Check size={16} weight="bold" aria-hidden="true" />
          ) : (
            <LinkSimple size={16} aria-hidden="true" />
          )}
        </button>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-6 max-sm:px-4"
      >
        {ticket.isPending ? (
          <div className="flex flex-col gap-4" aria-hidden="true">
            <span className="block h-4 w-1/3 rounded bg-(--surface-strong)" />
            <span className="block h-6 w-3/4 rounded bg-(--surface-strong)" />
            <span className="block h-40 rounded-2xl bg-(--surface-strong)" />
          </div>
        ) : ticket.error ? (
          <p className="m-0 py-8 text-center text-sm text-(--muted)">
            {ticket.error.message}
          </p>
        ) : (
          <SupportTicketView
            ticket={ticket.data}
            headingLevel={2}
            canReply={canManage}
            staffControls={
              <TicketProperties
                ticket={ticket.data}
                canManage={canManage}
                openField={openField}
                onOpenFieldChange={setOpenField}
              />
            }
            activity={
              <TicketActivity
                ticket={ticket.data}
                canManage={canManage}
                onHandOff={() => setOpenField("assignee")}
              />
            }
          />
        )}
      </div>
    </div>
  );
}
