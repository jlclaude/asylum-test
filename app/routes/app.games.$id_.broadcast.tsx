import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useLoaderData, useLocation, useRevalidator } from "react-router";

import { BroadcastCompletion } from "../components/broadcast/BroadcastCompletion";
import { BroadcastPresentation } from "../components/broadcast/BroadcastPresentation";
import { BroadcastResultAcceptance } from "../components/broadcast/BroadcastResultAcceptance";
import { GameModeShortcuts } from "../components/wheel/GameModeShortcuts";
import { GameModeToolbar } from "../components/wheel/GameModeToolbar";
import { WheelSection } from "../components/wheel/WheelSection";
import type { WheelActionData, WheelData, WheelOperatorAction, WheelOperatorHandle, WheelOperatorResult, WheelOperatorState } from "../components/wheel/types";
import { useFullscreen } from "../hooks/useFullscreen";
import { useGameModeShortcuts } from "../hooks/useGameModeShortcuts";
import { useSoundPreference } from "../hooks/useSoundPreference";
import { useWheelMusicSession } from "../hooks/useWheelMusicSession";
import { ASYLUM_THEMES, type AsylumThemeKey } from "../lib/asylum-themes";
import { adjacentWheelId, defaultBroadcastActiveWheelId, nextUnfinishedWheelId } from "../lib/game-mode-operator";
import { secondChanceResultForWheel } from "../lib/second-chance";
import { stopAllWheelMusic } from "../lib/wheel-music";
import { action as gameModeAction, loader as gameModeLoader } from "./app.games.$id_.play";

import "../styles/asylum-brand.css";
import "../styles/game-results.css";
import "../styles/wheel-studio.css";
import "../styles/broadcast-mode.css";
import "../styles/broadcast-presentation.css";

export const loader = gameModeLoader;
export const action = gameModeAction;
export { ErrorBoundary } from "./app.games.$id_.play";

