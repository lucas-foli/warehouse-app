// src/components/settings/ApproveJoinRequestModal.tsx
import { useState } from "react";
import { approveJoinRequest, type TenantJoinRequest } from "../../services/joinRequests";

interface Props {
  request: TenantJoinRequest;
  onClose: () => void;
  onApproved: () => void;
}

const ApproveJoinRequestModal = ({ request, onClose, onApproved }: Props) => {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await approveJoinRequest(request.id);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onApproved();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-[var(--radius-card)] border border-border/40 bg-card p-6 shadow-[var(--shadow-card)]"
        onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="text-lg font-semibold">Approve join request</h2>
          <p className="text-sm text-muted-foreground">
            Approve <strong>{request.email}</strong> and send them an invitation to join this
            workspace?
          </p>
          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-red-600">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-2xl px-4 py-2 text-sm border border-border/40 disabled:opacity-60">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60">
              {submitting ? "Approving…" : "Approve"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ApproveJoinRequestModal;
