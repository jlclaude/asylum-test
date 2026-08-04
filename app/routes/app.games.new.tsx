import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";
import { Prisma } from "@prisma/client";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation,
} from "react-router";
import { useState } from "react";
import { SPIN_DURATION_RANGE_LABEL } from "../lib/spin-duration";
import { validateGameTemplate } from "../lib/game-template-validation";

import { createGameTemplate, getGameTemplatesForShop } from "../models/game-template.server";
import { createGame } from "../models/game.server";
import { authenticate } from "../shopify.server";
import { formatRaffleCode } from "../lib/raffle-number";

export async function loader({
  request,
}: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const templates = await getGameTemplatesForShop(session.shop);

  return {
    templates: templates.map((template) => ({
      id: template.id,
      name: template.name,
      defaultGameTitle: template.defaultGameTitle,
      defaultGameDescription: template.defaultGameDescription,
      totalSpots: template.totalSpots,
      pricePerSpot: template.pricePerSpot.toString(),
      wheelCount: template.wheelCount,
      initialStatus: template.initialStatus,
      isDefault: template.isDefault,
    })),
  };
}

type ActionData = {
  errors?: {
    title?: string;
    description?: string;
    totalSpots?: string;
    pricePerSpot?: string;
    wheelCount?: string;
    status?: string;
    templateName?: string;
    templateDescription?: string;
    form?: string;
  };
  values?: {
    title: string;
    description: string;
    totalSpots: string;
    pricePerSpot: string;
    wheelCount: string;
    status: string;
    templateName?: string;
    templateDescription?: string;
  };
  success?: string;
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
  );

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
  const intent = String(formData.get("intent") ?? "create-game");
  const templateName = String(formData.get("templateName") ?? "").trim();
  const templateDescription = String(
    formData.get("templateDescription") ?? "",
  ).trim();

  const totalSpots = Number(totalSpotsValue);
  const pricePerSpot = Number(pricePerSpotValue);
  const wheelCount = Number(wheelCountValue);

  const values = {
    title,
    description,
    totalSpots: totalSpotsValue,
    pricePerSpot: pricePerSpotValue,
    wheelCount: wheelCountValue,
    status: statusValue,
    templateName,
    templateDescription,
  };

  if (intent === "save-template") {
    const templateValidation = validateGameTemplate({
      name: templateName,
      description: templateDescription,
      defaultGameTitle: title,
      defaultGameDescription: description,
      totalSpots: totalSpotsValue,
      pricePerSpot: pricePerSpotValue,
      wheelCount: wheelCountValue,
      initialStatus: statusValue,
      isDefault: false,
    });

    if (!templateValidation.input) {
      return {
        errors: {
          templateName: templateValidation.errors.name,
          templateDescription: templateValidation.errors.description,
          title: templateValidation.errors.defaultGameTitle,
          description: templateValidation.errors.defaultGameDescription,
          totalSpots: templateValidation.errors.totalSpots,
          pricePerSpot: templateValidation.errors.pricePerSpot,
          wheelCount: templateValidation.errors.wheelCount,
          status: templateValidation.errors.initialStatus,
          form: templateValidation.errors.form,
        },
        values,
      };
    }

    try {
      await createGameTemplate(session.shop, templateValidation.input);
      return { success: "Template saved.", values };
    } catch (error) {
      console.error("Failed to save game template:", error);
      const duplicateTemplate =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002";
      return {
        errors: duplicateTemplate
          ? { templateName: "A template with this name already exists." }
          : { form: "The template could not be saved. Check the server log for details." },
        values,
      };
    }
  }

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

  if (Object.keys(errors).length > 0) {
    return {
      errors,
      values,
    };
  }

  if (intent !== "create-game") {
    return { errors: { form: "Unknown game form action." }, values };
  }

  try {
    const game = await createGame({
      shop: session.shop,
      title,
      description,
      totalSpots,
      pricePerSpot: pricePerSpot.toFixed(2),
      wheelCount,
      status: statusValue as "OPEN" | "CLOSED",
    });
    return redirect(`/app?created=${encodeURIComponent(formatRaffleCode({ year: game.raffleYear, number: game.raffleNumber }))}`);
  } catch (error) {
    console.error("Failed to create game:", error);

    return {
      errors: {
        form: error instanceof Error
          ? error.message
          : "The game could not be saved.",
      },
      values,
    };
  }

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

  .game-template-panel {
    display: grid;
    gap: 12px;
    padding: 18px;
    border: 1px solid #40363a;
    border-radius: 14px;
    background: rgba(79, 29, 38, 0.16);
  }

  .game-template-actions {
    display: flex;
    align-items: end;
    gap: 12px;
  }

  .game-template-actions .game-field {
    flex: 1;
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
  const { templates } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();

  const isSubmitting =
    navigation.state === "submitting";

  const defaultTemplate = templates.find((template) => template.isDefault);
  const values = actionData?.values;
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    actionData ? "" : defaultTemplate?.id ?? "",
  );
  const initialTemplate = actionData ? undefined : defaultTemplate;
  const [title, setTitle] = useState(values?.title ?? initialTemplate?.defaultGameTitle ?? "");
  const [description, setDescription] = useState(values?.description ?? initialTemplate?.defaultGameDescription ?? "");
  const [totalSpots, setTotalSpots] = useState(values?.totalSpots ?? (initialTemplate ? String(initialTemplate.totalSpots) : ""));
  const [pricePerSpot, setPricePerSpot] = useState(values?.pricePerSpot ?? initialTemplate?.pricePerSpot ?? "");
  const [wheelCountValue, setWheelCountValue] = useState(values?.wheelCount ?? (initialTemplate ? String(initialTemplate.wheelCount) : "2"));
  const [status, setStatus] = useState(values?.status ?? initialTemplate?.initialStatus ?? "OPEN");

  const wheelCount = Number(
    wheelCountValue,
  );

  function applyTemplate(templateId: string) {
    const template = templates.find((candidate) => candidate.id === templateId);
    if (!template) {
      setTitle("");
      setDescription("");
      setTotalSpots("");
      setPricePerSpot("");
      setWheelCountValue("2");
      setStatus("OPEN");
      return;
    }
    setTitle(template.defaultGameTitle ?? "");
    setDescription(template.defaultGameDescription ?? "");
    setTotalSpots(String(template.totalSpots));
    setPricePerSpot(template.pricePerSpot);
    setWheelCountValue(String(template.wheelCount));
    setStatus(template.initialStatus);
  }

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
              of independent containment wheels for this game.
            </p>
          </header>

          <Form
            className="game-form"
            method="post"
          >
            <div className="game-form-body">
              <section className="game-template-panel" aria-labelledby="game-template-heading">
                <div className="game-field">
                  <label className="game-label" id="game-template-heading" htmlFor="gameTemplate">Start from a template</label>
                  <select className="game-select" id="gameTemplate" value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                    <option value="">Start without a template</option>
                    {templates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.isDefault ? " — Default" : ""}</option>)}
                  </select>
                  <button className="game-button game-button-secondary" type="button" onClick={() => applyTemplate(selectedTemplateId)}>{selectedTemplateId ? "Use template" : "Start without a template"}</button>
                  <p className="game-help">Using a template only prefills this form. Review and edit every value before creating the game.</p>
                </div>
              </section>

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
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
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
                    value={totalSpots}
                    onChange={(event) => setTotalSpots(event.target.value)}
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
                    value={pricePerSpot}
                    onChange={(event) => setPricePerSpot(event.target.value)}
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
                    Containment wheels{" "}
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
                    value={wheelCountValue}
                    onChange={(event) => setWheelCountValue(event.target.value)}
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
                    containment{" "}
                    {(Number.isFinite(wheelCount) &&
                    wheelCount > 0
                      ? wheelCount
                      : 2) === 1
                      ? "wheel"
                      : "wheels"}
                  </strong>{" "}
                  plus the required{" "}
                  <strong>Reward Chamber</strong>. Each wheel
                  shuffles and spins independently with its own
                  random duration between {SPIN_DURATION_RANGE_LABEL}.
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
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe the prize, rules, or information members should know."
                />

                {actionData?.errors?.description ? (
                  <p className="game-error">{actionData.errors.description}</p>
                ) : (
                  <p className="game-help">
                    Optional information shown on the public game page. Variables: {"{{SECOND_CHANCE_NUMBER}}"} for a plain number such as 7; {"{{SECOND_CHANCE_ORDINAL}}"} for an ordinal such as 7th.
                  </p>
                )}
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
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
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

              <section className="game-template-panel" aria-labelledby="save-template-heading">
                <div className="game-template-actions">
                  <div className="game-field">
                    <label className="game-label" id="save-template-heading" htmlFor="templateName">Save current settings as template</label>
                    <input className="game-input" id="templateName" name="templateName" maxLength={100} defaultValue={values?.templateName} placeholder="Template name" />
                    {actionData?.errors?.templateName ? <p className="game-error">{actionData.errors.templateName}</p> : null}
                    <label className="game-label" htmlFor="templateDescription">Template description</label>
                    <textarea className="game-textarea" id="templateDescription" name="templateDescription" maxLength={500} defaultValue={values?.templateDescription} placeholder="Optional note about when to use this setup" />
                    {actionData?.errors?.templateDescription ? <p className="game-error">{actionData.errors.templateDescription}</p> : null}
                    {actionData?.success ? <p className="game-help" role="status">{actionData.success}</p> : null}
                  </div>
                  <button className="game-button game-button-secondary" type="submit" name="intent" value="save-template" formNoValidate disabled={isSubmitting}>Save Template</button>
                </div>
              </section>
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
                name="intent"
                value="create-game"
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
