import * as React from "react";
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";

import { cn } from "../../lib/utils";
import { useBackDismiss } from "../../navigation/useBackDismiss";

function ContextMenu({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  actionsRef: externalActionsRef,
  ...props
}: ContextMenuPrimitive.Root.Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;
  const menuActionsRef = React.useRef<ContextMenuPrimitive.Root.Actions | null>(
    null,
  );

  useBackDismiss({
    open,
    onDismiss: () => menuActionsRef.current?.close(),
  });

  const actionsRef = React.useMemo<
    React.RefObject<ContextMenuPrimitive.Root.Actions | null>
  >(
    () => ({
      get current() {
        return menuActionsRef.current;
      },
      set current(actions) {
        menuActionsRef.current = actions;
        if (externalActionsRef) externalActionsRef.current = actions;
      },
    }),
    [externalActionsRef],
  );

  const handleOpenChange = React.useCallback<
    NonNullable<ContextMenuPrimitive.Root.Props["onOpenChange"]>
  >(
    (nextOpen, eventDetails) => {
      if (openProp === undefined) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen, eventDetails);
    },
    [onOpenChange, openProp],
  );

  return (
    <ContextMenuPrimitive.Root
      data-slot="context-menu"
      open={open}
      onOpenChange={handleOpenChange}
      actionsRef={actionsRef}
      {...props}
    />
  );
}

function ContextMenuTrigger({
  className,
  ...props
}: ContextMenuPrimitive.Trigger.Props) {
  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      className={cn("touch-pan-y", className)}
      {...props}
    />
  );
}

function ContextMenuContent({
  className,
  align = "start",
  alignOffset = 4,
  portalContainer,
  side = "right",
  sideOffset = 0,
  ...props
}: ContextMenuPrimitive.Popup.Props &
  Pick<
    ContextMenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  > & {
    portalContainer?: ContextMenuPrimitive.Portal.Props["container"];
  }) {
  return (
    <ContextMenuPrimitive.Portal
      container={portalContainer}
      data-slot="context-menu-portal"
    >
      <ContextMenuPrimitive.Positioner
        className="isolate z-220 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-content"
          className={cn(
            "z-220 max-h-(--available-height) min-w-52 max-w-[min(19rem,calc(100vw-1rem))] origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-xl border border-(--border) bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] p-1.5 text-(--text) shadow-[0_18px_48px_rgb(0_0_0/0.3)] backdrop-blur-xl transition-[transform,opacity] duration-100 ease-out outline-none data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
            className,
          )}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

function ContextMenuLabel({
  className,
  ...props
}: ContextMenuPrimitive.GroupLabel.Props) {
  return (
    <ContextMenuPrimitive.GroupLabel
      data-slot="context-menu-label"
      className={cn(
        "px-2.5 py-1.5 text-xs font-semibold text-(--muted)",
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuGroup({ ...props }: ContextMenuPrimitive.Group.Props) {
  return (
    <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
  );
}

function ContextMenuItem({
  className,
  ...props
}: ContextMenuPrimitive.Item.Props) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-(--text-secondary) outline-none select-none data-highlighted:bg-(--hover) data-highlighted:text-(--text) data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuSeparator({
  className,
  ...props
}: ContextMenuPrimitive.Separator.Props) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn("mx-1 my-1 h-px bg-(--border)", className)}
      {...props}
    />
  );
}

export {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
};
