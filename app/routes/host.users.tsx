import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import type { HostRole } from "@prisma/client";
import {
  requireHostMutation,
  requireHostPermission,
} from "../lib/host-auth.server";
import {
  createHostPasswordReset,
  createHostUser,
  deleteHostUser,
  listHostUsers,
  updateHostUser,
} from "../models/host-user.server";
import db from "../db.server";
import { recordHostAuditEvent } from "../models/host-audit.server";

const ROLES: HostRole[] = ["OWNER", "HOST", "MODERATOR", "VIEWER"];
export async function loader({ request }: LoaderFunctionArgs) {
  const host = await requireHostPermission(request, "hosts:manage");
  return { csrfToken: host.csrfToken, users: await listHostUsers(host.shop) };
}
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const host = await requireHostMutation(request, "hosts:manage", formData);
  const intent = String(formData.get("intent") ?? "");
  const id = String(formData.get("hostUserId") ?? "");
  try {
    if (intent === "create") {
      const role = String(formData.get("role")) as HostRole;
      if (!ROLES.includes(role)) throw new Error("Select a valid role.");
      await createHostUser({
        shop: host.shop,
        email: String(formData.get("email") ?? ""),
        displayName: String(formData.get("displayName") ?? ""),
        password: String(formData.get("password") ?? ""),
        role,
        actorId: host.actorId,
      });
      return { success: "Host account created." };
    }
    if (intent === "set-active") {
      await updateHostUser({
        shop: host.shop,
        id,
        actorId: host.actorId,
        isActive: formData.get("active") === "true",
      });
      return { success: "Host status updated." };
    }
    if (intent === "set-role") {
      const role = String(formData.get("role")) as HostRole;
      if (!ROLES.includes(role)) throw new Error("Select a valid role.");
      await updateHostUser({
        shop: host.shop,
        id,
        actorId: host.actorId,
        role,
      });
      return { success: "Host role updated." };
    }
    if (intent === "revoke-sessions") {
      const user = await db.hostUser.findFirst({
        where: { id, shop: host.shop },
      });
      if (!user) throw new Error("Host account not found.");
      await db.hostSession.updateMany({
        where: { hostUserId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await recordHostAuditEvent({
        shop: host.shop,
        actorId: host.actorId,
        action: "host.sessions_revoked",
        targetType: "HostUser",
        targetId: id,
      });
      return { success: "All sessions revoked." };
    }
    if (intent === "reset-link") {
      const token = await createHostPasswordReset({
        shop: host.shop,
        id,
        actorId: host.actorId,
      });
      return {
        success: "One-time reset link created.",
        resetUrl: `${new URL(request.url).origin}/host/reset/${token}`,
      };
    }
    if (intent === "delete") {
      await deleteHostUser({ shop: host.shop, id, actorId: host.actorId });
      return { success: "Host account deleted." };
    }
    return { error: "Unknown host action." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The host action failed.",
    };
  }
}
const date = (value: Date | string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Never";
export default function HostUsers() {
  const { users, csrfToken } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  return (
    <>
      <header className="host-header">
        <p className="host-kicker">Owner security</p>
        <h1>Host Accounts</h1>
        <p>
          Create role-scoped operators, revoke access, and issue short-lived
          reset links.
        </p>
      </header>
      {data?.error ? (
        <p className="host-message host-error">{data.error}</p>
      ) : null}
      {data?.success ? (
        <p className="host-message host-success">{data.success}</p>
      ) : null}
      {data?.resetUrl ? (
        <label className="host-form">
          Copy reset link
          <input readOnly value={data.resetUrl} />
        </label>
      ) : null}
      <section className="host-card">
        <h2>Create Host</h2>
        <Form className="host-form" method="post">
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <input type="hidden" name="intent" value="create" />
          <label>
            Display name
            <input name="displayName" required />
          </label>
          <label>
            Email
            <input type="email" name="email" required />
          </label>
          <label>
            Temporary password
            <input
              type="password"
              name="password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          <label>
            Role
            <select name="role">
              {ROLES.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
          </label>
          <button className="host-button">Create Host</button>
        </Form>
      </section>
      <section className="host-grid">
        {users.map((user) => (
          <article className="host-card" key={user.id}>
            <h2>{user.displayName}</h2>
            <p>{user.email}</p>
            <p>
              {user.role} · {user.isActive ? "Active" : "Disabled"}
            </p>
            <p>Last login: {date(user.lastLoginAt)}</p>
            <div className="host-actions">
              <Form method="post">
                <input type="hidden" name="csrfToken" value={csrfToken} />
                <input type="hidden" name="hostUserId" value={user.id} />
                <input type="hidden" name="active" value={String(!user.isActive)} />
                <select name="role" defaultValue={user.role}>
                  {ROLES.map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
                <button name="intent" value="set-role">
                  Set Role
                </button>
                <button name="intent" value="set-active">
                  {user.isActive ? "Deactivate" : "Reactivate"}
                </button>
                <button name="intent" value="revoke-sessions">
                  Revoke Sessions
                </button>
                <button name="intent" value="reset-link">
                  Reset Link
                </button>
                <button name="intent" value="delete">
                  Delete Account
                </button>
              </Form>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
