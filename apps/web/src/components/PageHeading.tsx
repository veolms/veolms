import { PageBackButton } from "./PageBackButton";

interface PageHeadingProps {
  id: string;
  title: string;
  description: string;
  onNavigateBack?: () => void;
  copyClassName?: string;
}

export function PageHeading({
  id,
  title,
  description,
  onNavigateBack,
  copyClassName = "min-w-0",
}: PageHeadingProps) {
  return (
    <div className={copyClassName}>
      <div className="flex min-h-9 min-w-0 items-center gap-2">
        {onNavigateBack ? <PageBackButton onClick={onNavigateBack} /> : null}
        <h1
          id={id}
          className="flex min-h-9 items-center text-[clamp(1.8rem,2.4vw,2.15rem)] leading-tight font-bold tracking-[-0.035em] text-(--text)"
        >
          {title}
        </h1>
      </div>
      <p className="mt-1.5 text-[0.88rem] leading-6 text-(--muted)">{description}</p>
    </div>
  );
}
