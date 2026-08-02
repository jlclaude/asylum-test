import type { LoaderFunctionArgs } from "react-router";
import type { GameStatus } from "@prisma/client";
import { Form, useLoaderData, useNavigate } from "react-router";
import {
  getDashboardGameCountsForShop,
  getGamesForShop,
} from "../models/game.server";
import { getGameTemplateSummaryForShop } from "../models/game-template.server";
import { authenticate } from "../shopify.server";
import { AsylumLogo } from "../components/asylum/AsylumLogo";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const requestedStatus = url.searchParams.get("status") ?? "ALL";
  const status: GameStatus | "ALL" = ["OPEN", "CLOSED", "READY", "IN_PROGRESS", "COMPLETED"].includes(requestedStatus)
    ? requestedStatus as GameStatus
    : "ALL";
  const sort = url.searchParams.get("sort") === "oldest" ? "oldest" : "newest";
  const [games, counts, templateSummary] = await Promise.all([
    getGamesForShop(session.shop, { search, status, sort }),
    getDashboardGameCountsForShop(session.shop),
    getGameTemplateSummaryForShop(session.shop),
  ]);

  return {
    counts,
    filters: { search, status, sort },
    templateSummary,
    games: games.map((game) => ({
      id: game.id,
      title: game.title,
      description: game.description,
      totalSpots: game.totalSpots,
      pricePerSpot: game.pricePerSpot.toString(),
      status: game.status,
      createdAt: game.createdAt.toISOString(),
    })),
  };
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
    year: "numeric",
  }).format(new Date(value));
}

