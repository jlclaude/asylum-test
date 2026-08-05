import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import {
  requireHostMutation,
  requireHostPermission,
} from "../lib/host-auth.server";
import { createGame } from "../models/game.server";
import {
  getGameTemplateForShop,
  getGameTemplatesForShop,
} from "../models/game-template.server";
import { formatRaffleCode } from "../lib/raffle-number";

export async function loader({ request }: LoaderFunctionArgs) {
  const host = await requireHostPermission(request, "games:create");
  const templates = await getGameTemplatesForShop(host.shop);
  return {
    csrfToken: host.csrfToken,
    templates: templates.map((template) => ({
      id: template.id,
      name: template.name,
      defaultGameTitle: template.defaultGameTitle,
      totalSpots: template.totalSpots,
      pricePerSpot: template.pricePerSpot.toString(),
      wheelCount: template.wheelCount,
      initialStatus: template.initialStatus,
      isDefault: template.isDefault,
    })),
  };
}
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const host = await requireHostMutation(request, "games:create", formData);
  const intent = String(formData.get("intent") ?? "create-blank");
  if (intent === "create-from-template") {
    const templateId = String(formData.get("templateId") ?? "");
    const template = await getGameTemplateForShop(templateId, host.shop);
    if (!template) return { error: "Select a valid template." };
    const title =
      String(formData.get("templateGameTitle") ?? "").trim() ||
      template.defaultGameTitle?.trim();
    if (!title)
      return { error: "Enter a game title for the selected template." };
    const game = await createGame({
      shop: host.shop,
      title,
      description: template.defaultGameDescription ?? "",
      totalSpots: template.totalSpots,
      pricePerSpot: template.pricePerSpot.toString(),
      wheelCount: template.wheelCount,
      status: template.initialStatus,
    });
    throw redirect(
      `/host/games/${game.id}?created=${encodeURIComponent(formatRaffleCode({ year: game.raffleYear, number: game.raffleNumber }))}`,
    );
  }
  if (intent !== "create-blank") return { error: "Unknown game action." };
  const title = String(formData.get("title") ?? "").trim();
  const totalSpots = Number(formData.get("totalSpots"));
  const pricePerSpot = String(formData.get("pricePerSpot") ?? "");
  const wheelCount = Number(formData.get("wheelCount"));
  if (
    !title ||
    !Number.isInteger(totalSpots) ||
    totalSpots < 1 ||
    !Number.isFinite(Number(pricePerSpot)) ||
    Number(pricePerSpot) < 0 ||
    !Number.isInteger(wheelCount) ||
    wheelCount < 1 ||
    wheelCount > 20
  )
    return {
      error: "Enter a title, valid spot count, price, and wheel count.",
    };
  const game = await createGame({
    shop: host.shop,
    title,
    description: String(formData.get("description") ?? "").trim(),
    totalSpots,
    pricePerSpot,
    wheelCount,
    status: "OPEN",
  });
  throw redirect(
    `/host/games/${game.id}?created=${encodeURIComponent(formatRaffleCode({ year: game.raffleYear, number: game.raffleNumber }))}`,
  );
}
export default function HostNewGame() {
  const { csrfToken, templates } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  return (
    <section className="host-card">
      <p className="host-kicker">New raffle</p>
      <h1>Create Game</h1>
      {data?.error ? (
        <p className="host-message host-error">{data.error}</p>
      ) : null}
      <Form className="host-form" method="post">
        <input type="hidden" name="csrfToken" value={csrfToken} />
        <input type="hidden" name="intent" value="create-blank" />
        <h2>Create Blank Game</h2>
        <label>
          Title
          <input name="title" required />
        </label>
        <label>
          Description
          <textarea name="description" />
        </label>
        <label>
          Total spots
          <input name="totalSpots" type="number" min="1" required />
        </label>
        <label>
          Price per spot
          <input
            name="pricePerSpot"
            type="number"
            min="0"
            step="0.01"
            required
          />
        </label>
        <label>
          Name wheel count
          <input
            name="wheelCount"
            type="number"
            min="1"
            max="20"
            defaultValue="2"
            required
          />
        </label>
        <button className="host-button">Create Game</button>
      </Form>
      <hr className="host-divider" />
      <Form className="host-form" method="post">
        <input type="hidden" name="csrfToken" value={csrfToken} />
        <input type="hidden" name="intent" value="create-from-template" />
        <h2>Create From Template</h2>
        {templates.length ? (
          <>
            <label>
              Template
              <select
                name="templateId"
                defaultValue={
                  templates.find((template) => template.isDefault)?.id ??
                  templates[0]?.id
                }
                required
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} · {template.totalSpots} spots · $
                    {template.pricePerSpot} · {template.wheelCount} wheels ·{" "}
                    {template.initialStatus}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Game title
              <input
                name="templateGameTitle"
                placeholder="Uses the template title when left blank"
              />
            </label>
            <button className="host-button">Create From Template</button>
          </>
        ) : (
          <p className="host-empty">
            No templates are available. Create one in the Templates section.
          </p>
        )}
      </Form>
    </section>
  );
}
