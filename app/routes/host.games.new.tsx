import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import {
  requireHostMutation,
  requireHostPermission,
} from "../lib/host-auth.server";
import { createGame } from "../models/game.server";
import { formatRaffleCode } from "../lib/raffle-number";

export async function loader({ request }: LoaderFunctionArgs) {
  const host = await requireHostPermission(request, "games:create");
  return { csrfToken: host.csrfToken };
}
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const host = await requireHostMutation(request, "games:create", formData);
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
  const { csrfToken } = useLoaderData<typeof loader>();
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
    </section>
  );
}
