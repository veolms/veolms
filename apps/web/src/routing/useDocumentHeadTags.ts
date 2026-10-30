import { useEffect } from "react";
import type { HeadTagDescriptor } from "./routeDescriptors";

const describeHeadTag = (tag: HeadTagDescriptor) => {
  if ("tagName" in tag) {
    return {
      tagName: "link",
      identity: ["rel", tag.rel],
      value: ["href", tag.href],
    } as const;
  }
  return {
    tagName: "meta",
    identity:
      "property" in tag ? ["property", tag.property] : ["name", tag.name],
    value: ["content", tag.content],
  } as const;
};

/**
 * Puts `tags` in the document head and returns the way back: a tag that was
 * already there gets its old value again, one that was added is taken out.
 */
export function applyDocumentHeadTags(
  tags: readonly HeadTagDescriptor[],
  head: HTMLHeadElement = document.head,
): () => void {
  const restores = tags.map((tag) => {
    const {
      tagName,
      identity: [identityName, identityValue],
      value: [valueName, value],
    } = describeHeadTag(tag);
    const existing = head.querySelector(
      `${tagName}[${identityName}="${identityValue}"]`,
    );
    if (!existing) {
      const added = head.ownerDocument.createElement(tagName);
      added.setAttribute(identityName, identityValue);
      added.setAttribute(valueName, value);
      head.append(added);
      return () => added.remove();
    }
    const previous = existing.getAttribute(valueName);
    existing.setAttribute(valueName, value);
    return () => {
      // The router replaces a tag when the next page gives it another
      // value. Only a tag it left alone still holds ours and is put back.
      if (!existing.isConnected || existing.getAttribute(valueName) !== value)
        return;
      if (previous === null) existing.removeAttribute(valueName);
      else existing.setAttribute(valueName, previous);
    };
  });
  return () => restores.forEach((restore) => restore());
}

/**
 * Keeps `tags` in the document head while mounted, and puts the head back
 * as it was when they change or the caller leaves. A route's `meta` export
 * fills the head from what the document was built with and is not run again
 * when a client fetch finishes; this is for tags only known after one.
 * `undefined` leaves the head to the route's `meta`.
 */
export function useDocumentHeadTags(
  tags: readonly HeadTagDescriptor[] | undefined,
): void {
  const serializedTags = tags ? JSON.stringify(tags) : undefined;
  useEffect(() => {
    if (serializedTags === undefined) return;
    return applyDocumentHeadTags(
      JSON.parse(serializedTags) as HeadTagDescriptor[],
    );
  }, [serializedTags]);
}
