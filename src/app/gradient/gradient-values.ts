import { createCurveEvaluator } from "@/toolcraft/runtime";

export type GradientPattern = "bands" | "diagonal" | "radial";
export type GradientBlend = "normal" | "screen" | "add";
export type GradientFont = "sans" | "serif" | "mono" | "display";
export type GradientCurveTarget = "glass" | "smear";

/** Curve samples evaluated on the CPU and uploaded as one uniform array. */
export const GRADIENT_CURVE_SAMPLES = 64;

export type GradientLayerEffects = {
  blend: GradientBlend;
  chromatic: number;
  glass: number;
  grain: number;
  opacity: number;
};

export type GradientParams = {
  angle: number;
  curve: { samples: number[]; target: GradientCurveTarget };
  background: string;
  backgroundVisible: boolean;
  colors: [string, string, string];
  field: {
    chromatic: number;
    coverage: number;
    density: number;
    grain: number;
    pattern: GradientPattern;
    waves: number;
  };
  glass: { amount: number; count: number; edge: number };
  logo: GradientLayerEffects & { scale: number };
  photo: GradientLayerEffects;
  smear: { amount: number; teeth: number };
  text: GradientLayerEffects & {
    content: string;
    enabled: boolean;
    font: GradientFont;
    size: number;
    weight: "400" | "700";
  };
};

function num(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hex(value: unknown, fallback: string): string {
  if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
  if (typeof value === "object" && value !== null && "hex" in value) {
    return hex((value as { hex?: unknown }).hex, fallback);
  }
  return fallback;
}

function choice<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function readLayer(values: Record<string, unknown>, prefix: string): GradientLayerEffects {
  return {
    blend: choice(values[`${prefix}.blend`], ["normal", "screen", "add"], "normal"),
    chromatic: num(values[`${prefix}.chromatic`], 0),
    glass: num(values[`${prefix}.glass`], 0),
    grain: num(values[`${prefix}.grain`], 0),
    opacity: num(values[`${prefix}.opacity`], 1),
  };
}

/** Samples the authored curve; a missing value falls back to the identity ramp. */
function sampleGradientCurve(value: unknown): number[] {
  const points = (value as { points?: { RGB?: { x: number; y: number }[] } } | null)?.points?.RGB;
  const evaluator = createCurveEvaluator(
    points && points.length >= 2 ? points : [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    "smooth",
  );
  return Array.from({ length: GRADIENT_CURVE_SAMPLES }, (_, index) =>
    evaluator(index / (GRADIENT_CURVE_SAMPLES - 1)),
  );
}

/** Pure value reader: every renderer and export path derives its parameters here. */
export function readGradientParams(values: Record<string, unknown>): GradientParams {
  const background = hex(values["appearance.background"], "#05060A");
  const textEnabled = values["text.enabled"] !== false;
  return {
    angle: num(values["field.angle"], 0),
    curve: {
      samples: sampleGradientCurve(values["distortion.curve"]),
      target: choice(values["distortion.target"], ["glass", "smear"], "glass"),
    },
    background,
    backgroundVisible: values["export.includeBackground"] !== false,
    colors: [
      hex(values["palette.a"], "#1746EA"),
      hex(values["palette.b"], "#4576FF"),
      hex(values["palette.c"], "#FFFFFF"),
    ],
    field: {
      chromatic: num(values["field.chromatic"], 0),
      coverage: Math.min(1, Math.max(0, num(values["field.coverage"], 1))),
      density: Math.max(1, num(values["field.density"], 6)),
      grain: num(values["field.grain"], 0),
      pattern: choice(values["field.pattern"], ["bands", "diagonal", "radial"], "bands"),
      waves: num(values["field.waves"], 0),
    },
    glass: {
      amount: num(values["glass.amount"], 0),
      count: Math.max(1, num(values["glass.count"], 28)),
      edge: num(values["glass.edge"], 0),
    },
    logo: { ...readLayer(values, "logo"), scale: num(values["logo.scale"], 0.3) },
    photo: readLayer(values, "photo"),
    smear: {
      amount: num(values["smear.amount"], 0),
      teeth: Math.max(2, num(values["smear.teeth"], 18)),
    },
    text: {
      ...readLayer(values, "text"),
      content: textEnabled && typeof values["text.content"] === "string" ? values["text.content"] : "",
      enabled: textEnabled,
      font: choice(values["text.font"], ["sans", "serif", "mono", "display"], "sans"),
      size: num(values["text.size"], 0.14),
      weight: choice(values["text.weight"], ["400", "700"], "700"),
    },
  };
}

/** Stable key: layer rasters are rebuilt only when this changes. */
export function layerRasterKey(params: GradientParams, layer: "photo" | "logo" | "text"): string {
  if (layer === "text") {
    const { content, font, size, weight } = params.text;
    return `text|${content}|${font}|${size}|${weight}`;
  }
  return layer === "logo" ? `logo|${params.logo.scale}` : "photo";
}
