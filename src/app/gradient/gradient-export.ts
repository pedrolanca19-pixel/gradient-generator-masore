import { GradientStack } from "./gradient-stack";
import { readGradientParams } from "./gradient-values";

type ExportStack = { canvas: HTMLCanvasElement; stack: GradientStack };

/**
 * One offscreen stack serves every export frame. Image and video export both
 * call renderFrame with the exact size of the frame they composite.
 */
let exportStack: ExportStack | null = null;

function getExportStack(): GradientStack {
  if (!exportStack) {
    const canvas = document.createElement("canvas");
    exportStack = { canvas, stack: new GradientStack(canvas) };
  }
  return exportStack.stack;
}

export const gradientRasterFrameRenderer = {
  baseFileName: "gradient",
  renderFrame: ({
    context,
    frame,
    signal,
    state,
    timelineProgress,
  }: {
    context: CanvasRenderingContext2D;
    frame: { height: number; width: number; x: number; y: number };
    signal: AbortSignal;
    state: { values: Readonly<Record<string, unknown>> };
    timelineProgress: number;
  }) => {
    signal.throwIfAborted();
    // The context is already in world units: draw the product frame rect and
    // rasterize at the output pixel size that maps onto it.
    const width = context.canvas.width;
    const height = context.canvas.height;
    const params = readGradientParams(state.values);
    const stack = getExportStack();
    stack.render(params, timelineProgress, width, height);
    context.drawImage(stack.canvas, frame.x, frame.y, frame.width, frame.height);
  },
};