const styles = `
  :root {
    color-scheme: dark;
  }

  * {
    box-sizing: border-box;
  }

  .asylum-dashboard {
    min-height: 100%;
    padding: 32px;
    color: #f5f5f5;
    background:
      radial-gradient(
        circle at top right,
        rgba(155, 22, 34, 0.18),
        transparent 34%
      ),
      linear-gradient(
        145deg,
        #0d0d0f 0%,
        #171719 52%,
        #101012 100%
      );
    font-family:
      Inter,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
  }

  .asylum-shell {
    width: min(1180px, 100%);
    margin: 0 auto;
  }

  .asylum-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 42px;
  }

  .asylum-brand {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .asylum-mark {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border: 1px solid #5e252c;
    border-radius: 14px;
    color: #ff5968;
    background: linear-gradient(145deg, #251316, #130e10);
    box-shadow:
      inset 0 0 20px rgba(255, 61, 80, 0.08),
      0 12px 30px rgba(0, 0, 0, 0.32);
    font-size: 25px;
    font-weight: 800;
  }

  .asylum-mark .asylum-logo-image {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .asylum-brand h1 {
    margin: 0;
    font-size: clamp(25px, 4vw, 36px);
    letter-spacing: 0.04em;
    line-height: 1;
  }

  .asylum-brand p {
    margin: 8px 0 0;
    color: #9d9da3;
    font-size: 14px;
  }

  .asylum-status {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 9px 13px;
    border: 1px solid #2d553b;
    border-radius: 999px;
    color: #9ee6b5;
    background: rgba(24, 75, 42, 0.25);
    font-size: 13px;
    font-weight: 700;
  }

  .asylum-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #52d881;
    box-shadow: 0 0 12px rgba(82, 216, 129, 0.7);
  }

  .asylum-hero {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    padding: 30px;
    margin-bottom: 24px;
    border: 1px solid #2d2d31;
    border-radius: 20px;
    background: linear-gradient(
      135deg,
      rgba(37, 37, 41, 0.94),
      rgba(21, 21, 24, 0.94)
    );
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
  }

  .asylum-eyebrow {
    margin: 0 0 10px;
    color: #e44e5e;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }

  .asylum-hero h2 {
    max-width: 680px;
    margin: 0;
    font-size: clamp(27px, 4vw, 43px);
    line-height: 1.08;
  }

  .asylum-hero-description {
    max-width: 670px;
    margin: 16px 0 0;
    color: #aeafb4;
    font-size: 16px;
    line-height: 1.65;
  }

  .asylum-primary-button {
    flex: 0 0 auto;
    min-width: 164px;
    padding: 14px 20px;
    border: 1px solid #ee5464;
    border-radius: 11px;
    color: #ffffff;
    background: linear-gradient(180deg, #d94051, #9d2432);
    box-shadow: 0 12px 30px rgba(163, 30, 46, 0.28);
    cursor: pointer;
    font: inherit;
    font-weight: 800;
    transition:
      transform 150ms ease,
      filter 150ms ease;
  }

  .asylum-hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .asylum-secondary-button {
    padding: 12px 17px;
    border: 1px solid #46464c;
    border-radius: 11px;
    color: #ededf0;
    background: #222226;
    cursor: pointer;
    font: inherit;
    font-weight: 750;
  }

  .asylum-primary-button:hover {
    filter: brightness(1.1);
    transform: translateY(-1px);
  }

  .asylum-primary-button:active {
    transform: translateY(0);
  }

  .asylum-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
    margin-bottom: 24px;
  }

  .asylum-card {
    padding: 24px;
    border: 1px solid #2b2b2f;
    border-radius: 17px;
    background: rgba(28, 28, 31, 0.92);
    box-shadow: 0 16px 45px rgba(0, 0, 0, 0.2);
  }

  .asylum-stat-label {
    margin: 0;
    color: #a4a4aa;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .asylum-stat-value {
    margin: 16px 0 8px;
    font-size: 42px;
    font-weight: 800;
    line-height: 1;
  }

  .asylum-stat-note {
    margin: 0;
    color: #6f7076;
    font-size: 13px;
  }

  .asylum-content-grid {
    display: grid;
    grid-template-columns:
      minmax(0, 1.7fr)
      minmax(260px, 0.8fr);
    gap: 18px;
  }

  .asylum-section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 22px;
  }

  .asylum-section-heading h3 {
    margin: 0;
    font-size: 19px;
  }

  .asylum-section-heading span {
    color: #77787e;
    font-size: 13px;
  }

  .asylum-empty-state {
    display: grid;
    place-items: center;
    min-height: 215px;
    padding: 28px;
    border: 1px dashed #3a3a3f;
    border-radius: 13px;
    text-align: center;
    background: rgba(12, 12, 14, 0.28);
  }

  .asylum-empty-icon {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    margin: 0 auto 14px;
    border-radius: 12px;
    color: #d74b5b;
    background: #2a171b;
    font-size: 22px;
  }

  .asylum-empty-state h4 {
    margin: 0 0 8px;
    font-size: 16px;
  }

  .asylum-empty-state p {
    max-width: 360px;
    margin: 0;
    color: #85868c;
    font-size: 14px;
    line-height: 1.55;
  }

  .asylum-steps {
    display: grid;
    gap: 15px;
  }

  .asylum-step {
    display: grid;
    grid-template-columns: 32px 1fr;
    gap: 12px;
    align-items: start;
  }

  .asylum-step-number {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 1px solid #4c292e;
    border-radius: 9px;
    color: #ed6a78;
    background: #241518;
    font-size: 13px;
    font-weight: 800;
  }

  .asylum-step h4 {
    margin: 1px 0 4px;
    font-size: 14px;
  }

  .asylum-step p {
    margin: 0;
    color: #7f8086;
    font-size: 13px;
    line-height: 1.45;
  }

  .asylum-game-list {
    display: grid;
    gap: 12px;
  }

  .asylum-game-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 17px;
    border: 1px solid #343439;
    border-radius: 13px;
    background: rgba(13, 13, 15, 0.48);
    cursor: pointer;
    transition:
      border-color 150ms ease,
      transform 150ms ease,
      background 150ms ease;
  }

  .asylum-game-row:hover {
    border-color: #5b343a;
    background: rgba(20, 16, 18, 0.7);
    transform: translateY(-1px);
  }

  .asylum-game-row:focus-visible {
    outline: 3px solid rgba(217, 75, 91, 0.3);
    outline-offset: 2px;
  }

  .asylum-game-main {
    min-width: 0;
  }

  .asylum-game-main h4 {
    overflow: hidden;
    margin: 0 0 7px;
    color: #f4f4f5;
    font-size: 15px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .asylum-game-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 7px 14px;
    margin: 0;
    color: #818287;
    font-size: 12px;
  }

  .asylum-game-side {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 14px;
  }

  .asylum-game-status {
    display: inline-flex;
    align-items: center;
    padding: 6px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .asylum-game-status-open {
    border: 1px solid #305c40;
    color: #97e3b0;
    background: rgba(29, 92, 51, 0.25);
  }

  .asylum-game-status-closed {
    border: 1px solid #66562c;
    color: #e5cc82;
    background: rgba(105, 82, 20, 0.22);
  }

  .asylum-game-status-completed {
    border: 1px solid #45464c;
    color: #b7b8bd;
    background: rgba(69, 70, 76, 0.22);
  }

  .asylum-game-arrow {
    color: #64656b;
    font-size: 18px;
  }

  .asylum-game-filters {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) auto auto auto;
    gap: 9px;
    margin: 16px 0;
  }

  .asylum-game-filters input,
  .asylum-game-filters select,
  .asylum-game-filters button {
    min-height: 40px;
    padding: 0 10px;
    border: 1px solid #3d3d42;
    border-radius: 8px;
    color: #ffffff;
    background: #151517;
    font: inherit;
  }

  @media (max-width: 820px) {
    .asylum-dashboard {
      padding: 20px;
    }

    .asylum-header,
    .asylum-hero {
      align-items: flex-start;
      flex-direction: column;
    }

    .asylum-stats,
    .asylum-content-grid {
      grid-template-columns: 1fr;
    }

    .asylum-game-filters {
      grid-template-columns: 1fr;
    }

    .asylum-primary-button {
      width: 100%;
    }
  }

  @media (max-width: 480px) {
    .asylum-dashboard {
      padding: 14px;
    }

    .asylum-hero,
    .asylum-card {
      padding: 20px;
    }

    .asylum-status {
      display: none;
    }

    .asylum-game-row {
      align-items: flex-start;
      flex-direction: column;
    }

    .asylum-game-side {
      justify-content: space-between;
      width: 100%;
    }
  }
`;

