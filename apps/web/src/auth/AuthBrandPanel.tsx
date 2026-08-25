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

export function AuthBrandPanel() {
  return (
    <div className="auth-brand-panel">
      {/* Decorative, so the artwork is a CSS background rather than an <img>:
          the stylesheet can then skip the request entirely below the two-column
          breakpoint, where the panel is hidden. */}
      <div aria-hidden="true" className="auth-brand-panel__illustration-slot" />
    </div>
  );
}
