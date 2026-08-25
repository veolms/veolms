export type ReadingModeColors = "full" | "light" | "black-and-white";

export interface ReadingModePreferences {
  enabled: boolean;
  colorTemperature: number;
  texture: number;
  textureGrainSize: number;
  colors: ReadingModeColors;
}

export interface ReadingModeVisuals {
  textureStrength: number;
  textureOpacityDark: number;
  textureOpacityLight: number;
  temperatureColor: string;
  temperatureOpacity: number;
}

export const READING_MODE_STORAGE_KEY = "veolms-reading-mode-v1";
export const READING_MODE_CHANGE_EVENT = "veolms:reading-mode-change";

export const READING_MODE_DEFAULTS: Readonly<ReadingModePreferences> = {
  enabled: false,
  colorTemperature: 50,
  texture: 90,
  textureGrainSize: 50,
  colors: "full",
};

export const READING_MODE_TEXTURE_EXPONENT = 1.3;
export const READING_MODE_TEXTURE_BASE_TILE_SIZE = 256;
export const READING_MODE_TEXTURE_DARK_MAX_OPACITY = 0.22;
export const READING_MODE_TEXTURE_LIGHT_MAX_OPACITY = 0.1;
export const READING_MODE_TEMPERATURE_EXPONENT = 1.18;
export const READING_MODE_COOL_MAX_OPACITY = 0.28;
export const READING_MODE_WARM_MAX_OPACITY = 0.3;
export const READING_MODE_COOL_COLOR = "#a8d3ff";
export const READING_MODE_WARM_COLOR = "#ffc372";

const normalizePercent = (value: unknown, fallback: number): number => {
  let numericValue: number;
  if (typeof value === "number") {
    numericValue = value;
  } else if (typeof value === "string" && value.trim()) {
    numericValue = Number(value);
  } else {
    return fallback;
  }
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(100, Math.max(0, Math.round(numericValue)));
};

const normalizeColors = (value: unknown): ReadingModeColors =>
  value === "light" || value === "black-and-white" ? value : "full";

export function normalizeReadingModePreferences(
  value: unknown,
): ReadingModePreferences {
  if (typeof value !== "object" || value === null) {
    return { ...READING_MODE_DEFAULTS };
  }

  const candidate = value as Partial<ReadingModePreferences>;
  return {
    enabled:
      typeof candidate.enabled === "boolean"
        ? candidate.enabled
        : READING_MODE_DEFAULTS.enabled,
    colorTemperature: normalizePercent(
      candidate.colorTemperature,
      READING_MODE_DEFAULTS.colorTemperature,
    ),
    texture: normalizePercent(candidate.texture, READING_MODE_DEFAULTS.texture),
    textureGrainSize: normalizePercent(
      candidate.textureGrainSize,
      READING_MODE_DEFAULTS.textureGrainSize,
    ),
    colors: normalizeColors(candidate.colors),
  };
}

export function getReadingModeTextureGrainScale(value: unknown): number {
  const grainSize = normalizePercent(
    value,
    READING_MODE_DEFAULTS.textureGrainSize,
  );
  return grainSize <= 50 ? 0.5 + grainSize / 100 : grainSize / 50;
}

export function getReadingModeTextureTileSize(
  grainSize: unknown,
  pixelRatio: unknown = typeof window === "undefined"
    ? 1
    : window.devicePixelRatio,
): number {
  const numericPixelRatio = Number(pixelRatio);
  const densityScale =
    Number.isFinite(numericPixelRatio) && numericPixelRatio >= 2.5
      ? 3
      : Number.isFinite(numericPixelRatio) && numericPixelRatio >= 1.5
        ? 2
        : 1;
  return (
    READING_MODE_TEXTURE_BASE_TILE_SIZE *
    densityScale *
    getReadingModeTextureGrainScale(grainSize)
  );
}

export function readReadingModePreferences(): ReadingModePreferences {
  if (typeof window === "undefined") return { ...READING_MODE_DEFAULTS };

  try {
    const storedValue = window.localStorage.getItem(READING_MODE_STORAGE_KEY);
    return storedValue
      ? normalizeReadingModePreferences(JSON.parse(storedValue))
      : { ...READING_MODE_DEFAULTS };
  } catch {
    return { ...READING_MODE_DEFAULTS };
  }
}

export function getReadingModeVisuals(
  preferences: Pick<ReadingModePreferences, "colorTemperature" | "texture">,
): ReadingModeVisuals {
  const texture = normalizePercent(preferences.texture, 0) / 100;
  const textureStrength = Math.pow(texture, READING_MODE_TEXTURE_EXPONENT);
  const temperature = normalizePercent(preferences.colorTemperature, 50);
  const temperatureDistance = Math.abs(temperature - 50) / 50;
  const temperatureStrength = Math.pow(
    temperatureDistance,
    READING_MODE_TEMPERATURE_EXPONENT,
  );
  const isWarm = temperature >= 50;

  return {
    textureStrength,
    textureOpacityDark: textureStrength * READING_MODE_TEXTURE_DARK_MAX_OPACITY,
    textureOpacityLight:
      textureStrength * READING_MODE_TEXTURE_LIGHT_MAX_OPACITY,
    temperatureColor: isWarm
      ? READING_MODE_WARM_COLOR
      : READING_MODE_COOL_COLOR,
    temperatureOpacity:
      temperatureStrength *
      (isWarm ? READING_MODE_WARM_MAX_OPACITY : READING_MODE_COOL_MAX_OPACITY),
  };
}

