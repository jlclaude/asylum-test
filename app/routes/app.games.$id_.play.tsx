import { useState } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";
import {
  isRouteErrorResponse,
  useFetcher,
  useLoaderData,
  useNavigate,
  useRouteError,
} from "react-router";

import { AsylumBrand } from "../components/asylum/AsylumBrand";
import { GameIdentityCard } from "../components/asylum/GameIdentityCard";
import { WheelSection } from "../components/wheel/WheelSection";
import type {
  WheelActionData,
  WheelData,
} from "../components/wheel/types";
import {
  ASYLUM_THEMES,
  type AsylumThemeKey,
} from "../lib/asylum-themes";
import {
  beginGameRun,
  completeGameWheelSpin,
  deserializeWheelEntries,
  getGameRun,
  selectGameWheelDuration,
  shuffleGameWheel,
  startGameWheelSpin,
} from "../models/game-run.server";
import { getGameForShop } from "../models/game.server";
import { authenticate } from "../shopify.server";

import "../styles/asylum-brand.css";
import "../styles/wheel-studio.css";

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

  const run = await getGameRun(game.id);

  return {
    game: {
      id: game.id,
      title: game.title,
      description: game.description,
      status: game.status,
      wheelCount: game.wheelCount,
      totalSpots: game.totalSpots,
      pricePerSpot:
        game.pricePerSpot.toString(),
      createdAt:
        game.createdAt.toISOString(),
    },

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
}: ActionFunctionArgs): Promise<WheelActionData> {
  const { session } =
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
        success: "Containment result saved.",
      };
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

  const beginFetcher =
    useFetcher<WheelActionData>();

  const { game, run } =
    useLoaderData<typeof loader>();

  const [themeKey, setThemeKey] =
    useState<AsylumThemeKey>("classic");

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
          <button
            type="button"
            onClick={() =>
              navigate(
                `/app/games/${game.id}`,
              )
            }
          >
            ← Return to Game Control
          </button>

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

        <GameIdentityCard
          title={game.title}
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
              name wheels plus one weighted
              value wheel.
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
                }
              >
                {game.status !== "CLOSED"
                  ? "CLOSE GAME FIRST"
                  : beginFetcher.state !==
                        "idle"
                    ? "INITIALIZING…"
                    : "BEGIN GAME"}
              </button>
            </beginFetcher.Form>
          </section>
        ) : (
          run.rounds.map((round) => (
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
                      key={wheel.id}
                      wheel={
                        wheel as WheelData
                      }
                      themeKey={themeKey}
                      sequenceNumber={
                        index + 1
                      }
                    />
                  ),
                )}
              </div>
            </section>
          ))
        )}

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
      <a href="/app">
        Return to dashboard
      </a>
    </main>
  );
}
