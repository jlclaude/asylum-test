import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";
import {
  data,
  isRouteErrorResponse,
  Link,
  useFetcher,
  useLoaderData,
  useNavigate,
  useRouteError,
} from "react-router";

import { AsylumBrand } from "../components/asylum/AsylumBrand";
import { SpinMusicControls } from "../components/audio/SpinMusicControls";
import { GameIdentityCard } from "../components/asylum/GameIdentityCard";
import { GameCompletionCard } from "../components/results/GameCompletionCard";
import { GameResultsSummary } from "../components/results/GameResultsSummary";
import { GamePrizeClaims } from "../components/prize-claims/GamePrizeClaims";
import { getSecondChanceResult } from "../models/second-chance.server";
import { secondChanceResultForWheel } from "../lib/second-chance";
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
import {
  beginGameRun,
  acceptGameWheelResult,
  completeGameWheelSpin,
  deserializeWheelEntries,
  getGameRun,
  selectGameWheelDuration,
  shuffleGameWheel,
  startGameWheelSpin,
} from "../models/game-run.server";
import { getGameForShop } from "../models/game.server";
import { getGameResults } from "../models/game-results.server";
import { authenticate } from "../shopify.server";
import { formatRaffleCode } from "../lib/raffle-number";
import { PRIZE_CLAIM_EXPIRATION_DAYS, type PrizeClaimExpirationDays } from "../lib/prize-claim";
import { buildPrizeClaimUrl } from "../lib/prize-claim-token.server";
import { validateAdminPrizePackageOptions } from "../lib/prize-packages";
import { verifyPrizeOptionCollections } from "../lib/shopify-prize-products.server";
import { createWinnerPrizeClaim, getEligiblePrizeWheels, getPrizeClaimsForGame, toPrizeClaimSummary, updatePrizeClaimStatus } from "../models/prize-claim.server";
import { runGameReadinessCheck } from "../services/game-readiness.server";

import "../styles/asylum-brand.css";
import "../styles/game-results.css";
import "../styles/wheel-studio.css";
import "../styles/prize-claims.css";

export async function loader({
  request,
  params,
}: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!params.id) {
    throw new Response(
      "Game ID is required.",
      {
        status: 400,
      },
    );
  }

  const game = await getGameForShop(
    params.id,
    session.shop,
  );

  if (!game) {
    throw new Response(
      "Game not found.",
      {
        status: 404,
      },
    );
  }

  const readiness = await runGameReadinessCheck(game.id, session.shop);
  if (!readiness.isReady) {
    throw new Response(
      `${readiness.blockingCount} blocking readiness issues must be resolved in the Game Control Center.`,
      { status: 409, statusText: "Game readiness check failed" },
    );
  }

  const [run, results, secondChance, eligiblePrizeWheels, prizeClaims] = await Promise.all([
    getGameRun(game.id),
    getGameResults(game.id),
    getSecondChanceResult(game.id),
    getEligiblePrizeWheels(game.id, session.shop),
    getPrizeClaimsForGame(game.id, session.shop),
  ]);

  return {
    game: {
      id: game.id,
      raffleCode: formatRaffleCode({ year: game.raffleYear, number: game.raffleNumber }),
      title: game.title,
      description: game.description,
      secondChanceOffset: game.secondChanceOffset,
      status: game.status,
      archivedAt: game.archivedAt?.toISOString() ?? null,
      wheelCount: game.wheelCount,
      totalSpots: game.totalSpots,
      pricePerSpot:
        game.pricePerSpot.toString(),
      createdAt:
        game.createdAt.toISOString(),
    },

    results,
    secondChance,
    eligiblePrizeWheels: eligiblePrizeWheels.map((wheel) => ({ ...wheel, resultAcceptedAt: wheel.resultAcceptedAt?.toISOString() ?? null })),
    prizeClaims: prizeClaims.map(toPrizeClaimSummary),
    run: run
      ? {
          id: run.id,

          rounds: run.rounds.map(
            (round) => ({
              id: round.id,
              title:
                round.title ??
                `Round ${round.position}`,
              status: round.status,

              wheels: round.wheels.map(
                (wheel) => ({
                  id: wheel.id,
                  type: wheel.type,
                  label: wheel.label,
                  status: wheel.status,

                  entries:
                    deserializeWheelEntries(
                      wheel.shuffledEntriesJson,
                    ),

                  spinDurationSeconds:
                    wheel.spinDurationSeconds,

                  winnerEntryIndex:
                    wheel.winnerEntryIndex,

                  winnerDisplayName:
                    wheel.winnerDisplayName,

                  winnerValue:
                    wheel.winnerValue,

                  spunAt:
                    wheel.spunAt?.toISOString() ?? null,
                  resultAcceptedAt:
                    wheel.resultAcceptedAt?.toISOString() ?? null,
                }),
              ),
            }),
          ),
        }
      : null,
  };
}

