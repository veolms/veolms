import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";

export interface HomeSectionHeaderProps {
  icon: typeof BookOpen;
  title: string;
  id?: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
}

export function HomeSectionHeader({
  icon: Icon,
  title,
  id,
  subtitle,
  action,
  onAction,
}: HomeSectionHeaderProps) {
  return (
    <div
      className={[
        "dashboard-section-heading",
        subtitle && "dashboard-section-heading--with-subtitle",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="dashboard-section-heading__copy">
        <h2 id={id}>
          <Icon size={19} weight="duotone" />
          <span>{title}</span>
        </h2>
        {subtitle ? (
          <p className="dashboard-section-heading__subtitle">{subtitle}</p>
        ) : null}
      </div>
      {action && (
        <button type="button" onClick={onAction}>
          {action} <ArrowRight size={17} />
        </button>
      )}
    </div>
  );
}
