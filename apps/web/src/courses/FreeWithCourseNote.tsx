import type { MouseEvent } from "react";

/**
 * "with “<course>” course", after "Free" on a linked-only course's card and
 * page. The course's name is in quotes and in the text's own colour,
 * against the quieter words around it, so it reads as a name. With `href`
 * it is a link to that course's page, underlined on hover; `onNavigate`
 * then takes a plain click (a new tab still opens the address).
 */
export function FreeWithCourseNote({
  title,
  href,
  onNavigate,
}: {
  title: string;
  href?: string;
  onNavigate?: (path: string) => void;
}) {
  const nameClasses = "font-semibold text-(--text)";
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      !href ||
      !onNavigate ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    onNavigate(href);
  };
  return (
    <>
      with{" "}
      {href ? (
        <a
          href={href}
          onClick={open}
          className={`${nameClasses} relative z-20 underline-offset-3 hover:underline focus-visible:underline focus-visible:outline-none`}
        >
          “{title}”
        </a>
      ) : (
        <span className={nameClasses}>“{title}”</span>
      )}{" "}
      course
    </>
  );
}
