import "./sidebar-squircle-fallback.css";

/**
 * A home page built ahead of time holds three homes, because the build
 * cannot know whose it will be: the guest's, the placeholders of a
 * learner's, and the placeholders of the dashboard. The document's own
 * attributes pick one before anything is drawn (the head scripts set them
 * from what the browser remembers, see store/sessionPresence.ts and
 * store/homeHint.ts): the guest's for a visitor and for a learner with no
 * courses yet, the dashboard's for an account whose home that is, and the
 * learner's for anyone else who is signed in.
 */
export const guestHomePreviewClasses =
  "guest-home-preview contents [:root[data-session-hint=signed-in]:not([data-home-hint=new-learner])_&]:hidden";
export const learnerHomePendingClasses =
  "session-pending-home hidden [:root[data-session-hint=signed-in]:not([data-home-hint])_&]:block";
export const dashboardHomePendingClasses =
  "dashboard-pending-home hidden [:root[data-session-hint=signed-in][data-home-hint$=dashboard]_&]:block";

// The sidebar's profile button keeps one fixed corner radius while the
// sidebar is expanded. The `!` is needed because the app-wide roundness
// setting otherwise resizes every button's corners.
//
// On the collapsed rail it is a clearly visible squircle, but only once the
// sidebar has actually finished narrowing: the collapsed state is switched on
// at the start of that animation, so the squircle is tied to the width of the
// surrounding container (the profile block here, the nav for menu items)
// instead. Until the rail is narrow the ordinary rounded corners stay. The
// same goes for dragging the rail wider: holding the resize handle changes
// nothing until the rail actually grows.
//
// The squircle needs `corner-shape`. A browser without it (Firefox, Safari)
// would draw the rail's large radius as a circle, so there the button has
// 15px corners and sidebar-squircle-fallback.css cuts the same squircle out
// with a mask. The menu items and dock buttons below follow the same rule.
//
// The button's height and the picture's inset from its left edge are tied
// to the width of the profile block (a size container): 64px tall with the
// picture 7px in when wide, easing to a 57px square with the picture centred
// by the time the block is rail-width. The stylesheet instead switches
// between two fixed layouts when the collapsed state changes, which left the
// picture off-centre at the end of a drag until release, and made the button
// balloon into a huge square at the start of a collapse.
//
// While the sidebar is being dragged, the profile button and the menu items
// clip their own contents, so the profile arrow and a menu item's shortcut
// badge are cut off at the button's edge instead of hanging outside it.
//
// The picture has no outline in any theme: neither the frame's border nor
// the picture's own border and inner edge light are drawn.
//
// While the collapsed rail is being dragged wider, the name and the arrow
// are laid out exactly as in the expanded button (same gap, same right
// padding, both present) and simply come into view as the button widens,
// the reverse of how they are cut off while it narrows.
export const SIDEBAR_PROFILE_BUTTON_CLASS =
  "courses-profile__button sidebar-squircle h-[clamp(57px,calc(57px+(100cqw-57px)*0.07),64px)]! min-h-0! aspect-auto! justify-start! pl-[clamp(0.7px,calc(0.7px+(100cqw-57px)*0.063),7px)]! [:root:not([data-sidebar-state=collapsed])_.courses-app:not(.courses-app--collapsed)_&]:rounded-xl! [:is(.courses-app--collapsed,[data-sidebar-state=collapsed]_.courses-app)_&]:@min-[60.01px]:rounded-xl! [:is(.courses-app--collapsed,[data-sidebar-state=collapsed]_.courses-app)_&]:@min-[60.01px]:[corner-shape:round]! [:is(.courses-app--collapsed,[data-sidebar-state=collapsed]_.courses-app)_&]:@max-[60px]:supports-[corner-shape:squircle]:rounded-[28.5px]! [:is(.courses-app--collapsed,[data-sidebar-state=collapsed]_.courses-app)_&]:@max-[60px]:not-supports-[corner-shape:squircle]:rounded-[15px]! [:is(.courses-app--collapsed,[data-sidebar-state=collapsed]_.courses-app)_&]:@max-[60px]:[corner-shape:squircle]! [.courses-app--resizing_&]:overflow-hidden! [&_strong]:text-[15px]! [&>span:first-child]:border-transparent! [&_i]:border-transparent! [&_i]:shadow-none! [.courses-app--collapsed.courses-app--resizing_&]:gap-1! [.courses-app--collapsed.courses-app--resizing_&]:pr-[9px]! [.courses-app--collapsed.courses-app--resizing_&]:[&>span:not(:first-child)]:block! [.courses-app--collapsed.courses-app--resizing_&]:[&>span:not(:first-child)]:max-w-[190px]! [.courses-app--collapsed.courses-app--resizing_&]:[&>span:not(:first-child)]:opacity-100! [.courses-app--collapsed.courses-app--resizing_&]:[&>span:not(:first-child)]:[clip-path:none]! [.courses-app--collapsed.courses-app--resizing_&]:[&>svg]:block! [.courses-app--collapsed.courses-app--resizing_&]:[&>svg]:w-[19px]! [.courses-app--collapsed.courses-app--resizing_&]:[&>svg]:min-w-[19px]! [.courses-app--collapsed.courses-app--resizing_&]:[&>svg]:shrink-0! [.courses-app--collapsed.courses-app--resizing_&]:[&>svg]:max-w-[190px]! [.courses-app--collapsed.courses-app--resizing_&]:[&>svg]:opacity-100! [.courses-app--collapsed.courses-app--resizing_&]:[&>svg]:[clip-path:none]!";
