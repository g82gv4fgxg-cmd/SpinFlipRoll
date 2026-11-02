import type { KeyboardEvent } from "react";

/** Runs `action` on Enter, ignoring the Enter that confirms text in an input method editor (e.g. Japanese). */
export function onEnter(action: () => void) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) action();
  };
}

export function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur();
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the older copy method.
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}
