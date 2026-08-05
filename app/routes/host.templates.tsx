import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { TemplateFormFields } from "../components/templates/TemplateFormFields";
import {
  requireHostMutation,
  requireHostPermission,
} from "../lib/host-auth.server";
import { getGameTemplatesForShop } from "../models/game-template.server";
import {
  handleGameTemplateAction,
  type GameTemplateActionData,
} from "../services/game-template-actions.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const host = await requireHostPermission(request, "games:view");
  const url = new URL(request.url);
  const sort = url.searchParams.get("sort") === "recent" ? "recent" : "name";
  const templates = await getGameTemplatesForShop(host.shop, sort);
  return {
    sort,
    canManage: host.permissions.includes("games:manage"),
    csrfToken: host.csrfToken,
    templates: templates.map((template) => ({
      ...template,
      pricePerSpot: template.pricePerSpot.toString(),
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    })),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const host = await requireHostMutation(request, "games:manage", formData);
  return handleGameTemplateAction(host.shop, formData);
}

export default function HostTemplates() {
  const { templates, sort, canManage, csrfToken } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<GameTemplateActionData>();
  const busy = useNavigation().state === "submitting";
  return (
    <section>
      <header className="host-header">
        <p className="host-kicker">Reusable configurations</p>
        <h1>Templates</h1>
        <p>
          Templates store game setup only—never claims, payments, wheels, or
          results.
        </p>
        <div className="host-actions">
          <Link className="host-link" to="/host/games/new">
            Create Game From Template
          </Link>
          <Form method="get">
            <label>
              Sort templates
              <select
                name="sort"
                defaultValue={sort}
                onChange={(event) => event.currentTarget.form?.requestSubmit()}
              >
                <option value="name">Name</option>
                <option value="recent">Recently updated</option>
              </select>
            </label>
          </Form>
        </div>
      </header>
      {actionData?.success ? (
        <p className="host-message host-success" role="status">
          {actionData.success}
        </p>
      ) : null}
      <div className="host-template-grid">
        {canManage ? (
          <section className="host-card">
            <h2>Create Template</h2>
            {actionData?.intent === "create" && actionData.errors?.form ? (
              <p className="host-message host-error" role="alert">
                {actionData.errors.form}
              </p>
            ) : null}
            <Form className="host-form" method="post">
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <input type="hidden" name="intent" value="create" />
              <TemplateFormFields
                idPrefix="host-new-template"
                values={
                  actionData?.intent === "create"
                    ? actionData.values
                    : { wheelCount: "2", initialStatus: "OPEN" }
                }
                errors={
                  actionData?.intent === "create"
                    ? actionData.errors
                    : undefined
                }
              />
              <button className="host-button" disabled={busy}>
                Save Template
              </button>
            </Form>
          </section>
        ) : null}
        <section className="host-template-list" aria-label="Saved templates">
          {templates.length === 0 ? (
            <article className="host-card host-empty">
              No templates saved yet.
            </article>
          ) : (
            templates.map((template) => {
              const editResponse =
                actionData?.intent === "update" &&
                actionData.templateId === template.id
                  ? actionData
                  : undefined;
              return (
                <article className="host-card" key={template.id}>
                  <h2>
                    {template.name}
                    {template.isDefault ? " · DEFAULT" : ""}
                  </h2>
                  <p>
                    {template.totalSpots} spots · ${template.pricePerSpot} ·{" "}
                    {template.wheelCount} name wheels · {template.initialStatus}
                  </p>
                  {template.defaultGameDescription ? (
                    <p className="host-template-description">
                      {template.defaultGameDescription}
                    </p>
                  ) : null}
                  {canManage ? (
                    <>
                      {editResponse?.errors?.form ? (
                        <p className="host-message host-error" role="alert">
                          {editResponse.errors.form}
                        </p>
                      ) : null}
                      <details>
                        <summary>Edit Template</summary>
                        <Form className="host-form" method="post">
                          <input
                            type="hidden"
                            name="csrfToken"
                            value={csrfToken}
                          />
                          <input type="hidden" name="intent" value="update" />
                          <input
                            type="hidden"
                            name="templateId"
                            value={template.id}
                          />
                          <TemplateFormFields
                            idPrefix={`host-template-${template.id}`}
                            errors={editResponse?.errors}
                            values={
                              editResponse?.values ?? {
                                name: template.name,
                                description: template.description ?? "",
                                defaultGameTitle:
                                  template.defaultGameTitle ?? "",
                                defaultGameDescription:
                                  template.defaultGameDescription ?? "",
                                pricePerSpot: template.pricePerSpot,
                                totalSpots: String(template.totalSpots),
                                wheelCount: String(template.wheelCount),
                                initialStatus: template.initialStatus,
                                isDefault: template.isDefault,
                              }
                            }
                          />
                          <button className="host-button" disabled={busy}>
                            Update Template
                          </button>
                        </Form>
                      </details>
                      <div className="host-actions">
                        <Form method="post">
                          <input
                            type="hidden"
                            name="csrfToken"
                            value={csrfToken}
                          />
                          <input
                            type="hidden"
                            name="intent"
                            value="duplicate"
                          />
                          <input
                            type="hidden"
                            name="templateId"
                            value={template.id}
                          />
                          <button className="host-button" disabled={busy}>
                            Duplicate
                          </button>
                        </Form>
                        <Form
                          method="post"
                          onSubmit={(event) => {
                            if (!window.confirm(`Delete ${template.name}?`))
                              event.preventDefault();
                          }}
                        >
                          <input
                            type="hidden"
                            name="csrfToken"
                            value={csrfToken}
                          />
                          <input type="hidden" name="intent" value="delete" />
                          <input
                            type="hidden"
                            name="templateId"
                            value={template.id}
                          />
                          <button
                            className="host-button host-danger"
                            disabled={busy}
                          >
                            Delete
                          </button>
                        </Form>
                      </div>
                    </>
                  ) : null}
                </article>
              );
            })
          )}
        </section>
      </div>
    </section>
  );
}