export default function BroadcastModePage() {
  const location = useLocation();
  const routeBase = location.pathname.startsWith("/host/") ? "/host" as const : "/app" as const;
  const { game, run, results, secondChance, csrfToken } = useLoaderData<typeof loader>();
  useWheelMusicSession(`game:${game.id}:broadcast`);
  const fullscreenTarget = useRef<HTMLElement>(null);
  const wheelRef = useRef<WheelOperatorHandle>(null);
  const acceptFetcher = useFetcher<WheelActionData>();
  const revalidator = useRevalidator();
  const handledStaleAcceptance = useRef<WheelActionData | null>(null);
  const [themeKey, setThemeKey] = useState<AsylumThemeKey>("classic");
  const [message, setMessage] = useState<string | null>(null);
  const [operatorState, setOperatorState] = useState<WheelOperatorState | null>(null);
  const wheels = useMemo(() => (run?.rounds.flatMap((round) => round.wheels) ?? []) as WheelData[], [run]);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(() => new Set(wheels.filter((wheel) => wheel.resultAcceptedAt).map((wheel) => wheel.id)));
  const acceptedIdsRef = useRef(new Set(wheels.filter((wheel) => wheel.resultAcceptedAt).map((wheel) => wheel.id)));
  const [finalResultAccepted, setFinalResultAccepted] = useState(
    () => wheels.length > 0 && wheels.every((wheel) => wheel.status === "COMPLETED" && Boolean(wheel.resultAcceptedAt)),
  );
  const [activeId, setActiveId] = useState<string | null>(() => defaultBroadcastActiveWheelId(wheels));
  const activeWheel = wheels.find((wheel) => wheel.id === activeId) ?? wheels[0] ?? null;
  const { muted, toggleMuted } = useSoundPreference();
  const { isFullscreen, toggleFullscreen } = useFullscreen(fullscreenTarget);

  const acceptResult = useCallback((wheelId: string) => {
    if (acceptedIdsRef.current.has(wheelId)) return;
    acceptFetcher.submit({ intent: "accept-result", wheelId, ...(csrfToken ? { csrfToken } : {}) }, { method: "post" });
  }, [acceptFetcher, csrfToken]);

  useEffect(() => {
    const response = acceptFetcher.data;
    if (!response || acceptFetcher.state !== "idle") return;
    if (response.stale) {
      if (handledStaleAcceptance.current !== response) {
        handledStaleAcceptance.current = response;
        revalidator.revalidate();
        setMessage(response.error ?? "This wheel changed in another session. The latest state has been loaded.");
      }
      return;
    }
    if (response.intent !== "accept-result" || !response.success || !response.wheelId) return;
    const wheelId = response.wheelId;
    if (acceptedIdsRef.current.has(wheelId)) return;
    acceptedIdsRef.current.add(wheelId);
    setAcceptedIds((current) => new Set(current).add(wheelId));
    const nextId = nextUnfinishedWheelId(wheels, wheelId);
    if (nextId) {
      setOperatorState(null);
      setActiveId(nextId);
      setMessage(`${wheels.find((wheel) => wheel.id === nextId)?.label ?? "Next wheel"} selected.`);
    } else {
      setFinalResultAccepted(true);
      setMessage("All persisted results accepted.");
    }
  }, [acceptFetcher.data, acceptFetcher.state, revalidator, wheels]);

  const runAction = useCallback((operatorAction: WheelOperatorAction): WheelOperatorResult => (
    wheelRef.current?.runAction(operatorAction) ?? { triggered: false, message: "Active wheel controls are unavailable." }
  ), []);

  const navigateWheel = useCallback((direction: 1 | -1): WheelOperatorResult => {
    if (operatorState?.spinning) return { triggered: false, message: "Wheel is currently spinning." };
    const id = adjacentWheelId(wheels.map((wheel) => wheel.id), activeId, direction);
    if (!id) return { triggered: false, message: "No wheel is available." };
    setActiveId(id);
    return { triggered: true, message: `${wheels.find((wheel) => wheel.id === id)?.label ?? "Wheel"} selected.` };
  }, [activeId, operatorState?.spinning, wheels]);

  const toggleBroadcastFullscreen = useCallback(() => {
    void toggleFullscreen().then((success) => {
      if (!success) setMessage("Fullscreen is unavailable in this browser.");
    });
    return { triggered: true, message: "Fullscreen command requested." };
  }, [toggleFullscreen]);

  const shortcutHandlers = useMemo(() => ({
    shuffle: () => runAction("shuffle-wheel"),
    selectDuration: () => runAction("select-duration"),
    spin: () => runAction("spin-wheel"),
    nextWheel: () => navigateWheel(1),
    previousWheel: () => navigateWheel(-1),
    releaseFocus: () => ({ triggered: true, message: "Operator focus released." }),
    toggleFullscreen: toggleBroadcastFullscreen,
    toggleSound: () => {
      toggleMuted();
      return { triggered: true, message: muted ? "Wheel effects enabled." : "Wheel effects muted." };
    },
    showMessage: setMessage,
  }), [muted, navigateWheel, runAction, toggleBroadcastFullscreen, toggleMuted]);
  useGameModeShortcuts(shortcutHandlers);

  const theme = ASYLUM_THEMES[themeKey];
  const variables = {
    "--theme-page": theme.pageBackground,
    "--theme-panel": theme.panel,
    "--theme-border": theme.panelBorder,
    "--theme-primary": theme.primary,
    "--theme-primary-dark": theme.primaryDark,
    "--theme-wheel-dark": theme.wheelDark,
    "--theme-text": theme.text,
    "--theme-muted": theme.muted,
    "--theme-value": theme.valuePrimary,
  } as React.CSSProperties;
  const activeIndex = activeWheel ? wheels.indexOf(activeWheel) : -1;
  const nextWheel = activeIndex >= 0 ? wheels.slice(activeIndex + 1).find((wheel) => wheel.status !== "COMPLETED") ?? null : null;
  const rewardWheel = [...wheels].reverse().find((wheel) => wheel.type === "VALUE" && wheel.status === "COMPLETED" && wheel.winnerValue) ?? null;
  const activeResult = activeWheel?.winnerDisplayName ?? activeWheel?.winnerValue ?? null;
  const secondChanceItems = secondChance ? [
    ...(secondChance.beforeDisplayName ? [{ label: `−${game.secondChanceOffset} OFFSET`, value: secondChance.beforeDisplayName }] : []),
    ...(secondChance.afterDisplayName ? [{ label: `+${game.secondChanceOffset} OFFSET`, value: secondChance.afterDisplayName }] : []),
  ] : [];
  const triggerOperatorAction = (operatorAction: WheelOperatorAction) => { const response = runAction(operatorAction); if (response.message) setMessage(response.message); };

  return (
    <main ref={fullscreenTarget} className="studio-page broadcast-page" style={variables}>
      <BroadcastPresentation
        healthState={finalResultAccepted ? "COMPLETED" : activeWheel?.type === "VALUE" && activeWheel.status !== "READY" ? "REWARD_CHAMBER" : activeWheel?.status === "SPINNING" || operatorState?.spinning ? "SPINNING" : activeWheel?.status === "COMPLETED" ? secondChanceItems.length ? "SECOND_CHANCE" : "WINNER" : activeWheel ? "READY" : "WAITING"}
        info={{ gameTitle: game.title, raffleCode: game.raffleCode, gameStatus: game.status, wheelLabel: activeWheel?.label ?? null, wheelSequence: activeWheel ? `${activeIndex + 1} / ${wheels.length}` : null, wheelStatus: operatorState?.spinning ? "SPINNING" : activeWheel?.status ?? "WAITING", entryCount: activeWheel?.entries.length ?? 0, winner: activeWheel?.type === "NAME" ? activeResult : null, secondChance: secondChanceItems, upNext: nextWheel?.label ?? null, reward: rewardWheel?.winnerValue ?? (activeWheel?.type === "VALUE" ? activeResult : null), bonus: nextWheel?.label ?? null, spinning: operatorState?.spinning ?? activeWheel?.status === "SPINNING" }}
        operatorTools={<>
          <div className="broadcast-toolbar"><a href={`${routeBase}/games/${game.id}/play`} onClick={stopAllWheelMusic}>← Normal Game Mode</a><select value={themeKey} onChange={(event) => setThemeKey(event.target.value as AsylumThemeKey)} aria-label="Asylum theme">{Object.values(ASYLUM_THEMES).map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></div>
          <div className="broadcast-operator-actions"><button type="button" onClick={() => { const response = navigateWheel(-1); if (response.message) setMessage(response.message); }}>Previous Wheel</button><button type="button" onClick={() => triggerOperatorAction("shuffle-wheel")}>Shuffle</button><button type="button" onClick={() => triggerOperatorAction("select-duration")}>Random Time</button><button type="button" onClick={() => triggerOperatorAction("spin-wheel")}>Spin</button><button type="button" onClick={() => { const response = navigateWheel(1); if (response.message) setMessage(response.message); }}>Next Wheel</button></div>
          <GameModeToolbar activeWheel={operatorState ?? (activeWheel ? { id: activeWheel.id, label: activeWheel.label, status: activeWheel.status, selectedDuration: activeWheel.spinDurationSeconds, spinning: activeWheel.status === "SPINNING" } : null)} muted={muted} fullscreen={isFullscreen} onToggleMuted={toggleMuted} onToggleFullscreen={() => { void toggleBroadcastFullscreen(); }} />
        </>}
        wheel={activeWheel ? (
          <section className="broadcast-stage" aria-label={`Active wheel: ${activeWheel.label}`}>
            <WheelSection
              ref={wheelRef}
              key={activeWheel.id}
              wheel={activeWheel}
              themeKey={themeKey}
              sequenceNumber={wheels.indexOf(activeWheel) + 1}
              isActive
              isOperatorLocked={activeWheel.status === "COMPLETED"}
              allowLockedSelection
              broadcastCountdown
              systemMessage={message}
              secondChanceResult={secondChanceResultForWheel(secondChance, activeWheel)}
              onSelect={setActiveId}
              onOperatorStateChange={setOperatorState}
              onCompleted={() => setMessage("Result persisted. Operator acceptance required.")}
              csrfToken={csrfToken}
            />
          </section>
        ) : (
          <section className="broadcast-empty"><h2>Broadcast unavailable</h2><p>Begin Game Mode to build the containment wheels.</p></section>
        )}
        resultAction={activeWheel?.status === "COMPLETED" && activeResult ? (
          <BroadcastResultAcceptance
            key={activeWheel.id}
            type={activeWheel.type}
            result={activeResult}
            accepted={acceptedIds.has(activeWheel.id)}
            onAccept={() => acceptResult(activeWheel.id)}
          />
        ) : null}
        overlay={results?.completedAt && finalResultAccepted ? <BroadcastCompletion gameId={game.id} gameTitle={game.title} results={results} secondChance={secondChance} routeBase={routeBase} /> : null}
      />
        <GameModeShortcuts message={message} />
    </main>
  );
}
