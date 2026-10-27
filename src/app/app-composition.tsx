import { composeToolcraftApp } from "@/toolcraft/runtime/react";

import { appSchema } from "./app-schema";
import { GradientCanvas } from "./gradient/gradient-canvas";
import { gradientRasterFrameRenderer } from "./gradient/gradient-export";

export const appComposition = composeToolcraftApp(appSchema, {
  scene: {
    canvasContent: <GradientCanvas />,
    rasterFrameRenderer: gradientRasterFrameRenderer,
    // World origin is the artboard centre, so the product rect is centred on it.
    sceneBoundsProvider: ({ state }) => [
      {
        height: state.canvas.size.height,
        width: state.canvas.size.width,
        x: -state.canvas.size.width / 2,
        y: -state.canvas.size.height / 2,
      },
    ],
  },
});
