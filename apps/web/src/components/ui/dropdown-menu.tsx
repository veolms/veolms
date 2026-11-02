import * as React from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";

import { cn } from "../../lib/utils";
import { useBackDismiss } from "../../navigation/useBackDismiss";

/**
 * A menu opened from a button (the context menu's twin, opened by a press
 * instead of a right click): the same popup, items and dismissal on Back.
 */
function DropdownMenu({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  actionsRef: externalActionsRef,
  ...props
}: MenuPrimitive.Root.Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;
  const menuActionsRef = React.useRef<MenuPrimitive.Root.Actions | null>(null);

  useBackDismiss({
    open,
    onDismiss: () => menuActionsRef.current?.close(),
  });

  const actionsRef = React.useMemo<
    React.RefObject<MenuPrimitive.Root.Actions | null>
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
    NonNullable<MenuPrimitive.Root.Props["onOpenChange"]>
  >(
    (nextOpen, eventDetails) => {
      if (openProp === undefined) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen, eventDetails);
    },
    [onOpenChange, openProp],
  );

  return (
    <MenuPrimitive.Root
      data-slot="dropdown-menu"
      open={open}
      onOpenChange={handleOpenChange}
      actionsRef={actionsRef}
      {...props}
    />
  );
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  className,
  align = "end",
  alignOffset = 0,
  portalContainer,
  side = "bottom",
  sideOffset = 6,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  > & {
    portalContainer?: MenuPrimitive.Portal.Props["container"];
  }) {
  return (
    // While the menu is open Base UI lays a backdrop over the page (a sibling
    // of the positioner, `data-base-ui-inert`) so that a press anywhere else
    // only closes the menu. The backdrop has no z-index of its own, so it
    // would lie under anything raised (the lesson page's sheets are z-180,
    // and a press on a lesson there played it): it is raised just under the
    // menu.
    <MenuPrimitive.Portal
      container={portalContainer}
      data-slot="dropdown-menu-portal"
      className="[&>[data-base-ui-inert]]:z-219"
    >
      <MenuPrimitive.Positioner
        className="isolate z-220 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "z-220 max-h-(--available-height) min-w-52 max-w-[min(19rem,calc(100vw-1rem))] origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-xl border border-(--border) bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] p-1.5 text-(--text) shadow-[0_18px_48px_rgb(0_0_0/0.3)] backdrop-blur-xl transition-[transform,opacity] duration-100 ease-out outline-none data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

const itemClasses =
  "relative flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-(--text-secondary) outline-none select-none data-highlighted:bg-(--hover) data-highlighted:text-(--text) data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

function DropdownMenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(itemClasses, className)}
      {...props}
    />
  );
}

/**
 * An item that is a setting: its words (with an icon, like the items
 * around it) and, at the row's right edge, a small switch that is on or
 * off. The menu stays open as it is switched.
 */
function DropdownMenuSwitchItem({
  className,
  children,
  closeOnClick = false,
  ...props
}: MenuPrimitive.CheckboxItem.Props) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-switch-item"
      className={cn(itemClasses, "gap-2.5", className)}
      closeOnClick={closeOnClick}
      {...props}
    >
      {children}
      <span aria-hidden="true" className={switchClasses}>
        <span className={switchKnobClasses} />
      </span>
    </MenuPrimitive.CheckboxItem>
  );
}

/**
 * The switch of a `SwitchItem`, after the settings page's (smaller, to fit
 * a menu row): a track that takes the accent while on, and a knob that
 * slides to the right.
 */
const switchClasses =
  "ml-auto flex h-5 w-8.5 shrink-0 items-center rounded-full bg-[color-mix(in_srgb,var(--text)_22%,transparent)] p-0.5 transition-colors duration-150 [[data-checked]>&]:bg-(--accent)";
const switchKnobClasses =
  "block size-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.28)] transition-transform duration-150 [[data-checked]_&]:translate-x-3.5 [[data-checked]_&]:bg-(--on-accent,#fff) motion-reduce:transition-none";

function DropdownMenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("mx-1 my-1 h-px bg-(--border)", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSwitchItem,
  DropdownMenuTrigger,
};
