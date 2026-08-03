import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  isRouteErrorResponse,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  useRouteError,
} from "react-router";
import {
  getPrizeClaimForShop,
  updatePrizeClaimStatus,
} from "../models/prize-claim.server";
import { authenticate } from "../shopify.server";
import { formatRaffleCode } from "../lib/raffle-number";
import { formatPrizeClaimShippingSummary } from "../lib/prize-claim";
import "../styles/prize-claims.css";
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  if (!params.id)
    throw new Response("Prize claim ID is required.", { status: 400 });
  const claim = await getPrizeClaimForShop(params.id, session.shop);
  if (!claim) throw new Response("Prize claim not found.", { status: 404 });
  return {
    claim: {
      ...claim,
      generatedAt: claim.generatedAt.toISOString(),
      expiresAt: claim.expiresAt?.toISOString() ?? null,
      submittedAt: claim.submittedAt?.toISOString() ?? null,
      reviewedAt: claim.reviewedAt?.toISOString() ?? null,
      fulfilledAt: claim.fulfilledAt?.toISOString() ?? null,
      revokedAt: claim.revokedAt?.toISOString() ?? null,
      createdAt: claim.createdAt.toISOString(),
      updatedAt: claim.updatedAt.toISOString(),
        game: {
          ...claim.game,
          raffleCode: formatRaffleCode(claim.game.raffleNumber),
        archivedAt: claim.game.archivedAt?.toISOString() ?? null,
      },
    },
  };
}
type ActionData = { error?: string; success?: string };
export async function action({
  request,
  params,
}: ActionFunctionArgs): Promise<ActionData> {
  const { session } = await authenticate.admin(request);
  if (!params.id) return { error: "Prize claim ID is missing." };
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  try {
    if (!["review", "fulfill", "revoke"].includes(intent))
      return { error: "Unknown prize claim action." };
    await updatePrizeClaimStatus({
      id: params.id,
      shop: session.shop,
      action: intent as "review" | "fulfill" | "revoke",
      confirmSubmittedRevocation:
        formData.get("confirmSubmittedRevocation") === "yes",
      adminNotes: String(formData.get("adminNotes") ?? "").trim() || undefined,
    });
    return {
      success:
        intent === "review"
          ? "Prize claim marked reviewed."
          : intent === "fulfill"
            ? "Prize claim marked fulfilled."
            : "Prize claim revoked.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "The prize claim could not be updated.",
    };
  }
}
const show = (value: string | null) => value || "—";
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
export default function PrizeClaimDetail() {
  const { claim } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  const shippingAddress = [
    claim.addressLine1,
    claim.addressLine2,
    [claim.city, claim.stateProvince, claim.postalCode]
      .filter(Boolean)
      .join(", "),
    claim.country,
  ]
    .filter(Boolean)
    .join("\n");
  const shippingSummary = formatPrizeClaimShippingSummary(claim);
  return (
    <main className="prize-admin-page">
      <div className="prize-admin-shell">
        <Link to="/app/prize-claims">← Prize Claims</Link>
        <header>
          <p>Private fulfillment record</p>
          <h1>{claim.winnerDisplayName}</h1>
          <span>
            {claim.game.raffleCode} · {claim.game.title} · {claim.wheelLabel} · {claim.status}
          </span>
        </header>
        {actionData?.error ? (
          <p className="prize-message prize-error">{actionData.error}</p>
        ) : null}
        {actionData?.success ? (
          <p className="prize-message">{actionData.success}</p>
        ) : null}
        <section className="prize-detail-grid">
          <article>
            <h2>Prize request</h2>
            <dl>
              <div>
                <dt>Prize requested</dt>
                <dd>{show(claim.preferredPrize)}</dd>
              </div>
              <div>
                <dt>Winner name</dt>
                <dd>{claim.winnerDisplayName}</dd>
              </div>
              <div>
                <dt>Notes</dt>
                <dd className="prize-prewrap">{show(claim.winnerNotes)}</dd>
              </div>
            </dl>
          </article>
          <article>
            <h2>Shipping address</h2>
            <dl>
              <div>
                <dt>Full name</dt>
                <dd>{show(claim.recipientName)}</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd className="prize-prewrap">{shippingAddress || "—"}</dd>
              </div>
            </dl>
            <div className="prize-actions">
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(shippingSummary)}
              >
                Copy Shipping Summary
              </button>
            </div>
          </article>
          <article>
            <h2>Claim record</h2>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>{claim.status}</dd>
              </div>
              <div>
                <dt>Generated</dt>
                <dd>{date(claim.generatedAt)}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{date(claim.submittedAt)}</dd>
              </div>
              <div>
                <dt>Reviewed</dt>
                <dd>{date(claim.reviewedAt)}</dd>
              </div>
              <div>
                <dt>Fulfilled</dt>
                <dd>{date(claim.fulfilledAt)}</dd>
              </div>
            </dl>
          </article>
        </section>
        <Form className="prize-admin-action" method="post">
          <label>
            Admin notes
            <textarea
              name="adminNotes"
              defaultValue={claim.adminNotes ?? ""}
              maxLength={2000}
            />
          </label>
          <div className="prize-actions">
            {claim.status === "SUBMITTED" ? (
              <button name="intent" value="review" disabled={busy}>
                Mark Reviewed
              </button>
            ) : null}
            {["SUBMITTED", "REVIEWED"].includes(claim.status) ? (
              <button name="intent" value="fulfill" disabled={busy}>
                Mark Fulfilled
              </button>
            ) : null}
            {claim.status === "OPEN" ? (
              <button name="intent" value="revoke" disabled={busy}>
                Revoke Link
              </button>
            ) : null}
            {claim.status === "SUBMITTED" ? (
              <label>
                <input
                  type="checkbox"
                  name="confirmSubmittedRevocation"
                  value="yes"
                />{" "}
                Confirm submitted-request revocation
                <button name="intent" value="revoke" disabled={busy}>
                  Revoke Submitted Request
                </button>
              </label>
            ) : null}
          </div>
        </Form>
        <p>
          <Link to={`/app/games/${claim.gameId}`}>
            Open Game Control Center
          </Link>
        </p>
      </div>
    </main>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? String(error.data || error.statusText)
    : error instanceof Error
      ? error.message
      : "Prize claim could not be loaded.";

  return (
    <main className="prize-admin-page">
      <div className="prize-admin-shell">
        <h1>Prize claim could not be loaded.</h1>
        <p className="prize-message prize-error" role="alert">
          {message}
        </p>
        <Link to="/app/prize-claims">Return to Prize Claims</Link>
      </div>
    </main>
  );
}
