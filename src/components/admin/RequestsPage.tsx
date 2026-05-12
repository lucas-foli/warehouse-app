// src/components/admin/RequestsPage.tsx
import { useEffect, useState } from "react";
import { listSignupRequests, type SignupRequest, type SignupRequestStatus } from "../../services/signupRequests";
import ApproveRequestModal from "./ApproveRequestModal";
import DeclineRequestModal from "./DeclineRequestModal";

const TABS: SignupRequestStatus[] = ["pending", "approved", "declined"];

const RequestsPage = () => {
  const [tab, setTab] = useState<SignupRequestStatus>("pending");
  const [requests, setRequests] = useState<SignupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<SignupRequest | null>(null);
  const [declining, setDeclining] = useState<SignupRequest | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await listSignupRequests(tab);
      setRequests(rows);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [tab]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Demo requests</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Submissions from the apex /demo page. Approve to provision a tenant; decline to dismiss.
        </p>
      </div>

      <div className="inline-flex rounded-full border border-border/40 bg-muted p-1 text-xs font-semibold uppercase tracking-[0.25em]">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-5 py-2 transition ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

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
              <th>Company</th>
              <th>Role</th>
              <th>To evaluate</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {requests.map((r) => (
              <tr key={r.id}>
                <td className="py-3 text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                <td>{r.email}</td>
                <td>{r.workspace_name}</td>
                <td className="text-muted-foreground">{r.role ?? "—"}</td>
                <td className="max-w-xs truncate text-muted-foreground" title={r.use_case ?? ""}>{r.use_case ?? "—"}</td>
                <td className="text-right">
                  {r.status === "pending" && (
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setApproving(r)} className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground">Approve</button>
                      <button onClick={() => setDeclining(r)} className="rounded-full border border-border/40 px-3 py-1 text-xs">Decline</button>
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
        <ApproveRequestModal
          request={approving}
          onClose={() => setApproving(null)}
          onApproved={() => { setApproving(null); void load(); }} />
      )}
      {declining && (
        <DeclineRequestModal
          request={declining}
          onClose={() => setDeclining(null)}
          onDeclined={() => { setDeclining(null); void load(); }} />
      )}
    </div>
  );
};

export default RequestsPage;
