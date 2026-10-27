export const gradientVertexShader = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/**
 * Generated field. Output is premultiplied: alpha is the field coverage, so
 * the runtime background shows through where coverage is below one.
 * Time is a 0..1 loop progress; every periodic term uses a whole number of
 * cycles per loop, so the first and last frames stitch.
 */
export const gradientFieldFragmentShader = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform vec2 uSize;
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform int uPattern;
uniform float uDensity;
uniform float uWaves;
uniform float uAngle;
uniform float uGlassAmount;
uniform float uGlassCount;
uniform float uGlassEdge;
uniform float uSmearAmount;
uniform float uSmearTeeth;
uniform float uChromatic;
uniform float uGrain;
uniform float uCoverage;

const float TAU = 6.28318530718;

vec3 ramp(float t) {
  float x = fract(t) * 3.0;
  float k = floor(x);
  float f = smoothstep(0.0, 1.0, fract(x));
  vec3 a = k < 1.0 ? uColorA : (k < 2.0 ? uColorB : uColorC);
  vec3 b = k < 1.0 ? uColorB : (k < 2.0 ? uColorC : uColorA);
  return mix(a, b, f);
}

vec2 rotate(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

float fieldValue(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(uSize.x / uSize.y, 1.0);
  p = rotate(p, uAngle);
  float v;
  if (uPattern == 0) {
    v = p.y + uWaves * 0.12 * sin(TAU * (p.x * 1.3 + uTime));
  } else if (uPattern == 1) {
    v = p.x + p.y * 0.6 + uWaves * 0.12 * sin(TAU * (p.y * 1.3 + uTime));
  } else {
    float a = atan(p.y, p.x) / TAU * 2.0;
    v = length(p * vec2(1.0, 1.2)) + uWaves * 0.1 * sin(TAU * (a + uTime));
  }
  return v * uDensity * 0.5 + uTime;
}

void main() {
  vec2 uv = vUv;

  // Vertical glass stripes: each stripe bends the sampling coordinate in x.
  float cell = fract(uv.x * uGlassCount);
  float g = cell * 2.0 - 1.0;
  float bend = g * (1.0 - g * g);
  uv.x += uGlassAmount * bend * 0.8 / uGlassCount;

  // Serrated smear: sawtooth horizontal displacement per row.
  float tooth = fract(uv.y * uSmearTeeth);
  uv.x += uSmearAmount * (tooth - 0.5) * 0.25;

  vec3 col;
  if (uChromatic > 0.0) {
    vec2 d = vec2(uChromatic * 0.012, 0.0);
    col.r = ramp(fieldValue(uv + d)).r;
    col.g = ramp(fieldValue(uv)).g;
    col.b = ramp(fieldValue(uv - d)).b;
  } else {
    col = ramp(fieldValue(uv));
  }

  float edge = pow(1.0 - abs(g), 6.0) * uGlassEdge * step(0.001, uGlassAmount);
  col += edge * 0.5;
  col += (hash(gl_FragCoord.xy) - 0.5) * uGrain * 0.35;
  col = clamp(col, 0.0, 1.0);

  float a = uCoverage;
  outColor = vec4(col * a, a);
}
`;

/**
 * Foreground layer (text, logo or photo). The input texture is premultiplied,
 * and the effects keep premultiplied alpha so each blend equation stays valid.
 */
export const gradientLayerFragmentShader = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uTexture;
uniform float uGlass;
uniform float uGlassCount;
uniform float uChromatic;
uniform float uGrain;
uniform float uOpacity;

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

void main() {
  vec2 uv = vUv;
  float cell = fract(uv.x * uGlassCount);
  float g = cell * 2.0 - 1.0;
  uv.x += uGlass * g * (1.0 - g * g) * 0.8 / uGlassCount;

  vec4 center = texture(uTexture, uv);
  vec3 rgb = center.rgb;
  if (uChromatic > 0.0) {
    vec2 d = vec2(uChromatic * 0.012, 0.0);
    rgb.r = texture(uTexture, uv + d).r;
    rgb.b = texture(uTexture, uv - d).b;
  }
  float a = center.a;
  rgb = min(rgb, vec3(a));
  rgb += (hash(gl_FragCoord.xy) - 0.5) * uGrain * 0.35 * a;
  rgb = clamp(rgb, 0.0, a);

  outColor = vec4(rgb, a) * uOpacity;
}
`;
