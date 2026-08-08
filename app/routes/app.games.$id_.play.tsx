import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";
import {
  isRouteErrorResponse,
  Link,
  useFetcher,
  useLoaderData,
  useNavigate,
  useRevalidator,
  useRouteError,
} from "react-router";

import { AsylumBrand } from "../components/asylum/AsylumBrand";
import { SpinMusicControls } from "../components/audio/SpinMusicControls";
import { GameIdentityCard } from "../components/asylum/GameIdentityCard";
import { GameCompletionCard } from "../components/results/GameCompletionCard";
import { GameResultsSummary } from "../components/results/GameResultsSummary";
import { GamePrizeClaims } from "../components/prize-claims/GamePrizeClaims";
import { secondChanceResultForWheel } from "../lib/second-chance";
import type { GameControlRouteMode } from "../lib/game-control-routes";
import { WheelSection } from "../components/wheel/WheelSection";
import { GameModeShortcuts } from "../components/wheel/GameModeShortcuts";
import { GameModeToolbar } from "../components/wheel/GameModeToolbar";
import type {
  WheelActionData,
  WheelData,
  WheelOperatorAction,
  WheelOperatorHandle,
  WheelOperatorResult,
  WheelOperatorState,
} from "../components/wheel/types";
import { useFullscreen } from "../hooks/useFullscreen";
import { useGameModeShortcuts } from "../hooks/useGameModeShortcuts";
import { useSoundPreference } from "../hooks/useSoundPreference";
import { useWheelMusicSession } from "../hooks/useWheelMusicSession";
import { adjacentWheelId, defaultGameModeActiveWheelId, nextUnfinishedWheelId, unfinishedWheelIds } from "../lib/game-mode-operator";
import { stopAllWheelMusic } from "../lib/wheel-music";
import {
  ASYLUM_THEMES,
  type AsylumThemeKey,
} from "../lib/asylum-themes";
import { authenticate } from "../shopify.server";
import { handleGameModeAction, loadGameModeData } from "../services/game-mode.server";
import { shopifyOperator } from "../lib/operator-context.server";
import { emitDesktopAutomationEvent } from "../lib/desktop-automation.client";

import "../styles/asylum-brand.css";
import "../styles/game-results.css";
import "../styles/wheel-studio.css";
import "../styles/prize-claims.css";

export async function loader({
  request,
  params,
}: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!params.id) throw new Response("Game ID is required.", { status: 400 });
  return {
    ...(await loadGameModeData(params.id, session.shop)),
    csrfToken: null as string | null,
    routeMode: "SHOPIFY_ADMIN" as GameControlRouteMode,
  };
}

export async function action({
  request,
  params,
}: ActionFunctionArgs) {
  const { session, admin } =
    await authenticate.admin(request);

  if (!params.id) return { error: "Game ID is missing." };
  return handleGameModeAction({ request, gameId: params.id, operator: shopifyOperator(session), admin });
}

