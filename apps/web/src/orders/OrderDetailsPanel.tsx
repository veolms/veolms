import { useEffect, useRef, useState } from "react";
import type { AdminOrder } from "@veolms/contracts";
import { SlideOverFrame } from "../components/SlideOverPanel";
import {
  SplitFrameGutter,
  SplitFramePane,
  useSplitFrameWidth,
} from "../components/SplitFramePane";
import {
  Drawer,
  DrawerContent,
  type DrawerDismissThen,
} from "../components/ui/drawer";
import { useSidePanelVariant } from "../components/useSidePanelVariant";
import { useBackDismiss } from "../navigation/useBackDismiss";
import type { NavigateTo } from "../routing/navigation";
import {
  OrderDetailsContent,
  type OrderDetailsStep,
} from "./OrderDetailsContent";

export interface OrderDetailsPanelProps {
  /** The order shown; none while no order is open. */
  order: AdminOrder | null;
  onClose: () => void;
  /** The desktop gutter was dragged or double-clicked open: show this order
   * again (the last one shown). */
  onReopen: (orderId: string) => void;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onRequestRefund: (order: AdminOrder) => void;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

/**
 * The order opened from the Orders page, in the same panel as an open
 * discussion on the Discussions page: beside the list on a desktop, over
 * the page from the right on a tablet, a sheet from the bottom on a phone.
 */
export function OrderDetailsPanel(props: OrderDetailsPanelProps) {
  const variant = useSidePanelVariant();
  useOrderPanelKeys(props);
  if (variant === "desktop") return <DesktopPanel {...props} />;
  if (!props.order) return null;
  if (variant === "tablet")
    return <TabletPanel {...props} order={props.order} />;
  return <PhonePanel {...props} order={props.order} />;
}

/** Esc closes the order; ← and → step through the list. Left to a field,
 * a menu or a dialog that has the keyboard. */
function useOrderPanelKeys({
  order,
  onClose,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: OrderDetailsPanelProps) {
  useEffect(() => {
    if (!order) return;
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
          "input, textarea, select, [contenteditable=true], [role=menu], [role=listbox]",
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
  }, [order, onClose, hasPrev, hasNext, onPrev, onNext]);
}

function toStep({
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: OrderDetailsPanelProps): OrderDetailsStep {
  return { hasPrev, hasNext, onPrev, onNext };
}

function DesktopPanel(props: OrderDetailsPanelProps) {
  const { order, onClose, onReopen, onNavigatePage } = props;
  const open = Boolean(order);
  // The gutter reopens the order that was shown last.
  const lastOrderIdRef = useRef<string | null>(null);
  if (order) lastOrderIdRef.current = order.id;
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
    storageKey: "veolms-orders-panel-width",
    closedLabel: "Order panel closed",
    defaultCollapsed: !open,
    onCollapsedChange: (nowCollapsed) => {
      if (followingPageRef.current) return;
      if (nowCollapsed) onClose();
      else if (lastOrderIdRef.current) onReopen(lastOrderIdRef.current);
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
      aria-label="Order details"
      paneRef={paneRef}
      width={paneWidth}
      slide
      className="flex flex-col"
    >
      <SplitFrameGutter
        aria-label="Resize order panel"
        title={
          collapsed
            ? "Open order panel · drag or double-click"
            : "Resize order panel · double-click to close"
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
          {!collapsed && order && (
            <OrderDetailsContent
              order={order}
              variant="desktop"
              onClose={onClose}
              step={toStep(props)}
              onRequestRefund={props.onRequestRefund}
              onOpenPage={(path) => onNavigatePage?.(path)}
              setNotice={props.setNotice}
            />
          )}
        </div>
      </div>
    </SplitFramePane>
  );
}

function TabletPanel(props: OrderDetailsPanelProps & { order: AdminOrder }) {
  const { order, onClose, onNavigatePage } = props;
  // The panel covers the page, so Back closes it rather than leaving Orders.
  const dismissThroughHistory = useBackDismiss({
    open: true,
    onDismiss: onClose,
  });
  return (
    <SlideOverFrame
      label="Order details"
      onClose={onClose}
      className="max-w-[460px]"
      // A light dim, no blur: the list stays readable behind the panel.
      backdropClassName="bg-black/35"
    >
      <OrderDetailsContent
        order={order}
        variant="tablet"
        step={toStep(props)}
        onRequestRefund={props.onRequestRefund}
        // The panel's Back entry is taken off first, so Back from the page
        // opened returns to Orders and not to a closed panel.
        onOpenPage={(path) =>
          dismissThroughHistory(() => onNavigatePage?.(path))
        }
        setNotice={props.setNotice}
      />
    </SlideOverFrame>
  );
}

function PhonePanel(props: OrderDetailsPanelProps & { order: AdminOrder }) {
  const { order, onClose, onNavigatePage } = props;
  const [open, setOpen] = useState(true);
  const dismissThenRef = useRef<DrawerDismissThen | null>(null);

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
      dismissThenRef={dismissThenRef}
    >
      <DrawerContent
        aria-label="Order details"
        finalFocus={false}
        className="bg-(--surface) data-[swipe-axis=y]:[--drawer-content-max-height:calc(100dvh-2.5rem)]"
      >
        <OrderDetailsContent
          order={order}
          variant="phone"
          step={toStep(props)}
          onRequestRefund={(target) => {
            // The refund dialog opens once the sheet has gone.
            const dismissThen = dismissThenRef.current;
            if (dismissThen) dismissThen(() => props.onRequestRefund(target));
            else props.onRequestRefund(target);
          }}
          onOpenPage={(path) => {
            const navigate = () => onNavigatePage?.(path);
            const dismissThen = dismissThenRef.current;
            if (dismissThen) dismissThen(navigate);
            else navigate();
          }}
          setNotice={props.setNotice}
        />
      </DrawerContent>
    </Drawer>
  );
}
