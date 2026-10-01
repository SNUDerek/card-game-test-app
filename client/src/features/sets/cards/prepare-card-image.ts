import { CARD_IMAGE_MAX_SIZE, CARD_IMAGE_MIN_SIZE } from "@card-table/shared";

export class CardImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CardImageError";
  }
}

export interface CardImagePlan {
  /** Centered square cut from the source, in source pixels. */
  crop: { sx: number; sy: number; size: number };
  /** Side length of the output square. */
  outputSize: number;
}

/**
 * Decides how to turn a source image into card artwork: the largest centered
 * square, scaled down to at most CARD_IMAGE_MAX_SIZE. Never scales up, since
 * that only adds blur; a source too small to meet the minimum is rejected.
 */
export function planCardImage(width: number, height: number): CardImagePlan {
  const size = Math.min(width, height);
  if (!(size >= CARD_IMAGE_MIN_SIZE)) {
    throw new CardImageError(
      `Images must be at least ${CARD_IMAGE_MIN_SIZE}×${CARD_IMAGE_MIN_SIZE} pixels; ` +
        `this one is ${width}×${height}.`,
    );
  }
  return {
    crop: {
      sx: Math.floor((width - size) / 2),
      sy: Math.floor((height - size) / 2),
      size,
    },
    outputSize: Math.min(size, CARD_IMAGE_MAX_SIZE),
  };
}

/**
 * Crops and resizes a user-chosen image in the browser, so the server only
 * ever receives square artwork within the size limits and needs no image
 * processing library. Output is PNG, which keeps pixel art crisp.
 */
export async function prepareCardImage(source: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    throw new CardImageError("That file could not be read as an image.");
  }

  try {
    const { crop, outputSize } = planCardImage(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext("2d");
    if (!context) throw new CardImageError("This browser cannot process images.");
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, crop.sx, crop.sy, crop.size, crop.size, 0, 0, outputSize, outputSize);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new CardImageError("The image could not be encoded.")),
        "image/png",
      );
    });
  } finally {
    bitmap.close();
  }
}
