import { useState, type CSSProperties } from "react";
import { useHomeFestive } from "../services/home";
import { DiwaliCoupon } from "./DiwaliCoupon";
import { DiwaliDiyaRow } from "./DiwaliDiyaRow";
import "./diwali.css";

/** Left out of the collapsed rail, which keeps only the fountain. */
const notInRail = "[.courses-app--collapsed_&]:hidden";

/**
 * A firework: a rocket's trail climbs to the burst, which then opens into a
 * ring of sparks and fades. Each burst is one element that grows, so a sky
 * of them costs the compositor a handful of layers, not one per spark.
 */
function Firework({
  left,
  top,
  size,
  trail,
  color,
  delay,
}: {
  left: string;
  top: string;
  size: number;
  trail: number;
  color: string;
  delay: string;
}) {
  const rays = 10;
  return (
    <span className="absolute size-0" style={{ left, top }}>
      <span
        style={{ height: trail, animationDelay: delay }}
        className="absolute top-0 -left-px w-0.5 animate-[diwali-rocket_8.4s_cubic-bezier(.3,.6,.4,1)_infinite] rounded-full bg-[linear-gradient(to_bottom,#FFF1CF_0,rgb(255_196_110/0.55)_10px,transparent_44px)] opacity-0 motion-reduce:hidden"
      />
      <svg
        viewBox="-50 -50 100 100"
        style={{
          width: size,
          height: size,
          animationDelay: delay,
          color,
        }}
        className="absolute -translate-1/2 animate-[diwali-burst_8.4s_cubic-bezier(.15,.7,.3,1)_infinite] overflow-visible opacity-0 motion-reduce:hidden"
      >
        <circle r="9" fill="currentColor" opacity=".35" />
        {Array.from({ length: rays }, (_, index) => {
          const angle = (index / rays) * Math.PI * 2;
          const x = Math.cos(angle);
          const y = Math.sin(angle);
          return (
            <g key={index}>
              <line
                x1={x * 18}
                y1={y * 18}
                x2={x * 40}
                y2={y * 40}
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                opacity=".9"
              />
              <circle cx={x * 46} cy={y * 46} r="2.6" fill="#FFF4D6" />
            </g>
          );
        })}
      </svg>
    </span>
  );
}

/** The festive sky's stars. */
const stars: readonly [string, string, string][] = [
  ["14%", "16%", "0s"],
  ["86%", "30%", ".9s"],
  ["58%", "8%", "1.7s"],
  ["36%", "36%", ".9s"],
  ["92%", "54%", "0s"],
  ["6%", "48%", "1.7s"],
];

/**
 * The Diwali offer in the sidebar, in the room between the menu and the
 * profile button: a night sky with fireworks over two diyas and a fountain,
 * and the coupon code under them, which copies with a press. It shows
 * while an admin has the festive offer on (Platform > Home page), with the
 * code set there; without a code it is the diyas alone.
 *
 * It takes only the room the menu leaves: the box is a size container, the
 * card shows only where it fits whole, and the sky above it only where
 * there is room for that too. The collapsed rail keeps only the fountain,
 * sparkling and still firing rockets when pressed, in a box of its own
 * height so the rail's menu keeps its room.
 *
 * It can be hidden from its corner for the rest of the visit: it is back on
 * the next load, as a sale should be. Hidden or off, its box stays, empty,
 * so the profile button and the dock below keep their place at the
 * sidebar's foot.
 */
export function DiwaliSidebarOffer() {
  const festive = useHomeFestive().data;
  const [hidden, setHidden] = useState(false);

  if (hidden || !festive?.enabled) {
    return (
      <div
        aria-hidden="true"
        className="min-h-0 flex-1 [.courses-app--collapsed_&]:hidden"
      />
    );
  }

  const { couponCode, couponNote } = festive;
  const hide = () => setHidden(true);

  return (
    <section
      aria-label="Diwali offer"
      className="group/diwali relative mx-[9.5px] min-h-0 flex-1 [container-name:diwali] [container-type:size] [.courses-app--collapsed_&]:h-24 [.courses-app--collapsed_&]:flex-none"
    >
      {/* Everything is laid out from the box's foot up; it shows only where
          the card fits whole. */}
      <div className="absolute inset-x-0 bottom-0 hidden flex-col justify-end pb-3 [@container_diwali_(min-height:11rem)]:flex [@container_diwali_(min-height:11rem)]:pb-0 [.courses-app--collapsed_&]:flex">
        {/* The warm light of the diyas over the foot of the sidebar. */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute -inset-x-8 -bottom-20 h-104 ${notInRail} bg-[radial-gradient(ellipse_50%_50%_at_50%_58%,rgb(255_150_50/0.2)_0%,rgb(255_150_50/0.1)_32%,rgb(255_150_50/0.03)_62%,transparent)] [:root[data-theme=light]_&]:opacity-70`}
        />

        {/* The sky, where there is room for it above the card. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none relative hidden h-52 shrink-0 mask-[linear-gradient(to_top,black_0%,black_55%,transparent)] [@container_diwali_(min-height:23rem)]:block ${notInRail}`}
        >
          {stars.map(([left, top, delay]) => (
            <span
              key={`${left}${top}`}
              style={{ left, top, animationDelay: delay }}
              className="absolute size-0.5 animate-[diwali-twinkle_2.8s_ease-in-out_infinite] rounded-full bg-[#fff3d6] motion-reduce:animate-none [:root[data-theme=light]_&]:bg-[#d79a3a]"
            />
          ))}
          <Firework
            left="28%"
            top="34%"
            size={74}
            trail={150}
            color="#FFD27A"
            delay="0s"
          />
          <Firework
            left="74%"
            top="22%"
            size={86}
            trail={180}
            color="#FF9FB0"
            delay="2.8s"
          />
          <Firework
            left="60%"
            top="56%"
            size={56}
            trail={120}
            color="#FFF1D0"
            delay="5.2s"
          />
          <Firework
            left="18%"
            top="64%"
            size={48}
            trail={100}
            color="#B9C2FF"
            delay="6.8s"
          />
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={hide}
            aria-label="Hide the Diwali offer"
            title="Hide"
            // A faint mark rather than a control: no ring, only a whisper of
            // a circle, brighter when pointed at.
            className="absolute -top-6 right-0 z-10 grid size-5 [.courses-app--collapsed_&]:hidden cursor-pointer before:absolute before:-inset-2.5 before:content-[''] place-items-center rounded-full bg-white/[0.04] text-slate-400/60 opacity-0 transition-[opacity,background-color,color] duration-200 group-hover/diwali:opacity-100 hover:bg-white/10 hover:text-slate-200 focus-visible:opacity-100 focus-visible:outline-1 focus-visible:outline-white/30 [@media(hover:none)]:opacity-60 [:root[data-theme=light]_&]:bg-slate-900/[0.04] [:root[data-theme=light]_&]:text-slate-500/70 [:root[data-theme=light]_&]:hover:bg-slate-900/10 [:root[data-theme=light]_&]:hover:text-slate-700"
          >
            <svg viewBox="0 0 24 24" className="size-2" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <DiwaliDiyaRow />

          {couponCode ? (
            <DiwaliCoupon
              code={couponCode}
              note={couponNote}
              copyWord="container"
              className={`relative px-1 pt-6 pb-1 text-center ${notInRail}`}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
