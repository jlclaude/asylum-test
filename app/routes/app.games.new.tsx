import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  useActionData,
  useNavigate,
  useNavigation,
} from "react-router";

import { createGame } from "../models/game.server";
import { authenticate } from "../shopify.server";

export async function loader({
  request,
}: LoaderFunctionArgs) {
  await authenticate.admin(request);

  return null;
}

type ActionData = {
  errors?: {
    title?: string;
    totalSpots?: string;
    pricePerSpot?: string;
    wheelCount?: string;
    status?: string;
    form?: string;
  };
  values?: {
    title: string;
    description: string;
    totalSpots: string;
    pricePerSpot: string;
    wheelCount: string;
    status: string;
  };
};

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response | ActionData> {
  const { session, redirect } = await authenticate.admin(request);
  const formData = await request.formData();

  const title = String(
    formData.get("title") ?? "",
  ).trim();

  const description = String(
    formData.get("description") ?? "",
  ).trim();

  const totalSpotsValue = String(
    formData.get("totalSpots") ?? "",
  );

  const pricePerSpotValue = String(
    formData.get("pricePerSpot") ?? "",
  );

  const wheelCountValue = String(
    formData.get("wheelCount") ?? "2",
  );

  const statusValue = String(
    formData.get("status") ?? "OPEN",
  );

  const totalSpots = Number(totalSpotsValue);
  const pricePerSpot = Number(pricePerSpotValue);
  const wheelCount = Number(wheelCountValue);

  const errors: NonNullable<ActionData["errors"]> = {};

  if (!title) {
    errors.title = "Enter a game title.";
  }

  if (title.length > 150) {
    errors.title =
      "The game title must be 150 characters or fewer.";
  }

  if (
    !Number.isInteger(totalSpots) ||
    totalSpots < 1 ||
    totalSpots > 100000
  ) {
    errors.totalSpots =
      "Total spots must be a whole number between 1 and 100,000.";
  }

  if (
    !Number.isFinite(pricePerSpot) ||
    pricePerSpot < 0 ||
    pricePerSpot > 1000000
  ) {
    errors.pricePerSpot =
      "Enter a valid price between 0 and 1,000,000.";
  }

  if (
    !Number.isInteger(wheelCount) ||
    wheelCount < 1 ||
    wheelCount > 20
  ) {
    errors.wheelCount =
      "The number of name wheels must be between 1 and 20.";
  }

  if (!["OPEN", "CLOSED"].includes(statusValue)) {
    errors.status = "Select a valid game status.";
  }

  const values = {
    title,
    description,
    totalSpots: totalSpotsValue,
    pricePerSpot: pricePerSpotValue,
    wheelCount: wheelCountValue,
    status: statusValue,
  };

  if (Object.keys(errors).length > 0) {
    return {
      errors,
      values,
    };
  }

  try {
    await createGame({
      shop: session.shop,
      title,
      description,
      totalSpots,
      pricePerSpot: pricePerSpot.toFixed(2),
      wheelCount,
      status: statusValue as "OPEN" | "CLOSED",
    });
  } catch (error) {
    console.error("Failed to create game:", error);

    return {
      errors: {
        form:
          error instanceof Error
            ? error.message
            : "The game could not be saved.",
      },
      values,
    };
  }

  return redirect("/app");
}