export default function GameModePage() {
  const navigate = useNavigate();
  const fullscreenTarget = useRef<HTMLElement>(null);
  const wheelRefs = useRef(new Map<string, WheelOperatorHandle>());

  const beginFetcher =
    useFetcher<WheelActionData>();
  const acceptFetcher = useFetcher<WheelActionData>();
  const revalidator = useRevalidator();
  const handledAcceptance = useRef<string | null>(null);
  const handledStaleAcceptance = useRef<WheelActionData | null>(null);

  const { game, run, results, secondChance, eligiblePrizeWheels, prizeClaims, csrfToken, routeMode } =
    useLoaderData<typeof loader>();
  const routeBase =
    routeMode === "HOST_PORTAL" ? ("/host" as const) : ("/app" as const);
  useWheelMusicSession(`game:${game.id}:play`);

  const orderedWheels = useMemo(
    () => run?.rounds.flatMap((round) => round.wheels) ?? [],
    [run],
  );

  const [themeKey, setThemeKey] =
    useState<AsylumThemeKey>("classic");
  const [operatorStates, setOperatorStates] = useState<Record<string, WheelOperatorState>>({});
  const [operatorMessage, setOperatorMessage] = useState<string | null>(null);
  const [completedLocally, setCompletedLocally] = useState<Set<string>>(() => new Set());
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(
    () => new Set(orderedWheels.filter((wheel) => wheel.resultAcceptedAt).map((wheel) => wheel.id)),
  );
  const [focusReleased, setFocusReleased] = useState(false);

  const unfinishedWheels = useMemo(
    () => {
      const ids = new Set(unfinishedWheelIds(orderedWheels, completedLocally));
      return orderedWheels.filter((wheel) => ids.has(wheel.id));
    },
    [completedLocally, orderedWheels],
  );
  const [activeWheelId, setActiveWheelId] = useState<string | null>(
    () => defaultGameModeActiveWheelId(orderedWheels),
  );
  const { muted, toggleMuted } = useSoundPreference();
  const { isFullscreen, toggleFullscreen } = useFullscreen(fullscreenTarget);

  useEffect(() => {
    if (focusReleased && activeWheelId === null) return;
    if (activeWheelId && orderedWheels.some((wheel) => wheel.id === activeWheelId)) return;
    setActiveWheelId(defaultGameModeActiveWheelId(orderedWheels));
  }, [activeWheelId, focusReleased, orderedWheels]);

  useEffect(() => {
    if (!operatorMessage) return;
    const timer = window.setTimeout(() => setOperatorMessage(null), 3200);
    return () => window.clearTimeout(timer);
  }, [operatorMessage]);

  const updateOperatorState = useCallback((state: WheelOperatorState) => {
    setOperatorStates((current) => {
      const previous = current[state.id];
      if (previous && previous.label === state.label && previous.status === state.status && previous.selectedDuration === state.selectedDuration && previous.spinning === state.spinning) return current;
      return { ...current, [state.id]: state };
    });
  }, []);

  const selectWheel = useCallback((wheelId: string) => {
    setFocusReleased(false);
    setActiveWheelId(wheelId);
  }, []);

  const handleWheelCompleted = useCallback((wheelId: string) => {
    setCompletedLocally((current) => new Set(current).add(wheelId));
    setFocusReleased(false);
    setActiveWheelId(wheelId);
  }, []);

  const acceptResult = useCallback((wheelId: string) => {
    acceptFetcher.submit({ intent: "accept-result", wheelId, ...(csrfToken ? { csrfToken } : {}) }, { method: "post" });
  }, [acceptFetcher, csrfToken]);

  useEffect(() => {
    const response = acceptFetcher.data;
    if (!response || acceptFetcher.state !== "idle") return;
    if (response.stale) {
      if (handledStaleAcceptance.current !== response) {
        handledStaleAcceptance.current = response;
        revalidator.revalidate();
        setOperatorMessage(response.error ?? "This wheel changed in another session. The latest state has been loaded.");
      }
      return;
    }
    if (response.intent !== "accept-result" || !response.success || !response.wheelId) return;
    if (handledAcceptance.current === response.wheelId) return;
    handledAcceptance.current = response.wheelId;
    const wheelId = response.wheelId;
    setAcceptedIds((current) => new Set(current).add(wheelId));
    const nextId = nextUnfinishedWheelId(
      orderedWheels.map((wheel) => completedLocally.has(wheel.id)
        ? { ...wheel, status: "COMPLETED" as const }
        : wheel),
      wheelId,
    );
    emitDesktopAutomationEvent("ACCEPT_RESULT", wheelId);
    if (!nextId) {
      emitDesktopAutomationEvent("RAFFLE_FINISHED", wheelId);
      setOperatorMessage("All persisted results accepted.");
      return;
    }
    setFocusReleased(false);
    setActiveWheelId(nextId);
    setOperatorMessage(`${orderedWheels.find((wheel) => wheel.id === nextId)?.label ?? "Next wheel"} selected.`);
    window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      wheelRefs.current.get(nextId)?.scrollIntoView(reducedMotion);
    });
  }, [acceptFetcher.data, acceptFetcher.state, completedLocally, orderedWheels, revalidator]);

  const activeWheel = activeWheelId
    ? operatorStates[activeWheelId] ?? (() => {
        const wheel = orderedWheels.find((candidate) => candidate.id === activeWheelId);
        return wheel ? { id: wheel.id, label: wheel.label, status: wheel.status, selectedDuration: wheel.spinDurationSeconds, spinning: wheel.status === "SPINNING" } : null;
      })()
    : null;

  const runActiveAction = useCallback((action: WheelOperatorAction): WheelOperatorResult => {
    if (!activeWheelId) return { triggered: false, message: "No unfinished wheel is selected." };
    return wheelRefs.current.get(activeWheelId)?.runAction(action) ?? { triggered: false, message: "Active wheel controls are unavailable." };
  }, [activeWheelId]);

  const navigateWheel = useCallback((direction: 1 | -1): WheelOperatorResult => {
    if (activeWheel?.spinning) return { triggered: false, message: "Wheel is currently spinning." };
    if (unfinishedWheels.length === 0) return { triggered: false, message: "All wheels are completed." };
    const nextId = adjacentWheelId(unfinishedWheels.map((wheel) => wheel.id), activeWheelId, direction);
    const nextWheel = unfinishedWheels.find((wheel) => wheel.id === nextId);
    if (!nextWheel) return { triggered: false, message: "No unfinished wheel is available." };
    setFocusReleased(false);
    setActiveWheelId(nextWheel.id);
    return { triggered: true, message: `${nextWheel.label} selected.` };
  }, [activeWheel?.spinning, activeWheelId, unfinishedWheels]);

  const shortcutHandlers = useMemo(() => ({
    shuffle: () => runActiveAction("shuffle-wheel"),
    selectDuration: () => runActiveAction("select-duration"),
    spin: () => runActiveAction("spin-wheel"),
    nextWheel: () => navigateWheel(1),
    previousWheel: () => navigateWheel(-1),
    releaseFocus: () => {
      setFocusReleased(true);
      setActiveWheelId(null);
      return { triggered: true, message: "Operator focus released." };
    },
    toggleFullscreen: () => {
      void toggleFullscreen().then((success) => {
        if (!success) setOperatorMessage("Fullscreen is unavailable in this browser.");
      });
      return { triggered: true, message: "Fullscreen command requested." };
    },
    toggleSound: () => {
      toggleMuted();
      return { triggered: true, message: muted ? "Wheel effects enabled." : "Wheel effects muted." };
    },
    showMessage: setOperatorMessage,
  }), [muted, navigateWheel, runActiveAction, toggleFullscreen, toggleMuted]);

  useGameModeShortcuts(shortcutHandlers);

  const theme =
    ASYLUM_THEMES[themeKey];

  const firstNameWheel =
    run?.rounds[0]?.wheels.find(
      (wheel) =>
        wheel.type === "NAME",
    );

  const variables = {
    "--theme-page":
      theme.pageBackground,
    "--theme-panel": theme.panel,
    "--theme-border":
      theme.panelBorder,
    "--theme-primary":
      theme.primary,
    "--theme-primary-dark":
      theme.primaryDark,
    "--theme-wheel-dark":
      theme.wheelDark,
    "--theme-text": theme.text,
    "--theme-muted": theme.muted,
    "--theme-value":
      theme.valuePrimary,
  } as React.CSSProperties;

  return (
    <main
      ref={fullscreenTarget}
      className="studio-page"
      style={variables}
    >
      <div className="studio-shell">
        <header className="studio-topbar">
          <AsylumBrand />

          <div className="studio-topbar-center">
            <span aria-hidden="true" />
            <strong>
              CONTAINMENT CONTROL SYSTEM
            </strong>
            <span aria-hidden="true" />
          </div>

          <div className="studio-system-status">
            <small>System status</small>
            <strong>
              {game.status.replace("_", " ")}
            </strong>
          </div>
        </header>

        <div className="studio-toolbar">
          <div>
            <Link to={`${routeBase}/games/${game.id}`} onClick={stopAllWheelMusic}>
              ← Return to Game Control
            </Link>
            {run ? (
              <button type="button" onClick={() => {
                stopAllWheelMusic();
                navigate(`${routeBase}/games/${game.id}/broadcast`);
              }}>
                OPEN BROADCAST MODE
              </button>
            ) : null}
          </div>

          <select
            value={themeKey}
            onChange={(event) =>
              setThemeKey(
                event.target
                  .value as AsylumThemeKey,
              )
            }
            aria-label="Asylum theme"
          >
            {Object.values(
              ASYLUM_THEMES,
            ).map((option) => (
              <option
                key={option.key}
                value={option.key}
              >
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {game.archivedAt ? <div className="studio-begin-error">This game is archived. Results remain readable, but gameplay controls are disabled until it is restored.</div> : null}

        <GameModeToolbar
          activeWheel={activeWheel}
          muted={muted}
          fullscreen={isFullscreen}
          onToggleMuted={toggleMuted}
          onToggleFullscreen={() => {
            void toggleFullscreen().then((success) => {
              if (!success) setOperatorMessage("Fullscreen is unavailable in this browser.");
            });
          }}
        />
        <SpinMusicControls />

        <GameIdentityCard
          title={game.title}
          raffleCode={game.raffleCode}
          status={game.status}
          nameWheelCount={
            game.wheelCount
          }
          totalEntries={
            firstNameWheel?.entries.length
          }
          themeLabel={theme.label}
        />

        {!run ? (
          <section className="studio-begin-panel">
            <p>
              Authorized initialization
            </p>
            <h1>
              Build the containment wheels
            </h1>

            <span>
              Confirmed paid claims will be
              frozen into {game.wheelCount}{" "}
              containment wheels plus one weighted
              Reward Chamber.
            </span>

            {beginFetcher.data?.error ? (
              <div className="studio-begin-error">
                {beginFetcher.data.error}
              </div>
            ) : null}

            <beginFetcher.Form method="post">
              {csrfToken ? <input type="hidden" name="csrfToken" value={csrfToken} /> : null}
              <input
                type="hidden"
                name="intent"
                value="begin-game"
              />

              <button
                type="submit"
                disabled={
                  beginFetcher.state !==
                    "idle" ||
                  game.status !== "CLOSED"
                  || Boolean(game.archivedAt)
                }
              >
                {game.archivedAt
                  ? "GAME ARCHIVED"
                  : game.status !== "CLOSED"
                  ? "CLOSE GAME FIRST"
                  : beginFetcher.state !==
                        "idle"
                    ? "INITIALIZING…"
                    : "BEGIN GAME"}
              </button>
            </beginFetcher.Form>
          </section>
        ) : (
          <>
          {run.rounds.map((round) => (
            <section
              className="studio-round"
              key={round.id}
            >
              <header className="studio-round-header">
                <div>
                  <p>
                    Active containment round
                  </p>
                  <h1>{round.title}</h1>
                </div>

                <span>{round.status}</span>
              </header>

              <div className="studio-wheel-stack">
                {round.wheels.map(
                  (wheel, index) => (
                    <WheelSection
                      ref={(handle) => {
                        if (handle) wheelRefs.current.set(wheel.id, handle);
                        else wheelRefs.current.delete(wheel.id);
                      }}
                      key={wheel.id}
                      wheel={
                        wheel as WheelData
                      }
                      themeKey={themeKey}
                      sequenceNumber={
                        index + 1
                      }
                      isActive={activeWheelId === wheel.id}
                      isOperatorLocked={Boolean(game.archivedAt) || wheel.status === "COMPLETED" || completedLocally.has(wheel.id)}
                      onSelect={selectWheel}
                      onCompleted={handleWheelCompleted}
                      onOperatorStateChange={updateOperatorState}
                      secondChanceResult={secondChanceResultForWheel(secondChance, wheel)}
                      resultAccepted={acceptedIds.has(wheel.id)}
                      onAcceptResult={acceptResult}
                      csrfToken={csrfToken}
                    />
                  ),
                )}
              </div>
            </section>
          ))}

          {results ? <GameResultsSummary results={results} heading="Live wheel record" /> : null}
          <GamePrizeClaims
            eligibleWheels={eligiblePrizeWheels}
            claims={prizeClaims}
            csrfToken={csrfToken}
            routeBase={routeBase}
            routeMode={routeMode}
          />

          {game.status === "COMPLETED" && results?.completedAt && activeWheelId && acceptedIds.has(activeWheelId) ? (
            <GameCompletionCard
              gameId={game.id}
              gameTitle={game.title}
              results={results}
              secondChance={secondChance}
              routeBase={routeBase}
            />
          ) : null}
          </>
        )}

        {run ? <GameModeShortcuts message={operatorMessage} /> : null}

        <footer className="studio-statusbar">
          <div>
            <i aria-hidden="true" />
            SYSTEM READY
          </div>

          <strong>
            STANDBY FOR CONTAINMENT
            ENGAGEMENT
          </strong>

          <span>
            S = SHUFFLE · T = TIME ·
            SPACE = SPIN
          </span>
        </footer>
      </div>
    </main>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  let message =
    "Game Mode could not be loaded.";

  if (isRouteErrorResponse(error)) {
    message =
      error.status === 404
        ? "This game could not be found."
        : typeof error.data === "string" && error.data.trim()
          ? error.data
          : `${error.status}: ${error.statusText || "Request failed"}`;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 32,
        color: "#ffffff",
        background: "#101012",
      }}
    >
      <h1>Game Mode error</h1>
      <p>{message}</p>
      {import.meta.env.DEV && error instanceof Error && error.stack ? (
        <pre
          style={{
            maxWidth: 960,
            overflow: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {error.stack}
        </pre>
      ) : null}
      <a href="/app" onClick={stopAllWheelMusic}>
        Return to dashboard
      </a>
    </main>
  );
}