export async function action({
  request,
  params,
}: ActionFunctionArgs) {
  const { session, admin } =
    await authenticate.admin(request);

  if (!params.id) {
    return {
      error: "Game ID is missing.",
    };
  }

  const formData =
    await request.formData();

  const intent = String(
    formData.get("intent") ?? "",
  );

  const wheelId = String(
    formData.get("wheelId") ?? "",
  ).trim();

  try {
    if (intent === "begin-game") {
      const readiness = await runGameReadinessCheck(params.id, session.shop);
      if (!readiness.isReady) {
        return {
          intent,
          error: `${readiness.blockingCount} blocking readiness issues must be resolved in the Game Control Center.`,
        };
      }
      await beginGameRun(
        params.id,
        session.shop,
      );

      return {
        intent,
        success:
          "Containment wheels initialized.",
      };
    }

    if (!wheelId) {
      return {
        intent,
        error: "Wheel ID is missing.",
      };
    }

    if (intent === "shuffle-wheel") {
      await shuffleGameWheel(
        wheelId,
        params.id,
        session.shop,
      );

      return {
        intent,
        wheelId,
        success:
          "Wheel order recalibrated.",
      };
    }

    if (intent === "select-duration") {
      const result =
        await selectGameWheelDuration(
          wheelId,
          params.id,
          session.shop,
        );

      return {
        intent,
        wheelId,
        spinDurationSeconds:
          result.spinDurationSeconds,
        success: `Spin duration locked at ${result.spinDurationSeconds} seconds.`,
      };
    }

    if (intent === "spin-wheel") {
      const result =
        await startGameWheelSpin(
          wheelId,
          params.id,
          session.shop,
        );

      return {
        intent,
        wheelId,
        winnerEntryIndex:
          result.winnerEntryIndex,
        winnerDisplayName:
          result.winnerDisplayName ??
          undefined,
        winnerValue:
          result.winnerValue ??
          undefined,
        spinDurationSeconds:
          result.spinDurationSeconds,
        spinToken:
          result.spinToken,
        success: `${result.wheelLabel} containment cycle engaged.`,
      };
    }

    if (intent === "complete-wheel") {
      const result =
        await completeGameWheelSpin(
          wheelId,
          params.id,
          session.shop,
        );

      return {
        intent,
        wheelId,
        winnerDisplayName:
          result.winnerDisplayName ??
          undefined,
        winnerValue:
          result.winnerValue ??
          undefined,
        secondChance: result.secondChance,
        success: "Containment result saved.",
      };
    }

    if (intent === "accept-result") {
      await acceptGameWheelResult(wheelId, params.id, session.shop);
      return { intent, wheelId, success: "Persisted result accepted." };
    }

    if (intent === "create-prize-claim") {
      const expirationDays = Number(formData.get("expirationDays"));
      if (!PRIZE_CLAIM_EXPIRATION_DAYS.includes(expirationDays as PrizeClaimExpirationDays)) return { intent, wheelId, error: "Select a valid expiration period." };
      const packageValidation = validateAdminPrizePackageOptions(formData.get("prizeOptionsJson"));
      if ("error" in packageValidation) return { intent, wheelId, error: packageValidation.error };
      const verifiedOptions = await verifyPrizeOptionCollections(admin, packageValidation.options);
      const result = await createWinnerPrizeClaim({ shop: session.shop, gameId: params.id, gameWheelId: wheelId, expirationDays: expirationDays as PrizeClaimExpirationDays, prizeOptions: verifiedOptions });
      if (!result.created) return { intent, wheelId, success: "An active claim link already exists for this winner." };
      return data<WheelActionData>(
        { intent, wheelId, success: "Private prize claim link created.", privateUrl: buildPrizeClaimUrl(result.token, new URL(request.url).origin) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (["revoke-prize-claim", "fulfill-prize-claim"].includes(intent)) {
      const prizeClaimId = String(formData.get("prizeClaimId") ?? "").trim();
      await updatePrizeClaimStatus({ id: prizeClaimId, shop: session.shop, action: intent === "revoke-prize-claim" ? "revoke" : "fulfill" });
      return { intent, wheelId, success: intent === "revoke-prize-claim" ? "Prize claim link revoked." : "Prize claim marked fulfilled." };
    }

    return {
      intent,
      error: "Unknown Game Mode action.",
    };
  } catch (error) {
    console.error(
      "Game Mode action failed:",
      error,
    );

    return {
      intent,
      wheelId:
        wheelId || undefined,
      error:
        error instanceof Error
          ? error.message
          : "The Game Mode action failed.",
    };
  }
}

export default function GameModePage() {
  const navigate = useNavigate();
  const fullscreenTarget = useRef<HTMLElement>(null);
  const wheelRefs = useRef(new Map<string, WheelOperatorHandle>());

  const beginFetcher =
    useFetcher<WheelActionData>();
  const acceptFetcher = useFetcher<WheelActionData>();

  const { game, run, results, secondChance, eligiblePrizeWheels, prizeClaims } =
    useLoaderData<typeof loader>();
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
    acceptFetcher.submit({ intent: "accept-result", wheelId }, { method: "post" });
    setAcceptedIds((current) => new Set(current).add(wheelId));
    const nextId = nextUnfinishedWheelId(
      orderedWheels.map((wheel) => completedLocally.has(wheel.id)
        ? { ...wheel, status: "COMPLETED" as const }
        : wheel),
      wheelId,
    );
    if (!nextId) {
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
  }, [acceptFetcher, completedLocally, orderedWheels]);

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
            <Link to={`/app/games/${game.id}`} onClick={stopAllWheelMusic}>
              ← Return to Game Control
            </Link>
            {run ? (
              <button type="button" onClick={() => {
                stopAllWheelMusic();
                navigate(`/app/games/${game.id}/broadcast`);
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
                    />
                  ),
                )}
              </div>
            </section>
          ))}

          {results ? <GameResultsSummary results={results} heading="Live wheel record" /> : null}
          <GamePrizeClaims eligibleWheels={eligiblePrizeWheels} claims={prizeClaims} />

          {game.status === "COMPLETED" && results?.completedAt && activeWheelId && acceptedIds.has(activeWheelId) ? (
            <GameCompletionCard
              gameId={game.id}
              gameTitle={game.title}
              results={results}
              secondChance={secondChance}
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
        : `${error.status}: ${error.statusText}`;
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
