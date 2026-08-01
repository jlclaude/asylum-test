import type { ReactNode } from "react";

type WheelConsoleProps = {
  label: string;
  status: string;
  children: ReactNode;
};

export function WheelConsole({
  label,
  status,
  children,
}: WheelConsoleProps) {
  return (
    <aside className="studio-console">
      <span className="studio-console-bolt studio-console-bolt-nw" aria-hidden="true" />
      <span className="studio-console-bolt studio-console-bolt-ne" aria-hidden="true" />
      <span className="studio-console-bolt studio-console-bolt-sw" aria-hidden="true" />
      <span className="studio-console-bolt studio-console-bolt-se" aria-hidden="true" />

      <header className="studio-console-header">
        <div>
          <p>Operator control machine</p>
          <h3>{label}</h3>
        </div>

        <span className="studio-console-status">
          <i aria-hidden="true" />
          {status}
        </span>
      </header>

      <div className="studio-console-scanner" aria-hidden="true" />

      <div className="studio-console-content">{children}</div>

      <footer className="studio-console-footer">
        <span>CONTAINMENT LINK ACTIVE</span>
        <span aria-hidden="true">◆ ◆ ◆</span>
      </footer>
    </aside>
  );
}
