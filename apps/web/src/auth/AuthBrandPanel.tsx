import logoDarkSvg from "../assets/procodrr-logo-dark.svg?raw";

const brandWordmarkSvg = logoDarkSvg.replace(
  /fill="black"/g,
  'fill="currentColor"',
);

export interface AuthBrandMarkProps {
  className?: string;
}

export function AuthBrandMark({
  className = "auth-card__brand",
}: AuthBrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={className}
      dangerouslySetInnerHTML={{ __html: brandWordmarkSvg }}
    />
  );
}
