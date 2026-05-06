// src/components/admin/DeclineRequestModal.tsx
import { useState } from "react";
import { declineSignupRequest, type SignupRequest } from "../../services/signupRequests";

interface Props {
  request: SignupRequest;
  onClose: () => void;
  onDeclined: () => void;
}

const DeclineRequestModal = ({ request, onClose, onDeclined }: Props) => {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await declineSignupRequest({
      request_id: request.id,
      reason: reason.trim() || null,
    });
    setSubmitting(false);
    if (!result.ok) { setError(result.error); return; }
    onDeclined();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-[var(--radius-card)] border border-border/40 bg-card p-6 shadow-[var(--shadow-card)]" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="text-lg font-semibold">Decline request</h2>
          <p className="text-sm text-muted-foreground">
            Decline {request.email}'s request for <strong>{request.workspace_name}</strong>?
          </p>
          <label className="block text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Reason (optional, internal)
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25" />
          </label>
          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-red-600">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-2xl px-4 py-2 text-sm border border-border/40">Cancel</button>
            <button type="submit" disabled={submitting} className="rounded-2xl bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-60">
              {submitting ? "Declining…" : "Decline"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DeclineRequestModal;
