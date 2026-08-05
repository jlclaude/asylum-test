import { Link } from "react-router";

export function HostErrorPage({ title = "Host Portal Error", message }: { title?: string; message: string }) {
  return <main className="host-page host-error-page"><section className="host-card"><p className="host-kicker">Asylum containment system</p><h1>{title}</h1><p className="host-message host-error" role="alert">{message}</p><Link className="host-link" to="/host">Return to Host Portal</Link></section></main>;
}
