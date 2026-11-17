import type { SiteLook } from "@veolms/contracts";
import {
  renderSectionHtml,
  siteAttributes,
  siteCss,
  type SiteRenderContext,
} from "@veolms/site-render";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { escapeHtml } from "@veolms/site-render";
import type { EditablePage } from "./pageDocument";
import { SECTION_CATALOG } from "./sectionCatalog";

export type EditorDevice = "phone" | "tablet" | "desktop";

const DEVICE_WIDTH: Record<EditorDevice, number> = {
  phone: 390,
  tablet: 820,
  desktop: 1280,
};

/**
 * Only the editor's outlines and "Add section" bars; the page itself is
 * styled by the theme, exactly as when it is live.
 */
const EDITOR_CSS = `
html,body{margin:0;min-height:100%}
a{cursor:default}
[data-ed-section]{position:relative;cursor:pointer}
[data-ed-section]::after{content:"";position:absolute;inset:0;pointer-events:none;outline:2px solid transparent;outline-offset:-2px;transition:outline-color .15s}
[data-ed-section]:hover::after{outline-color:color-mix(in srgb,#6366f1 55%,transparent)}
[data-ed-section][data-selected]::after{outline:2px solid #6366f1}
[data-ed-section][data-problem]::after{outline:2px solid #f43f5e}
[data-ed-section] .ed-tag{position:absolute;top:8px;left:8px;z-index:3;font:600 11px/1 system-ui,sans-serif;color:#fff;background:#6366f1;border-radius:6px;padding:5px 7px;opacity:0;pointer-events:none;transition:opacity .15s}
[data-ed-section]:hover .ed-tag,[data-ed-section][data-selected] .ed-tag{opacity:1}
[data-ed-section][data-problem] .ed-tag{background:#f43f5e;opacity:1}
.ed-insert{position:relative;height:0;z-index:4}
.ed-insert button{position:absolute;left:50%;top:0;transform:translate(-50%,-50%);font:600 12px/1 system-ui,sans-serif;color:#fff;background:#6366f1;border:0;border-radius:999px;padding:7px 12px;cursor:pointer;opacity:0;transition:opacity .15s;box-shadow:0 6px 18px -6px rgb(0 0 0/.4)}
.ed-insert:hover button,.ed-insert button:focus-visible{opacity:1}
.ed-insert::before{content:"";position:absolute;left:0;right:0;top:-14px;height:28px}
.ed-empty{min-height:60vh;display:grid;place-items:center;font:500 15px/1.5 system-ui,sans-serif;color:#64748b;text-align:center;padding:24px}
.ed-empty button{margin-top:12px;font:600 14px/1 system-ui,sans-serif;color:#fff;background:#6366f1;border:0;border-radius:10px;padding:12px 16px;cursor:pointer}
.ed-hidden-note{position:absolute;top:8px;right:8px;z-index:3;font:600 11px/1 system-ui,sans-serif;color:#0f172a;background:#fde68a;border-radius:6px;padding:5px 7px}
@media (max-width:719px){.vp-hide-phone{display:block!important;opacity:.45}}
@media (min-width:720px){.vp-hide-desktop{display:block!important;opacity:.45}}
`;

function pageBody(
  page: EditablePage,
  context: SiteRenderContext,
  selectedId: string | null,
  problemIds: ReadonlySet<string>,
): string {
  if (page.sections.length === 0) {
    return `<div class="ed-empty"><div>This page is empty.<br><button type="button" data-ed-insert="0">Add the first section</button></div></div>`;
  }
  const insert = (index: number) =>
    `<div class="ed-insert"><button type="button" data-ed-insert="${index}">+ Add section</button></div>`;
  const parts: string[] = [];
  page.sections.forEach((section, index) => {
    if (index > 0) parts.push(insert(index));
    const html =
      renderSectionHtml(section, context) ||
      `<div class="ed-empty" style="min-height:120px">Nothing to show yet: add content on the right.</div>`;
    const hideOn = section.settings.hideOn;
    const hiddenNote =
      hideOn && hideOn !== "none"
        ? `<span class="ed-hidden-note">Hidden on ${hideOn}</span>`
        : "";
    parts.push(
      `<div data-ed-section="${escapeHtml(section.id)}"${section.id === selectedId ? " data-selected" : ""}${problemIds.has(section.id) ? " data-problem" : ""}><span class="ed-tag">${escapeHtml(SECTION_CATALOG[section.type].label)}</span>${hiddenNote}${html}</div>`,
    );
  });
  parts.push(insert(page.sections.length));
  return parts.join("");
}

