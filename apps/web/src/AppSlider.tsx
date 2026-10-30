import type { CSSProperties, InputHTMLAttributes } from "react";

export type AppSliderVariant = "accent" | "temperature" | "player" | "volume";

export interface AppSliderProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  variant?: AppSliderVariant;
}

type AppSliderStyle = CSSProperties & {
  "--app-slider-progress": string;
  "--app-slider-thumb-accent"?: string;
};

const TEMPERATURE_COLOR_STOPS = [
  { at: 0, color: [128, 191, 255] },
  { at: 50, color: [220, 234, 240] },
  { at: 100, color: [242, 173, 101] },
] as const;

const getTemperatureThumbColor = (progress: number): string => {
  const [lowerStop, upperStop] =
    progress <= 50
      ? [TEMPERATURE_COLOR_STOPS[0], TEMPERATURE_COLOR_STOPS[1]]
      : [TEMPERATURE_COLOR_STOPS[1], TEMPERATURE_COLOR_STOPS[2]];
  const stopProgress =
    (progress - lowerStop.at) / (upperStop.at - lowerStop.at);
  const [lowerRed, lowerGreen, lowerBlue] = lowerStop.color;
  const [upperRed, upperGreen, upperBlue] = upperStop.color;
  const interpolateChannel = (lower: number, upper: number) =>
    Math.round(lower + (upper - lower) * stopProgress);
  const color = [
    interpolateChannel(lowerRed, upperRed),
    interpolateChannel(lowerGreen, upperGreen),
    interpolateChannel(lowerBlue, upperBlue),
  ];

  return `rgb(${color.join(" ")})`;
};

const toFiniteNumber = (
  value: string | number | readonly string[] | undefined,
  fallback: number,
): number => {
  const numericValue = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

export function AppSlider({
  className = "",
  max = 100,
  min = 0,
  style,
  value,
  defaultValue,
  variant = "accent",
  ...props
}: AppSliderProps) {
  const minimum = toFiniteNumber(min, 0);
  const maximum = toFiniteNumber(max, 100);
  const currentValue = toFiniteNumber(value ?? defaultValue, minimum);
  const progress =
    maximum <= minimum
      ? 0
      : Math.min(
          100,
          Math.max(0, ((currentValue - minimum) / (maximum - minimum)) * 100),
        );
  const sliderStyle = {
    ...style,
    "--app-slider-progress": `${progress}%`,
    ...(variant === "temperature"
      ? { "--app-slider-thumb-accent": getTemperatureThumbColor(progress) }
      : {}),
  } as AppSliderStyle;

  return (
    <input
      {...props}
      type="range"
      min={min}
      max={max}
      value={value}
      defaultValue={defaultValue}
      className={`app-slider app-slider--${variant} ${className}`.trim()}
      style={sliderStyle}
    />
  );
}
