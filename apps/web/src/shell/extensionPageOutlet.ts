import { useOutletContext } from "react-router";

/**
 * What the shell hands a page that renders its own route inside it (Help and
 * feedback): the same back action Settings and the other shell pages get.
 */
export interface ExtensionPageOutletContext {
  /** Set when the page is not a sidebar entry, so it shows a back button. */
  onNavigateBack: (() => void) | undefined;
}

export function useExtensionPageBack(): (() => void) | undefined {
  return useOutletContext<ExtensionPageOutletContext | undefined>()
    ?.onNavigateBack;
}
