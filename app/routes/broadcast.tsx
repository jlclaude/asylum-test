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
  return <main className={`production-broadcast state-${state.toLowerCase()}`}>
    <header><AsylumLogo /><div><p>ASYLUM GAMES LIVE</p><h1>{broadcast?.game.title ?? "Broadcast Standby"}</h1></div><div className="broadcast-id"><span>RAFFLE</span><strong>{broadcast?.game.raffleCode ?? "—"}</strong><small>{wheel?.label ?? "Awaiting production"}</small></div></header>
    <section className="broadcast-stage" aria-live="polite">
      {wheel && entries.length ? <div className={`broadcast-wheel ${wheel.status === "SPINNING" ? "is-spinning" : ""}`}><WheelCanvas entries={entries} type={wheel.type} themeKey="classic" rotation={0} spinning={wheel.status === "SPINNING"} duration={null} pointerTick={0} pointerIntensity={wheel.status === "SPINNING" ? 1 : .35} winnerEntryIndex={wheel.winnerEntryIndex} celebrating={wheel.status === "COMPLETED"} /></div> : <div className="broadcast-wait"><span>{broadcast ? "TRANSMISSION READY" : "NO ACTIVE RAFFLE"}</span><strong>{broadcast ? "AWAITING LIVE RAFFLE" : "Open a game in the Host Portal to load Broadcast Mode."}</strong></div>}
      <div className="state-bug">{state.replace("_", " ")}</div>
    </section>
    <section className="broadcast-lower">
      <article className="winner-area"><span>{reward ? "REWARD CHAMBER" : "CURRENT WINNER"}</span><strong>{wheel?.status === "COMPLETED" ? (wheel.winnerDisplayName ?? wheel.winnerValue ?? "Result confirmed") : state === "SPINNING" ? "CONTAINMENT IN PROGRESS" : "READY"}</strong></article>
      <article className="second-area"><span>SECOND CHANCE</span><strong>{broadcast?.secondChance ? [broadcast.secondChance.beforeDisplayName, broadcast.secondChance.afterDisplayName].filter(Boolean).join("  ·  ") : "Pending"}</strong></article>
    </section>
    <footer><span>ASYLUMGAMES.COM</span><span>FACEBOOK · ASYLUM GAMES</span><span>UPCOMING PRIZE · {broadcast?.upcomingPrize ?? "TO BE ANNOUNCED"}</span></footer>
  </main>;
}
