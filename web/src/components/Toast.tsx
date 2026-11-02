import { useEffect } from "react";

export type ToastState = {
  id: number;
  message: string;
  undo?: () => void;
} | null;

type ToastProps = {
  toast: ToastState;
  theme: "dark" | "light";
  onDismiss: () => void;
};

export default function Toast({ toast, theme, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(onDismiss, toast.undo ? 7000 : 4000);
    return () => window.clearTimeout(id);
  }, [toast, onDismiss]);

  return (
    <div className={`toast-region theme-${theme}`} role="status" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.id}>
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              className="toast-undo"
              onClick={() => {
                toast.undo?.();
                onDismiss();
              }}
            >
              Undo
            </button>
          )}
          <button className="toast-close" onClick={onDismiss} aria-label="Dismiss message">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
