import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import {
  requireHostMutation,
  requireHostPermission,
} from "../lib/host-auth.server";
import { validatePaymentInstructions } from "../lib/payment-instructions";
import {
  getShopSettings,
  updatePaymentInstructions,
} from "../models/shop-settings.server";
export async function loader({ request }: LoaderFunctionArgs) {
  const host = await requireHostPermission(request, "settings:manage");
  const settings = await getShopSettings(host.shop);
  return {
    csrfToken: host.csrfToken,
    paymentInstructions: settings?.paymentInstructions ?? "",
  };
}
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const host = await requireHostMutation(request, "settings:manage", formData);
  const validation = validatePaymentInstructions(
    String(formData.get("paymentInstructions") ?? ""),
  );
  if (validation.error) return { error: validation.error };
  await updatePaymentInstructions(host.shop, validation.value);
  return { success: "Shop settings saved." };
}
export default function HostSettings() {
  const { csrfToken, paymentInstructions } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  return (
    <>
      <header className="host-header">
        <p className="host-kicker">Owner settings</p>
        <h1>Host Settings</h1>
      </header>
      <section className="host-card">
        {data?.error ? (
          <p className="host-message host-error">{data.error}</p>
        ) : null}
        {data?.success ? (
          <p className="host-message host-success">{data.success}</p>
        ) : null}
        <Form className="host-form" method="post">
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <label>
            Payment instructions
            <textarea
              name="paymentInstructions"
              defaultValue={paymentInstructions}
            />
          </label>
          <button className="host-button">Save Settings</button>
        </Form>
      </section>
    </>
  );
}