// Menu items are as tall as the collapsed profile button, with the dock's
// icon size and a matching label size, in both sidebar states. On the
// collapsed rail they are squares and become the same squircle. The left
// padding centres the icon in the collapsed square, which also keeps it on
// the same vertical line in the expanded row.
// Where the squircle is cut out with a mask (sidebar-squircle-fallback.css),
// a collapsed item also has a 1px transparent border, as the dock and
// profile buttons do: the 1px edge light is drawn inside the border, so the
// squircle leaves it whole instead of trimming it to a hairline at the top.
// The left padding is 1px less, so the icon stays where it is.
// Idle items carry a faint fill, about half as strong as the hover fill.
// It is see-through unless the stylesheet supplies a solid one (it does
// while the lesson video glows under the sidebar; see navigation.css).
export const SIDEBAR_NAV_ITEM_SQUIRCLE_CLASS =
  "sidebar-squircle [:is(.courses-app--collapsed,[data-sidebar-state=collapsed]_.courses-app)_&]:@max-[60px]:not-supports-[corner-shape:squircle]:border! [:is(.courses-app--collapsed,[data-sidebar-state=collapsed]_.courses-app)_&]:@max-[60px]:not-supports-[corner-shape:squircle]:border-transparent! [:is(.courses-app--collapsed,[data-sidebar-state=collapsed]_.courses-app)_&]:@max-[60px]:not-supports-[corner-shape:squircle]:pl-[15px]! [:is(.courses-app--collapsed,[data-sidebar-state=collapsed]_.courses-app)_&]:@max-[60px]:supports-[corner-shape:squircle]:rounded-[50%]! [:is(.courses-app--collapsed,[data-sidebar-state=collapsed]_.courses-app)_&]:@max-[60px]:not-supports-[corner-shape:squircle]:rounded-[15px]! [:is(.courses-app--collapsed,[data-sidebar-state=collapsed]_.courses-app)_&]:@max-[60px]:[corner-shape:squircle] h-[57px]! min-h-[57px]! pl-4! [&_svg]:size-[26px]! [&_svg]:basis-[26px]! text-base! [:root:not([data-sidebar-state=collapsed])_.courses-app:not(.courses-app--collapsed)_&]:rounded-xl! [:is(.courses-app--collapsed,[data-sidebar-state=collapsed]_.courses-app)_&]:@min-[60.01px]:rounded-xl! [&:not(.is-active):not(:hover)]:bg-[var(--sidebar-menu-idle-background,color-mix(in_srgb,var(--surface)_35%,transparent))]! [.courses-app--resizing_&]:overflow-hidden!";

