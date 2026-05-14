// src/components/AcceptInvitePage.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { acceptInvitation } from "../services/invitations";
import { supabase } from "../lib/supabaseClient";
import { useTenant } from "../context/TenantContext";
import { messageForEdgeErrorCode } from "../utils/edgeErrors";
import LoginForm from "./LoginForm";

const TOKEN_STORAGE_KEY = "tenant_invitation_token";

interface Props { onAccepted?: () => void }

const AcceptInvitePage = ({ onAccepted }: Props = {}) => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const { refreshTenant } = useTenant();
  // Guards against a second POST after the await refreshTenant() below: the
  // tenant-context update can re-render and re-run this effect before
  // navigate() unmounts the page, and the cleanup's cancelled flag only
  // skips post-await code — the duplicate POST has already fired by then.
  const acceptStartedRef = useRef(false);

  // Persist token across the auth round-trip.
  const tokenFromUrl = params.get("token")?.trim() ?? "";
  if (typeof window !== "undefined" && tokenFromUrl) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, tokenFromUrl);
  }
  const token = tokenFromUrl
    || (typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "" : "");

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setHasSession(!!data.session);
    };
    void check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, session) => {
      setHasSession(!!session);
    });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!hasSession || !token) return;
    if (acceptStartedRef.current) return;
    acceptStartedRef.current = true;
    let cancelled = false;
    const accept = async () => {
      const result = await acceptInvitation(token);
      if (cancelled) return;
      if (!result.ok) {
        setError(messageForEdgeErrorCode(result.error));
        return;
      }
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      // Re-fetch the tenant now that the membership row exists. Before this
      // the user wasn't a member, so `from('tenants')` was RLS-denied and
      // TenantContext had only the branding stub (id=""). Without the refresh
      // App.loadMembership runs with tenant.id="" and renders "Acesso não
      // autorizado".
      await refreshTenant();
      if (cancelled) return;
      onAccepted?.();
      navigate("/", { replace: true });
    };
    void accept();
    return () => { cancelled = true; };
  }, [hasSession, token, navigate, onAccepted, refreshTenant]);

  if (hasSession === null) return null;

  if (!token) {
    return <CenteredCard title="Invalid invitation link" body="No token found in this URL." />;
  }

  if (error) {
    return <CenteredCard title="Couldn't accept invite" body={error} />;
  }

  if (!hasSession) {
    return <LoginForm onSuccess={() => { /* effect above will pick up the new session */ }} />;
  }

  return <CenteredCard title="Joining workspace…" body="One moment." />;
};

const CenteredCard = ({ title, body }: { title: string; body: string }) => (
  <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
    <div className="w-full max-w-xl rounded-[var(--radius-card)] border border-border/40 bg-card p-8 shadow-[var(--shadow-card)] text-center">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{body}</p>
    </div>
  </div>
);

export default AcceptInvitePage;
