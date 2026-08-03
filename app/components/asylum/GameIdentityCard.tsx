type GameIdentityCardProps = {
  title: string;
  raffleCode: string;
  status: string;
  nameWheelCount: number;
  totalEntries?: number;
  themeLabel: string;
};

export function GameIdentityCard({
  title,
  raffleCode,
  status,
  nameWheelCount,
  totalEntries,
  themeLabel,
}: GameIdentityCardProps) {
  return (
    <section className="asylum-identity-card" aria-label="Game identity">
      <div className="asylum-identity-hazard" />

      <div className="asylum-identity-body">
        <div>
          <p className="asylum-identity-kicker">Authorized game session</p>
          <h2>{title}</h2>
          <strong>Raffle Number: {raffleCode}</strong>
          <p className="asylum-identity-code">
            ASYLUM CONTROL PROTOCOL · {themeLabel.toUpperCase()}
          </p>
        </div>

        <dl className="asylum-identity-stats">
          <div>
            <dt>Status</dt>
            <dd>{status.replace("_", " ")}</dd>
          </div>
          <div>
            <dt>Containment wheels</dt>
            <dd>{nameWheelCount}</dd>
          </div>
          <div>
            <dt>Total wheels</dt>
            <dd>{nameWheelCount + 1}</dd>
          </div>
          {typeof totalEntries === "number" ? (
            <div>
              <dt>Frozen entries</dt>
              <dd>{totalEntries}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </section>
  );
}
