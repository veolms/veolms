import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";

type LoadingSpinnerIconProps = {
  className?: string;
  size?: number;
};

export function LoadingSpinnerIcon({
  className = "",
  size = 24,
}: LoadingSpinnerIconProps) {
  return (
    <CircleNotch
      aria-hidden="true"
      className={`animate-spin text-(--accent) ${className}`}
      focusable="false"
      size={size}
    />
  );
}

type CenteredLoadingSpinnerProps = LoadingSpinnerIconProps & {
  className?: string;
  label: string;
};

export function CenteredLoadingSpinner({
  className = "min-h-48 w-full",
  label,
  size = 26,
  ...spinnerProps
}: CenteredLoadingSpinnerProps) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className={`grid place-items-center ${className}`}
      role="status"
    >
      <LoadingSpinnerIcon size={size} {...spinnerProps} />
    </div>
  );
}
