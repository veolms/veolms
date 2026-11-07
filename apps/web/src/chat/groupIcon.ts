/**
 * A group's icon is shown round and small: the photo is cut to its centre
 * square and made at most 640 px (a JPEG of some tens of KB) before it is
 * uploaded, so saving is quick on a phone's connection. A picture the
 * browser can't read is sent as it is.
 */
export async function squareIcon(
  file: File,
  maxSide = 640,
): Promise<{ file: File; width?: number; height?: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const out = Math.max(1, Math.min(maxSide, side));
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return { file };
    }
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      out,
      out,
    );
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.88),
    );
    if (!blob) return { file };
    return {
      file: new File([blob], "group-icon.jpg", { type: "image/jpeg" }),
      width: out,
      height: out,
    };
  } catch {
    return { file };
  }
}
