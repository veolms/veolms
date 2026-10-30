import { lessonContentTypeIconSvg } from "../curriculum";

const escapeHtml = (str: string) => {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

export const setCustomDragImage = (
  e: React.DragEvent,
  sourceElement: HTMLElement,
  htmlContent: string,
) => {
  if (!e.dataTransfer) return;
  const rect = sourceElement.getBoundingClientRect();
  const ghost = document.createElement("div");
  ghost.style.position = "fixed";
  ghost.style.top = "-9999px";
  ghost.style.left = "-9999px";
  ghost.style.width = `${Math.round(rect.width)}px`;
  ghost.style.boxSizing = "border-box";
  ghost.style.pointerEvents = "none";
  ghost.style.zIndex = "999999";
  ghost.innerHTML = htmlContent;
  document.body.appendChild(ghost);

  const offsetX = Math.min(
    Math.max(e.clientX - rect.left, 24),
    Math.max(rect.width - 24, 24),
  );
  const offsetY = 24;

  e.dataTransfer.effectAllowed = "move";
  try {
    e.dataTransfer.setData("text/plain", "");
    e.dataTransfer.setDragImage(ghost, offsetX, offsetY);
  } catch {
    // fallback if dataTransfer is restricted
  }

  setTimeout(() => {
    if (ghost.parentNode) {
      ghost.parentNode.removeChild(ghost);
    }
  }, 0);
};

export const sectionGhostHtml = (
  title: string,
  index: number,
  lessonCount: number,
) => `
  <div style="
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 18px;
    border-radius: 12px;
    border: 1.5px solid var(--accent, #6366f1);
    background: var(--surface, #1e1e24);
    color: var(--text, #ffffff);
    box-shadow: 0 14px 32px rgba(0,0,0,0.45);
    box-sizing: border-box;
    font-family: inherit;
  ">
    <div style="display: flex; align-items: center; gap: 12px;">
      <span style="display: flex; align-items: center; color: var(--muted, #888); opacity: 0.85;">
        <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor">
          <path d="M100,60a16,16,0,1,1-16-16A16,16,0,0,1,100,60Zm72-16a16,16,0,1,0,16,16A16,16,0,0,0,172,44ZM84,112a16,16,0,1,0,16,16A16,16,0,0,0,84,112Zm88,0a16,16,0,1,0,16,16A16,16,0,0,0,172,112ZM84,180a16,16,0,1,0,16,16A16,16,0,0,0,84,180Zm88,0a16,16,0,1,0,16,16A16,16,0,0,0,172,180Z"/>
        </svg>
      </span>
      <span style="font-weight: 700; font-size: 0.92rem; color: var(--text, #fff);">
        Section ${index + 1}
      </span>
      <span style="font-weight: 600; font-size: 0.92rem; color: var(--text, #fff);">
        ${escapeHtml(title)}
      </span>
      <span style="font-size: 0.76rem; color: var(--muted, #888); margin-left: 4px;">
        ${lessonCount} ${lessonCount === 1 ? "Lesson" : "Lessons"}
      </span>
    </div>
  </div>
`;

export const lessonGhostHtml = (
  title: string,
  index: number,
  contentType: "video" | "document" | "quiz" | "audio" | "image",
) => {
  return `
  <div style="
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-radius: 10px;
    border: 1.5px solid var(--accent, #6366f1);
    background: var(--surface, #1e1e24);
    color: var(--text, #ffffff);
    box-shadow: 0 12px 28px rgba(0,0,0,0.4);
    box-sizing: border-box;
    font-family: inherit;
  ">
    <div style="display: flex; align-items: center; gap: 12px;">
      <span style="display: flex; align-items: center; color: var(--muted, #888); opacity: 0.85;">
        <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor">
          <path d="M100,60a16,16,0,1,1-16-16A16,16,0,0,1,100,60Zm72-16a16,16,0,1,0,16,16A16,16,0,0,0,172,44ZM84,112a16,16,0,1,0,16,16A16,16,0,0,0,84,112Zm88,0a16,16,0,1,0,16,16A16,16,0,0,0,172,112ZM84,180a16,16,0,1,0,16,16A16,16,0,0,0,84,180Zm88,0a16,16,0,1,0,16,16A16,16,0,0,0,172,180Z"/>
        </svg>
      </span>
      <span style="display: inline-flex; width: 22px; height: 22px; align-items: center; justify-content: center; color: var(--accent, #6366f1);">
        ${lessonContentTypeIconSvg(contentType)}
      </span>
      <span style="font-weight: 600; font-size: 0.88rem; color: var(--text, #fff);">
        ${index + 1}. ${escapeHtml(title)}
      </span>
    </div>
    <div style="display: flex; align-items: center; gap: 8px; color: var(--muted, #888); opacity: 0.8;">
      <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
        <path d="M216,48H176V40a24.1,24.1,0,0,0-24-24H104A24.1,24.1,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM104,104v48a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm64,0v48a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"/>
      </svg>
      <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
        <path d="M128,184a8,8,0,0,1-5.66-2.34l-80-80a8,8,0,0,1,11.32-11.32L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32l-80,80A8,8,0,0,1,128,184Z"/>
      </svg>
    </div>
  </div>
`;
};

export const inclusionGhostHtml = (text: string) => `
  <div style="
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 10px;
    border: 1.5px solid var(--accent, #6366f1);
    background: var(--surface, #1e1e24);
    color: var(--text, #ffffff);
    box-shadow: 0 10px 24px rgba(0,0,0,0.35);
    box-sizing: border-box;
    font-family: inherit;
  ">
    <span style="display: flex; align-items: center; color: var(--muted, #888); opacity: 0.85;">
      <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor">
        <path d="M100,60a16,16,0,1,1-16-16A16,16,0,0,1,100,60Zm72-16a16,16,0,1,0,16,16A16,16,0,0,0,172,44ZM84,112a16,16,0,1,0,16,16A16,16,0,0,0,84,112Zm88,0a16,16,0,1,0,16,16A16,16,0,0,0,172,112ZM84,180a16,16,0,1,0,16,16A16,16,0,0,0,84,180Zm88,0a16,16,0,1,0,16,16A16,16,0,0,0,172,180Z"/>
      </svg>
    </span>
    <span style="font-weight: 500; font-size: 0.86rem; color: var(--text, #fff);">
      ${escapeHtml(text || "Inclusion item")}
    </span>
  </div>
`;
