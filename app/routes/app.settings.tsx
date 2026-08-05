import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { PaymentInstructionsCard } from "../components/payment/PaymentInstructionsCard";
import { PAYMENT_INSTRUCTIONS_MAX_LENGTH, validatePaymentInstructions } from "../lib/payment-instructions";
import { getShopSettings, updatePaymentInstructions } from "../models/shop-settings.server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { createHostUser } from "../models/host-user.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const settings = await getShopSettings(session.shop);
  const hostOwnerCount = await db.hostUser.count({ where: { shop: session.shop, role: "OWNER", isActive: true } });
  return { paymentInstructions: settings?.paymentInstructions ?? "", hostOwnerExists: hostOwnerCount > 0 };
}

type ActionData = { error?: string; success?: string; value: string; intent?: string };

export async function action({ request }: ActionFunctionArgs): Promise<ActionData> {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "save-payment-instructions");
  if (intent === "create-host-owner") {
    const existingValue = (await getShopSettings(session.shop))?.paymentInstructions ?? "";
    const password = String(formData.get("password") ?? "");
    if (password !== String(formData.get("passwordConfirmation") ?? "")) return { intent, error: "Passwords do not match.", value: existingValue };
    try {
      await createHostUser({ shop: session.shop, email: String(formData.get("email") ?? ""), displayName: String(formData.get("displayName") ?? ""), password, role: "OWNER", bootstrap: true });
      return { intent, success: "Host Portal owner created.", value: existingValue };
    } catch (error) {
      return { intent, error: error instanceof Error ? error.message : "The Host Portal owner could not be created.", value: existingValue };
    }
  }
  const validation = validatePaymentInstructions(String(formData.get("paymentInstructions") ?? ""));
  if (validation.error) return { error: validation.error, value: validation.value };

  try {
    await updatePaymentInstructions(session.shop, validation.value);
    return { success: validation.value ? "Payment instructions saved." : "Payment instructions cleared.", value: validation.value };
  } catch (error) {
    console.error("Failed to update payment instructions:", error);
    return { error: "Payment instructions could not be saved.", value: validation.value };
  }
}

const styles = `
  :root{color-scheme:dark}*{box-sizing:border-box}.settings-page{min-height:100%;padding:28px;color:#f5f5f5;background:radial-gradient(circle at top right,rgba(155,22,34,.18),transparent 35%),linear-gradient(145deg,#0d0d0f,#171719 52%,#101012);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.settings-shell{width:min(980px,100%);margin:auto}.settings-back{display:inline-block;margin-bottom:24px;color:#aaaab0;text-decoration:none;font-weight:750}.settings-header{margin-bottom:22px}.settings-header p{margin:0 0 8px;color:#e44e5e;font-size:12px;font-weight:850;letter-spacing:.14em;text-transform:uppercase}.settings-header h1{margin:0;font-size:clamp(30px,5vw,44px)}.settings-header>span{display:block;max-width:680px;margin-top:12px;color:#9b9ca2;line-height:1.6}.settings-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.9fr);gap:22px;align-items:start}.settings-card,.payment-instructions-card{padding:24px;border:1px solid #343439;border-radius:18px;background:rgba(25,25,28,.97);box-shadow:0 18px 50px rgba(0,0,0,.25)}.settings-form{display:grid;gap:12px}.settings-form label{font-weight:800}.settings-textarea{min-height:300px;padding:14px;border:1px solid #44444a;border-radius:10px;color:#fff;background:#101012;font:inherit;line-height:1.55;resize:vertical}.settings-form-meta{display:flex;justify-content:space-between;gap:12px;color:#96979d;font-size:12px}.settings-button{padding:12px 17px;border:1px solid #e65363;border-radius:10px;color:#fff;background:linear-gradient(#d94051,#992432);cursor:pointer;font:inherit;font-weight:850}.settings-button:disabled{cursor:wait;opacity:.65}.settings-message{margin:0;padding:11px;border-radius:8px}.settings-success{color:#b9efc9;background:#173822}.settings-error{color:#ffb0b8;background:#4a2027}.settings-backups{margin-top:22px;padding:22px;border:1px solid #66562c;border-radius:16px;background:#211c12}.settings-backups h2{margin-top:0}.settings-backups p{color:#aaa7a0;line-height:1.55}.settings-backups a{display:inline-block;padding:11px 15px;border:1px solid #c39137;border-radius:9px;color:#fff;background:#72521d;text-decoration:none;font-weight:850}.payment-instructions-card{border:2px solid #9f3441}.payment-instructions-kicker{margin:0 0 7px;color:#ef6573;font-size:11px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.payment-instructions-card h3{margin:0}.payment-instructions-text,.payment-instructions-empty{margin:18px 0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65}.payment-instructions-empty{color:#b5b5ba}.payment-instructions-note{margin:0;padding-top:14px;border-top:1px solid #3d3d42;color:#b8b8bd;font-size:13px;line-height:1.55}@media(max-width:760px){.settings-page{padding:18px 14px}.settings-grid{grid-template-columns:1fr}}
`;