const styles = `
  :root {
    color-scheme: dark;
  }

  * {
    box-sizing: border-box;
  }

  .game-page {
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

  .game-shell {
    width: min(920px, 100%);
    margin: 0 auto;
  }

  .game-back {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 24px;
    padding: 0;
    border: 0;
    color: #a4a4aa;
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-size: 14px;
    font-weight: 700;
  }

  .game-back:hover {
    color: #ffffff;
  }

  .game-header {
    margin-bottom: 28px;
  }

  .game-eyebrow {
    margin: 0 0 10px;
    color: #e44e5e;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }

  .game-header h1 {
    margin: 0;
    font-size: clamp(30px, 5vw, 44px);
    line-height: 1.08;
  }

  .game-header-description {
    max-width: 680px;
    margin: 14px 0 0;
    color: #9d9da3;
    font-size: 15px;
    line-height: 1.6;
  }

  .game-form {
    overflow: hidden;
    border: 1px solid #2d2d31;
    border-radius: 20px;
    background: rgba(27, 27, 30, 0.96);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.3);
  }

  .game-form-body {
    display: grid;
    gap: 24px;
    padding: 30px;
  }

  .game-field {
    display: grid;
    gap: 9px;
  }

  .game-field-row {
    display: grid;
    grid-template-columns:
      repeat(3, minmax(0, 1fr));
    gap: 18px;
  }

  .game-label {
    color: #e5e5e7;
    font-size: 14px;
    font-weight: 750;
  }

  .game-required {
    color: #ed5c6b;
  }

  .game-help,
  .game-error {
    margin: -3px 0 0;
    font-size: 12px;
    line-height: 1.45;
  }

  .game-help {
    color: #77787e;
  }

  .game-error {
    color: #ff7b88;
  }

  .game-form-error {
    padding: 14px 16px;
    border: 1px solid #73313a;
    border-radius: 10px;
    color: #ffabb3;
    background: rgba(106, 28, 39, 0.3);
    font-size: 14px;
  }

  .game-input,
  .game-select,
  .game-textarea {
    width: 100%;
    border: 1px solid #3a3a3f;
    border-radius: 11px;
    outline: none;
    color: #ffffff;
    background: #111113;
    font: inherit;
    font-size: 15px;
    transition:
      border-color 150ms ease,
      box-shadow 150ms ease;
  }

  .game-input,
  .game-select {
    height: 48px;
    padding: 0 14px;
  }

  .game-textarea {
    min-height: 130px;
    padding: 14px;
    resize: vertical;
    line-height: 1.55;
  }

  .game-input:focus,
  .game-select:focus,
  .game-textarea:focus {
    border-color: #d94b5b;
    box-shadow:
      0 0 0 3px rgba(217, 75, 91, 0.14);
  }

  .game-input::placeholder,
  .game-textarea::placeholder {
    color: #5f6065;
  }

  .wheel-summary {
    padding: 18px;
    border: 1px solid #3a3033;
    border-radius: 13px;
    background: rgba(65, 25, 31, 0.22);
  }

  .wheel-summary h2 {
    margin: 0 0 9px;
    font-size: 15px;
  }

  .wheel-summary p {
    margin: 0;
    color: #a4a4aa;
    font-size: 13px;
    line-height: 1.55;
  }

  .wheel-summary strong {
    color: #ffffff;
  }

  .game-form-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 20px 30px;
    border-top: 1px solid #2d2d31;
    background: rgba(15, 15, 17, 0.55);
  }

  .game-button {
    min-width: 125px;
    padding: 13px 19px;
    border-radius: 10px;
    cursor: pointer;
    font: inherit;
    font-size: 14px;
    font-weight: 800;
    transition:
      transform 150ms ease,
      filter 150ms ease;
  }

  .game-button:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .game-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .game-button:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  .game-button-secondary {
    border: 1px solid #3c3c41;
    color: #d7d7da;
    background: #222225;
  }

  .game-button-primary {
    border: 1px solid #ee5464;
    color: #ffffff;
    background:
      linear-gradient(
        180deg,
        #d94051,
        #9d2432
      );
    box-shadow:
      0 12px 30px rgba(163, 30, 46, 0.25);
  }

  .game-button-primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  @media (max-width: 760px) {
    .game-page {
      padding: 20px 14px;
    }

    .game-field-row {
      grid-template-columns: 1fr;
    }

    .game-form-body {
      padding: 22px;
    }

    .game-form-footer {
      flex-direction: column-reverse;
      padding: 18px 22px;
    }

    .game-button {
      width: 100%;
    }
  }
`;

