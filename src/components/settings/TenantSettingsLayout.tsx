// src/components/settings/TenantSettingsLayout.tsx
//
// Tenant admin layout — rendered at <slug>.warehouse.go-fly.ai/settings/*.
// The /admin/* URL space is reserved for the platform admin on apex; tenants
// get /settings/* so the two surfaces stay textually distinct in logs and
// links even though both use the word "admin" conversationally.
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTenant } from "../../context/TenantContext";

const TenantSettingsLayout = () => {
  const { tenant } = useTenant();
  const location = useLocation();
  const navigate = useNavigate();

  const isJoinRequests = location.pathname.startsWith("/settings/join-requests");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              Settings
            </div>
            <h1 className="mt-1 text-sm font-semibold tracking-tight">
              {tenant?.companyName ?? "Workspace settings"}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="rounded-full border border-border/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground">
            Back to dashboard
          </button>
        </div>
        <nav className="mt-4 flex gap-2 text-[11px] font-semibold uppercase tracking-[0.25em]">
          <Link
            to="/settings/join-requests"
            className={`rounded-full px-3 py-1 transition ${
              isJoinRequests
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}>
            Join requests
          </Link>
        </nav>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
};

export default TenantSettingsLayout;
