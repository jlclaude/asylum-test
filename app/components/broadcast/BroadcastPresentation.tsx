import { useEffect, type ReactNode } from "react";
import { AsylumLogo } from "../asylum/AsylumLogo";

export type BroadcastPresentationInfo = {
  gameTitle: string;
  raffleCode: string;
  gameStatus: string;
  wheelLabel: string | null;
  wheelSequence: string | null;
  wheelStatus: string;
  entryCount: number;
  winner: string | null;
  secondChance: Array<{ label: string; value: string }>;
  upNext: string | null;
  reward: string | null;
  bonus: string | null;
  spinning: boolean;
};

type HealthBridge = { reportHealth(value: { state: string; gameState: string | null; raffleCode: string | null; wheelLabel: string | null; status: "live"; message: null }): void };

export function BroadcastPresentation({ info, healthState, wheel, operatorTools, resultAction, overlay }: { info: BroadcastPresentationInfo; healthState: string; wheel: ReactNode; operatorTools?: ReactNode; resultAction?: ReactNode; overlay?: ReactNode }) {
  useEffect(() => { (window as typeof window & { asylumBroadcastDesktop?: HealthBridge }).asylumBroadcastDesktop?.reportHealth({ state: healthState, gameState: info.gameStatus, raffleCode: info.raffleCode, wheelLabel: info.wheelLabel, status: "live", message: null }); }, [healthState, info.gameStatus, info.raffleCode, info.wheelLabel]);
  return (
    <section className={`broadcast-presentation${info.spinning ? " is-spinning" : ""}`}>
      <AsylumLogo className="broadcast-presentation-watermark" decorative />
      <header className="broadcast-presentation-header">
        <div><span>RAFFLE CODE</span><strong>{info.raffleCode}</strong><small>{info.gameTitle}</small></div>
        <AsylumLogo className="broadcast-presentation-logo" />
        <div className="broadcast-presentation-heading-right"><span>CURRENT WHEEL</span><strong>{info.wheelLabel ?? "Awaiting production"}</strong><small>{info.wheelSequence ? `WHEEL ${info.wheelSequence}` : info.gameStatus.replace("_", " ")}</small></div>
      </header>
      {operatorTools ? <div className="broadcast-operator-tools">{operatorTools}</div> : null}
      <main className="broadcast-presentation-main">
        <aside className="broadcast-information-column broadcast-information-left">
          <article><span>CURRENT STATUS</span><strong>{info.wheelStatus.replace("_", " ")}</strong></article>
          <article><span>CURRENT WINNER</span><strong>{info.winner ?? "WAITING"}</strong></article>
          <article><span>SECOND CHANCE</span>{info.secondChance.length ? info.secondChance.map((item) => <p key={`${item.label}-${item.value}`}><small>{item.label}</small><strong>{item.value}</strong></p>) : <strong>PENDING</strong>}</article>
          {resultAction ? <div className="broadcast-result-action">{resultAction}</div> : null}
        </aside>
        <div className="broadcast-presentation-wheel">{wheel}</div>
        <aside className="broadcast-information-column broadcast-information-right">
          <article><span>CURRENT WHEEL</span><strong>{info.wheelLabel ?? "PENDING"}</strong></article>
          <article><span>ENTRIES</span><strong>{info.entryCount || "—"}</strong></article>
          <article><span>UP NEXT</span><strong>{info.upNext ?? "TO BE ANNOUNCED"}</strong></article>
          <article><span>REWARD CHAMBER</span><strong>{info.reward ?? "WAITING"}</strong></article>
        </aside>
      </main>
      {overlay}
      <footer className="broadcast-presentation-footer"><span>ASYLUMGAMES.COM</span><span>FACEBOOK · ASYLUM GAMES</span><span>BONUS PRIZE · {info.bonus ?? "TO BE ANNOUNCED"}</span></footer>
    </section>
  );
}
