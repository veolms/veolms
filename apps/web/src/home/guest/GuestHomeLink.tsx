import type { AnchorHTMLAttributes, MouseEvent } from "react";
import type { NavigateTo, NavigationOptions } from "../../routing/navigation";

interface GuestHomeLinkProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> {
  href: string;
  onNavigatePage?: NavigateTo;
  navigationOptions?: NavigationOptions;
}

/**
 * A real link that navigates inside the application on a plain click and
 * leaves modified clicks (new tab, new window, download) to the browser.
 */
export function GuestHomeLink({
  href,
  onNavigatePage,
  navigationOptions,
  onClick,
  ...props
}: GuestHomeLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      !onNavigatePage ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    onNavigatePage(href, navigationOptions);
  };

  return <a {...props} href={href} onClick={handleClick} />;
}
