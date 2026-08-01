import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  isRouteErrorResponse,
  useActionData,
  useLoaderData,
  useNavigation,
  useRouteError,
} from "react-router";
import {
  createPublicClaim,
  getClaimTotals,
  getPublicClaimsForGame,
} from "../models/claim.server";
import { getPublicGame } from "../models/game.server";
import { getPublicGameResults } from "../models/game-results.server";
import { PublicGameResults } from "../components/results/PublicGameResults";
import { formatPublicName } from "../lib/public-name";

import "../styles/game-results.css";

export async function loader({
  params,
}: LoaderFunctionArgs) {
  if (!params.id) {
    throw new Response("Game ID is required.", {
      status: 400,
    });
  }

  const game = await getPublicGame(params.id);

  if (!game) {
    throw new Response("Game not found.", {
      status: 404,
    });
  }

  const [totals, claims, results] = await Promise.all([
    getClaimTotals(game.id),
    getPublicClaimsForGame(game.id),
    game.status === "COMPLETED"
      ? getPublicGameResults(game.id)
      : Promise.resolve(null),
  ]);

  return {
    game: {
      id: game.id,
      title: game.title,
      description: game.description,
      totalSpots: game.totalSpots,
      pricePerSpot: game.pricePerSpot.toString(),
      status: game.status,
    },
    totals,
    results,
    claims: claims.map((claim) => ({
      id: claim.id,
      displayName: formatPublicName(claim.displayName),
      quantity: claim.quantity,
      comment: claim.comment,
      status: claim.status,
      createdAt: claim.createdAt.toISOString(),
    })),
  };
}

type ActionData = {
  error?: string;
  success?: string;
};

export async function action({
  request,
  params,
}: ActionFunctionArgs): Promise<ActionData> {
  if (!params.id) {
    return {
      error: "Game ID is missing.",
    };
  }

  const formData = await request.formData();

  const displayName = String(
    formData.get("displayName") ?? "",
  ).trim();

  const facebookHandle = String(
    formData.get("facebookHandle") ?? "",
  ).trim();

  const comment = String(
    formData.get("comment") ?? "",
  ).trim();

  const quantity = Number(formData.get("quantity"));

  if (!displayName) {
    return {
      error: "Enter your Facebook display name.",
    };
  }

  if (displayName.length > 100) {
    return {
      error: "Your display name is too long.",
    };
  }

  if (facebookHandle.length > 100) {
    return {
      error: "Your Facebook username is too long.",
    };
  }

  if (comment.length > 500) {
    return {
      error: "Comments must be 500 characters or fewer.",
    };
  }

  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 10000
  ) {
    return {
      error: "Enter a valid whole-number quantity.",
    };
  }

  try {
    const result = await createPublicClaim({
      gameId: params.id,
      displayName,
      facebookHandle,
      quantity,
      comment,
    });

    if (!result.success) {
      return {
        error: result.error,
      };
    }

    return {
      success: `${quantity} ${
        quantity === 1 ? "spot has" : "spots have"
      } been reserved for ${displayName}. Your claim is pending host confirmation.`,
    };
  } catch (error) {
    console.error("Public claim failed:", error);

    return {
      error:
        error instanceof Error
          ? error.message
          : "Your claim could not be submitted.",
    };
  }
}

