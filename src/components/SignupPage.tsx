// src/components/SignupPage.tsx
import { motion } from "framer-motion";
import { useState } from "react";
import { submitSignupRequest } from "../services/signupRequests";

const REFERRAL_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "google", label: "Google" },
  { value: "twitter", label: "Twitter" },
  { value: "friend", label: "Friend or colleague" },
  { value: "other", label: "Other" },
];

const SignupPage = () => {
  const [email, setEmail] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [useCase, setUseCase] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setError("");

    const validEmail = /.+@.+\..+/.test(email);
    if (!validEmail) { setError("Please enter a valid email."); return; }
    if (!workspaceName.trim()) { setError("Workspace name is required."); return; }

    setSubmitting(true);
    const result = await submitSignupRequest({
      email,
      workspace_name: workspaceName,
      use_case: useCase,
      referral_source: referralSource,
    });
    setSubmitting(false);

    if (!result.ok) {
      if (result.error === "already_pending") {
        setError("You already have a pending request — we'll email you when it's reviewed.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-xl rounded-[var(--radius-card)] border border-border/40 bg-card p-8 shadow-[var(--shadow-card)] text-center">
          <h1 className="text-xl font-semibold tracking-tight">Request received</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Thanks. We'll email you at <strong>{email}</strong> when access is granted.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl rounded-[var(--radius-card)] border border-border/40 bg-card p-8 shadow-[var(--shadow-card)]">
        <h1 className="text-xl font-semibold tracking-tight">Request access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tell us a bit about your business. We review every request and grant access manually.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field label="Email">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25" />
          </Field>
          <Field label="Workspace name">
            <input type="text" required maxLength={60} value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="Acme Inc"
              className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25" />
          </Field>
          <Field label="How will you use this? (optional)">
            <textarea rows={3} maxLength={500} value={useCase} onChange={(e) => setUseCase(e.target.value)}
              placeholder="A few sentences about your inventory and team."
              className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25" />
          </Field>
          <Field label="How'd you hear about us? (optional)">
            <select value={referralSource} onChange={(e) => setReferralSource(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25">
              {REFERRAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>

          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-red-600">
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting}
            className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60">
            {submitting ? "Submitting…" : "Request access"}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground sm:text-[11px] sm:tracking-[0.3em]">
    {label}
    {children}
  </label>
);

export default SignupPage;
