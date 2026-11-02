import { useCallback, useEffect, useRef, useState } from "react";

/** setTimeout helpers whose timers are cancelled automatically when the component goes away. */
export function useTimers() {
  const timers = useRef(new Set<number>());

  useEffect(() => {
    const active = timers.current;
    return () => {
      active.forEach((id) => window.clearTimeout(id));
      active.clear();
    };
  }, []);

  const later = useCallback((callback: () => void, delayMs: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      callback();
    }, delayMs);
    timers.current.add(id);
  }, []);

  const cancelAll = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current.clear();
  }, []);

  return { later, cancelAll };
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window.matchMedia === "function" && window.matchMedia(query).matches);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "LABEL"].includes(target.tagName);
}

/** Space bar shortcut, ignored while typing or when a button already has focus (Space presses that button). */
export function useSpaceKey(action: () => void, enabled: boolean) {
  const latest = useRef(action);
  latest.current = action;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || isTypingTarget(event.target)) return;
      event.preventDefault();
      latest.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

export function useEscapeKey(action: () => void, enabled: boolean) {
  const latest = useRef(action);
  latest.current = action;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") latest.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

/** Presenter mode: hides everything but the main picker and goes full screen where the browser allows it. */
export function usePresenting() {
  const [presenting, setPresenting] = useState(false);

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setPresenting(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  const enter = useCallback(() => {
    setPresenting(true);
    // iPhone Safari has no full screen API for pages; presenter mode still works without it.
    document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);

  const exit = useCallback(() => {
    setPresenting(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  }, []);

  return { presenting, enter, exit };
}
