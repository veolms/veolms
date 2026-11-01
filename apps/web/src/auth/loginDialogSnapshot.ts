// When social sign-in has to take the whole tab to the provider (the
// browser blocked its window), the page is loaded again on the way back,
// and the login pop-up can only open once the app has started: on the
// development server the page is blank until then, on a built page it shows
// without the pop-up. To have the pop-up there from the first frame, a copy
// of it, as it looked when the tab left, is kept with the styles it needs
// that a fresh page does not have yet. A script in the document head puts
// that copy up before anything is drawn, and the real pop-up takes it down
// in the frame it opens.

import { OAUTH_CALLBACK_PATH_TEST } from "./oauthPopup";

const SNAPSHOT_STORAGE_KEY = "veolms_login_dialog_snapshot";
const SNAPSHOT_ATTRIBUTE = "data-login-dialog-snapshot";
// Given to a copied stylesheet link, so the code that loads the pop-up's
// styles does not take the copy for its own and leave it to be removed.
const SNAPSHOT_HREF_FRAGMENT = "#login-dialog-snapshot";
// The copy's own element name. It goes in front of the app's root, and
// React, matching the body's children to its own by tag while it takes the
// page over, skips a tag it does not render; a <div> it would take for the
// root and fail on.
const SNAPSHOT_ELEMENT = "veolms-login-snapshot";
/** Taken down regardless after this long, should the pop-up never open. */
const SNAPSHOT_TIMEOUT_MS = 15_000;

type SnapshotSheet =
  { href: string; crossOrigin: string | null } | { css: string };

interface LoginDialogSnapshot {
  page: string;
  html: string;
  backdropColor: string;
  backdropFilter: string;
  sheets: SnapshotSheet[];
}

/**
 * A stylesheet a fresh page does not start with: a `<style>` the
 * development server added, or a `<link>` loaded with code fetched later
 * (those are given `crossorigin`; the page's own links are not).
 */
function isLoadedLater(owner: Element | ProcessingInstruction | null) {
  if (owner instanceof HTMLStyleElement) return true;
  return owner instanceof HTMLLinkElement && owner.hasAttribute("crossorigin");
}

function hasRuleFor(sheet: CSSStyleSheet, elements: Element[]): boolean {
  const walk = (rules: CSSRuleList): boolean => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        // `matches` refuses pseudo-elements; the element they belong to
        // is what counts here.
        const selector = rule.selectorText.replace(
          /::?(?:before|after|placeholder|backdrop|selection|-webkit-[\w-]+|-moz-[\w-]+)/g,
          "",
        );
        try {
          if (elements.some((element) => element.matches(selector))) {
            return true;
          }
        } catch {
          // A selector this browser cannot test.
        }
      }
      if ("cssRules" in rule && walk((rule as CSSGroupingRule).cssRules)) {
        return true;
      }
    }
    return false;
  };
  try {
    return walk(sheet.cssRules);
  } catch {
    return false;
  }
}

/** Keeps the open login pop-up for the page the tab comes back to. */
export function rememberLoginDialogSnapshot(): void {
  try {
    const dialog = document.querySelector<HTMLDialogElement>(
      "dialog[data-login-dialog][open]",
    );
    if (!dialog) return;
    const elements = [dialog, ...dialog.querySelectorAll("*")];

    const sheets: SnapshotSheet[] = [];
    for (const sheet of document.styleSheets) {
      const owner = sheet.ownerNode;
      if (!isLoadedLater(owner) || !hasRuleFor(sheet, elements)) continue;
      if (owner instanceof HTMLLinkElement) {
        sheets.push({
          href: `${owner.href.split("#")[0]}${SNAPSHOT_HREF_FRAGMENT}`,
          crossOrigin: owner.getAttribute("crossorigin"),
        });
      } else if (owner instanceof HTMLStyleElement && owner.textContent) {
        sheets.push({ css: owner.textContent });
      }
    }

    const copy = dialog.cloneNode(true) as HTMLElement;
    // Only a picture: nothing in it may be found, focused or announced.
    copy.removeAttribute("data-login-dialog");
    copy.removeAttribute("aria-labelledby");
    for (const element of [copy, ...copy.querySelectorAll("[id]")]) {
      element.removeAttribute("id");
    }

    const backdrop = getComputedStyle(dialog, "::backdrop");
    const snapshot: LoginDialogSnapshot = {
      page: `${window.location.pathname}${window.location.search}`,
      html: copy.outerHTML,
      backdropColor: backdrop.backgroundColor,
      backdropFilter: backdrop.backdropFilter,
      sheets,
    };
    sessionStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Without a copy the page still opens its pop-up, only later.
  }
}

/** Takes the copy down, with the styles that came with it. */
export function removeLoginDialogSnapshot(): void {
  for (const element of document.querySelectorAll(`[${SNAPSHOT_ATTRIBUTE}]`)) {
    element.remove();
  }
}

/**
 * Runs in the head of every document (see `root.tsx`). Puts the copy up
 * when this is the page it was kept for and the provider's answer is
 * waiting for its pop-up. The styles go in first and hold the first frame
 * back until they are in (`blocking="render"`, which only works while the
 * body has not been parsed); the copy goes in as soon as there is a body.
 */
export function getLoginDialogSnapshotScript(
  redirectResultStorageKey: string,
): string {
  return `(function(){try{if(${OAUTH_CALLBACK_PATH_TEST})return;var raw=sessionStorage.getItem(${JSON.stringify(SNAPSHOT_STORAGE_KEY)});if(!raw)return;sessionStorage.removeItem(${JSON.stringify(SNAPSHOT_STORAGE_KEY)});if(sessionStorage.getItem(${JSON.stringify(redirectResultStorageKey)})===null)return;var s=JSON.parse(raw);if(s.page!==location.pathname+location.search)return;var mark=${JSON.stringify(SNAPSHOT_ATTRIBUTE)};s.sheets.forEach(function(x){var el;if(x.href){el=document.createElement("link");el.rel="stylesheet";if(x.crossOrigin!==null)el.setAttribute("crossorigin",x.crossOrigin);el.href=x.href;}else{el=document.createElement("style");el.textContent=x.css;}el.setAttribute("blocking","render");el.setAttribute(mark,"");document.head.appendChild(el);});var cover=document.createElement(${JSON.stringify(SNAPSHOT_ELEMENT)});cover.setAttribute(mark,"");cover.setAttribute("aria-hidden","true");cover.style.setProperty("display","block");cover.style.setProperty("position","fixed");cover.style.setProperty("inset","0");cover.style.setProperty("z-index","2147483647");cover.style.setProperty("background-color",s.backdropColor);cover.style.setProperty("backdrop-filter",s.backdropFilter);cover.style.setProperty("-webkit-backdrop-filter",s.backdropFilter);cover.innerHTML=s.html;var place=function(){if(!document.body)return false;document.body.insertBefore(cover,document.body.firstChild);return true;};if(!place()){var watch=new MutationObserver(function(){if(place())watch.disconnect();});watch.observe(document.documentElement,{childList:true});}setTimeout(function(){document.querySelectorAll("["+mark+"]").forEach(function(el){el.remove();});},${SNAPSHOT_TIMEOUT_MS});}catch(e){}})();`;
}