export function applyReadingModePreferences(
  preferences: ReadingModePreferences,
  root: HTMLElement | undefined = typeof document === "undefined"
    ? undefined
    : document.documentElement,
): ReadingModePreferences {
  const normalized = normalizeReadingModePreferences(preferences);
  if (!root) return normalized;

  const visuals = getReadingModeVisuals(normalized);
  root.dataset.readingMode = String(normalized.enabled);
  root.dataset.readingModeTexture = String(
    normalized.enabled && normalized.texture > 0,
  );
  root.dataset.readingModeTemperature = String(
    normalized.enabled && normalized.colorTemperature !== 50,
  );
  root.dataset.readingModeColors = normalized.colors;
  root.style.setProperty(
    "--reading-mode-texture-opacity-dark",
    normalized.enabled ? visuals.textureOpacityDark.toFixed(5) : "0",
  );
  root.style.setProperty(
    "--reading-mode-texture-opacity-light",
    normalized.enabled ? visuals.textureOpacityLight.toFixed(5) : "0",
  );
  root.style.setProperty(
    "--reading-mode-texture-tile-size",
    `${getReadingModeTextureTileSize(normalized.textureGrainSize).toFixed(2)}px`,
  );
  root.style.setProperty(
    "--reading-mode-temperature-color",
    visuals.temperatureColor,
  );
  root.style.setProperty(
    "--reading-mode-temperature-opacity",
    normalized.enabled ? visuals.temperatureOpacity.toFixed(5) : "0",
  );
  return normalized;
}

export function persistReadingModePreferences(
  preferences: ReadingModePreferences,
): ReadingModePreferences {
  const normalized = applyReadingModePreferences(preferences);
  if (typeof window === "undefined") return normalized;

  try {
    window.localStorage.setItem(
      READING_MODE_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  } catch {
    // Applying the preference should still work in storage-restricted contexts.
  }
  window.dispatchEvent(new CustomEvent(READING_MODE_CHANGE_EVENT));
  return normalized;
}

export function getReadingModeBootstrapScript(): string {
  const defaults = JSON.stringify(READING_MODE_DEFAULTS);
  const storageKey = JSON.stringify(READING_MODE_STORAGE_KEY);
  const coolColor = JSON.stringify(READING_MODE_COOL_COLOR);
  const warmColor = JSON.stringify(READING_MODE_WARM_COLOR);

  return `(()=>{const r=document.documentElement,d=${defaults},c=(v,f)=>{if(typeof v==="string"){if(!v.trim())return f;v=Number(v)}else if(typeof v!=="number")return f;return Number.isFinite(v)?Math.min(100,Math.max(0,Math.round(v))):f},m=v=>v==="light"||v==="black-and-white"?v:"full",g=v=>v<=50?.5+v/100:v/50;let p=d;try{const s=localStorage.getItem(${storageKey}),v=s?JSON.parse(s):d;p=v&&typeof v==="object"?{enabled:typeof v.enabled==="boolean"?v.enabled:d.enabled,colorTemperature:c(v.colorTemperature,d.colorTemperature),texture:c(v.texture,d.texture),textureGrainSize:c(v.textureGrainSize,d.textureGrainSize),colors:m(v.colors)}:d}catch{}const t=Math.pow(p.texture/100,${READING_MODE_TEXTURE_EXPONENT}),w=p.colorTemperature>=50,x=Math.pow(Math.abs(p.colorTemperature-50)/50,${READING_MODE_TEMPERATURE_EXPONENT}),h=devicePixelRatio>=2.5?3:devicePixelRatio>=1.5?2:1;r.dataset.readingMode=String(p.enabled);r.dataset.readingModeTexture=String(p.enabled&&p.texture>0);r.dataset.readingModeTemperature=String(p.enabled&&p.colorTemperature!==50);r.dataset.readingModeColors=p.colors;r.style.setProperty("--reading-mode-texture-opacity-dark",p.enabled?(t*${READING_MODE_TEXTURE_DARK_MAX_OPACITY}).toFixed(5):"0");r.style.setProperty("--reading-mode-texture-opacity-light",p.enabled?(t*${READING_MODE_TEXTURE_LIGHT_MAX_OPACITY}).toFixed(5):"0");r.style.setProperty("--reading-mode-texture-tile-size",(${READING_MODE_TEXTURE_BASE_TILE_SIZE}*h*g(p.textureGrainSize)).toFixed(2)+"px");r.style.setProperty("--reading-mode-temperature-color",w?${warmColor}:${coolColor});r.style.setProperty("--reading-mode-temperature-opacity",p.enabled?(x*(w?${READING_MODE_WARM_MAX_OPACITY}:${READING_MODE_COOL_MAX_OPACITY})).toFixed(5):"0")})();`;
}
