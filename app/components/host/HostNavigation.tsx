import { Form, Link } from "react-router";

export function HostNavigation({
  user,
  csrfToken,
}: {
  user: { displayName: string; role: string; permissions: string[] };
  csrfToken: string;
}) {
  return (
    <nav className="host-nav" aria-label="Host Portal">
      <div className="host-nav-links">
        <Link to="/host">Dashboard</Link>
        {user.permissions.includes("games:view") ? (
          <Link to="/host/templates">Templates</Link>
        ) : null}
        <Link to="/host/prize-claims">Prize Claims</Link>
        {user.permissions.includes("backups:manage") ? (
          <Link to="/host/backups">Backups</Link>
        ) : null}
        {user.permissions.includes("settings:manage") ? (
          <Link to="/host/settings">Settings</Link>
        ) : null}
        {user.permissions.includes("hosts:manage") ? (
          <Link to="/host/users">Hosts</Link>
        ) : null}
      </div>
      <div className="host-actions">
        <span>
          {user.displayName} · {user.role}
        </span>
        <Form action="/host/logout" method="post">
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <button type="submit">Log out</button>
        </Form>
      </div>
    </nav>
  );
}
