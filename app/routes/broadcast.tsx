import { useEffect, useMemo, useRef, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useRevalidator } from "react-router";
import { AsylumLogo } from "../components/asylum/AsylumLogo";
import { WheelCanvas } from "../components/wheel/WheelCanvas";
import type { WheelEntry } from "../components/wheel/types";
import { getBroadcastState } from "../models/broadcast.server";
import "../styles/wheel-studio.css";
import "../styles/production-broadcast.css";

export const meta: MetaFunction = () => [{ title: "Asylum Games Broadcast" }];
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url); const gameId = url.searchParams.get("gameId") ?? process.env.BROADCAST_GAME_ID ?? "";
  if (!gameId) return { broadcast: null, error: "NO_ACTIVE_GAME" as const };
  try { const broadcast = await getBroadcastState(gameId); return { broadcast, error: broadcast ? null : "GAME_NOT_FOUND" as const }; }
  catch { return { broadcast: null, error: "UNAVAILABLE" as const }; }
}

type BroadcastPayload = Awaited<ReturnType<typeof getBroadcastState>>;
type HealthBridge = { reportHealth(value: { state: string; gameState: string | null; raffleCode: string | null; wheelLabel: string | null; status: "live" | "waiting" | "error"; message: string | null }): void };

export default function ProductionBroadcast() {
  const data = useLoaderData<typeof loader>(); const revalidator = useRevalidator();
  const [lastKnown, setLastKnown] = useState<BroadcastPayload>(data.broadcast); const failures = useRef(0);
  useEffect(() => { if (data.broadcast) { setLastKnown(data.broadcast); failures.current = 0; } else if (data.error === "UNAVAILABLE") failures.current = Math.min(failures.current + 1, 5); }, [data]);
  useEffect(() => {
    const delay = data.error === "UNAVAILABLE" ? Math.min(1_000 * 2 ** failures.current, 15_000) : 1_000;
    const timer = window.setTimeout(() => { if (document.visibilityState === "visible" && revalidator.state === "idle") void revalidator.revalidate(); }, delay);
    return () => window.clearTimeout(timer);
  }, [data, revalidator]);
  useEffect(() => { const resume = () => { if (document.visibilityState === "visible" && revalidator.state === "idle") void revalidator.revalidate(); }; document.addEventListener("visibilitychange", resume); return () => document.removeEventListener("visibilitychange", resume); }, [revalidator]);
  const broadcast = data.broadcast ?? lastKnown; const connectionLost = data.error === "UNAVAILABLE";
  const wheel = broadcast?.wheel; const entriesKey = JSON.stringify(wheel?.entries ?? []);
  const entries: WheelEntry[] = useMemo(() => (JSON.parse(entriesKey) as Array<{ displayName?: string; value?: string | null }>).map((entry) => entry.displayName !== undefined ? { claimId: "", displayName: entry.displayName } : { value: entry.value ?? "" }), [entriesKey]);
  const state = broadcast?.state ?? (connectionLost ? "ERROR" : "WAITING"); const reward = wheel?.type === "VALUE";
  const persistedResult = wheel?.status === "COMPLETED" ? (wheel.winnerDisplayName ?? wheel.winnerValue) : null;
  const secondChanceNames = broadcast?.secondChance ? [broadcast.secondChance.beforeDisplayName, broadcast.secondChance.afterDisplayName].filter((name): name is string => Boolean(name)) : [];
  useEffect(() => { const bridge = (window as typeof window & { asylumBroadcastDesktop?: HealthBridge }).asylumBroadcastDesktop; bridge?.reportHealth({ state, gameState: broadcast?.game.status ?? null, raffleCode: broadcast?.game.raffleCode ?? null, wheelLabel: wheel?.label ?? null, status: connectionLost ? "error" : broadcast ? "live" : "waiting", message: connectionLost ? "Server connection lost" : data.error }); }, [broadcast, connectionLost, data.error, state, wheel?.label]);
  const wheelVisible = Boolean(wheel && entries.length && state !== "WAITING");
  return <main className={`production-broadcast state-${state.toLowerCase()}`}>
    <div className="broadcast-safe-zone" aria-hidden="true" />
    <header className="broadcast-header">
      <div className="header-identity"><span>RAFFLE CODE</span><strong>{broadcast?.game.raffleCode ?? "—"}</strong><small>{broadcast?.game.title ?? "Broadcast Standby"}</small></div>
      <AsylumLogo className="broadcast-brand-logo" />
      <div className="header-wheel"><span>CURRENT WHEEL</span><strong>{wheel?.label ?? "Awaiting production"}</strong><small>{entries.length ? `${entries.length} entries` : "No entries loaded"}</small></div>
    </header>
    <section className="broadcast-main" aria-live="polite">
      {state === "WAITING" ? <section className="broadcast-state-card waiting-card"><AsylumLogo className="waiting-logo" /><span>ASYLUM GAMES</span><strong>Raffle {broadcast?.game.raffleCode ?? "—"}</strong><h1>{data.error === "NO_ACTIVE_GAME" ? "SELECT AN ACTIVE RAFFLE" : data.error === "GAME_NOT_FOUND" ? "BROADCAST TEMPORARILY UNAVAILABLE" : "WAITING TO BEGIN"}</h1><small>{data.error ? "Retrying…" : "Drawing starting soon"}</small></section> : null}
      {state === "COMPLETED" ? <section className="broadcast-state-card completed-card"><span>RAFFLE COMPLETE</span><h1>{broadcast?.game.raffleCode}</h1><div><p>MAIN WINNER<strong>{broadcast?.completed.mainWinner ?? "—"}</strong></p><p>SECOND CHANCE<strong>{secondChanceNames.join(" · ") || "—"}</strong></p><p>REWARD CHAMBER<strong>{broadcast?.completed.reward ?? "—"}</strong></p></div></section> : null}
      {state !== "WAITING" && state !== "COMPLETED" ? <>
        <aside className="broadcast-status-panel">
          <div><span>CURRENT STATUS</span><strong>{state === "READY" ? "READY TO SPIN" : state.replace("_", " ")}</strong></div>
          {persistedResult ? <div><span>{reward ? "CURRENT REWARD" : "CURRENT WINNER"}</span><strong>{persistedResult}</strong></div> : null}
          {secondChanceNames.length ? <div className="compact-second-chance"><span>SECOND CHANCE</span>{secondChanceNames.map((name, index) => <strong key={`${name}-${index}`}>{name}</strong>)}</div> : null}
        </aside>
        <section className="broadcast-stage">
          {wheelVisible ? <div className={`broadcast-wheel ${state === "SPINNING" ? "is-spinning" : ""}`}><WheelCanvas entries={entries} type={wheel!.type} themeKey="classic" rotation={0} spinning={state === "SPINNING"} duration={null} pointerTick={0} pointerIntensity={state === "SPINNING" ? 1 : .35} winnerEntryIndex={wheel!.winnerEntryIndex} celebrating={wheel!.status === "COMPLETED"} /></div> : null}
          {state === "SPINNING" ? <div className="spinning-bug">SPINNING</div> : null}
          {persistedResult ? <div className="broadcast-result"><span>{reward ? "REWARD CHAMBER RESULT" : "WINNER"}</span><strong>{persistedResult}</strong></div> : null}
        </section>
        <aside className="broadcast-next-panel"><span>UP NEXT</span><strong>{broadcast?.upcomingPrize ?? "TO BE ANNOUNCED"}</strong><small>{reward ? "REWARD CHAMBER" : "ASYLUM GAMES LIVE"}</small></aside>
      </> : null}
    </section>
    {connectionLost ? <div className="broadcast-connection-overlay"><strong>BROADCAST TEMPORARILY UNAVAILABLE</strong><span>Connection lost · Retrying…</span></div> : null}
    <footer><span>ASYLUMGAMES.COM</span><span>FACEBOOK · ASYLUM GAMES</span><span>UPCOMING PRIZE · {broadcast?.upcomingPrize ?? "TO BE ANNOUNCED"}</span></footer>
  </main>;
}
