import { useEffect, useRef } from "react";
import type { RefObject } from "react";

export type CanvasSize = { width: number; height: number; dpr: number };

/** Matches the canvas's pixel size to its on-screen size (capped at 2x for speed). */
export function fitCanvas(canvas: HTMLCanvasElement): CanvasSize {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return { width: Math.max(1, rect.width), height: Math.max(1, rect.height), dpr };
}

/** Calls `onResize` with the new size whenever the canvas changes size. */
export function useCanvasSize(ref: RefObject<HTMLCanvasElement | null>, onResize: (size: CanvasSize) => void) {
  const latest = useRef(onResize);
  latest.current = onResize;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => latest.current(fitCanvas(canvas)));
    observer.observe(canvas);
    latest.current(fitCanvas(canvas));
    return () => observer.disconnect();
  }, [ref]);
}

/** A requestAnimationFrame loop that runs only while `tick` returns true. */
export function useAnimationLoop(tick: (now: number) => boolean) {
  const latest = useRef(tick);
  latest.current = tick;
  const frame = useRef(0);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      // Reset, or a remount (React Strict Mode does one in development) would think a loop is still running.
      frame.current = 0;
    },
    []
  );

  return () => {
    if (frame.current) return;
    const loop = (now: number) => {
      frame.current = 0;
      if (latest.current(now)) frame.current = requestAnimationFrame(loop);
    };
    frame.current = requestAnimationFrame(loop);
  };
}

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function css(colour: Rgb, alpha = 1): string {
  return `rgba(${Math.round(colour[0])}, ${Math.round(colour[1])}, ${Math.round(colour[2])}, ${alpha})`;
}

export const lighten = (hex: string, t: number) => css(mixRgb(hexToRgb(hex), [255, 255, 255], t));
export const darken = (hex: string, t: number) => css(mixRgb(hexToRgb(hex), [0, 0, 0], t));
