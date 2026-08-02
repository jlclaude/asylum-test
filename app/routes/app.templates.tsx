import { Prisma } from "@prisma/client";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { TemplateFormFields } from "../components/templates/TemplateFormFields";
import { gameTemplateValues, validateGameTemplate } from "../lib/game-template-validation";
import {
  createGameTemplate,
  deleteGameTemplate,
  duplicateGameTemplate,
  getGameTemplatesForShop,
  updateGameTemplate,
} from "../models/game-template.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const sort = url.searchParams.get("sort") === "recent" ? "recent" : "name";
  const templates = await getGameTemplatesForShop(session.shop, sort);
  return {
    sort,
    templates: templates.map((template) => ({
      ...template,
      pricePerSpot: template.pricePerSpot.toString(),
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    })),
  };
}

type ActionData = {
  intent: string;
  templateId?: string;
  success?: string;
  errors?: ReturnType<typeof validateGameTemplate>["errors"];
  values?: ReturnType<typeof gameTemplateValues>;
};

export async function action({ request }: ActionFunctionArgs): Promise<ActionData> {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const templateId = String(formData.get("templateId") ?? "");

  try {
    if (intent === "delete") {
      const result = await deleteGameTemplate(templateId, session.shop);
      return result.count ? { intent, success: "Template deleted." } : { intent, errors: { form: "Template not found." } };
    }
    if (intent === "duplicate") {
      const duplicated = await duplicateGameTemplate(templateId, session.shop);
      return duplicated ? { intent, success: `Created ${duplicated.name}.` } : { intent, errors: { form: "Template not found." } };
    }

    const values = gameTemplateValues(formData);
    const validation = validateGameTemplate(values);
    if (!validation.input) return { intent, templateId, errors: validation.errors, values };

    if (intent === "create") {
      await createGameTemplate(session.shop, validation.input);
      return { intent, success: "Template created." };
    }
    if (intent === "update") {
      const updated = await updateGameTemplate(templateId, session.shop, validation.input);
      return updated ? { intent, templateId, success: "Template updated." } : { intent, templateId, errors: { form: "Template not found." }, values };
    }
    return { intent, errors: { form: "Unknown template action." }, values };
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (!duplicate) console.error("Template action failed:", error);
    return {
      intent,
      templateId,
      errors: { form: duplicate ? "A template with this name already exists for this shop." : "The template could not be saved." },
      values: intent === "create" || intent === "update" ? gameTemplateValues(formData) : undefined,
    };
  }
}

const styles = `
  :root{color-scheme:dark}*{box-sizing:border-box}.templates-page{min-height:100%;padding:28px;color:#f5f5f5;background:radial-gradient(circle at top right,rgba(155,22,34,.18),transparent 35%),linear-gradient(145deg,#0d0d0f,#171719 52%,#101012);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.templates-shell{width:min(1120px,100%);margin:auto}.templates-top,.templates-heading,.template-actions{display:flex;align-items:center;justify-content:space-between;gap:16px}.templates-top{margin-bottom:24px}.templates-top a,.template-button{border:1px solid #48484f;border-radius:10px;padding:10px 14px;color:#eee;background:#202024;text-decoration:none;cursor:pointer;font:inherit;font-weight:750}.template-button-primary{border-color:#9a3140;background:#a82f40}.templates-heading{align-items:flex-end;margin-bottom:22px}.templates-heading h1{margin:6px 0;font-size:clamp(30px,5vw,44px)}.templates-heading p,.template-card p{color:#999aa0}.templates-grid{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:22px;align-items:start}.template-card{padding:24px;border:1px solid #303035;border-radius:18px;background:rgba(27,27,30,.96);box-shadow:0 18px 50px rgba(0,0,0,.25)}.template-card h2,.template-card h3{margin-top:0}.template-fields{display:grid;gap:9px}.template-fields label{margin-top:7px;font-size:13px;font-weight:750}.template-fields input,.template-fields textarea,.template-fields select{width:100%;border:1px solid #414147;border-radius:9px;padding:11px;color:#fff;background:#111113;font:inherit}.template-fields textarea{min-height:72px;resize:vertical}.template-field-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.template-check{display:flex;align-items:center;gap:9px}.template-check input{width:auto}.template-error,.template-message{margin:0;padding:10px;border-radius:8px;color:#ffadb5;background:#4c2027}.template-message{margin-bottom:16px;color:#b9efc9;background:#173822}.template-list{display:grid;gap:15px}.template-meta{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}.template-meta span{padding:5px 8px;border:1px solid #3b3b41;border-radius:999px;font-size:12px}.template-default{color:#ffd886}.template-description-preview{margin:14px 0;padding:13px;border:1px solid #38383e;border-radius:10px;background:#111113;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55}.template-actions{justify-content:flex-start;margin-top:16px;flex-wrap:wrap}.template-actions form{margin:0}.template-danger{border-color:#74323b;color:#ff9da8}.template-empty{padding:30px;text-align:center;color:#9b9ca2}@media(max-width:800px){.templates-grid,.template-field-row{grid-template-columns:1fr}.templates-heading{align-items:flex-start;flex-direction:column}.templates-page{padding:18px 14px}}
`;

