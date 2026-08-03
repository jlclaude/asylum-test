import { useCallback, useMemo, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";

import { BroadcastCompletion } from "../components/broadcast/BroadcastCompletion";
import { SpinMusicControls } from "../components/audio/SpinMusicControls";
import { BroadcastGameHeader } from "../components/broadcast/BroadcastGameHeader";
import { BroadcastResultAcceptance } from "../components/broadcast/BroadcastResultAcceptance";
import { BroadcastWheelRail } from "../components/broadcast/BroadcastWheelRail";
import { GameModeShortcuts } from "../components/wheel/GameModeShortcuts";
import { GameModeToolbar } from "../components/wheel/GameModeToolbar";
import { WheelSection } from "../components/wheel/WheelSection";
import type { WheelData, WheelOperatorAction, WheelOperatorHandle, WheelOperatorResult, WheelOperatorState } from "../components/wheel/types";
import { useFullscreen } from "../hooks/useFullscreen";
import { useGameModeShortcuts } from "../hooks/useGameModeShortcuts";
import { useSoundPreference } from "../hooks/useSoundPreference";
import { ASYLUM_THEMES, type AsylumThemeKey } from "../lib/asylum-themes";
import { adjacentWheelId, defaultBroadcastActiveWheelId, nextUnfinishedWheelId } from "../lib/game-mode-operator";
import { secondChanceResultForWheel } from "../lib/second-chance";
import { action as gameModeAction, loader as gameModeLoader } from "./app.games.$id_.play";

import "../styles/asylum-brand.css";
import "../styles/game-results.css";
import "../styles/wheel-studio.css";
import "../styles/broadcast-mode.css";

export const loader = gameModeLoader;
export const action = gameModeAction;
export { ErrorBoundary } from "./app.games.$id_.play";

export default function BroadcastModePage() {
  const { game, run, results, secondChance } = useLoaderData<typeof loader>();
  const fullscreenTarget = useRef<HTMLElement>(null);
  const wheelRef = useRef<WheelOperatorHandle>(null);
  const acceptFetcher = useFetcher();
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
    acceptedIdsRef.current.add(wheelId);
    acceptFetcher.submit({ intent: "accept-result", wheelId }, { method: "post" });
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
  }, [acceptFetcher, wheels]);

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

  return (
    <main ref={fullscreenTarget} className="studio-page broadcast-page" style={variables}>
      <div className="broadcast-shell">
        <BroadcastGameHeader title={game.title} status={game.status} />

        <div className="broadcast-toolbar">
          <a href={`/app/games/${game.id}/play`}>← Normal Game Mode</a>
          <select value={themeKey} onChange={(event) => setThemeKey(event.target.value as AsylumThemeKey)} aria-label="Asylum theme">
            {Object.values(ASYLUM_THEMES).map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </div>

        <GameModeToolbar
          activeWheel={operatorState ?? (activeWheel ? { id: activeWheel.id, label: activeWheel.label, status: activeWheel.status, selectedDuration: activeWheel.spinDurationSeconds, spinning: activeWheel.status === "SPINNING" } : null)}
          muted={muted}
          fullscreen={isFullscreen}
          onToggleMuted={toggleMuted}
          onToggleFullscreen={() => { void toggleBroadcastFullscreen(); }}
        />
        <SpinMusicControls />

        {activeWheel ? (
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
            />
          </section>
        ) : (
          <section className="broadcast-empty"><h2>Broadcast unavailable</h2><p>Begin Game Mode to build the containment wheels.</p></section>
        )}

        {activeWheel?.status === "COMPLETED" && (activeWheel.winnerDisplayName ?? activeWheel.winnerValue) ? (
          <BroadcastResultAcceptance
            key={activeWheel.id}
            type={activeWheel.type}
            result={(activeWheel.winnerDisplayName ?? activeWheel.winnerValue) as string}
            accepted={acceptedIds.has(activeWheel.id)}
            onAccept={() => acceptResult(activeWheel.id)}
          />
        ) : null}

        <BroadcastWheelRail wheels={wheels} activeId={activeWheel?.id ?? null} onSelect={setActiveId} />
        {results?.completedAt && finalResultAccepted ? <BroadcastCompletion gameId={game.id} gameTitle={game.title} results={results} secondChance={secondChance} /> : null}
        <GameModeShortcuts message={message} />

        <footer className="studio-statusbar broadcast-statusbar">
          <div><i aria-hidden="true" /> BROADCAST LINK ACTIVE</div>
          <strong>ASYLUM CONTAINMENT SYSTEM</strong>
          <span>S · T · SPACE · ↑/↓ · F · M</span>
        </footer>
      </div>
    </main>
  );
}
