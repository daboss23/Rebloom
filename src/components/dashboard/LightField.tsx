"use client";

import { useEffect, useRef } from "react";
import { cx } from "@/components/ui/cx";

/**
 * Light through moving water onto glass: drifting caustic lines with a faint prism split at the brightest
 * edges (DECISIONS D-058). One small WebGL shader, drawn at reduced resolution and about 30 frames a second,
 * paused when off screen or in a hidden tab, and a single still frame for reduced motion. If WebGL isn't
 * there, the CSS wash underneath is the whole effect.
 */

const VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uTop;
uniform vec3 uBottom;
uniform vec3 uPool;
uniform vec3 uTint;
uniform float uStrength;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// Bright where two moving cells meet: the web of light on a pool floor.
float caustic(vec2 p, float t) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash2(i + g);
      o = 0.5 + 0.42 * sin(t * 0.55 + 6.2831 * o);
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  float e = d2 - d1;
  // A thin bright line where light focuses, with a soft glow either side of it.
  return pow(1.0 - smoothstep(0.0, 0.14, e), 4.0) + 0.22 * (1.0 - smoothstep(0.0, 0.45, e));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes.xy;
  vec2 p = gl_FragCoord.xy / uRes.y * 3.4;
  float t = uTime;
  p += 0.55 * vec2(sin(p.y * 0.9 + t * 0.3), cos(p.x * 0.8 - t * 0.26));
  p += 0.18 * vec2(sin(p.y * 2.3 - t * 0.5), cos(p.x * 2.1 + t * 0.45));
  float r = caustic(p + vec2(0.014, 0.0), t);
  float g = caustic(p, t);
  float b = caustic(p - vec2(0.014, 0.0), t);
  float fine = caustic(p * 1.85 + 3.7, t * 1.25);
  vec3 light = (vec3(r, g, b) * 0.8 + fine * 0.3) * uTint;
  vec3 base = mix(uBottom, uTop, smoothstep(0.0, 1.0, uv.y));
  // A low sun at the top right: dawn warmth spilling across the water.
  float pool = smoothstep(0.95, 0.0, distance(uv, vec2(0.88, 0.95)));
  base = mix(base, uPool, pool * 0.7);
  vec3 col = base + light * uStrength;
  col *= mix(1.0, 0.93, smoothstep(0.35, 1.0, distance(uv, vec2(0.45, 0.6))));
  gl_FragColor = vec4(col, 1.0);
}
`;

const hex = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as const;
};

const PALETTES = {
  ice: { top: "#f1f8fb", bottom: "#bcd9e7", pool: "#ffd2bf", tint: "#ffffff", strength: 0.42, wash: "linear-gradient(180deg,#f6fbfd,#cfe3ed)" },
  sea: { top: "#163246", bottom: "#07131b", pool: "#1e5a78", tint: "#9fd0e6", strength: 0.38, wash: "linear-gradient(180deg,#163246,#07131b)" },
} as const;

export function LightField({ variant = "ice", className }: { variant?: keyof typeof PALETTES; className?: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    // A fresh canvas per mount: a context, once released, can't be used again.
    const el = document.createElement("canvas");
    el.className = "lightfield block h-full w-full opacity-0 transition-opacity duration-1000";
    host.current.appendChild(el);
    const gl = el.getContext("webgl", { antialias: false, premultipliedAlpha: false, powerPreference: "low-power" });
    if (!gl) {
      el.remove();
      return;
    }

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      el.remove();
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const palette = PALETTES[variant];
    const u = (name: string) => gl.getUniformLocation(prog, name);
    gl.uniform3fv(u("uTop"), hex(palette.top));
    gl.uniform3fv(u("uBottom"), hex(palette.bottom));
    gl.uniform3fv(u("uPool"), hex(palette.pool));
    gl.uniform3fv(u("uTint"), hex(palette.tint));
    gl.uniform1f(u("uStrength"), palette.strength);
    const uRes = u("uRes");
    const uTime = u("uTime");

    // Drawn at a fraction of the screen's pixels: soft light needs no more, and it keeps the GPU idle.
    const scale = Math.min(window.devicePixelRatio || 1, 2) * 0.5;
    const resize = () => {
      const w = Math.max(1, Math.round(el.clientWidth * scale));
      const h = Math.max(1, Math.round(el.clientHeight * scale));
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
    };
    const draw = (seconds: number) => {
      resize();
      gl.uniform1f(uTime, seconds);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const offset = 40 + Math.random() * 20;
    el.dataset.ready = "true";
    const release = () => {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      el.remove();
    };
    draw(offset);
    requestAnimationFrame(() => el.classList.remove("opacity-0"));
    if (still) return release;

    let frame = 0;
    let last = 0;
    let visible = true;
    // About 30 frames a second, or 15 on touch screens, where the battery and the glass above pay for each one.
    const gap = window.matchMedia("(pointer: coarse)").matches ? 66 : 33;
    const start = performance.now();
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (!visible || document.hidden || now - last < gap) return;
      last = now;
      draw(offset + (now - start) / 1000);
    };
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    io.observe(el);
    const ro = new ResizeObserver(() => draw(offset + (performance.now() - start) / 1000));
    ro.observe(el);
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
      release();
    };
  }, [variant]);

  return (
    <div ref={host} aria-hidden className={cx("pointer-events-none absolute inset-0 overflow-hidden", className)} style={{ background: PALETTES[variant].wash }} />
  );
}
