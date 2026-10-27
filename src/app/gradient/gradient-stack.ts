import { GradientGl, type GradientLayerDraw } from "./gradient-gl";
import {
  getGradientImageSource,
  rasterizeLogoLayer,
  rasterizePhotoLayer,
  rasterizeTextLayer,
  type GradientImageKind,
} from "./gradient-layers";
import { layerRasterKey, type GradientParams } from "./gradient-values";

type LayerName = GradientImageKind | "text";

type CachedLayer = {
  key: string;
  texture: WebGLTexture;
};

const layerOrder: readonly LayerName[] = ["photo", "logo", "text"];

/**
 * Owns one GL renderer and one texture per foreground layer. A layer is
 * rasterized again only when its content key changes, so timeline playback
 * re-runs only the field pass.
 */
export class GradientStack {
  private readonly gl: GradientGl;
  private readonly layers = new Map<LayerName, CachedLayer>();

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new GradientGl(canvas);
  }

  get canvas(): HTMLCanvasElement {
    return this.gl.canvas;
  }

  render(params: GradientParams, timeProgress: number, width: number, height: number): void {
    this.gl.resize(width, height);
    const drawn: GradientLayerDraw[] = [];

    for (const name of layerOrder) {
      const texture = this.ensureLayer(name, params, width, height);
      if (!texture) continue;
      drawn.push({
        effects: name === "text" ? params.text : params[name],
        glassCount: params.glass.count,
        texture,
      });
    }

    this.gl.draw(params, timeProgress, drawn);
  }

  private ensureLayer(name: LayerName, params: GradientParams, width: number, height: number): WebGLTexture | null {
    const image = name === "text" ? null : getGradientImageSource(name);
    const hasContent =
      name === "text" ? params.text.content.trim() !== "" : image !== null;
    const cached = this.layers.get(name);
    if (!hasContent) {
      if (cached) {
        this.gl.deleteTexture(cached.texture);
        this.layers.delete(name);
      }
      return null;
    }

    const key = `${width}x${height}|${layerRasterKey(params, name === "text" ? "text" : name)}|${image?.src ?? ""}`;
    if (cached && cached.key === key) return cached.texture;

    const source =
      name === "text"
        ? rasterizeTextLayer(width, height, params)
        : name === "photo"
          ? rasterizePhotoLayer(width, height, image as HTMLImageElement)
          : rasterizeLogoLayer(width, height, image as HTMLImageElement, params.logo.scale);
    const texture = this.gl.uploadLayer(source, cached?.texture ?? null);
    this.layers.set(name, { key, texture });
    return texture;
  }

  dispose(): void {
    for (const layer of this.layers.values()) this.gl.deleteTexture(layer.texture);
    this.layers.clear();
    this.gl.dispose();
  }
}
