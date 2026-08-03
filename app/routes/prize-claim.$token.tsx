import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  isRouteErrorResponse,
  useActionData,
  useLoaderData,
  useNavigation,
  useRouteError,
} from "react-router";
import { AsylumLogo } from "../components/asylum/AsylumLogo";
import { PublicPrizePackageSelector } from "../components/prize-claims/PublicPrizePackageSelector";
import { isCollectionPrizeOption } from "../lib/prize-packages";
import { loadPublicPrizeProducts } from "../lib/shopify-prize-products.server";
import { unauthenticated } from "../shopify.server";
import {
  getPublicPrizeClaim,
  submitPublicPrizeClaim,
} from "../models/prize-claim.server";
import "../styles/asylum-brand.css";
import "../styles/prize-claims.css";

export async function loader({ params }: LoaderFunctionArgs) {
  if (!params.token)
    throw new Response("This prize claim link is invalid.", { status: 404 });
  const claim = await getPublicPrizeClaim(params.token);
  if (!claim)
    throw new Response("This prize claim link is invalid.", { status: 404 });
  if (claim.state !== "OPEN") return { claim, productsByOption: {} };
  const { shop, ...publicClaim } = claim;
  const collectionOptions = publicClaim.prizeOptions?.filter(isCollectionPrizeOption) ?? [];
  if (!collectionOptions.length) return { claim: publicClaim, productsByOption: {} };
  try {
    const { admin } = await unauthenticated.admin(shop);
    const entries = await Promise.all(collectionOptions.map(async (option) => [option.id, await loadPublicPrizeProducts(admin, option)] as const));
    return { claim: publicClaim, productsByOption: Object.fromEntries(entries) };
  } catch (error) {
    console.error("Prize claim products could not be loaded:", error);
    return { claim: publicClaim, productsByOption: {}, productError: "Prize products are temporarily unavailable. Refresh the page or contact the host." };
  }
}

type ActionData = {
  error?: string;
  confirmation?: {
    gameTitle: string;
    raffleCode: string;
    preferredPrize: string;
    selectedPrizeOptionLabel: string | null;
    recipientName: string;
    submittedAt: string;
  };
};
export async function action({
  request,
  params,
}: ActionFunctionArgs): Promise<ActionData> {
  if (!params.token) return { error: "This prize claim link is invalid." };
  try {
    const claim = await getPublicPrizeClaim(params.token);
    if (!claim || claim.state !== "OPEN") return { error: claim ? stateMessage(claim.state) : "This prize claim link is invalid." };
    const hasCollectionOptions = claim.prizeOptions?.some(isCollectionPrizeOption) ?? false;
    const admin = hasCollectionOptions ? (await unauthenticated.admin(claim.shop)).admin : undefined;
    return {
      confirmation: await submitPublicPrizeClaim(
        params.token,
        await request.formData(), admin,
      ),
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "The prize request could not be submitted.",
    };
  }
}

const stateMessage = (state: string) =>
  state === "EXPIRED"
    ? "This prize claim link has expired. Contact the host."
    : state === "REVOKED"
      ? "This prize claim link has been revoked. Contact the host."
      : state === "INVALID_CONFIGURATION"
        ? "This prize package is unavailable. Contact the host."
      : ["SUBMITTED", "REVIEWED", "FULFILLED"].includes(state)
        ? "This prize request has already been submitted."
        : "This prize claim link is unavailable.";

