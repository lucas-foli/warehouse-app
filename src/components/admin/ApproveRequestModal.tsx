// src/components/admin/ApproveRequestModal.tsx
import { useEffect, useState } from "react";
import { approveSignupRequest, type SignupRequest } from "../../services/signupRequests";
import { SLUG_RE, slugify } from "../../utils/slug";

const DURATIONS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "forever", label: "Forever" },
];

interface Props {
  request: SignupRequest;
  onClose: () => void;
  onApproved: () => void;
}

const ApproveRequestModal = ({ request, onClose, onApproved }: Props) => {
  const [slug, setSlug] = useState(slugify(request.workspace_name));
  const [duration, setDuration] = useState("30");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setSlug(slugify(request.workspace_name)); }, [request.id, request.workspace_name]);

  const computeGrantedUntil = (): string | null => {
    if (duration === "forever") return null;
    const days = Number(duration);
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  };

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setError("");
    if (!SLUG_RE.test(slug)) {
      setError("Slug must be 1–32 chars, lowercase letters, numbers, or dashes.");
      return;
    }
    setSubmitting(true);
    const result = await approveSignupRequest({
      request_id: request.id,
      slug,
      granted_until: computeGrantedUntil(),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onApproved();
  };

  return (
    <Backdrop onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <h2 className="text-lg font-semibold">Approve request</h2>
        <p className="text-sm text-muted-foreground">
          Granting access for <strong>{request.email}</strong> ({request.workspace_name}).
        </p>

        <Field label="Slug">
          <input value={slug} onChange={(e) => setSlug(e.target.value)} required
            className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25" />
        </Field>

        <Field label="Access duration">
          <select value={duration} onChange={(e) => setDuration(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25">
            {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </Field>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-red-600">
            {error === "slug_taken" ? "That slug is already taken — try another." : error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-2xl px-4 py-2 text-sm border border-border/40">Cancel</button>
          <button type="submit" disabled={submitting} className="rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60">
            {submitting ? "Approving…" : "Approve"}
          </button>
        </div>
      </form>
    </Backdrop>
  );
};

const Backdrop = ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
    <div className="w-full max-w-lg rounded-[var(--radius-card)] border border-border/40 bg-card p-6 shadow-[var(--shadow-card)]" onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
    {label}
    {children}
  </label>
);

export default ApproveRequestModal;