// The dock has no box of its own (background, padding, shadow): its buttons
// stand directly on the sidebar at the menu items' height and icon size, and
// idle ones carry the same faint fill as an idle menu item, and the same
// hover fill (dark and light themes each have their own), with no outline. Stacked
// vertically, each button takes the dock's full width, which makes it a
// square on the collapsed rail. There the buttons also take the same
// squircle as the profile button and menu items, under the same rule: only
// once the rail is narrow, and unaffected by holding the resize handle.
// The colour and reading-mode menus open inside the dock, so every button in
// them (swatches, the light/dark switch, the reading-mode toggle and its
// selects) is excluded from every button rule here.
// The dark/light and reading-mode icons take their own colours from the same
// source as the menu icons (so they follow the icon style setting), and each
// icon's glow follows its own colour instead of the theme accent.
export const SIDEBAR_DOCK_CLASS =
  "sidebar-squircle-dock [&.sidebar-appearance--vertical_button:not([data-theme-swatch],[data-palette-menu]_*,[data-reading-mode-menu]_*)]:w-full! [&.sidebar-appearance--vertical_button:not([data-theme-swatch],[data-palette-menu]_*,[data-reading-mode-menu]_*)]:basis-auto! [&.sidebar-appearance--vertical_.sidebar-palette-wrap]:w-full! [&.sidebar-appearance--vertical_.sidebar-palette-wrap]:h-auto! [&.sidebar-appearance--vertical_.sidebar-palette-wrap]:basis-auto! [:is(.courses-app--collapsed,[data-sidebar-state=collapsed]_.courses-app)_&]:@max-[60px]:supports-[corner-shape:squircle]:[&_button:not([data-theme-swatch],[data-palette-menu]_*,[data-reading-mode-menu]_*)]:rounded-[50%]! [:is(.courses-app--collapsed,[data-sidebar-state=collapsed]_.courses-app)_&]:@max-[60px]:not-supports-[corner-shape:squircle]:[&_button:not([data-theme-swatch],[data-palette-menu]_*,[data-reading-mode-menu]_*)]:rounded-[15px]! [:is(.courses-app--collapsed,[data-sidebar-state=collapsed]_.courses-app)_&]:@max-[60px]:[&_button:not([data-theme-swatch],[data-palette-menu]_*,[data-reading-mode-menu]_*)]:[corner-shape:squircle]! bg-transparent! p-0! shadow-none! [&_button:not([data-theme-swatch],[data-palette-menu]_*,[data-reading-mode-menu]_*,.is-active,[aria-expanded=true],[aria-pressed=true])]:bg-[color-mix(in_srgb,var(--surface)_35%,transparent)]! [&_button:not([data-theme-swatch],[data-palette-menu]_*,[data-reading-mode-menu]_*,.is-active,[aria-expanded=true],[aria-pressed=true])]:hover:bg-[color-mix(in_srgb,var(--surface)_72%,transparent)]! in-data-[theme=light]:[&_button:not([data-theme-swatch],[data-palette-menu]_*,[data-reading-mode-menu]_*,.is-active,[aria-expanded=true],[aria-pressed=true])]:hover:bg-[color-mix(in_srgb,var(--selected)_68%,var(--surface))]! [&_button:not([data-palette-menu]_*,[data-reading-mode-menu]_*)>svg]:size-[26px] [&_button:not([data-theme-swatch],[data-palette-menu]_*,[data-reading-mode-menu]_*)]:h-[57px]! [&_button:not([data-theme-swatch],[data-palette-menu]_*,[data-reading-mode-menu]_*)]:min-h-[57px]! [:is(.courses-app--collapsed,[data-sidebar-state=collapsed]_.courses-app)_&]:[&_button:not([data-palette-menu]_*,[data-reading-mode-menu]_*)>svg]:size-[26px] [:is(.courses-app--collapsed,[data-sidebar-state=collapsed]_.courses-app)_&]:@min-[60.01px]:[&_button:not([data-theme-swatch],[data-palette-menu]_*,[data-reading-mode-menu]_*)]:rounded-xl! [:is(.courses-app--collapsed,[data-sidebar-state=collapsed]_.courses-app)_&]:@min-[60.01px]:[&_button:not([data-theme-swatch],[data-palette-menu]_*,[data-reading-mode-menu]_*)]:[corner-shape:round]! [:root:not([data-sidebar-state=collapsed])_.courses-app:not(.courses-app--collapsed)_&]:[&_button:not([data-theme-swatch],[data-palette-menu]_*,[data-reading-mode-menu]_*)]:rounded-xl! [&_button:not([data-theme-swatch],[data-palette-menu]_*,[data-reading-mode-menu]_*)]:hover:border-transparent! mt-2! gap-2! [&_[data-appearance-mode-toggle]>svg]:text-(--dock-appearance-icon-color)! [&_[data-reading-mode-trigger]>svg]:text-(--dock-reading-mode-icon-color)! [&_button:not([data-palette-menu]_*,[data-reading-mode-menu]_*)>svg]:[filter:drop-shadow(0_2px_6px_color-mix(in_srgb,currentColor_38%,transparent))]!";

