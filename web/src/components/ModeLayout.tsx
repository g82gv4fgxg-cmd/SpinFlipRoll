import type { ReactNode } from "react";
import { useEscapeKey } from "../hooks";
import type { usePresenting } from "../hooks";
import type { Shell } from "../shell";
import Icon from "./Icon";

type ModeLayoutProps = {
  shell: Shell;
  className: string;
  subtitle: string;
  sidebar: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  /** A dialog or winner card; everything behind it becomes unreachable while it's open. */
  overlay?: ReactNode;
  presenter: ReturnType<typeof usePresenting>;
  children: ReactNode;
};

/** The sidebar + top bar + panels layout shared by the wheel, coin and dice screens. */
export default function ModeLayout({
  shell,
  className,
  subtitle,
  sidebar,
  title,
  actions,
  overlay,
  presenter,
  children,
}: ModeLayoutProps) {
  const blocked = Boolean(overlay) || undefined;
  useEscapeKey(presenter.exit, presenter.presenting && !overlay);

  return (
    <main className={`app ${className} theme-${shell.theme}${presenter.presenting ? " presenting" : ""}`}>
      <aside className="sidebar" inert={blocked}>
        <div className="brand">
          <button className="brand-mark" onClick={shell.goHome} aria-label="Back to picker modes">
            SFR
          </button>
          <div>
            <h1>SpinFlipRoll</h1>
            <p>{subtitle}</p>
          </div>
        </div>
        {sidebar}
      </aside>

      <section className="workspace" inert={blocked}>
        <header className="topbar">
          {title}
          <div className="top-actions">
            <div className="icon-actions">
              <button
                className="icon-toggle"
                onClick={shell.toggleSound}
                aria-label="Sound"
                aria-pressed={shell.soundOn}
                title={shell.soundOn ? "Sound on" : "Sound off"}
              >
                <Icon name={shell.soundOn ? "sound-on" : "sound-off"} />
              </button>
              <button
                className="icon-toggle"
                onClick={shell.toggleTheme}
                aria-label={shell.theme === "dark" ? "Light mode" : "Dark mode"}
                title={shell.theme === "dark" ? "Light mode" : "Dark mode"}
              >
                <Icon name={shell.theme === "dark" ? "sun" : "moon"} />
              </button>
              <button className="icon-toggle" onClick={presenter.enter} aria-label="Presenter mode" title="Presenter mode">
                <Icon name="expand" />
              </button>
            </div>
            <button onClick={shell.goHome}>Modes</button>
            {actions}
          </div>
        </header>

        <div className="main-grid">{children}</div>
      </section>

      {presenter.presenting && (
        <button className="exit-present" onClick={presenter.exit} inert={blocked}>
          <Icon name="close" size={18} /> Exit presenter mode
        </button>
      )}
      {overlay}
    </main>
  );
}