/** Writes the page into the frame's document, keeping its scroll position. */
function drawPage(
  frame: HTMLIFrameElement | null,
  css: string,
  attributes: Record<string, string>,
  bodyHtml: string,
) {
  const frameDocument = frame?.contentDocument;
  if (!frameDocument) return;
  const style = frameDocument.getElementById("vp-site-css");
  if (style) style.textContent = css;
  const body = frameDocument.body;
  body.className = "vp-site";
  for (const [name, value] of Object.entries(attributes)) {
    body.setAttribute(name, value);
  }
  body.innerHTML = bodyHtml;
}

/**
 * The page as visitors will see it, drawn by the same renderer the live
 * page uses, inside a frame sized like a phone, tablet or computer and
 * scaled to fit. Clicking a section selects it; the bars between sections
 * add one there.
 */
export function EditorCanvas({
  page,
  look,
  context,
  device,
  selectedId,
  problemIds,
  onSelect,
  onInsertAt,
}: {
  page: EditablePage;
  look: SiteLook;
  context: SiteRenderContext;
  device: EditorDevice;
  selectedId: string | null;
  problemIds: ReadonlySet<string>;
  onSelect: (sectionId: string | null) => void;
  onInsertAt: (index: number) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);
  const handlers = useRef({ onSelect, onInsertAt });
  handlers.current = { onSelect, onInsertAt };

  // The frame's size follows the space it has.
  useLayoutEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setBox({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Clicks inside the page select sections; links don't navigate.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !ready) return;
    const document = frame.contentDocument;
    if (!document) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      const insert = target.closest("[data-ed-insert]");
      if (insert) {
        event.preventDefault();
        handlers.current.onInsertAt(
          Number(insert.getAttribute("data-ed-insert")),
        );
        return;
      }
      if (target.closest("a, button, summary")) event.preventDefault();
      const section = target.closest("[data-ed-section]");
      handlers.current.onSelect(
        section?.getAttribute("data-ed-section") ?? null,
      );
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [ready]);

  // The page itself, redrawn in place so the scroll position stays.
  useEffect(() => {
    if (!ready) return;
    drawPage(
      frameRef.current,
      siteCss(look),
      siteAttributes(look),
      pageBody(page, context, selectedId, problemIds),
    );
  }, [page, look, context, selectedId, problemIds, ready]);

  // Bring the selected section into view when it changes.
  useEffect(() => {
    if (!selectedId || !ready) return;
    const element = frameRef.current?.contentDocument?.querySelector(
      `[data-ed-section="${CSS.escape(selectedId)}"]`,
    );
    const rect = element?.getBoundingClientRect();
    const view = frameRef.current?.contentWindow;
    if (!rect || !view) return;
    if (rect.top < 0 || rect.top > view.innerHeight * 0.7) {
      element?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedId, ready]);

  const width = DEVICE_WIDTH[device];
  const available = Math.max(box.width - 32, 200);
  const scale = Math.min(1, available / width);
  const frameHeight = Math.max(box.height - 32, 200) / scale;

  return (
    <div
      ref={boxRef}
      className="relative min-h-0 flex-1 overflow-hidden bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))]"
    >
      <div
        className="absolute top-4 left-1/2 origin-top overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_color-mix(in_srgb,var(--text)_10%,transparent),0_24px_60px_-30px_rgb(0_0_0/.5)]"
        style={{
          width,
          height: frameHeight,
          transform: `translateX(-50%) scale(${scale})`,
        }}
      >
        <iframe
          ref={frameRef}
          title="Page preview"
          className="block size-full border-0"
          srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style id="vp-site-css"></style><style>${EDITOR_CSS}</style></head><body></body></html>`}
          onLoad={() => setReady(true)}
        />
      </div>
    </div>
  );
}
