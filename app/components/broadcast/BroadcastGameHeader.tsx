import { AsylumBrand } from "../asylum/AsylumBrand";

export function BroadcastGameHeader({ title, status }: { title: string; status: string }) {
  return (
    <header className="broadcast-header">
      <AsylumBrand />
      <div><span>LIVE CONTAINMENT BROADCAST</span><h1>{title}</h1></div>
      <div className="broadcast-system"><small>System status</small><strong>{status.replace("_", " ")}</strong></div>
    </header>
  );
}
