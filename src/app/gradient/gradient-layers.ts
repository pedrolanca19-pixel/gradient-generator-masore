import type { GradientFont, GradientParams } from "./gradient-values";

export type GradientImageKind = "photo" | "logo";

/**
 * Decoded source images shared by the live canvas and export. The live canvas
 * fills this registry when a media URL changes; export reads it without React.
 */
const imageSources: Record<GradientImageKind, HTMLImageElement | null> = {
  logo: null,
  photo: null,
};

export function setGradientImageSource(kind: GradientImageKind, image: HTMLImageElement | null): void {
  imageSources[kind] = image;
}

export function getGradientImageSource(kind: GradientImageKind): HTMLImageElement | null {
  return imageSources[kind];
}

const fontFamilies: Record<GradientFont, string> = {
  display: "'Arial Black', Impact, sans-serif",
  mono: "'Courier New', Courier, monospace",
  sans: "Inter, Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
};

function createLayerCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Photo covers the whole frame, like a background photo would. */
export function rasterizePhotoLayer(width: number, height: number, image: HTMLImageElement): HTMLCanvasElement {
  const canvas = createLayerCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D context is not available for the photo layer.");
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  return canvas;
}

/** Logo is centred and keeps its aspect; the size is a fraction of the frame width. */
export function rasterizeLogoLayer(
  width: number,
  height: number,
  image: HTMLImageElement,
  scale: number,
): HTMLCanvasElement {
  const canvas = createLayerCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D context is not available for the logo layer.");
  const drawWidth = width * scale;
  const drawHeight = image.naturalHeight * (drawWidth / image.naturalWidth);
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  return canvas;
}

/** Text is centred and rasterized at the frame's pixel size, so zoom never blurs it. */
export function rasterizeTextLayer(width: number, height: number, params: GradientParams): HTMLCanvasElement {
  const canvas = createLayerCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D context is not available for the text layer.");
  const { content, font, size, weight } = params.text;
  if (content.trim() === "") return canvas;
  context.font = `${weight} ${Math.round(size * height)}px ${fontFamilies[font]}`;
  context.fillStyle = "#FFFFFF";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(content, width / 2, height / 2);
  return canvas;
}
