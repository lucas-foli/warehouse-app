// src/components/settings/JoinRequestsPage.tsx
//
// Tenant admin queue for tenant-scoped join requests + the per-tenant
// accept_join_requests kill switch.
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useTenant } from "../../context/TenantContext";
import {
  listJoinRequests,
  type JoinRequestStatus,
  type TenantJoinRequest,
} from "../../services/joinRequests";
import ApproveJoinRequestModal from "./ApproveJoinRequestModal";
import DeclineJoinRequestModal from "./DeclineJoinRequestModal";

const TABS: JoinRequestStatus[] = ["pending", "approved", "declined"];

const JoinRequestsPage = () => {
  const { tenant, patchTenant, refreshTenant } = useTenant();
  const [tab, setTab] = useState<JoinRequestStatus>("pending");
  const [requests, setRequests] = useState<TenantJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toggleSaving, setToggleSaving] = useState(false);
  const [approving, setApproving] = useState<TenantJoinRequest | null>(null);
  const [declining, setDeclining] = useState<TenantJoinRequest | null>(null);

  const tenantId = tenant?.id ?? "";
  const accepting = tenant?.acceptJoinRequests ?? true;

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError("");
    try {
      const rows = await listJoinRequests(tenantId, tab);
      setRequests(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [tenantId, tab]);

  const handleToggle = async () => {
    if (!tenantId) return;
    const next = !accepting;
    setToggleSaving(true);
    // Optimistic patch so the toggle feels instant.
    patchTenant({ acceptJoinRequests: next });
    const { error: updateErr } = await supabase
      .from("tenants")
      .update({ accept_join_requests: next })
      .eq("id", tenantId);
    setToggleSaving(false);
    if (updateErr) {
      patchTenant({ acceptJoinRequests: !next });
      setError(`Couldn't update setting: ${updateErr.message}`);
      return;
    }
    // Pull fresh tenant state so other surfaces stay in sync.
    void refreshTenant();
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/40 bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Allow people to request access to {tenant?.companyName ?? "this workspace"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              When off, the "Request access" link is hidden on your login page and incoming
              requests are silently rejected.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-3 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            <input
              type="checkbox"
              checked={accepting}
              onChange={handleToggle}
              disabled={toggleSaving}
              className="h-4 w-4 rounded border-input"
            />
            {accepting ? "On" : "Off"}
          </label>
        </div>
      </section>

      <div className="inline-flex rounded-full border border-border/40 bg-muted p-1 text-xs font-semibold uppercase tracking-[0.25em]">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-5 py-2 transition ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No {tab} requests.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            <tr>
              <th className="py-2">Submitted</th>
              <th>Email</th>
              <th>Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {requests.map((r) => (
              <tr key={r.id}>
                <td className="py-3 text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                <td>{r.email}</td>
                <td className="max-w-xs truncate text-muted-foreground" title={r.note ?? ""}>{r.note ?? "—"}</td>
                <td className="text-right">
                  {r.status === "pending" && (
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setApproving(r)}
                        className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground">
                        Approve
                      </button>
                      <button
                        onClick={() => setDeclining(r)}
                        className="rounded-full border border-border/40 px-3 py-1 text-xs">
                        Decline
                      </button>
                    </div>
                  )}
                  {r.status === "declined" && r.declined_reason && (
                    <span className="text-xs text-muted-foreground" title={r.declined_reason}>Declined</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {approving && (
        <ApproveJoinRequestModal
          request={approving}
          onClose={() => setApproving(null)}
          onApproved={() => {
            setApproving(null);
            void load();
          }}
        />
      )}

      {declining && (
        <DeclineJoinRequestModal
          request={declining}
          onClose={() => setDeclining(null)}
          onDeclined={() => {
            setDeclining(null);
            void load();
          }}
        />
      )}
    </div>
  );
};

export default JoinRequestsPage;
