// src/components/DemoRequestPage.tsx
//
// Apex /demo — marketing surface + demo-request form.
// Sales-led: submissions land in the platform admin /admin/requests queue.
import { motion } from "framer-motion";
import { useState } from "react";
import { submitSignupRequest } from "../services/signupRequests";

const DemoRequestPage = () => {
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [role, setRole] = useState("");
  const [useCase, setUseCase] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setError("");

    const validEmail = /.+@.+\..+/.test(email);
    if (!validEmail) { setError("Please enter a valid work email."); return; }
    if (!companyName.trim()) { setError("Company name is required."); return; }
    if (!role.trim()) { setError("Your role is required."); return; }

    setSubmitting(true);
    const result = await submitSignupRequest({
      email,
      workspace_name: companyName,
      role,
      use_case: useCase,
    });
    setSubmitting(false);

    if (!result.ok) {
      if (result.error === "already_pending") {
        setError("We already have a pending request for this email — we'll get back to you soon.");
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
          <h1 className="text-xl font-semibold tracking-tight">Thanks — we'll be in touch</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            We'll email <strong>{email}</strong> within one business day to set up the demo.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 gap-12 px-6 py-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:py-20">
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-col justify-center gap-8">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
              warehouse · request a demo
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              The source of truth for your inventory, sales, and customers.
            </h1>
            <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">
              warehouse is the system where retail teams record and organize what they sell, what's
              in stock, and who bought it — separate from where transactions are processed. We're
              sales-led: every workspace is set up by our team after a short conversation.
            </p>
          </div>

          {/* Screenshot / video placeholders — assets ship separately. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="aspect-video rounded-2xl border border-border/40 bg-muted/40" aria-hidden />
            <div className="aspect-video rounded-2xl border border-border/40 bg-muted/40" aria-hidden />
          </div>
          <div className="aspect-video rounded-2xl border border-border/40 bg-muted/40" aria-hidden />
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
          className="flex items-start">
          <div className="w-full rounded-[var(--radius-card)] border border-border/40 bg-card p-8 shadow-[var(--shadow-card)]">
            <h2 className="text-xl font-semibold tracking-tight">Request a demo</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Tell us a bit about your business. We'll follow up within one business day.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <Field label="Work email">
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25" />
              </Field>
              <Field label="Company name">
                <input type="text" required maxLength={80} value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Hardware"
                  autoComplete="organization"
                  className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25" />
              </Field>
              <Field label="Your role">
                <input type="text" required maxLength={80} value={role} onChange={(e) => setRole(e.target.value)}
                  placeholder="Operations manager"
                  autoComplete="organization-title"
                  className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25" />
              </Field>
              <Field label="What would you like to evaluate? (optional)">
                <textarea rows={3} maxLength={500} value={useCase} onChange={(e) => setUseCase(e.target.value)}
                  placeholder="A few sentences about what you're hoping to solve."
                  className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25" />
              </Field>

              {error && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-red-600">
                  {error}
                </div>
              )}

              <button type="submit" disabled={submitting}
                className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60">
                {submitting ? "Sending…" : "Request a demo"}
              </button>
            </form>
          </div>
        </motion.section>
      </div>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground sm:text-[11px] sm:tracking-[0.3em]">
    {label}
    {children}
  </label>
);

export default DemoRequestPage;
