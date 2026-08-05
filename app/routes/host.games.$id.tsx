import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useOutletContext,
} from "react-router";
import { requireHostMutation, requireHostUser } from "../lib/host-auth.server";
import {
  getGameForShop,
  updateGameStatus,
  archiveGame,
  restoreGame,
} from "../models/game.server";
import {
  cancelClaim,
  confirmClaimPayment,
  getClaimsForGame,
  getClaimTotals,
  updateClaimDisplayName,
} from "../models/claim.server";
import { getGameResults } from "../models/game-results.server";
import { runGameReadinessCheck } from "../services/game-readiness.server";
import { formatRaffleCode } from "../lib/raffle-number";
import { recordHostAuditEvent } from "../models/host-audit.server";

async function ownedGame(id: string | undefined, shop: string) {
  if (!id) throw new Response("Game ID is required.", { status: 400 });
  const game = await getGameForShop(id, shop);
  if (!game) throw new Response("Game not found.", { status: 404 });
  return game;
}
export async function loader({ request, params }: LoaderFunctionArgs) {
  const host = await requireHostUser(request);
  const game = await ownedGame(params.id, host.shop);
  const [claims, totals, readiness, results] = await Promise.all([
    getClaimsForGame(game.id),
    getClaimTotals(game.id),
    runGameReadinessCheck(game.id, host.shop),
    getGameResults(game.id),
  ]);
  return {
    csrfToken: host.csrfToken,
    game: {
      id: game.id,
      title: game.title,
      description: game.description,
      status: game.status,
      archived: Boolean(game.archivedAt),
      raffleCode: formatRaffleCode({
        year: game.raffleYear,
        number: game.raffleNumber,
      }),
      totalSpots: game.totalSpots,
      pricePerSpot: game.pricePerSpot.toString(),
    },
    claims: claims.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      expiresAt: c.expiresAt?.toISOString() ?? null,
    })),
    totals,
    readiness,
    results,
  };
}
export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const permission =
    intent === "archive-game" || intent === "restore-game"
      ? ("games:archive" as const)
      : intent === "open-wheels" || intent === "open-broadcast"
        ? ("wheels:operate" as const)
        : ["confirm-claim", "cancel-claim", "edit-claim-name"].includes(intent)
          ? ("claims:manage" as const)
          : ("games:manage" as const);
  const host = await requireHostMutation(request, permission, formData);
  const game = await ownedGame(params.id, host.shop);
  try {
    if (intent === "confirm-claim")
      await confirmClaimPayment(String(formData.get("claimId") ?? ""), game.id);
    else if (intent === "cancel-claim")
      await cancelClaim(String(formData.get("claimId") ?? ""), game.id);
    else if (intent === "edit-claim-name")
      await updateClaimDisplayName({
        shop: host.shop,
        gameId: game.id,
        claimId: String(formData.get("claimId") ?? ""),
        displayName: String(formData.get("displayName") ?? ""),
      });
    else if (intent === "close-game")
      await updateGameStatus(game.id, host.shop, "CLOSED");
    else if (intent === "reopen-game")
      await updateGameStatus(game.id, host.shop, "OPEN");
    else if (intent === "archive-game") await archiveGame(game.id, host.shop);
    else if (intent === "restore-game") await restoreGame(game.id, host.shop);
    else if (intent === "open-wheels" || intent === "open-broadcast") {
      const readiness = await runGameReadinessCheck(game.id, host.shop);
      if (!readiness.isReady)
        return {
          error: `${readiness.blockingCount} readiness issues must be resolved.`,
        };
      throw redirect(
        `/host/games/${game.id}/${intent === "open-wheels" ? "play" : "broadcast"}`,
      );
    } else return { error: "Unknown game action." };
    await recordHostAuditEvent({
      shop: host.shop,
      actorId: host.actorId,
      actorLabel: host.actorDisplayName,
      action: `game.${intent}`,
      targetType: "Game",
      targetId: game.id,
    });
    return { success: "Game state saved." };
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      error: error instanceof Error ? error.message : "The game action failed.",
    };
  }
}
export default function HostGame() {
  const { game, claims, totals, readiness, results, csrfToken } =
    useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const { user } = useOutletContext<{ user: { permissions: string[] } }>();
  const resultWheels = results?.rounds.flatMap((round) => round.wheels) ?? [];
  return (
    <>
      <header className="host-header">
        <p className="host-kicker">{game.raffleCode}</p>
        <h1>{game.title}</h1>
        <p>{game.description}</p>
      </header>
      {data?.error ? (
        <p className="host-message host-error">{data.error}</p>
      ) : null}
      {data?.success ? (
        <p className="host-message host-success">{data.success}</p>
      ) : null}
      <section className="host-grid">
        <article className="host-card">
          <h2>Game Status</h2>
          <dl>
            <div>
              <dt>Status</dt>
              <dd>{game.status}</dd>
            </div>
            <div>
              <dt>Spots</dt>
              <dd>
                {totals.reservedQuantity}/{game.totalSpots}
              </dd>
            </div>
            <div>
              <dt>Readiness</dt>
              <dd>
                {readiness.isReady
                  ? "READY"
                  : `${readiness.blockingCount} blocked`}
              </dd>
            </div>
          </dl>
          <div className="host-actions">
            {user.permissions.includes("games:manage") ? (
              <Form method="post">
                <input type="hidden" name="csrfToken" value={csrfToken} />
                {game.status === "OPEN" ? (
                  <button name="intent" value="close-game">
                    Close Game
                  </button>
                ) : game.status === "CLOSED" ? (
                  <button name="intent" value="reopen-game">
                    Reopen Game
                  </button>
                ) : null}
              </Form>
            ) : null}
            {user.permissions.includes("wheels:operate") ? (
              <>
                <Form method="post">
                  <input type="hidden" name="csrfToken" value={csrfToken} />
                  <button
                    className="host-button"
                    name="intent"
                    value="open-wheels"
                  >
                    Game Mode
                  </button>
                </Form>
                <Form method="post">
                  <input type="hidden" name="csrfToken" value={csrfToken} />
                  <button
                    className="host-button"
                    name="intent"
                    value="open-broadcast"
                  >
                    Broadcast
                  </button>
                </Form>
              </>
            ) : null}
          </div>
        </article>
        <article className="host-card">
          <h2>Saved Results</h2>
          {resultWheels.length ? (
            resultWheels.map((w) => (
              <p key={w.id}>
                <strong>{w.label}:</strong> {w.winner ?? "Pending"}
              </p>
            ))
          ) : (
            <p className="host-empty">No completed wheels.</p>
          )}
        </article>
      </section>
      <section className="host-card">
        <h2>Claims</h2>
        <div className="host-grid">
          {claims.map((claim) => (
            <article className="host-card" key={claim.id}>
              <h3>{claim.displayName}</h3>
              <p>
                {claim.quantity} spot(s) · {claim.status}
              </p>
              {user.permissions.includes("claims:manage") ? (
                <div className="host-actions">
                  <Form method="post">
                    <input type="hidden" name="csrfToken" value={csrfToken} />
                    <input type="hidden" name="claimId" value={claim.id} />
                    <button
                      className="host-button"
                      name="intent"
                      value="confirm-claim"
                    >
                      Mark Paid
                    </button>
                    <button type="submit" name="intent" value="cancel-claim">
                      Cancel
                    </button>
                  </Form>
                  <Form method="post">
                    <input type="hidden" name="csrfToken" value={csrfToken} />
                    <input type="hidden" name="claimId" value={claim.id} />
                    <input
                      name="displayName"
                      defaultValue={claim.displayName}
                      aria-label={`Correct ${claim.displayName}`}
                    />
                    <button name="intent" value="edit-claim-name">
                      Correct Name
                    </button>
                  </Form>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
      <p>
        <Link className="host-link" to="/host">
          Return to Dashboard
        </Link>
      </p>
    </>
  );
}
