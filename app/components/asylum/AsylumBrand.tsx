import { AsylumLogo } from "./AsylumLogo";

type AsylumBrandProps = {
  compact?: boolean;
  subtitle?: string;
};

export function AsylumBrand({
  compact = false,
  subtitle = "Controlled games. Transparent outcomes.",
}: AsylumBrandProps) {
  return (
    <div
      className={[
        "asylum-brand",
        compact ? "asylum-brand-compact" : "",
      ].join(" ")}
      aria-label="Asylum Games"
    >
      <div className="asylum-brand-mark">
        <AsylumLogo decorative />
      </div>

      <div className="asylum-brand-copy">
        <p className="asylum-brand-name">
          <span>ASYLUM</span>
          <small>GAMES</small>
        </p>

        {!compact ? (
          <p className="asylum-brand-subtitle">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}
