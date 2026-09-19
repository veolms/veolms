import type { SVGProps } from "react";

interface AppIconMark {
  d: string;
  fill?: boolean;
  strokeWidth?: number;
}

const icons = {
  player: {
    viewBox: "252 239 749 770",
    marks: [
      {
        d: "M422.5 247L404.5 249L391.5 252L374.5 258L360.5 265L341.5 278L326.5 292L315.5 306L304.5 324L304.5 326L297.5 341L290.5 363L287.5 380L282.5 398L282.5 403L279.5 414L277.5 429L276.5 430L273.5 454L272.5 455L271.5 469L270.5 470L269.5 484L268.5 485L266.5 511L265.5 512L263.5 547L262.5 548L262.5 562L261.5 563L261.5 584L260.5 585L260.5 675L261.5 676L261.5 696L262.5 697L262.5 711L263.5 712L263.5 724L264.5 725L266.5 757L267.5 758L267.5 766L268.5 767L268.5 775L269.5 776L269.5 783L271.5 791L272.5 806L273.5 807L273.5 813L274.5 814L279.5 849L280.5 850L282.5 864L284.5 869L284.5 873L290.5 897L296.5 915L305.5 934L319.5 954L342.5 976L355.5 984L372.5 992L388.5 997L407.5 1000L429.5 1000L448.5 997L487.5 986L528.5 971L576.5 951L600.5 940L669.5 905L717.5 878L756.5 854L803.5 823L844.5 794L906.5 746L940.5 717L961.5 697L978.5 675L988.5 654L992.5 638L992.5 616L991.5 615L991.5 610L989.5 602L982.5 585L968.5 564L938.5 534L898.5 500L847.5 460L799.5 425L746.5 389L691.5 355L632.5 322L586.5 299L534.5 276L494.5 261L461.5 251L445.5 248L432.5 247Z",
        fill: true,
      },
    ],
  },
  miniPlayerExpand: {
    viewBox: "0 0 91 82",
    marks: [
      {
        d: "M48.5 64.5H12.5V11.5H79V34.2",
        strokeWidth: 5.5,
      },
      {
        d: "M22 22H47.2V39H22Z",
        strokeWidth: 6,
      },
      {
        d: "M58.7 42.1H76.4A2.55 2.55 0 0 1 79 44.65 2.55 2.55 0 0 1 76.4 47.2H58.7A2.55 2.55 0 0 1 56.15 44.65 2.55 2.55 0 0 1 58.7 42.1Z",
        fill: true,
      },
      {
        d: "M56 44.8V63.6A2.75 2.75 0 0 1 61.5 63.6V44.8A2.75 2.75 0 0 1 56 44.8Z",
        fill: true,
      },
      {
        d: "M61.4 47.3H69.2L82.3 62.8V65.6L79.4 68 76 68.2 62.6 54.7Z",
        fill: true,
      },
    ],
  },
  cloudUpload: {
    viewBox: "0 0 640 640",
    marks: [
      {
        d: "M176 544C96.5 544 32 479.5 32 400C32 336.6 73 282.8 129.9 263.5C128.6 255.8 128 248 128 240C128 160.5 192.5 96 272 96C327.4 96 375.5 127.3 399.6 173.1C413.8 164.8 430.4 160 448 160C501 160 544 203 544 256C544 271.7 540.2 286.6 533.5 299.7C577.5 320 608 364.4 608 416C608 486.7 550.7 544 480 544L176 544zM337 255C327.6 245.6 312.4 245.6 303.1 255L231.1 327C221.7 336.4 221.7 351.6 231.1 360.9C240.5 370.2 255.7 370.3 265 360.9L296 329.9L296 432C296 445.3 306.7 456 320 456C333.3 456 344 445.3 344 432L344 329.9L375 360.9C384.4 370.3 399.6 370.3 408.9 360.9C418.2 351.5 418.3 336.3 408.9 327L336.9 255z",
        fill: true,
      },
    ],
  },
} as const satisfies Record<
  string,
  { viewBox: string; marks: readonly AppIconMark[] }
>;

export type AppIconName = keyof typeof icons;

export interface AppIconProps extends Omit<
  SVGProps<SVGSVGElement>,
  "name" | "title"
> {
  name: AppIconName;
  title?: string;
}

export function AppIcon({ name, title, ...props }: AppIconProps) {
  const icon = icons[name];
  const {
    role,
    "aria-hidden": ariaHidden,
    "aria-label": ariaLabel,
    ...svgProps
  } = props;
  const labelled = Boolean(title || ariaLabel);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={icon.viewBox}
      fill="none"
      focusable="false"
      role={role ?? (labelled ? "img" : undefined)}
      aria-hidden={ariaHidden ?? (labelled ? undefined : true)}
      aria-label={ariaLabel ?? title}
      {...svgProps}
    >
      {title ? <title>{title}</title> : null}
      {icon.marks.map((mark) => {
        const isFill = "fill" in mark && mark.fill === true;
        return (
          <path
            key={mark.d}
            d={mark.d}
            fill={isFill ? "currentColor" : "none"}
            stroke={isFill ? "none" : "currentColor"}
            strokeWidth={
              isFill ? undefined : ("strokeWidth" in mark ? mark.strokeWidth : 2)
            }
            strokeLinecap={isFill ? undefined : "round"}
            strokeLinejoin={isFill ? undefined : "round"}
          />
        );
      })}
    </svg>
  );
}
