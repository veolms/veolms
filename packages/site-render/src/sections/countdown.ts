import { button } from "../context.ts";
import { html } from "../html.ts";
import { frame, type SectionRenderer } from "./frame.ts";

const UNITS = ["Days", "Hours", "Minutes", "Seconds"] as const;

/** Days, hours, minutes and seconds in `ms`, each two digits. */
function split(ms: number): string[] {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return [
    Math.floor(seconds / 86_400),
    Math.floor((seconds % 86_400) / 3600),
    Math.floor((seconds % 3600) / 60),
    seconds % 60,
  ].map((value) => String(value).padStart(2, "0"));
}

/**
 * An offer clock: to a fixed date for everyone, or "evergreen" (each
 * visitor gets the same number of hours from their first visit, kept in
 * their browser). The page script keeps it ticking; it shows the time at
 * publishing until then. When it ends, the clock gives way to `endedText`.
 */
export const countdown: SectionRenderer<"countdown"> = {
  css: `
.vp-countdown .vp-wrap{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:20px 32px}
.vp-cd-words h2{margin:0;font-size:calc(clamp(1.3rem,3vw,1.8rem)*var(--hs))}
.vp-cd-words p{margin:6px 0 0;color:var(--s-muted)}
.vp-cd{display:flex;align-items:center;gap:clamp(8px,1.6vw,14px)}
.vp-cd-unit{display:grid;justify-items:center;min-width:clamp(54px,9vw,74px);padding:10px 8px;border-radius:var(--radius);background:color-mix(in srgb,var(--s-text) 10%,transparent)}
.vp-cd-unit b{font-family:var(--font-heading);font-weight:var(--heading-weight);font-size:clamp(1.5rem,4vw,2.2rem);line-height:1;font-variant-numeric:tabular-nums}
.vp-cd-unit span{margin-top:6px;font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--s-muted)}
.vp-cd-ended{display:none;font-weight:700}
.vp-cd[data-ended]{display:none}
.vp-cd[data-ended]+.vp-cd-ended{display:block}
.vp-countdown--boxes .vp-wrap{flex-direction:column;text-align:center;justify-content:center}
.vp-countdown--boxes .vp-cd-unit{min-width:clamp(70px,14vw,120px);padding:clamp(14px,3vw,24px) 10px}
.vp-countdown--boxes .vp-cd-unit b{font-size:clamp(2rem,7vw,3.6rem)}
`,
  render(section, context) {
    const { settings } = section;
    const endsAt = settings.endsAt ? Date.parse(settings.endsAt) : Number.NaN;
    const remaining =
      settings.mode === "evergreen"
        ? settings.hours * 3_600_000
        : Number.isFinite(endsAt)
          ? endsAt - Date.now()
          : 0;
    const digits = split(remaining);
    const clockData =
      settings.mode === "evergreen"
        ? html`data-countdown data-hours="${String(settings.hours)}"
          data-key="${section.id}"`
        : html`data-countdown data-end="${settings.endsAt}"`;
    const action = button(settings.button, context);
    const clock =
      settings.mode === "date" && !Number.isFinite(endsAt)
        ? context.mode === "editor"
          ? html`<p class="vp-note">Pick the date the offer ends.</p>`
          : null
        : html`<div
              class="vp-cd"
              ${clockData}
              role="timer"
              aria-label="Time left"
            >
              ${UNITS.map(
                (unit, index) =>
                  html`<span class="vp-cd-unit"
                    ><b data-unit>${digits[index]}</b><span>${unit}</span></span
                  >`,
              )}
            </div>
            ${settings.endedText ? html`<p class="vp-cd-ended">${settings.endedText}</p>` : null}`;
    return frame(
      section,
      settings,
      html`<div class="vp-cd-words">
          ${settings.heading ? html`<h2 class="vp-h2">${settings.heading}</h2>` : null}
          ${settings.text ? html`<p>${settings.text}</p>` : null}
        </div>
        <div>${clock}</div>
        ${action ? html`<div class="vp-actions">${action}</div>` : null}`,
    );
  },
};
