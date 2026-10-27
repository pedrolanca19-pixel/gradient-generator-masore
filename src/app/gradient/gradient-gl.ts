import type { GradientLayerEffects, GradientParams } from "./gradient-values";
import { gradientFieldFragmentShader, gradientLayerFragmentShader, gradientVertexShader } from "./gradient-shaders";

export type GradientLayerDraw = {
  effects: GradientLayerEffects;
  glassCount: number;
  texture: WebGLTexture;
};

const patternIndex = { bands: 0, diagonal: 1, radial: 2 } as const;

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("WebGL shader allocation failed.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "unknown error";
    gl.deleteShader(shader);
    throw new Error(`Gradient shader failed to compile: ${log}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, fragmentSource: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("WebGL program allocation failed.");
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, gradientVertexShader));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.bindAttribLocation(program, 0, "aPosition");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Gradient program failed to link: ${gl.getProgramInfoLog(program) ?? ""}`);
  }
  return program;
}

/**
 * One WebGL2 context drawing the generated field and then each foreground
 * layer in order. Used by the live canvas and by every export frame.
 */
export class GradientGl {
  private readonly gl: WebGL2RenderingContext;
  private readonly fieldProgram: WebGLProgram;
  private readonly layerProgram: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL2 is not available in this browser.");
    this.gl = gl;
    this.fieldProgram = link(gl, gradientFieldFragmentShader);
    this.layerProgram = link(gl, gradientLayerFragmentShader);

    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    if (!vao || !buffer) throw new Error("WebGL buffer allocation failed.");
    this.vao = vao;
    this.buffer = buffer;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  resize(width: number, height: number): void {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  uploadLayer(source: HTMLCanvasElement, previous: WebGLTexture | null): WebGLTexture {
    const gl = this.gl;
    const texture = previous ?? gl.createTexture();
    if (!texture) throw new Error("WebGL texture allocation failed.");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // 2D canvas rows start at the top; GL texture coordinates start at the bottom.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  deleteTexture(texture: WebGLTexture | null): void {
    if (texture) this.gl.deleteTexture(texture);
  }

  /** Draws the field, then every layer in array order, into the full canvas. */
  draw(params: GradientParams, timeProgress: number, layers: readonly GradientLayerDraw[]): void {
    const gl = this.gl;
    const width = this.canvas.width;
    const height = this.canvas.height;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.bindVertexArray(this.vao);

    this.drawField(params, timeProgress, width, height);
    for (const layer of layers) this.drawLayer(layer);

    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  private drawField(params: GradientParams, timeProgress: number, width: number, height: number): void {
    const gl = this.gl;
    const { field, glass, smear } = params;
    gl.useProgram(this.fieldProgram);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const setFloat = (name: string, value: number) => gl.uniform1f(gl.getUniformLocation(this.fieldProgram, name), value);
    const location = (name: string) => gl.getUniformLocation(this.fieldProgram, name);
    gl.uniform2f(location("uSize"), width, height);
    setFloat("uTime", timeProgress);
    const [ar, ag, ab] = hexToRgb(params.colors[0]);
    const [br, bg, bb] = hexToRgb(params.colors[1]);
    const [cr, cg, cb] = hexToRgb(params.colors[2]);
    gl.uniform3f(location("uColorA"), ar, ag, ab);
    gl.uniform3f(location("uColorB"), br, bg, bb);
    gl.uniform3f(location("uColorC"), cr, cg, cb);
    gl.uniform1i(location("uPattern"), patternIndex[field.pattern]);
    setFloat("uDensity", field.density);
    setFloat("uWaves", field.waves);
    setFloat("uAngle", (params.angle * Math.PI) / 180);
    setFloat("uGlassAmount", glass.amount);
    setFloat("uGlassCount", glass.count);
    setFloat("uGlassEdge", glass.edge);
    setFloat("uSmearAmount", smear.amount);
    setFloat("uSmearTeeth", smear.teeth);
    gl.uniform1fv(location("uCurve[0]"), params.curve.samples);
    setFloat("uCurveOnGlass", params.curve.target === "glass" ? 1 : 0);
    setFloat("uCurveOnSmear", params.curve.target === "smear" ? 1 : 0);
    setFloat("uChromatic", field.chromatic);
    setFloat("uGrain", field.grain);
    setFloat("uCoverage", field.coverage);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private drawLayer(layer: GradientLayerDraw): void {
    const gl = this.gl;
    const { effects } = layer;
    gl.useProgram(this.layerProgram);
    // Premultiplied sources: normal is over, screen lightens, add sums.
    if (effects.blend === "add") gl.blendFunc(gl.ONE, gl.ONE);
    else if (effects.blend === "screen") gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, layer.texture);
    gl.uniform1i(gl.getUniformLocation(this.layerProgram, "uTexture"), 0);
    gl.uniform1f(gl.getUniformLocation(this.layerProgram, "uGlass"), effects.glass);
    gl.uniform1f(gl.getUniformLocation(this.layerProgram, "uGlassCount"), layer.glassCount);
    gl.uniform1f(gl.getUniformLocation(this.layerProgram, "uChromatic"), effects.chromatic);
    gl.uniform1f(gl.getUniformLocation(this.layerProgram, "uGrain"), effects.grain);
    gl.uniform1f(gl.getUniformLocation(this.layerProgram, "uOpacity"), effects.opacity);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.fieldProgram);
    gl.deleteProgram(this.layerProgram);
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
  }
}
