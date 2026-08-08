import { useEffect, useMemo, useRef, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useRevalidator } from "react-router";
import { BroadcastPresentation } from "../components/broadcast/BroadcastPresentation";
import { WheelCanvas } from "../components/wheel/WheelCanvas";
import type { WheelEntry } from "../components/wheel/types";
import { getBroadcastState } from "../models/broadcast.server";
import "../styles/wheel-studio.css";
import "../styles/production-broadcast.css";
import "../styles/broadcast-presentation.css";

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
  const waitingMessage = data.error === "NO_ACTIVE_GAME" ? "SELECT AN ACTIVE RAFFLE" : data.error === "GAME_NOT_FOUND" ? "BROADCAST TEMPORARILY UNAVAILABLE" : "WAITING TO BEGIN";
  return <main className={`production-broadcast state-${state.toLowerCase()}`}><BroadcastPresentation
    healthState={state}
    info={{ gameTitle: broadcast?.game.title ?? "Broadcast Standby", raffleCode: broadcast?.game.raffleCode ?? "—", gameStatus: broadcast?.game.status ?? "WAITING", wheelLabel: wheel?.label ?? null, wheelSequence: null, wheelStatus: state === "READY" ? "READY TO SPIN" : state, entryCount: entries.length, winner: !reward ? persistedResult : null, secondChance: secondChanceNames.map((name, index) => ({ label: index === 0 ? "BEFORE" : "AFTER", value: name })), upNext: broadcast?.upcomingPrize ?? null, reward: broadcast?.completed.reward ?? (reward ? persistedResult : null), bonus: broadcast?.upcomingPrize ?? null, spinning: state === "SPINNING" }}
    wheel={wheelVisible ? <div className="broadcast-readonly-wheel"><WheelCanvas entries={entries} type={wheel!.type} themeKey="classic" rotation={0} spinning={state === "SPINNING"} duration={null} pointerTick={0} pointerIntensity={state === "SPINNING" ? 1 : .35} winnerEntryIndex={wheel!.winnerEntryIndex} celebrating={wheel!.status === "COMPLETED"} /></div> : <section className="broadcast-readonly-message"><strong>{waitingMessage}</strong><span>{data.error ? "Retrying…" : "Drawing starting soon"}</span></section>}
    overlay={connectionLost ? <div className="broadcast-connection-overlay"><strong>BROADCAST TEMPORARILY UNAVAILABLE</strong><span>Connection lost · Retrying…</span></div> : null}
  /></main>;
}
