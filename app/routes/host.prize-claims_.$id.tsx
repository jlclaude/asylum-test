import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useOutletContext,
} from "react-router";
import { requireHostMutation, requireHostUser } from "../lib/host-auth.server";
import {
  getPrizeClaimForShop,
  updatePrizeClaimStatus,
} from "../models/prize-claim.server";
export async function loader({ request, params }: LoaderFunctionArgs) {
  const host = await requireHostUser(request);
  if (!params.id)
    throw new Response("Prize claim ID is required.", { status: 400 });
  const claim = await getPrizeClaimForShop(params.id, host.shop);
  if (!claim) throw new Response("Prize claim not found.", { status: 404 });
  return {
    csrfToken: host.csrfToken,
    claim: {
      id: claim.id,
      gameId: claim.gameId,
      winnerDisplayName: claim.winnerDisplayName,
      wheelLabel: claim.wheelLabel,
      status: claim.status,
      preferredPrize: claim.preferredPrize,
      recipientName: claim.recipientName,
      addressLine1: claim.addressLine1,
      addressLine2: claim.addressLine2,
      city: claim.city,
      stateProvince: claim.stateProvince,
      postalCode: claim.postalCode,
      country: claim.country,
      winnerNotes: claim.winnerNotes,
      generatedAt: claim.generatedAt.toISOString(),
      submittedAt: claim.submittedAt?.toISOString() ?? null,
      reviewedAt: claim.reviewedAt?.toISOString() ?? null,
      fulfilledAt: claim.fulfilledAt?.toISOString() ?? null,
    },
  };
}
export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const host = await requireHostMutation(
    request,
    "prizeClaims:manage",
    formData,
  );
  const intent = String(formData.get("intent") ?? "");
  if (!params.id) return { error: "Prize claim ID is required." };
  try {
    if (!["review", "fulfill", "revoke"].includes(intent))
      return { error: "Unknown prize claim action." };
    await updatePrizeClaimStatus({
      id: params.id,
      shop: host.shop,
      action: intent as "review" | "fulfill" | "revoke",
    });
    return { success: "Prize claim status saved." };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Prize claim update failed.",
    };
  }
}
export default function HostPrizeDetail() {
  const { claim, csrfToken } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const { user } = useOutletContext<{ user: { permissions: string[] } }>();
  const address = [
    claim.addressLine1,
    claim.addressLine2,
    claim.city,
    claim.stateProvince,
    claim.postalCode,
    claim.country,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <>
      <header className="host-header">
        <p className="host-kicker">Private winner fulfillment</p>
        <h1>{claim.winnerDisplayName}</h1>
      </header>
      {data?.error ? (
        <p className="host-message host-error">{data.error}</p>
      ) : null}
      {data?.success ? (
        <p className="host-message host-success">{data.success}</p>
      ) : null}
      <section className="host-card">
        <dl>
          <div>
            <dt>Status</dt>
            <dd>{claim.status}</dd>
          </div>
          <div>
            <dt>Wheel</dt>
            <dd>{claim.wheelLabel}</dd>
          </div>
          <div>
            <dt>Prize requested</dt>
            <dd>{claim.preferredPrize ?? "Awaiting submission"}</dd>
          </div>
          <div>
            <dt>Full name</dt>
            <dd>{claim.recipientName ?? "—"}</dd>
          </div>
          <div>
            <dt>Shipping address</dt>
            <dd>{address || "—"}</dd>
          </div>
          <div>
            <dt>Notes</dt>
            <dd>{claim.winnerNotes ?? "—"}</dd>
          </div>
        </dl>
        {user.permissions.includes("prizeClaims:manage") ? (
          <Form method="post">
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <div className="host-actions">
              <button name="intent" value="review">
                Mark Reviewed
              </button>
              <button name="intent" value="fulfill">
                Mark Fulfilled
              </button>
              <button name="intent" value="revoke">
                Revoke
              </button>
            </div>
          </Form>
        ) : null}
        <Link className="host-link" to={`/host/games/${claim.gameId}`}>
          Game Control Center
        </Link>
      </section>
    </>
  );
}
