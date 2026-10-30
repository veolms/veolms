import { useEffect } from "react";

/**
 * Keeps the tab title on `title`. A route's `meta` export titles the page
 * from what the document was built with and is not run again when a client
 * fetch finishes; this is for a title that is only known after one.
 * `undefined` leaves the title to the route's `meta`.
 */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    if (title !== undefined && document.title !== title) {
      document.title = title;
    }
  }, [title]);
}
