// src/components/settings/DeclineJoinRequestModal.tsx
import { useState } from "react";
import { declineJoinRequest, type TenantJoinRequest } from "../../services/joinRequests";
import { Modal } from "../ui/Modal";

interface Props {
  request: TenantJoinRequest;
  onClose: () => void;
  onDeclined: () => void;
}

const DeclineJoinRequestModal = ({ request, onClose, onDeclined }: Props) => {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await declineJoinRequest({
      request_id: request.id,
      reason: reason.trim() || null,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDeclined();
  };

  return (
    <Modal open onClose={onClose} size="md" labelledById="decline-join-request-title">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 pt-2 sm:pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 id="decline-join-request-title" className="text-lg font-semibold">Decline join request</h2>
          <p className="text-sm text-muted-foreground">
            Decline <strong>{request.email}</strong>'s request to join this workspace?
          </p>
          <label className="block text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Reason (optional, internal)
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
            />
          </label>
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
              className="rounded-2xl bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-60">
              {submitting ? "Declining…" : "Decline"}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default DeclineJoinRequestModal;