export default function PublicPrizeClaimPage() {
  const { claim, productsByOption, productError } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  if (actionData?.confirmation) {
    const value = actionData.confirmation;
    return (
      <main className="prize-public-page">
        <section className="prize-public-card prize-confirmation">
          <AsylumLogo />
          <p>Submission secured</p>
          <h1>PRIZE REQUEST RECEIVED</h1>
          <strong>{value.raffleCode}</strong>
          <h2>{value.gameTitle}</h2>
          <dl>
            <div>
              <dt>Prize requested</dt>
              <dd>{value.selectedPrizeOptionLabel ?? value.preferredPrize}</dd>
            </div>
            <div>
              <dt>Recipient</dt>
              <dd>{value.recipientName}</dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>
                {new Intl.DateTimeFormat("en-US", {
                  dateStyle: "long",
                  timeStyle: "short",
                }).format(new Date(value.submittedAt))}
              </dd>
            </div>
          </dl>
          <p>
            The host will review your request and contact you about fulfillment.
          </p>
        </section>
      </main>
    );
  }
  if (claim.state !== "OPEN")
    return (
      <main className="prize-public-page">
        <section className="prize-public-card">
          <AsylumLogo />
          <h1>PRIZE CLAIM</h1>
          <p className="prize-message prize-error" role="alert">
            {stateMessage(claim.state)}
          </p>
        </section>
      </main>
    );
  return (
    <main className="prize-public-page">
      <section className="prize-public-card">
        <header>
          <AsylumLogo />
          <p>Private winner fulfillment</p>
          <h1>PRIZE CLAIM</h1>
          <strong>{claim.raffleCode}</strong>
          <h2>{claim.gameTitle}</h2>
        </header>
        <dl className="prize-public-summary">
          <div>
            <dt>Winner</dt>
            <dd>{claim.winnerDisplayName}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{claim.wheelLabel}</dd>
          </div>
          {claim.expiresAt ? (
            <div>
              <dt>Expires</dt>
              <dd>
                {new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(
                  new Date(claim.expiresAt),
                )}
              </dd>
            </div>
          ) : null}
        </dl>
        <p>
          Submit your preferred prize and fulfillment details. This private link
          can be used only once.
        </p>
        {actionData?.error ? (
          <p className="prize-message prize-error" role="alert">
            {actionData.error}
          </p>
        ) : null}
        {productError ? <p className="prize-message prize-error" role="alert">{productError}</p> : null}
        <Form className="prize-public-form" method="post">
          {claim.prizeOptions ? <PublicPrizePackageSelector options={claim.prizeOptions} productsByOption={productsByOption} /> : <label>Prize requested<input name="preferredPrize" maxLength={200} required /></label>}
          <label>
            Full name
            <input
              name="recipientName"
              autoComplete="name"
              maxLength={200}
              required
            />
          </label>
          <label>
            Address line 1
            <input
              name="addressLine1"
              autoComplete="address-line1"
              maxLength={200}
              required
            />
          </label>
          <label>
            Address line 2
            <input
              name="addressLine2"
              autoComplete="address-line2"
              maxLength={200}
            />
          </label>
          <div className="prize-form-grid">
            <label>
              City
              <input
                name="city"
                autoComplete="address-level2"
                maxLength={200}
                required
              />
            </label>
            <label>
              State / province
              <input
                name="stateProvince"
                autoComplete="address-level1"
                maxLength={200}
                required
              />
            </label>
            <label>
              Postal code
              <input
                name="postalCode"
                autoComplete="postal-code"
                maxLength={200}
                required
              />
            </label>
            <label>
              Country
              <input
                name="country"
                autoComplete="country-name"
                maxLength={200}
                required
              />
            </label>
          </div>
          <label>
            Additional notes
            <textarea name="winnerNotes" maxLength={2000} />
          </label>
          <p className="prize-privacy">
            Your shipping details are used only by the host to
            fulfill this prize request.
          </p>
          <button disabled={busy || Boolean(productError)}>
            {busy ? "Submitting…" : "SUBMIT PRIZE REQUEST"}
          </button>
        </Form>
      </section>
    </main>
  );
}
export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? String(error.data || error.statusText)
    : error instanceof Error
      ? error.message
      : "This prize claim page could not be loaded.";
  return (
    <main className="prize-public-page">
      <section className="prize-public-card">
        <AsylumLogo />
        <h1>PRIZE CLAIM</h1>
        <p className="prize-message prize-error" role="alert">
          {message}
        </p>
      </section>
    </main>
  );
}