export default function NewGamePage() {
  const navigate = useNavigate();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();

  const isSubmitting =
    navigation.state === "submitting";

  const values = actionData?.values;

  const wheelCount = Number(
    values?.wheelCount ?? "2",
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />

      <main className="game-page">
        <div className="game-shell">
          <button
            className="game-back"
            type="button"
            onClick={() => navigate("/app")}
          >
            ← Back to dashboard
          </button>

          <header className="game-header">
            <p className="game-eyebrow">
              Game management
            </p>

            <h1>Create a new game</h1>

            <p className="game-header-description">
              Configure the claim limits, pricing, and number
              of independent name wheels for this game.
            </p>
          </header>

          <Form
            className="game-form"
            method="post"
          >
            <div className="game-form-body">
              {actionData?.errors?.form ? (
                <div className="game-form-error">
                  {actionData.errors.form}
                </div>
              ) : null}

              <div className="game-field">
                <label
                  className="game-label"
                  htmlFor="title"
                >
                  Game title{" "}
                  <span className="game-required">
                    *
                  </span>
                </label>

                <input
                  className="game-input"
                  id="title"
                  name="title"
                  type="text"
                  maxLength={150}
                  defaultValue={values?.title}
                  placeholder="Example: Friday Night Mystery Box"
                  required
                  autoComplete="off"
                />

                {actionData?.errors?.title ? (
                  <p className="game-error">
                    {actionData.errors.title}
                  </p>
                ) : (
                  <p className="game-help">
                    Use the same title you share with your
                    Facebook group.
                  </p>
                )}
              </div>

              <div className="game-field-row">
                <div className="game-field">
                  <label
                    className="game-label"
                    htmlFor="totalSpots"
                  >
                    Total spots{" "}
                    <span className="game-required">
                      *
                    </span>
                  </label>

                  <input
                    className="game-input"
                    id="totalSpots"
                    name="totalSpots"
                    type="number"
                    min="1"
                    max="100000"
                    step="1"
                    defaultValue={values?.totalSpots}
                    placeholder="100"
                    required
                  />

                  {actionData?.errors?.totalSpots ? (
                    <p className="game-error">
                      {actionData.errors.totalSpots}
                    </p>
                  ) : null}
                </div>

                <div className="game-field">
                  <label
                    className="game-label"
                    htmlFor="pricePerSpot"
                  >
                    Price per spot{" "}
                    <span className="game-required">
                      *
                    </span>
                  </label>

                  <input
                    className="game-input"
                    id="pricePerSpot"
                    name="pricePerSpot"
                    type="number"
                    min="0"
                    max="1000000"
                    step="0.01"
                    defaultValue={values?.pricePerSpot}
                    placeholder="5.00"
                    required
                  />

                  {actionData?.errors?.pricePerSpot ? (
                    <p className="game-error">
                      {actionData.errors.pricePerSpot}
                    </p>
                  ) : null}
                </div>

                <div className="game-field">
                  <label
                    className="game-label"
                    htmlFor="wheelCount"
                  >
                    Name wheels{" "}
                    <span className="game-required">
                      *
                    </span>
                  </label>

                  <input
                    className="game-input"
                    id="wheelCount"
                    name="wheelCount"
                    type="number"
                    min="1"
                    max="20"
                    step="1"
                    defaultValue={values?.wheelCount ?? "2"}
                    required
                  />

                  {actionData?.errors?.wheelCount ? (
                    <p className="game-error">
                      {actionData.errors.wheelCount}
                    </p>
                  ) : (
                    <p className="game-help">
                      Default is 2.
                    </p>
                  )}
                </div>
              </div>

              <div className="wheel-summary">
                <h2>Wheel setup</h2>

                <p>
                  This game will create{" "}
                  <strong>
                    {Number.isFinite(wheelCount) &&
                    wheelCount > 0
                      ? wheelCount
                      : 2}{" "}
                    name{" "}
                    {(Number.isFinite(wheelCount) &&
                    wheelCount > 0
                      ? wheelCount
                      : 2) === 1
                      ? "wheel"
                      : "wheels"}
                  </strong>{" "}
                  plus the required{" "}
                  <strong>value wheel</strong>. Each wheel
                  shuffles and spins independently with its own
                  random duration between 30 and 120 seconds.
                </p>
              </div>

              <div className="game-field">
                <label
                  className="game-label"
                  htmlFor="description"
                >
                  Description
                </label>

                <textarea
                  className="game-textarea"
                  id="description"
                  name="description"
                  defaultValue={values?.description}
                  placeholder="Describe the prize, rules, or information members should know."
                />

                <p className="game-help">
                  Optional information shown on the public game
                  page.
                </p>
              </div>

              <div className="game-field">
                <label
                  className="game-label"
                  htmlFor="status"
                >
                  Initial status
                </label>

                <select
                  className="game-select"
                  id="status"
                  name="status"
                  defaultValue={values?.status ?? "OPEN"}
                >
                  <option value="OPEN">
                    Open — accept claims
                  </option>

                  <option value="CLOSED">
                    Closed — do not accept claims
                  </option>
                </select>

                {actionData?.errors?.status ? (
                  <p className="game-error">
                    {actionData.errors.status}
                  </p>
                ) : null}
              </div>
            </div>

            <footer className="game-form-footer">
              <button
                className={[
                  "game-button",
                  "game-button-secondary",
                ].join(" ")}
                type="button"
                disabled={isSubmitting}
                onClick={() => navigate("/app")}
              >
                Cancel
              </button>

              <button
                className={[
                  "game-button",
                  "game-button-primary",
                ].join(" ")}
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? "Creating…"
                  : "Create Game"}
              </button>
            </footer>
          </Form>
        </div>
      </main>
    </>
  );
}
