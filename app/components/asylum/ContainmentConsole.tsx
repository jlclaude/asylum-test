import type { ReactNode } from "react";

type ContainmentConsoleProps = {
  label: string;
  status: string;
  children: ReactNode;
};

export function ContainmentConsole({
  label,
  status,
  children,
}: ContainmentConsoleProps) {
  return (
    <aside className="containment-console">
      <header className="containment-console-header">
        <div>
          <p>Operator control</p>
          <h4>{label}</h4>
        </div>

        <span className="containment-console-status">
          <i aria-hidden="true" />
          {status}
        </span>
      </header>

      <div className="containment-console-scan" aria-hidden="true" />

      <div className="containment-console-body">{children}</div>

      <footer className="containment-console-footer">
        <span>ASYLUM SYSTEM ONLINE</span>
        <span aria-hidden="true">◆ ◆ ◆</span>
      </footer>
    </aside>
  );
}
