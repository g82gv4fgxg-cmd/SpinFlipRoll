import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useEscapeKey } from "../hooks";
import Icon from "./Icon";

type DialogProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

export default function Dialog({ title, onClose, children, className = "" }: DialogProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose, true);

  useEffect(() => {
    const first = bodyRef.current?.querySelector<HTMLElement>("input, textarea, select, button");
    first?.focus();
  }, []);

  return (
    <div className="dialog-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`dialog ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="dialog-header">
          <h2>{title}</h2>
          <button className="dialog-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="dialog-body" ref={bodyRef}>
          {children}
        </div>
      </section>
    </div>
  );
}
