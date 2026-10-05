import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "../../lib/utils";
import { useBackDismiss } from "../../navigation/useBackDismiss";

function Popover({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  actionsRef: externalActionsRef,
  ...props
}: PopoverPrimitive.Root.Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;
  const popoverActionsRef = React.useRef<PopoverPrimitive.Root.Actions | null>(
    null,
  );

  useBackDismiss({
    open,
    onDismiss: () => popoverActionsRef.current?.close(),
  });

  const actionsRef = React.useMemo<
    React.RefObject<PopoverPrimitive.Root.Actions | null>
  >(
    () => ({
      get current() {
        return popoverActionsRef.current;
      },
      set current(actions) {
        popoverActionsRef.current = actions;
        if (externalActionsRef) externalActionsRef.current = actions;
      },
    }),
    [externalActionsRef],
  );

  const handleOpenChange = React.useCallback<
    NonNullable<PopoverPrimitive.Root.Props["onOpenChange"]>
  >(
    (nextOpen, eventDetails) => {
      if (openProp === undefined) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen, eventDetails);
    },
    [onOpenChange, openProp],
  );

  return (
    <PopoverPrimitive.Root
      data-slot="popover"
      open={open}
      onOpenChange={handleOpenChange}
      actionsRef={actionsRef}
      {...props}
    />
  );
}

function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  arrow = false,
  collisionPadding = 8,
  portalContainer,
  side = "bottom",
  sideOffset = 8,
  children,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "collisionPadding" | "side" | "sideOffset"
  > & {
    /** Points a small arrow at the trigger. */
    arrow?: boolean;
    portalContainer?: PopoverPrimitive.Portal.Props["container"];
  }) {
  return (
    <PopoverPrimitive.Portal
      container={portalContainer}
      data-slot="popover-portal"
    >
      <PopoverPrimitive.Positioner
        className="isolate z-220 outline-none"
        align={align}
        alignOffset={alignOffset}
        collisionPadding={collisionPadding}
        side={side}
        sideOffset={sideOffset}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "max-h-(--available-height) max-w-[min(20rem,calc(100vw-1rem))] origin-(--transform-origin) rounded-xl border border-(--border) bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] text-(--text) shadow-[0_18px_48px_rgb(0_0_0/0.3)] backdrop-blur-xl transition-[transform,opacity] duration-100 ease-out outline-none data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
            className,
          )}
          {...props}
        >
          {arrow ? (
            <PopoverPrimitive.Arrow
              data-slot="popover-arrow"
              className="size-2.5 rotate-45 border-(--border) bg-[color-mix(in_srgb,var(--surface)_94%,var(--canvas))] data-[side=bottom]:-top-1.25 data-[side=bottom]:border-t data-[side=bottom]:border-l data-[side=left]:-right-1.25 data-[side=left]:border-t data-[side=left]:border-r data-[side=right]:-left-1.25 data-[side=right]:border-b data-[side=right]:border-l data-[side=top]:-bottom-1.25 data-[side=top]:border-r data-[side=top]:border-b"
            />
          ) : null}
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("text-sm font-semibold text-(--text)", className)}
      {...props}
    />
  );
}

export { Popover, PopoverContent, PopoverTitle, PopoverTrigger };
