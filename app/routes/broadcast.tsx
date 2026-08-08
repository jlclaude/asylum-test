import { useEffect } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useRevalidator } from "react-router";
import { AsylumLogo } from "../components/asylum/AsylumLogo";
import { WheelCanvas } from "../components/wheel/WheelCanvas";
import type { WheelEntry } from "../components/wheel/types";
import { getBroadcastState } from "../models/broadcast.server";
import "../styles/wheel-studio.css";
import "../styles/production-broadcast.css";

export const meta: MetaFunction = () => [{ title: "Asylum Games Broadcast" }];
export async function loader({ request }: LoaderFunctionArgs) { const url = new URL(request.url); const gameId = url.searchParams.get("gameId") ?? process.env.BROADCAST_GAME_ID ?? ""; return { broadcast: gameId ? await getBroadcastState(gameId) : null }; }

export default function ProductionBroadcast() {
  const { broadcast } = useLoaderData<typeof loader>(); const revalidator = useRevalidator();
  useEffect(() => { const timer = window.setInterval(() => { if (document.visibilityState === "visible") revalidator.revalidate(); }, 1_000); return () => window.clearInterval(timer); }, [revalidator]);
  const wheel = broadcast?.wheel; const entries: WheelEntry[] = wheel?.entries.map((entry) => entry.displayName !== undefined ? { claimId: "", displayName: entry.displayName } : { value: entry.value ?? "" }) ?? [];
  const state = broadcast?.state ?? "WAITING";
  const reward = wheel?.type === "VALUE";
  const persistedResult = wheel?.status === "COMPLETED" ? (wheel.winnerDisplayName ?? wheel.winnerValue) : null;
  const secondChanceNames = broadcast?.secondChance ? [broadcast.secondChance.beforeDisplayName, broadcast.secondChance.afterDisplayName].filter((name): name is string => Boolean(name)) : [];
  return <main className={`production-broadcast state-${state.toLowerCase()}`}>
    <header className="broadcast-header">
      <div className="header-identity"><span>RAFFLE CODE</span><strong>{broadcast?.game.raffleCode ?? "—"}</strong><small>{broadcast?.game.title ?? "Broadcast Standby"}</small></div>
      <AsylumLogo className="broadcast-brand-logo" />
      <div className="header-wheel"><span>CURRENT WHEEL</span><strong>{wheel?.label ?? "Awaiting production"}</strong><small>{entries.length ? `${entries.length} entries` : "No entries loaded"}</small></div>
    </header>
    <section className="broadcast-main" aria-live="polite">
      <aside className="broadcast-status-panel">
        <div><span>CURRENT STATUS</span><strong>{state.replace("_", " ")}</strong></div>
        <div><span>{reward ? "CURRENT REWARD" : "CURRENT WINNER"}</span><strong>{persistedResult ?? (state === "SPINNING" ? "IN PROGRESS" : "WAITING")}</strong></div>
        <div className="compact-second-chance"><span>SECOND CHANCE</span>{secondChanceNames.length ? secondChanceNames.map((name, index) => <strong key={`${name}-${index}`}>{name}</strong>) : <strong>WAITING</strong>}</div>
      </aside>
      <section className="broadcast-stage">
        {wheel && entries.length ? <div className={`broadcast-wheel ${wheel.status === "SPINNING" ? "is-spinning" : ""}`}><WheelCanvas entries={entries} type={wheel.type} themeKey="classic" rotation={0} spinning={wheel.status === "SPINNING"} duration={null} pointerTick={0} pointerIntensity={wheel.status === "SPINNING" ? 1 : .35} winnerEntryIndex={wheel.winnerEntryIndex} celebrating={wheel.status === "COMPLETED"} /></div> : <div className="broadcast-wait"><span>{broadcast ? "TRANSMISSION READY" : "NO ACTIVE RAFFLE"}</span><strong>{broadcast ? "AWAITING LIVE RAFFLE" : "Open a game in the Host Portal to load Broadcast Mode."}</strong></div>}
        {persistedResult ? <div className="broadcast-result"><span>{reward ? "REWARD CHAMBER RESULT" : "WINNER"}</span><strong>{persistedResult}</strong></div> : null}
      </section>
      <aside className="broadcast-next-panel"><span>UP NEXT</span><strong>{broadcast?.upcomingPrize ?? "TO BE ANNOUNCED"}</strong><small>{reward ? "REWARD CHAMBER" : "ASYLUM GAMES LIVE"}</small></aside>
    </section>
    <footer><span>ASYLUMGAMES.COM</span><span>FACEBOOK · ASYLUM GAMES</span><span>UPCOMING PRIZE · {broadcast?.upcomingPrize ?? "TO BE ANNOUNCED"}</span></footer>
  </main>;
}