export default function SettingsPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const [value, setValue] = useState(actionData?.value ?? loaderData.paymentInstructions);
  const saving = navigation.state === "submitting";
  return <><style dangerouslySetInnerHTML={{ __html: styles }} /><main className="settings-page"><div className="settings-shell">
    <Link className="settings-back" to="/app">← Back to dashboard</Link>
    <header className="settings-header"><p>Shop settings</p><h1>Payment Instructions</h1><span>Update the plain-text payment directions shown on every public game page for this shop.</span></header>
    <div className="settings-grid"><section className="settings-card"><Form className="settings-form" method="post">
      <label htmlFor="paymentInstructions">Instructions</label>
      <textarea className="settings-textarea" id="paymentInstructions" name="paymentInstructions" maxLength={PAYMENT_INSTRUCTIONS_MAX_LENGTH} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Add payment methods and the information buyers should include." />
      <div className="settings-form-meta"><span>{value ? "Instructions configured" : "No instructions configured"}</span><span>{value.length.toLocaleString()} / {PAYMENT_INSTRUCTIONS_MAX_LENGTH.toLocaleString()}</span></div>
      {actionData?.error ? <p className="settings-message settings-error" role="alert">{actionData.error}</p> : null}
      {actionData?.success ? <p className="settings-message settings-success" role="status">{actionData.success}</p> : null}
      <button className="settings-button" disabled={saving}>{saving ? "Saving…" : "Save Payment Instructions"}</button>
    </Form></section><PaymentInstructionsCard instructions={value.trim() || null} preview /></div>
    <section className="settings-backups"><h2>Host Portal Access</h2>{loaderData.hostOwnerExists ? <p>An active Host Portal OWNER is configured for this shop. Additional accounts are managed from the standalone portal.</p> : <Form className="settings-form" method="post"><input type="hidden" name="intent" value="create-host-owner"/><label>Owner display name<input name="displayName" required maxLength={100}/></label><label>Owner email<input name="email" type="email" required/></label><label>Password<input name="password" type="password" minLength={12} maxLength={128} required/></label><label>Confirm password<input name="passwordConfirmation" type="password" minLength={12} maxLength={128} required/></label>{actionData?.intent === "create-host-owner" && actionData.error ? <p className="settings-message settings-error" role="alert">{actionData.error}</p> : null}{actionData?.intent === "create-host-owner" && actionData.success ? <p className="settings-message settings-success" role="status">{actionData.success}</p> : null}<button className="settings-button">Create Owner Account</button></Form>}</section>
    <section className="settings-backups"><h2>Backup &amp; Export</h2><p>Create an emergency backup, export raffle records, or preview an empty-shop restore.</p><Link to="/app/backups">Open Backup &amp; Export</Link></section>
  </div></main></>;
}
