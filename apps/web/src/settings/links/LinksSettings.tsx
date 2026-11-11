import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";

import { CenteredLoadingSpinner } from "../../components/LoadingSpinner";
import { getApiError } from "../../lib/api-error";
import { useCapabilities } from "../../services/authorization";
import { useShortLinks } from "../../services/links";
import { LinkForm } from "./LinkForm";
import { LinkRow } from "./LinkRow";
import { linkCardClass, siteOrigin } from "./linkStyles";

/**
 * Settings > Links: short addresses on the site's own domain that redirect
 * to, or show, another page (docs/short-links.md). For staff with
 * `link.manage`.
 */
export function LinksSettings({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const capabilities = useCapabilities({ enabled: isAuthenticated });
  const allowed = isAuthenticated && capabilities.can("link.manage");
  const links = useShortLinks({ enabled: allowed });
  const host = siteOrigin().replace(/^https?:\/\//u, "");

  if (!capabilities.isFetched && isAuthenticated)
    return <CenteredLoadingSpinner label="Loading links" />;
  if (!allowed) {
    return (
      <p className={`${linkCardClass} p-5 text-sm text-(--muted)`}>
        Links are managed by the academy&apos;s staff.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5" aria-label="Links">
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-(--accent)/12 text-(--accent)">
          <LinkSimple size={22} weight="duotone" aria-hidden />
        </span>
        <div>
          <h2 className="text-lg font-bold text-(--text)">Links</h2>
          <p className="text-sm text-(--muted)">
            Short addresses on {host || "this site"} that send visitors to
            another page, or show it here.
          </p>
        </div>
      </header>

      <LinkForm />

      <section
        aria-labelledby="links-list-heading"
        className="flex flex-col gap-2"
      >
        <h3
          id="links-list-heading"
          className="text-sm font-semibold text-(--text-secondary)"
        >
          {links.data
            ? `${links.data.links.length} ${links.data.links.length === 1 ? "link" : "links"}`
            : "Your links"}
        </h3>
        {links.isPending ? (
          <CenteredLoadingSpinner label="Loading links" />
        ) : links.isError ? (
          <p role="alert" className="text-sm text-rose-500">
            {getApiError(links.error).message}
          </p>
        ) : links.data.links.length === 0 ? (
          <p className={`${linkCardClass} p-5 text-sm text-(--muted)`}>
            No links yet. Create one above, such as /nodejs for a course&apos;s
            syllabus.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {links.data.links.map((link) => (
              <LinkRow key={link.id} link={link} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
