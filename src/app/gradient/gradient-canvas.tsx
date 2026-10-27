"use client";

import * as React from "react";

import {
  getToolcraftTimelineLoopProgress,
  type ToolcraftMediaAsset,
  type ToolcraftState,
} from "@/toolcraft/runtime";
import {
  useToolcraftMediaPresentationUrls,
  useToolcraftProductSceneFrame,
  useToolcraftSelector,
} from "@/toolcraft/runtime/react";

import { GradientStack } from "./gradient-stack";
import { setGradientImageSource, type GradientImageKind } from "./gradient-layers";
import { readGradientParams } from "./gradient-values";

const MAX_BACKING_EDGE = 4096;

const selectGradientCanvasState = (state: ToolcraftState) => ({
  durationSeconds: state.timeline.durationSeconds,
  mediaAssets: state.mediaAssets,
  timeSeconds: state.timeline.currentTimeSeconds,
  values: state.values,
});

function findAssetUrl(
  assets: readonly ToolcraftMediaAsset[],
  target: string,
  urls: ReadonlyMap<string, string>,
): string | null {
  const asset = assets.find((candidate) => candidate.sourceTarget === target);
  return asset ? (urls.get(asset.id) ?? null) : null;
}

function useGradientImage(kind: GradientImageKind, url: string | null, onLoad: () => void): void {
  React.useEffect(() => {
    if (!url) {
      setGradientImageSource(kind, null);
      onLoad();
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      setGradientImageSource(kind, image);
      onLoad();
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [kind, onLoad, url]);
}

export function GradientCanvas(): React.JSX.Element | null {
  const frame = useToolcraftProductSceneFrame();
  const selection = useToolcraftSelector(selectGradientCanvasState);
  const urls = useToolcraftMediaPresentationUrls(selection.mediaAssets);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const stackRef = React.useRef<GradientStack | null>(null);
  const [imageVersion, setImageVersion] = React.useState(0);
  const bumpImageVersion = React.useCallback(() => setImageVersion((version) => version + 1), []);

  const photoUrl = findAssetUrl(selection.mediaAssets, "photo.file", urls);
  const logoUrl = findAssetUrl(selection.mediaAssets, "logo.file", urls);
  useGradientImage("photo", photoUrl, bumpImageVersion);
  useGradientImage("logo", logoUrl, bumpImageVersion);

  const params = React.useMemo(() => readGradientParams(selection.values), [selection.values]);
  const timeProgress = getToolcraftTimelineLoopProgress({
    currentTimeSeconds: selection.timeSeconds,
    durationSeconds: selection.durationSeconds,
  });
  const rect = frame.kind === "ready" ? frame.rect : null;
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const width = rect ? Math.min(MAX_BACKING_EDGE, Math.max(1, Math.round(rect.width * dpr))) : 0;
  const height = rect ? Math.min(MAX_BACKING_EDGE, Math.max(1, Math.round(rect.height * dpr))) : 0;

  React.useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;
    if (stackRef.current && stackRef.current.canvas !== canvas) {
      stackRef.current.dispose();
      stackRef.current = null;
    }
    stackRef.current ??= new GradientStack(canvas);
    stackRef.current.render(params, timeProgress, width, height);
  }, [height, imageVersion, params, timeProgress, width]);

  React.useEffect(
    () => () => {
      stackRef.current?.dispose();
      stackRef.current = null;
    },
    [],
  );

  if (!rect) return null;

  return (
    <canvas
      data-toolcraft-product-output
      ref={canvasRef}
      style={{ display: "block", height: "100%", width: "100%" }}
    />
  );
}
