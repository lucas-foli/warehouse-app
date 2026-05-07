// src/components/members/InvitationsList.tsx
import { useState } from "react";
import { resendInvitation, revokeInvitation, type TenantInvitation } from "../../services/invitations";

interface Props {
  invitations: TenantInvitation[];
  onChanged: () => void;
}

const InvitationsList = ({ invitations, onChanged }: Props) => {
  const [busyId, setBusyId] = useState<string | null>(null);

  const isPending = (i: TenantInvitation) =>
    !i.accepted_at && !i.revoked_at && new Date(i.expires_at) > new Date();
  const isExpired = (i: TenantInvitation) =>
    !i.accepted_at && !i.revoked_at && new Date(i.expires_at) <= new Date();

  const pending = invitations.filter(isPending);
  const expired = invitations.filter(isExpired);

  const handleResend = async (id: string) => {
    setBusyId(id);
    await resendInvitation(id);
    setBusyId(null);
    onChanged();
  };
  const handleRevoke = async (id: string) => {
    setBusyId(id);
    await revokeInvitation(id);
    setBusyId(null);
    onChanged();
  };

  return (
    <div className="space-y-6">
      <Section title="Pending invitations" rows={pending} busyId={busyId}
        onResend={handleResend} onRevoke={handleRevoke} kind="pending" />
      {expired.length > 0 && (
        <Section title="Expired invitations" rows={expired} busyId={busyId}
          onResend={handleResend} onRevoke={handleRevoke} kind="expired" />
      )}
    </div>
  );
};

const Section = ({ title, rows, busyId, onResend, onRevoke, kind }: {
  title: string; rows: TenantInvitation[]; busyId: string | null;
  onResend: (id: string) => void; onRevoke: (id: string) => void;
  kind: "pending" | "expired";
}) => {
  if (rows.length === 0 && kind === "pending") {
    return <div><h3 className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{title}</h3><p className="mt-2 text-sm text-muted-foreground">None.</p></div>;
  }
  return (
    <div>
      <h3 className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{title}</h3>
      <table className="mt-2 w-full text-sm">
        <thead className="text-left text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          <tr><th className="py-2">Email</th><th>Role</th><th>Expires</th><th></th></tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {rows.map((i) => (
            <tr key={i.id}>
              <td className="py-3">{i.email}</td>
              <td>{i.role}</td>
              <td className="text-muted-foreground">{new Date(i.expires_at).toLocaleDateString()}</td>
              <td className="text-right">
                <div className="flex justify-end gap-2">
                  <button onClick={() => onResend(i.id)} disabled={busyId === i.id}
                    className="rounded-full border border-border/40 px-3 py-1 text-xs disabled:opacity-50">Resend</button>
                  <button onClick={() => onRevoke(i.id)} disabled={busyId === i.id}
                    className="rounded-full border border-red-500/40 px-3 py-1 text-xs text-red-600 disabled:opacity-50">Revoke</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default InvitationsList;