function formatCurrency(value: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

const styles = `
  :root {
    color-scheme: dark;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background: #0d0d0f;
  }

  .public-game-page {
    min-height: 100vh;
    padding: 28px;
    color: #f5f5f5;
    background:
      radial-gradient(
        circle at top right,
        rgba(155, 22, 34, 0.2),
        transparent 35%
      ),
      radial-gradient(
        circle at bottom left,
        rgba(77, 18, 29, 0.13),
        transparent 38%
      ),
      linear-gradient(
        145deg,
        #09090b 0%,
        #171719 52%,
        #0e0e10 100%
      );
    font-family:
      Inter,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
  }

  .public-game-shell {
    width: min(1120px, 100%);
    margin: 0 auto;
  }

  .public-brand {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 30px;
  }

  .public-brand-mark {
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    border: 1px solid #5e252c;
    border-radius: 13px;
    color: #ff5968;
    background: linear-gradient(145deg, #251316, #130e10);
    font-size: 22px;
    font-weight: 900;
  }

  .public-brand h1 {
    margin: 0;
    font-size: 21px;
    letter-spacing: 0.08em;
  }

  .public-brand p {
    margin: 5px 0 0;
    color: #7d7e84;
    font-size: 12px;
  }

  .public-hero {
    overflow: hidden;
    margin-bottom: 20px;
    border: 1px solid #303034;
    border-radius: 20px;
    background: rgba(26, 26, 29, 0.94);
    box-shadow: 0 25px 80px rgba(0, 0, 0, 0.35);
  }

  .public-hazard {
    height: 7px;
    background:
      repeating-linear-gradient(
        -45deg,
        #b72d3d,
        #b72d3d 12px,
        #161618 12px,
        #161618 24px
      );
  }

  .public-hero-body {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    padding: 30px;
  }

  .public-eyebrow {
    margin: 0 0 9px;
    color: #e44e5e;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .public-hero h2 {
    margin: 0;
    font-size: clamp(29px, 5vw, 48px);
    line-height: 1.06;
  }

  .public-description {
    max-width: 690px;
    margin: 15px 0 0;
    color: #a2a3a8;
    font-size: 15px;
    line-height: 1.65;
  }

  .public-live-status {
    flex: 0 0 auto;
    padding: 9px 13px;
    border: 1px solid #305c40;
    border-radius: 999px;
    color: #9ce2b3;
    background: rgba(29, 92, 51, 0.25);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.06em;
  }

  .public-live-status-closed {
    border-color: #66562c;
    color: #e5cc82;
    background: rgba(105, 82, 20, 0.22);
  }

  .public-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 20px;
  }

  .public-stat {
    padding: 21px;
    border: 1px solid #2d2d31;
    border-radius: 15px;
    background: rgba(28, 28, 31, 0.93);
  }

  .public-stat-label {
    margin: 0;
    color: #8b8c92;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .public-stat-value {
    margin: 13px 0 5px;
    font-size: 30px;
    font-weight: 850;
    line-height: 1;
  }

  .public-stat-note {
    margin: 0;
    color: #696a70;
    font-size: 12px;
  }

  .public-progress {
    margin-bottom: 20px;
    padding: 20px;
    border: 1px solid #2d2d31;
    border-radius: 15px;
    background: rgba(28, 28, 31, 0.93);
  }

  .public-progress-heading {
    display: flex;
    justify-content: space-between;
    gap: 15px;
    margin-bottom: 10px;
    font-size: 12px;
    font-weight: 750;
  }

  .public-progress-heading span:last-child {
    color: #a3a4a9;
  }

  .public-progress-track {
    height: 10px;
    overflow: hidden;
    border-radius: 999px;
    background: #111113;
  }

  .public-progress-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #942532, #df4859);
  }

  .public-grid {
    display: grid;
    grid-template-columns:
      minmax(310px, 0.85fr)
      minmax(0, 1.15fr);
    gap: 18px;
  }

  .public-card {
    padding: 25px;
    border: 1px solid #2d2d31;
    border-radius: 17px;
    background: rgba(28, 28, 31, 0.94);
  }

  .public-card h3 {
    margin: 0 0 6px;
    font-size: 20px;
  }

  .public-card-intro {
    margin: 0 0 21px;
    color: #85868c;
    font-size: 13px;
    line-height: 1.55;
  }

  .public-form {
    display: grid;
    gap: 16px;
  }

  .public-field {
    display: grid;
    gap: 7px;
  }

  .public-field label {
    color: #e4e4e6;
    font-size: 13px;
    font-weight: 750;
  }

  .public-input,
  .public-textarea {
    width: 100%;
    border: 1px solid #3a3a3f;
    border-radius: 10px;
    outline: none;
    color: #ffffff;
    background: #111113;
    font: inherit;
    font-size: 15px;
  }

  .public-input {
    height: 47px;
    padding: 0 13px;
  }

  .public-textarea {
    min-height: 105px;
    padding: 13px;
    resize: vertical;
    line-height: 1.5;
  }

  .public-input:focus,
  .public-textarea:focus {
    border-color: #d94b5b;
    box-shadow: 0 0 0 3px rgba(217, 75, 91, 0.14);
  }

  .public-notice {
    padding: 13px;
    border: 1px solid #47474c;
    border-radius: 10px;
    color: #aeafb4;
    background: rgba(13, 13, 15, 0.46);
    font-size: 12px;
    line-height: 1.55;
  }

  .public-submit {
    width: 100%;
    padding: 14px 18px;
    border: 1px solid #ee5464;
    border-radius: 10px;
    color: #ffffff;
    background: linear-gradient(180deg, #d94051, #9d2432);
    box-shadow: 0 13px 32px rgba(163, 30, 46, 0.25);
    cursor: pointer;
    font: inherit;
    font-weight: 850;
  }

  .public-submit:disabled {
    cursor: not-allowed;
    filter: grayscale(0.35);
    opacity: 0.55;
  }

  .public-message {
    margin-bottom: 18px;
    padding: 14px;
    border-radius: 10px;
    font-size: 13px;
    line-height: 1.5;
  }

  .public-message-error {
    border: 1px solid #73313a;
    color: #ffabb3;
    background: rgba(106, 28, 39, 0.3);
  }

  .public-message-success {
    border: 1px solid #305c40;
    color: #a7e8ba;
    background: rgba(29, 92, 51, 0.25);
  }

  .public-claim-list {
    display: grid;
    gap: 11px;
  }

  .public-claim-row {
    padding: 15px;
    border: 1px solid #35353a;
    border-radius: 12px;
    background: rgba(12, 12, 14, 0.42);
  }

  .public-claim-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }

  .public-claim-row h4 {
    margin: 0 0 5px;
    font-size: 14px;
  }

  .public-claim-meta {
    margin: 0;
    color: #74757b;
    font-size: 12px;
  }

  .public-claim-badge {
    padding: 5px 8px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.04em;
  }

  .public-claim-badge-pending {
    border: 1px solid #66562c;
    color: #e5cc82;
    background: rgba(105, 82, 20, 0.22);
  }

  .public-claim-badge-confirmed {
    border: 1px solid #305c40;
    color: #97e3b0;
    background: rgba(29, 92, 51, 0.25);
  }

  .public-claim-comment {
    margin: 11px 0 0;
    color: #a3a4a9;
    font-size: 12px;
    line-height: 1.5;
  }

  .public-empty {
    padding: 45px 20px;
    border: 1px dashed #3a3a3f;
    border-radius: 12px;
    color: #797a80;
    text-align: center;
  }

  .public-error-page {
    display: grid;
    place-items: center;
    min-height: 100vh;
    padding: 25px;
    color: #f5f5f5;
    background: #0d0d0f;
    font-family: Inter, sans-serif;
  }

  .public-error-card {
    width: min(500px, 100%);
    padding: 30px;
    border: 1px solid #3a3033;
    border-radius: 18px;
    background: #1c1c1f;
    text-align: center;
  }

  @media (max-width: 820px) {
    .public-game-page {
      padding: 20px;
    }

    .public-hero-body {
      align-items: flex-start;
      flex-direction: column;
    }

    .public-stats {
      grid-template-columns: 1fr;
    }

    .public-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 480px) {
    .public-game-page {
      padding: 14px;
    }

    .public-hero-body,
    .public-card {
      padding: 20px;
    }
  }
`;

export default function PublicGamePage() {
  const { game, totals, claims, results } =
    useLoaderData<typeof loader>();

  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";

  const remaining = Math.max(
    game.totalSpots - totals.reservedQuantity,
    0,
  );

  const filledPercentage =
    game.totalSpots > 0
      ? Math.min(
          Math.round(
            (totals.reservedQuantity / game.totalSpots) * 100,
          ),
          100,
        )
      : 0;

  const claimsOpen =
    game.status === "OPEN" && remaining > 0;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />

      <main className="public-game-page">
        <div className="public-game-shell">
          <header className="public-brand">
            <div className="public-brand-mark" aria-hidden="true">
              A
            </div>

            <div>
              <h1>ASYLUM GAMES</h1>
              <p>Private community game</p>
            </div>
          </header>

          <section className="public-hero">
            <div className="public-hazard" />

            <div className="public-hero-body">
              <div>
                <p className="public-eyebrow">
                  {game.status === "COMPLETED" ? "Official game record" : "Secure your spots"}
                </p>

                <h2>{game.title}</h2>

                <p className="public-description">
                  {game.description ||
                    "Enter the number of spots you would like to reserve."}
                </p>
              </div>

              <span
                className={[
                  "public-live-status",
                  game.status !== "OPEN"
                    ? "public-live-status-closed"
                    : "",
                ].join(" ")}
              >
                {game.status === "COMPLETED" ? "GAME COMPLETE" : claimsOpen ? "CLAIMS OPEN" : "CLAIMS CLOSED"}
              </span>
            </div>
          </section>

          <section
            className="public-stats"
            aria-label="Game statistics"
          >
            <article className="public-stat">
              <p className="public-stat-label">Total spots</p>
              <p className="public-stat-value">
                {game.totalSpots.toLocaleString()}
              </p>
              <p className="public-stat-note">
                {formatCurrency(game.pricePerSpot)} per spot
              </p>
            </article>

            <article className="public-stat">
              <p className="public-stat-label">Claimed</p>
              <p className="public-stat-value">
                {totals.reservedQuantity.toLocaleString()}
              </p>
              <p className="public-stat-note">
                Pending and confirmed
              </p>
            </article>

            <article className="public-stat">
              <p className="public-stat-label">Remaining</p>
              <p className="public-stat-value">
                {remaining.toLocaleString()}
              </p>
              <p className="public-stat-note">
                Available to reserve
              </p>
            </article>
          </section>

          <section className="public-progress">
            <div className="public-progress-heading">
              <span>Game progress</span>
              <span>{filledPercentage}% filled</span>
            </div>

            <div className="public-progress-track">
              <div
                className="public-progress-fill"
                style={{
                  width: `${filledPercentage}%`,
                }}
              />
            </div>
          </section>

          {actionData?.error ? (
            <div className="public-message public-message-error">
              {actionData.error}
            </div>
          ) : null}

          {actionData?.success ? (
            <div className="public-message public-message-success">
              {actionData.success}
            </div>
          ) : null}

          {game.status === "COMPLETED" && results ? (
            <PublicGameResults gameTitle={game.title} results={results} />
          ) : null}

          <section className="public-grid">
            <article className="public-card">
              <h3>Claim your spots</h3>

              <p className="public-card-intro">
                Your claim reserves spots immediately and remains
                pending until the host confirms it.
              </p>

              <Form className="public-form" method="post">
                <div className="public-field">
                  <label htmlFor="displayName">
                    Facebook display name
                  </label>

                  <input
                    className="public-input"
                    id="displayName"
                    name="displayName"
                    type="text"
                    maxLength={100}
                    required
                    disabled={!claimsOpen || isSubmitting}
                  />
                </div>

                <div className="public-field">
                  <label htmlFor="facebookHandle">
                    Facebook username
                  </label>

                  <input
                    className="public-input"
                    id="facebookHandle"
                    name="facebookHandle"
                    type="text"
                    maxLength={100}
                    placeholder="@username"
                    disabled={!claimsOpen || isSubmitting}
                  />
                </div>

                <div className="public-field">
                  <label htmlFor="quantity">
                    Number of spots
                  </label>

                  <input
                    className="public-input"
                    id="quantity"
                    name="quantity"
                    type="number"
                    min="1"
                    max={remaining}
                    step="1"
                    required
                    disabled={!claimsOpen || isSubmitting}
                  />
                </div>

                <div className="public-field">
                  <label htmlFor="comment">
                    Comment
                  </label>

                  <textarea
                    className="public-textarea"
                    id="comment"
                    name="comment"
                    maxLength={500}
                    placeholder="Optional message for the host"
                    disabled={!claimsOpen || isSubmitting}
                  />
                </div>

                <div className="public-notice">
                  No payment is collected on this page. Your claim
                  will remain pending until the host verifies and
                  confirms it separately.
                </div>

                <button
                  className="public-submit"
                  type="submit"
                  disabled={!claimsOpen || isSubmitting}
                >
                  {isSubmitting
                    ? "Reserving spots…"
                    : claimsOpen
                      ? "Secure My Spots"
                      : "Claims Closed"}
                </button>
              </Form>
            </article>

            <article className="public-card">
              <h3>Recent activity</h3>

              <p className="public-card-intro">
                Names are shortened publicly for member privacy.
              </p>

              {claims.length === 0 ? (
                <div className="public-empty">
                  No member claims yet.
                </div>
              ) : (
                <div className="public-claim-list">
                  {claims.map((claim) => (
                    <div
                      className="public-claim-row"
                      key={claim.id}
                    >
                      <div className="public-claim-top">
                        <div>
                          <h4>{claim.displayName}</h4>

                          <p className="public-claim-meta">
                            {claim.quantity}{" "}
                            {claim.quantity === 1
                              ? "spot"
                              : "spots"}{" "}
                            · {formatDate(claim.createdAt)}
                          </p>
                        </div>

                        <span
                          className={[
                            "public-claim-badge",
                            `public-claim-badge-${claim.status.toLowerCase()}`,
                          ].join(" ")}
                        >
                          {claim.status}
                        </span>
                      </div>

                      {claim.comment ? (
                        <p className="public-claim-comment">
                          {claim.comment}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>
        </div>
      </main>
    </>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  let title = "Game unavailable";
  let message =
    "This game could not be loaded. Check the link and try again.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Game not found";
      message =
        "This game does not exist or is no longer available.";
    }

    if (error.status === 400) {
      title = "Invalid game link";
      message = "The game link is missing required information.";
    }
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />

      <main className="public-error-page">
        <section className="public-error-card">
          <h1>{title}</h1>
          <p>{message}</p>
        </section>
      </main>
    </>
  );
}
