"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { Point } from "@/lib/capture/metrics";

/** What the camera loop shares with the mesh, by reference, so the mesh never re-renders React. */
export interface MeshFeed {
  /** The face model's points, normalised to the 3:4 preview, or null with no face in view. */
  points: Point[] | null;
  /** Every check passes: the photo is about to be taken. */
  ready: boolean;
  /** 0 to 1 through the one-second hold before the photo (GATE.holdMs). */
  hold: number;
}

/** The face model's own points: the 468 of the face, without the irises. */
const FACE_POINTS = 468;

/**
 * The face as the model reads it, live over the camera (DECISIONS D-074): its own points drawn as dots that settle
 * smoothly between readings, brighter once every check passes, and a light line that crosses the face over the real
 * one-second hold before the photo is taken. Nothing here is decoration: no face, no dots.
 */
export function FaceMesh({ feed, mirrored }: { feed: RefObject<MeshFeed>; mirrored: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let shown: { x: number; y: number }[] | null = null;
    let alpha = 0;
    let glow = 0;
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(el.clientWidth * dpr);
      const h = Math.round(el.clientHeight * dpr);
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
      }
      const { points, ready, hold } = feed.current;
      // Readings arrive a few times a second; ease toward each so the mesh moves with the face, not in steps.
      if (points) {
        const target = points.slice(0, FACE_POINTS).map((p) => ({ x: (mirrored ? 1 - p.x : p.x) * w, y: p.y * h }));
        if (!shown || shown.length !== target.length || still) shown = target;
        else for (let i = 0; i < target.length; i++) {
          shown[i].x += (target[i].x - shown[i].x) * 0.3;
          shown[i].y += (target[i].y - shown[i].y) * 0.3;
        }
      }
      alpha += ((points ? 1 : 0) - alpha) * 0.12;
      glow += ((ready ? 1 : 0) - glow) * 0.15;
      ctx.clearRect(0, 0, w, h);
      if (!shown || alpha < 0.02) return;

      let top = Infinity;
      let bottom = -Infinity;
      let left = Infinity;
      let right = -Infinity;
      for (const p of shown) {
        top = Math.min(top, p.y);
        bottom = Math.max(bottom, p.y);
        left = Math.min(left, p.x);
        right = Math.max(right, p.x);
      }
      const scanning = !still && ready && hold > 0;
      const lineY = top + (bottom - top) * hold;
      const band = (bottom - top) * 0.07;
      const r = (1.3 + glow * 0.3) * dpr;

      // Ice dots, brighter once the photo is lined up. Dots near the passing line catch its light.
      ctx.fillStyle = `rgba(232, 246, 252, ${alpha * (0.6 + glow * 0.35)})`;
      ctx.beginPath();
      for (const p of shown) {
        if (scanning && Math.abs(p.y - lineY) < band) continue;
        ctx.moveTo(p.x + r, p.y);
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
      if (scanning) {
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        for (const p of shown) {
          if (Math.abs(p.y - lineY) >= band) continue;
          ctx.moveTo(p.x + r * 1.6, p.y);
          ctx.arc(p.x, p.y, r * 1.6, 0, Math.PI * 2);
        }
        ctx.fill();
        const pad = (right - left) * 0.12;
        const line = ctx.createLinearGradient(left - pad, 0, right + pad, 0);
        line.addColorStop(0, "rgba(255,255,255,0)");
        line.addColorStop(0.5, `rgba(255,255,255,${0.85 * alpha})`);
        line.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = line;
        ctx.fillRect(left - pad, lineY - dpr, right - left + pad * 2, 2 * dpr);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [feed, mirrored]);

  return <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
