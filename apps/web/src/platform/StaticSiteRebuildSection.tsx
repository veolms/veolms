import { ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { GlobeHemisphereWestIcon as GlobeHemisphereWest } from "@phosphor-icons/react/GlobeHemisphereWest";
import { Button } from "../components/Button";
import { useCapabilities } from "../services/authorization/authorization.queries";
import {
  useRebuildStaticSite,
  useStaticSiteRebuildStatus,
} from "../services/platform";
import { SettingRow } from "../settings/SettingsControls";

const STATUS_TEXT = {
  queued: "Queued. The build starts in a moment.",
  running: "Building every public page. This takes about 6 minutes.",
  succeeded: "All public pages were rebuilt and published.",
} as const;

/**
 * Every public page (the home page, the catalogue, every course and lesson
 * page) built again and published. A course's own pages are rebuilt on their
 * own after it changes; this is for changes that reach every page, such as
 * the academy's look or home page.
 */
export function StaticSiteRebuildSection() {
  const { data: capabilities } = useCapabilities();
  const canRebuild =
    capabilities?.permissions.includes("platform.settings.update") ?? false;
  const statusQuery = useStaticSiteRebuildStatus({ enabled: canRebuild });
  const rebuild = useRebuildStaticSite();
  const status = statusQuery.data;
  const busy =
    rebuild.isPending ||
    status?.status === "queued" ||
    status?.status === "running";
  const message =
    rebuild.error?.message ??
    (status?.status === "failed"
      ? (status.message ?? "The rebuild failed.")
      : status && status.status !== "idle"
        ? STATUS_TEXT[status.status]
        : null);

  if (!canRebuild) return null;
  return (
    <section
      className="settings-section"
      aria-labelledby="platform-public-pages-heading"
    >
      <header className="settings-section__heading mb-3">
        <GlobeHemisphereWest size={20} weight="duotone" />
        <div>
          <h3 id="platform-public-pages-heading">Public pages</h3>
          <p>
            Course pages update on their own a few minutes after a course
            changes. Rebuild every page after a change that shows on all of
            them, such as the academy&rsquo;s look or home page.
          </p>
        </div>
      </header>
      <div className="settings-row-list">
        <SettingRow
          className="max-[480px]:[grid-template-columns:2rem_minmax(0,1fr)] max-[480px]:[&_.settings-row__control]:col-start-2"
          icon={ArrowsClockwise}
          label="Rebuild all public pages"
          note="The home page, the catalogue and every course and lesson page, built again and published."
        >
          <Button
            variant="quiet"
            disabled={busy}
            onClick={() => rebuild.mutate()}
          >
            {busy ? "Rebuilding…" : "Rebuild"}
          </Button>
        </SettingRow>
      </div>
      {message ? (
        <p
          className="mt-3 text-sm text-(--text-secondary)"
          role={status?.status === "failed" ? "alert" : "status"}
        >
          {message}{" "}
          {status?.runUrl ? (
            <a
              href={status.runUrl}
              target="_blank"
              rel="noreferrer"
              className="text-(--accent) underline"
            >
              View the build
            </a>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