// The phone sheet's appearance row matches the desktop dock: no tray behind
// the buttons, each button standing on its own at the dock's height, corners
// and icon size. Idle buttons keep the sheet's own darker fill and border so
// each one has a clear edge; the active one rises. The tray clipped its
// children, so it no longer does: the active button's shadow would be cut at
// the row's edge.
export const MOBILE_SHEET_DOCK_CLASS =
  "bg-transparent! p-0! shadow-none! rounded-none! overflow-visible! gap-2! [&_button]:h-[57px]! [&_button]:min-h-[57px]! [&_button]:rounded-xl! [&_button>svg]:size-[26px] [&_[data-appearance-mode-toggle]>svg]:text-(--dock-appearance-icon-color)! [&_[data-reading-mode-trigger]>svg]:text-(--dock-reading-mode-icon-color)! [&_button>svg]:[filter:drop-shadow(0_2px_6px_color-mix(in_srgb,currentColor_38%,transparent))]!";

// While the sidebar is animating or being dragged between its two states it
// still counts as collapsed but is no longer narrow. In that in-between
// stretch every piece shows the corners it has at rest when expanded, so
// nothing changes shape when the motion ends.

// While the expanded sidebar is being dragged narrower, the collapse button
// rides the sidebar's right edge all the way down to the collapsed width, and
// the logo is cut exactly where the button begins. Left to the stylesheet,
// the button sits after the logo in a row with a gap: the gap hid the logo
// early, and the row's left padding stopped the button short of its place.
//
// Dragging the collapsed rail wider does the reverse, and from the first
// pixel: the button leaves with the sidebar's edge and the logo is revealed
// behind it, starting at its first letter, which never moves sideways. The
// stylesheet otherwise keeps the rail layout until the drag passes a
// threshold and then jumps to the expanded one.
//
// The button keeps one line through all of this: the same height in the
// header at rest, on the rail at rest and during either drag, and a
// horizontal position that meets the resting one at both ends (the half-pixel
// offsets absorb the nudge the stylesheet gives the icon on the rail).
// On the rail the icon is centred over the menu icons, which is a few pixels
// left of where the sidebar's edge alone would leave it, so the drag
// positions ease across that difference over the last stretch before the
// rail (the `clamp` terms) rather than stepping at release.
// The collapse icon is drawn larger too, scaled about its centre and set
// half a pixel lower, so its rounded bottom edge reads as level with the
// bottom of the wordmark while it still covers the first letter on the rail.
// The logo is drawn 10% larger than the stylesheet's slot for it, scaled
// from its left edge so the first letter keeps its place; the rail's slot
// for that letter is widened to match.
// The gap before the collapse button is tightened so the larger wordmark
// still fits whole at the narrowest expanded width.
//
// The collapse button and shortcut animate the same way as a drag. The
// header keeps one layout for every collapsed state, positioned from the
// sidebar's right edge, so while the sidebar narrows the button travels in
// and covers the logo instead of jumping to the rail. On the rail the button
// is hidden unless the sidebar is hovered; that fade is held back for the
// length of the collapse so the button is seen arriving.
//
// The logo sits 4px lower than the stylesheet puts it, in every state. That
// centres it on the collapse icon's line, and on the rail it puts the first
// letter wholly behind the icon when the icon shows.
//
// The header keeps the rail's height for as long as the sidebar counts as
// collapsed. The stylesheet makes it 2px taller once an outward drag passes
// its content threshold, which pushed the whole menu down mid-drag.
//
// On the settled rail the logo's first letter is drawn a little smaller than
// in the open sidebar, small enough to sit wholly behind the collapse icon
// when the icon shows. (The icon used to carry a pad in the sidebar's
// background colour to cover the letter's edges instead; over the lesson
// video's ambient glow that pad showed as a dark ring.)
// The window the letter shows through is narrowed to match (20px), or the
// smaller wordmark would bring the start of its second letter into it.
// On hover, in both sidebar states, the button's own hover background and
// glow are switched off and the icon gets a single outline in the theme's
// accent colour, with the same colour behind it.
// The compact (48px) brand slot and its lower logo apply only to the settled
// collapsed sidebar. While a drag has the full wordmark showing
// (`resize-content-visible`), the stylesheet gives the slot its expanded
// 50px and shifts the menu to match; forcing the compact size there as well
// moved the logo and the whole menu by 2px mid-drag.
// The logo keeps its 38px box in the compact slot too, so the mark sits at
// the same height in every state.
// It keeps one horizontal place in every state as well: the mark centred on
// the menu's icon column. Only the settled collapsed sidebar used to have
// that nudge, so the logo stepped 1.5px left on the frame it collapsed.
export const SIDEBAR_BRAND_CLASS =
  "courses-sidebar__brand [--sidebar-resize-preview-width:inherit] [--sidebar-resize-logo-opacity:inherit] [&>.courses-logo-clip]:[--sidebar-resize-logo-opacity:inherit] [&>.courses-logo-clip]:[transition:opacity_200ms_ease]! [.courses-app--resizing_&]:[&>.courses-logo-clip]:[transition:none]! [.courses-app--resizing_&]:[&>.courses-logo-clip]:opacity-(--sidebar-resize-logo-opacity)! [:root:not([data-collapsed-sidebar-logo=true])_.courses-app--collapsed:not(.courses-app--resizing)_&]:[&>.courses-logo-clip]:opacity-0! [[data-collapsed-sidebar-logo=true]_.courses-app--collapsed:not(.courses-app--resizing)_.courses-sidebar:is(:hover,:focus-within)_&]:[&>.courses-logo-clip]:opacity-0! [[data-collapsed-sidebar-logo=true]_.courses-app--collapsed:not(.courses-app--resizing)_&]:[&>.courses-logo-clip]:[transition:opacity_120ms_ease_340ms]! [[data-collapsed-sidebar-logo=true]_.courses-app--collapsed:not(.courses-app--resizing)_.courses-sidebar:is(:hover,:focus-within)_&]:[&>.courses-logo-clip]:[transition:opacity_120ms_ease_0ms]! [.courses-app:not(.courses-app--collapsed)_&]:[&>.courses-logo-clip]:max-w-[min(156px,max(21px,calc(100%-36px)))]! [.courses-app--collapsed_&]:flex-row! [.courses-app--collapsed_&]:items-end! [.courses-app--collapsed_&]:justify-start! [.courses-app--collapsed_&]:pl-[19.375px]! [.courses-app--collapsed_&]:pr-[7px]! [.courses-app--collapsed.courses-app--resizing_&]:[&>.courses-logo-clip]:static! [.courses-app--collapsed.courses-app--resizing_&]:[&>.courses-logo-clip]:block! [.courses-app--collapsed.courses-app--resizing_&]:[&>.courses-logo-clip]:w-[156px]! [.courses-app--collapsed.courses-app--resizing_&]:[&>.courses-logo-clip]:transform-none! [.courses-app--collapsed.courses-app--resizing_&]:[&>.courses-logo-clip]:[clip-path:inset(0)]! [.courses-app--collapsed.courses-app--resizing_&]:[&>.courses-logo-clip]:max-w-[min(156px,max(0px,calc(100%-36px)))]! [[data-collapsed-sidebar-logo=true]_.courses-app--collapsed:not(.courses-app--resizing)_&]:[&>.courses-logo-clip]:static! [[data-collapsed-sidebar-logo=true]_.courses-app--collapsed:not(.courses-app--resizing)_&]:[&>.courses-logo-clip]:block! [[data-collapsed-sidebar-logo=true]_.courses-app--collapsed:not(.courses-app--resizing)_&]:[&>.courses-logo-clip]:w-[156px]! [[data-collapsed-sidebar-logo=true]_.courses-app--collapsed:not(.courses-app--resizing)_&]:[&>.courses-logo-clip]:transform-none! [[data-collapsed-sidebar-logo=true]_.courses-app--collapsed:not(.courses-app--resizing)_&]:[&>.courses-logo-clip]:[clip-path:inset(0)]! [[data-collapsed-sidebar-logo=true]_.courses-app--collapsed:not(.courses-app--resizing)_&]:[&>.courses-logo-clip]:max-w-[min(156px,max(21px,calc(100%-36px)))]! [[data-collapsed-sidebar-logo=true]_.courses-app--collapsed.courses-app--resizing_&]:[&>.courses-logo-clip]:max-w-[min(156px,max(21px,calc(100%-36px)))]! [&>.courses-logo-clip>svg]:origin-left [&>.courses-logo-clip>svg]:scale-[0.975] [&>.courses-logo-clip]:translate-y-[2px] [&>.courses-logo-clip]:-translate-x-[0.5px] min-[641px]:[&>.courses-logo-clip]:-translate-x-[1px] [.courses-app--collapsed:not(.courses-app--resize-content-visible)_&]:h-12! [.courses-app--collapsed:not(.courses-app--resize-content-visible)_&]:min-h-12! [.courses-app--collapsed:not(.courses-app--resize-content-visible)_&]:[&>.courses-logo-clip]:-mb-[2px] [.courses-app--collapsed:not(.courses-app--resize-content-visible)_&]:[&>.courses-logo-clip]:h-[38px]!";
