import { MAX_DISCUSSION_ATTACHMENT_DIMENSION } from "@veolms/contracts";

export interface AttachmentDimensionFields {
  width: number | null;
  height: number | null;
}

export function getAttachmentDimensionFields(
  metadata: unknown,
): AttachmentDimensionFields {
  const parsed =
    typeof metadata === "string"
      ? parseMetadata(metadata)
      : isRecord(metadata)
        ? metadata
        : null;
  const width = readDimension(parsed?.width);
  const height = readDimension(parsed?.height);
  return width !== null && height !== null
    ? { width, height }
    : { width: null, height: null };
}

function parseMetadata(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDimension(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_DISCUSSION_ATTACHMENT_DIMENSION
    ? value
    : null;
}
