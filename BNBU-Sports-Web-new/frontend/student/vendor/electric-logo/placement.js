// Match the static <img>'s object-fit: contain, including transparent source
// margins. The distance field is cropped; its origin is not the image origin.
export function containLogoPlacement(shape, box) {
  const { sourceWidth, sourceHeight, sourceLeft, sourceTop, pad, logoWidth, logoHeight } = shape;
  const { width, height, left = 0, right = 0, top = 0, bottom = 0 } = box;
  const innerWidth = Math.max(0, width - left - right);
  const innerHeight = Math.max(0, height - top - bottom);
  const fit = Math.max(1e-4, Math.min(innerWidth / sourceWidth, innerHeight / sourceHeight));
  const imageX = left + (innerWidth - sourceWidth * fit) / 2;
  const imageY = top + (innerHeight - sourceHeight * fit) / 2;
  return {
    fit,
    ox: imageX + (sourceLeft - pad) * fit,
    oy: imageY + (sourceTop - pad) * fit,
    unit: Math.max(logoWidth, logoHeight) * fit / 100,
  };
}
