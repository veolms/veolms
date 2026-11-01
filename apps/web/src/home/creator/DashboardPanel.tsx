import type { ReactNode } from "react";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import type { Icon } from "@phosphor-icons/react";
import { DashboardInfoPopover } from "./DashboardInfoPopover";

interface DashboardPanelProps {
  className?: string;
  icon: Icon;
  title: string;
  action?: string;
  onAction?: () => void;
  infoLabel?: string;
  infoTitle?: string;
  infoDescription?: ReactNode;
  children: ReactNode;
}

export function DashboardPanel({
  className = "",
  icon,
  title,
  action,
  onAction,
  infoLabel,
  infoTitle,
  infoDescription,
  children,
}: DashboardPanelProps) {
  const hasInfoPopover = Boolean(infoLabel && infoTitle && infoDescription);
  const HeadingIcon = icon;

  return (
    <section className={`creator-dashboard-panel ${className}`}>
      <header className="creator-panel-heading">
        <h2>
          <HeadingIcon size={19} weight="duotone" aria-hidden="true" />
          <span>{title}</span>
        </h2>
        <div className="creator-panel-actions">
          {hasInfoPopover && (
            <DashboardInfoPopover
              infoLabel={infoLabel!}
              infoTitle={infoTitle!}
              infoDescription={infoDescription!}
            />
          )}
          {action && (
            <button
              type="button"
              className="creator-panel-link"
              onClick={onAction}
            >
              {action} <ArrowRight size={16} />
            </button>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}
