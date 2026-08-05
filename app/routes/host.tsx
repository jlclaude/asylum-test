import type { LoaderFunctionArgs } from "react-router";
import {
  Outlet,
  useLoaderData,
  useRouteError,
  isRouteErrorResponse,
} from "react-router";
import { HostNavigation } from "../components/host/HostNavigation";
import { HostErrorPage } from "../components/host/HostErrorPage";
import { requireHostUser } from "../lib/host-auth.server";
import "../styles/host-portal.css";

export async function loader({ request }: LoaderFunctionArgs) {
  const host = await requireHostUser(request);
  return {
    user: {
      displayName: host.actorDisplayName,
      role: host.role,
      permissions: host.permissions,
    },
    csrfToken: host.csrfToken,
  };
}
export default function HostLayout() {
  const data = useLoaderData<typeof loader>();
  return (
    <main className="host-page">
      <div className="host-shell">
        <HostNavigation {...data} />
        <Outlet context={data} />
      </div>
    </main>
  );
}
export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status}: ${error.statusText || error.data}`
    : error instanceof Error
      ? error.message
      : "The Host Portal could not be loaded.";
  return <HostErrorPage message={message} />;
}