export default function AppIndex() {
  const navigate = useNavigate();
  const { counts, filters, games, templateSummary } = useLoaderData<typeof loader>();

  const stats = [
    {
      label: "Open games",
      value: String(counts.open),
      note: "Games currently accepting claims",
    },
    {
      label: "Templates",
      value: String(templateSummary.count),
      note: templateSummary.defaultTemplate
        ? `Default: ${templateSummary.defaultTemplate.name}`
        : "No default template selected",
    },
    {
      label: "Completed games",
      value: String(counts.completed),
      note: "Finished draws and winners",
    },
    {
      label: "Archived games",
      value: String(counts.archived),
      note: "Preserved outside the active list",
    },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />

      <main className="asylum-dashboard">
        <div className="asylum-shell">
          <header className="asylum-header">
            <div className="asylum-brand">
              <div className="asylum-mark">
                <AsylumLogo decorative />
              </div>

              <div>
                <h1>ASYLUM GAMES</h1>
                <p>Private games. Manual claims. Transparent draws.</p>
              </div>
            </div>

            <div className="asylum-status">
              <span className="asylum-status-dot" />
              Development environment
            </div>
          </header>

          <section className="asylum-hero">
            <div>
              <p className="asylum-eyebrow">Host control center</p>

              <h2>Run every game from one secure dashboard.</h2>

              <p className="asylum-hero-description">
                Create games, review Facebook claims, confirm payments,
                lock entries, and draw a winner from one place.
              </p>
            </div>

            <div className="asylum-hero-actions">
              <button className="asylum-secondary-button" type="button" onClick={() => navigate("/app/games/archived")}>Archived Games</button>
              <button className="asylum-secondary-button" type="button" onClick={() => navigate("/app/second-chance")}>Second Chance Entries</button>
              <button className="asylum-secondary-button" type="button" onClick={() => navigate("/app/templates")}>Manage Templates</button>
              <button className="asylum-primary-button" type="button" onClick={() => navigate("/app/games/new")}>+ Create Game</button>
            </div>
          </section>

          <section
            className="asylum-stats"
            aria-label="Game statistics"
          >
            {stats.map((stat) => (
              <article className="asylum-card" key={stat.label}>
                <p className="asylum-stat-label">{stat.label}</p>
                <p className="asylum-stat-value">{stat.value}</p>
                <p className="asylum-stat-note">{stat.note}</p>
              </article>
            ))}
          </section>

          <section className="asylum-content-grid">
            <article className="asylum-card">
              <div className="asylum-section-heading">
                <h3>Recent games</h3>

                <span>
                  {games.length === 0
                    ? "No activity yet"
                    : `${games.length} ${
                        games.length === 1 ? "game" : "games"
                      }`}
                </span>
              </div>

              <Form className="asylum-game-filters" method="get">
                <input type="search" name="search" defaultValue={filters.search} placeholder="Search games by title" aria-label="Search games by title" />
                <select name="status" defaultValue={filters.status} aria-label="Filter by gameplay status"><option value="ALL">All statuses</option><option value="OPEN">Open</option><option value="CLOSED">Closed</option><option value="READY">Ready</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option></select>
                <select name="sort" defaultValue={filters.sort} aria-label="Sort games by created date"><option value="newest">Newest created</option><option value="oldest">Oldest created</option></select>
                <button type="submit">Apply</button>
              </Form>

              {games.length === 0 ? (
                <div className="asylum-empty-state">
                  <div>
                    <div
                      className="asylum-empty-icon"
                      aria-hidden="true"
                    >
                      +
                    </div>

                    <h4>Your first game starts here</h4>

                    <p>
                      Create a game to begin accepting claims and
                      tracking confirmed entries.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="asylum-game-list">
                  {games.slice(0, 5).map((game) => (
                    <div
                      className="asylum-game-row"
                      key={game.id}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        navigate(`/app/games/${game.id}`)
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" ||
                          event.key === " "
                        ) {
                          navigate(`/app/games/${game.id}`);
                        }
                      }}
                    >
                      <div className="asylum-game-main">
                        <h4>{game.title}</h4>

                        <p className="asylum-game-meta">
                          <span>
                            {game.totalSpots.toLocaleString()} spots
                          </span>

                          <span>
                            {formatCurrency(game.pricePerSpot)} per spot
                          </span>

                          <span>
                            Created {formatDate(game.createdAt)}
                          </span>
                        </p>
                      </div>

                      <div className="asylum-game-side">
                        <span
                          className={[
                            "asylum-game-status",
                            `asylum-game-status-${game.status.toLowerCase()}`,
                          ].join(" ")}
                        >
                          {game.status}
                        </span>

                        <span
                          className="asylum-game-arrow"
                          aria-hidden="true"
                        >
                          ›
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <aside className="asylum-card">
              <div className="asylum-section-heading">
                <h3>How it works</h3>
              </div>

              <div className="asylum-steps">
                <div className="asylum-step">
                  <span className="asylum-step-number">1</span>

                  <div>
                    <h4>Create a game</h4>
                    <p>
                      Set the title, number of spots, and spot price.
                    </p>
                  </div>
                </div>

                <div className="asylum-step">
                  <span className="asylum-step-number">2</span>

                  <div>
                    <h4>Confirm claims</h4>
                    <p>
                      Review submissions and manually confirm payment.
                    </p>
                  </div>
                </div>

                <div className="asylum-step">
                  <span className="asylum-step-number">3</span>

                  <div>
                    <h4>Draw the winner</h4>
                    <p>
                      Lock paid entries and run a secure weighted draw.
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </section>
        </div>
      </main>
    </>
  );
}