export default function TemplatesPage() {
  const { templates, sort } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  return <><style dangerouslySetInnerHTML={{ __html: styles }} /><main className="templates-page"><div className="templates-shell">
    <div className="templates-top"><Link to="/app">← Dashboard</Link><Link to="/app/games/new">Create game from template</Link></div>
    <header className="templates-heading"><div><p>Reusable configurations</p><h1>Game Templates</h1><p>Templates store setup only—never claims, payments, wheels, or results.</p></div><Form method="get"><label htmlFor="template-sort">Sort </label><select id="template-sort" name="sort" defaultValue={sort} onChange={(event) => event.currentTarget.form?.requestSubmit()}><option value="name">Name</option><option value="recent">Recently updated</option></select></Form></header>
    {actionData?.success ? <div className="template-message" role="status">{actionData.success}</div> : null}
    <div className="templates-grid"><section className="template-card"><h2>Create template</h2>
      {actionData?.intent === "create" && actionData.errors?.form ? <p className="template-error" role="alert">{actionData.errors.form}</p> : null}
      <Form method="post"><input type="hidden" name="intent" value="create" /><TemplateFormFields idPrefix="new-template" values={actionData?.intent === "create" ? actionData.values : { wheelCount: "2", initialStatus: "OPEN" }} errors={actionData?.intent === "create" ? actionData.errors : undefined} /><div className="template-actions"><button className="template-button template-button-primary" disabled={busy}>Save template</button></div></Form>
    </section><section className="template-list" aria-label="Saved templates">
      {templates.length === 0 ? <div className="template-card template-empty">No templates saved yet.</div> : templates.map((template) => {
        const editResponse = actionData?.intent === "update" && actionData.templateId === template.id ? actionData : undefined;
        return <article className="template-card" key={template.id}><h3>{template.name} {template.isDefault ? <span className="template-default">· DEFAULT</span> : null}</h3><div className="template-meta"><span>{template.totalSpots} spots</span><span>${template.pricePerSpot}</span><span>{template.wheelCount} name wheels</span><span>{template.initialStatus}</span></div>
          {template.defaultGameDescription ? <div><strong>Default game description preview</strong><p className="template-description-preview">{template.defaultGameDescription}</p></div> : null}
          {editResponse?.errors?.form ? <p className="template-error" role="alert">{editResponse.errors.form}</p> : null}
          <details><summary>Edit configuration</summary><Form method="post"><input type="hidden" name="intent" value="update" /><input type="hidden" name="templateId" value={template.id} /><TemplateFormFields idPrefix={`template-${template.id}`} errors={editResponse?.errors} values={editResponse?.values ?? { name: template.name, description: template.description ?? "", defaultGameTitle: template.defaultGameTitle ?? "", defaultGameDescription: template.defaultGameDescription ?? "", pricePerSpot: template.pricePerSpot, totalSpots: String(template.totalSpots), wheelCount: String(template.wheelCount), initialStatus: template.initialStatus, isDefault: template.isDefault }} /><div className="template-actions"><button className="template-button template-button-primary" disabled={busy}>Update</button></div></Form></details>
          <div className="template-actions"><Form method="post"><input type="hidden" name="intent" value="duplicate" /><input type="hidden" name="templateId" value={template.id} /><button className="template-button" disabled={busy}>Duplicate</button></Form><Form method="post" onSubmit={(event) => { if (!window.confirm(`Delete ${template.name}? Existing games will not be affected.`)) event.preventDefault(); }}><input type="hidden" name="intent" value="delete" /><input type="hidden" name="templateId" value={template.id} /><button className="template-button template-danger" disabled={busy}>Delete</button></Form></div>
        </article>;
      })}
    </section></div>
  </div></main></>;
}
