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
      <div className="asylum-brand-mark" aria-hidden="true">
        <span className="asylum-brand-bars" />
        <strong>A</strong>
        <span className="asylum-brand-bolt asylum-brand-bolt-one" />
        <span className="asylum-brand-bolt asylum-brand-bolt-two" />
        <span className="asylum-brand-bolt asylum-brand-bolt-three" />
        <span className="asylum-brand-bolt asylum-brand-bolt-four" />
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
