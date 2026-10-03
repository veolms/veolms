export interface AvatarCropAreaPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MAX_AVATAR_OUTPUT_SIZE = 512;
const MAX_WORKING_IMAGE_SIZE = 4096;
const AVATAR_WEBP_QUALITY = 0.82;

function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

function getRotatedSize(width: number, height: number, rotation: number) {
  const rotationRadians = (rotation * Math.PI) / 180;
  return {
    width:
      Math.abs(Math.cos(rotationRadians) * width) + Math.abs(Math.sin(rotationRadians) * height),
    height:
      Math.abs(Math.sin(rotationRadians) * width) + Math.abs(Math.cos(rotationRadians) * height),
  };
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The selected image could not be read."));
    image.src = source;
  });
}

function canvasToWebpBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("This browser could not process the selected image."));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      AVATAR_WEBP_QUALITY,
    );
  });
}

function toWebpFileName(fileName: string): string {
  const baseName = fileName.replace(/\.[^./]+$/, "").trim() || "profile-photo";
  return `${baseName}.webp`;
}

/**
 * Applies the crop selected by react-easy-crop, rotates it, and returns a
 * browser-uploadable WebP. The full working canvas is capped so very large
 * source images do not create unnecessarily large intermediate canvases.
 */
export async function createAvatarCropFile(
  source: string,
  cropAreaPixels: AvatarCropAreaPixels,
  rotation: number,
  fileName = "profile-photo.webp",
): Promise<File> {
  const image = await loadImage(source);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("The selected image has no usable dimensions.");
  }

  const workingScale = Math.min(1, MAX_WORKING_IMAGE_SIZE / Math.max(sourceWidth, sourceHeight));
  const workingWidth = Math.max(1, Math.round(sourceWidth * workingScale));
  const workingHeight = Math.max(1, Math.round(sourceHeight * workingScale));
  const normalizedRotation = normalizeRotation(rotation);
  const rotatedSize = getRotatedSize(workingWidth, workingHeight, normalizedRotation);
  const rotatedCanvas = document.createElement("canvas");
  rotatedCanvas.width = Math.max(1, Math.ceil(rotatedSize.width));
  rotatedCanvas.height = Math.max(1, Math.ceil(rotatedSize.height));

  try {
    const rotatedContext = rotatedCanvas.getContext("2d");
    if (!rotatedContext) {
      throw new Error("This browser could not process the selected image.");
    }

    rotatedContext.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
    rotatedContext.rotate((normalizedRotation * Math.PI) / 180);
    rotatedContext.drawImage(
      image,
      -workingWidth / 2,
      -workingHeight / 2,
      workingWidth,
      workingHeight,
    );

    const cropX = cropAreaPixels.x * workingScale;
    const cropY = cropAreaPixels.y * workingScale;
    const cropSize = Math.min(
      cropAreaPixels.width * workingScale,
      cropAreaPixels.height * workingScale,
    );
    const boundedCropX = Math.max(0, Math.min(cropX, rotatedCanvas.width - cropSize));
    const boundedCropY = Math.max(0, Math.min(cropY, rotatedCanvas.height - cropSize));

    if (!Number.isFinite(cropSize) || cropSize <= 0) {
      throw new Error("The selected image crop is invalid.");
    }

    const outputSize = Math.max(1, Math.min(MAX_AVATAR_OUTPUT_SIZE, Math.round(cropSize)));
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = outputSize;
    outputCanvas.height = outputSize;

    try {
      const outputContext = outputCanvas.getContext("2d");
      if (!outputContext) {
        throw new Error("This browser could not process the selected image.");
      }

      outputContext.drawImage(
        rotatedCanvas,
        boundedCropX,
        boundedCropY,
        cropSize,
        cropSize,
        0,
        0,
        outputSize,
        outputSize,
      );

      const blob = await canvasToWebpBlob(outputCanvas);
      return new File([blob], toWebpFileName(fileName), {
        type: "image/webp",
        lastModified: Date.now(),
      });
    } finally {
      outputCanvas.width = 0;
      outputCanvas.height = 0;
    }
  } finally {
    rotatedCanvas.width = 0;
    rotatedCanvas.height = 0;
    image.src = "";
  }
}