export const SIDEBAR_COLLAPSE_BUTTON_CLASS =
  "sidebar-collapse [--sidebar-resize-preview-width:inherit] [.courses-app:not(.courses-app--collapsed)_&]:absolute! [.courses-app:not(.courses-app--collapsed)_&]:top-[14px]! [.courses-app:not(.courses-app--collapsed)_&]:bottom-auto! [.courses-app:not(.courses-app--collapsed)_&]:left-[calc(100%-39px-clamp(0px,(112px-100%)*0.1,4px))]! [.courses-app--collapsed_&]:absolute! [.courses-app--collapsed_&]:top-[14px]! [.courses-app--collapsed_&]:bottom-auto! [.courses-app--collapsed_&]:left-auto! [.courses-app--collapsed_&]:right-[calc(7.5px+clamp(0px,(120px-100%)*0.1,4px))]! [.courses-app--collapsed_&]:opacity-100! [.courses-app--collapsed_&]:pointer-events-auto! [[data-collapsed-sidebar-logo=true]_.courses-app--collapsed:not(.courses-app--resizing)_.courses-sidebar:not(:hover):not(:focus-within)_&]:opacity-0! [[data-collapsed-sidebar-logo=true]_.courses-app--collapsed:not(.courses-app--resizing)_.courses-sidebar:not(:hover):not(:focus-within)_&]:pointer-events-none! [[data-collapsed-sidebar-logo=true]_.courses-app--collapsed:not(.courses-app--resizing)_&]:[transition:opacity_120ms_ease_120ms]! [[data-collapsed-sidebar-logo=true]_.courses-app--collapsed:not(.courses-app--resizing)_.courses-sidebar:not(:hover):not(:focus-within)_&]:[transition:opacity_120ms_ease_220ms]! [.courses-app--collapsed:not(.courses-app--resizing)_.courses-sidebar:not(:hover)_&]:delay-[220ms]! [&>span]:origin-bottom [&>span]:scale-[0.88] [&>span]:-translate-y-[1.02px] [.courses-app--collapsed_&]:[&>span]:origin-center [.courses-app--collapsed_&]:[&>span]:scale-[0.958] [.courses-app--collapsed_&]:[&>span]:translate-x-[0.4px] [.courses-app--collapsed_&]:[&>span]:-translate-y-[1.8px] bg-transparent! shadow-none! hover:[--sidebar-toggle-surface:color-mix(in_srgb,var(--accent)_50%,var(--surface))] active:[--sidebar-toggle-surface:color-mix(in_srgb,var(--accent)_50%,var(--surface))] [&_rect:first-child]:transition-[fill] [&_rect:first-child]:duration-150 motion-reduce:[&_rect:first-child]:transition-none";
