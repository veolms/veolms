import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";

export interface HomeSectionHeaderProps {
  icon: typeof BookOpen;
  title: string;
  id?: string;
  action?: string;
  onAction?: () => void;
}

export function HomeSectionHeader({
  icon: Icon,
  title,
  id,
  action,
  onAction,
}: HomeSectionHeaderProps) {
  return (
    <div className="dashboard-section-heading">
      <h2 id={id}>
        <Icon size={19} weight="duotone" />
        <span>{title}</span>
      </h2>
      {action && (
        <button type="button" onClick={onAction}>
          {action} <ArrowRight size={17} />
        </button>
      )}
    </div>
  );
}
