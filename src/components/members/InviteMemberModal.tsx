// src/components/members/InviteMemberModal.tsx
import { useState } from "react";
import { createInvitation } from "../../services/invitations";

interface Props {
  tenantId: string;
  onClose: () => void;
  onInvited: () => void;
}

const InviteMemberModal = ({ tenantId, onClose, onInvited }: Props) => {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setError("");
    if (!/.+@.+\..+/.test(email)) { setError("Enter a valid email."); return; }
    setSubmitting(true);
    const result = await createInvitation({ tenant_id: tenantId, email, role });
    setSubmitting(false);
    if (!result.ok) { setError(translateError(result.error)); return; }
    onInvited();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-border/40 bg-card p-6 shadow-[var(--shadow-card)]" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="text-lg font-semibold">Invite teammate</h2>
          <label className="block text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25" />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">Role</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="role" value="member" checked={role === "member"} onChange={() => setRole("member")} /> Member
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="role" value="admin" checked={role === "admin"} onChange={() => setRole("admin")} /> Admin
            </label>
          </fieldset>
          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-red-600">{error}</div>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-2xl px-4 py-2 text-sm border border-border/40">Cancel</button>
            <button type="submit" disabled={submitting} className="rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60">
              {submitting ? "Sending…" : "Send invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const translateError = (code: string) => {
  switch (code) {
    case "already_invited": return "There's already a pending invite for that email.";
    case "already_member": return "That user is already a member of this workspace.";
    case "invalid_email": return "Enter a valid email.";
    default: return "Something went wrong. Please try again.";
  }
};

export default InviteMemberModal;
