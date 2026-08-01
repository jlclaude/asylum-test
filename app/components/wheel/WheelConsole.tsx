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
      <header className="studio-console-header">
        <div>
          <p>Control console</p>
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
