// src/components/RequestAccessPage.tsx
//
// Rendered on tenant subdomains at /request-access. Submits a tenant-scoped
// join request that lands in the tenant admin's queue at /settings/join-requests.
import { motion } from "framer-motion";
import { useState } from "react";
import { useTenant } from "../context/TenantContext";
import { useTheme } from "../context/ThemeContext";
import { submitJoinRequest } from "../services/joinRequests";

const RequestAccessPage = () => {
  const { tenantSlug, tenant } = useTenant();
  const { companyName } = useTheme();
  const displayName = tenant?.companyName || companyName || tenantSlug;

  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  // When a tenant has opted out, show a closed-door screen instead of the form.
  // The Edge Function would silently drop the submission anyway; this just
  // tells the user truthfully rather than letting them fill out a dead form.
  if (tenant && !tenant.acceptJoinRequests) {
    return (
      <CenteredCard
        title={`${displayName} isn't accepting requests`}
        body="This workspace isn't accepting access requests right now. Please contact your admin directly to get added."
      />
    );
  }

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setError("");

    const validEmail = /.+@.+\..+/.test(email);
    if (!validEmail) { setError("Please enter a valid work email."); return; }

    setSubmitting(true);
    const result = await submitJoinRequest({
      slug: tenantSlug,
      email,
      note,
    });
    setSubmitting(false);

    if (!result.ok) {
      setError("Something went wrong. Please try again.");
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <CenteredCard
        title="Request sent"
        body={`If ${displayName} approves your request, we'll email ${email} with a link to join.`}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl rounded-[var(--radius-card)] border border-border/40 bg-card p-8 shadow-[var(--shadow-card)]">
        <h1 className="text-xl font-semibold tracking-tight">Request access to {displayName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Submit your work email and a quick note. {displayName}'s admin will review and email
          you an invite if approved.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field label="Work email">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25" />
          </Field>
          <Field label="Anything we should know? (optional)">
            <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. I'm on the operations team, hired last week."
              className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25" />
          </Field>

          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-red-600">
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting}
            className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60">
            {submitting ? "Sending…" : "Send request"}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const CenteredCard = ({ title, body }: { title: string; body: string }) => (
  <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
    <div className="w-full max-w-xl rounded-[var(--radius-card)] border border-border/40 bg-card p-8 shadow-[var(--shadow-card)] text-center">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{body}</p>
    </div>
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground sm:text-[11px] sm:tracking-[0.3em]">
    {label}
    {children}
  </label>
);

export default RequestAccessPage;
