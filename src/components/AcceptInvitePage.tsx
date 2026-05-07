// src/components/AcceptInvitePage.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { acceptInvitation } from "../services/invitations";
import { supabase } from "../lib/supabaseClient";

const TOKEN_STORAGE_KEY = "tenant_invitation_token";

const AcceptInvitePage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  // null = still resolving from URL/localStorage; "" = resolved with no token
  const [token, setToken] = useState<string | null>(null);
  const acceptStartedRef = useRef(false);

  // Resolve token: URL takes precedence, then localStorage. If the URL carries
  // a token we persist it and strip it from the address bar so the auth
  // round-trip can't leak it via history/referrer.
  useEffect(() => {
    if (typeof window === "undefined") {
      setToken("");
      return;
    }
    const urlToken = params.get("token")?.trim() ?? "";
    if (urlToken) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, urlToken);
      const url = new URL(window.location.href);
      url.searchParams.delete("token");
      window.history.replaceState(
        null,
        document.title,
        url.pathname + (url.search || "") + url.hash,
      );
      setToken(urlToken);
      return;
    }
    setToken(window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "");
  }, [params]);

  // Track session state.
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setHasSession(!!data.session);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!cancelled) setHasSession(!!session);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // If there is a token but no session, bounce to the login screen with a
  // ?next= param so we land back here after auth and re-mount cleanly.
  useEffect(() => {
    if (token === null || hasSession === null) return;
    if (token && !hasSession) {
      navigate("/?next=/accept-invite", { replace: true });
    }
  }, [token, hasSession, navigate]);

  // Authenticated with a token: call the Edge Function exactly once.
  useEffect(() => {
    if (token === null || hasSession === null) return;
    if (!hasSession || !token) return;
    if (acceptStartedRef.current) return;
    acceptStartedRef.current = true;

    let cancelled = false;
    const accept = async () => {
      const result = await acceptInvitation(token);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
      if (cancelled) return;
      if (!result.ok) {
        setError(translateError(result.error));
        return;
      }
      // Force a full reload so App re-runs the tenant_members lookup with the
      // freshly-inserted row. Using react-router navigate keeps stale state
      // and produces an "Acesso não autorizado" flash before the membership
      // query is re-issued.
      if (typeof window !== "undefined") {
        window.location.replace("/");
      }
    };
    void accept();
    return () => {
      cancelled = true;
    };
  }, [hasSession, token]);

  if (token === null || hasSession === null) return null;

  if (error) {
    return <CenteredCard title="Couldn't accept invite" body={error} />;
  }

  if (!token) {
    return <CenteredCard title="Invalid invitation link" body="No token found in this URL." />;
  }

  // !hasSession is handled by the redirect effect above; render nothing while
  // the navigation is in flight.
  if (!hasSession) return null;

  return <CenteredCard title="Joining workspace…" body="One moment." />;
};

const translateError = (code: string) => {
  switch (code) {
    case "expired": return "This invitation has expired. Ask the workspace admin for a new one.";
    case "revoked": return "This invitation has been revoked.";
    case "already_accepted": return "This invitation has already been used.";
    case "email_mismatch": return "This invitation is for a different email address.";
    case "invalid_token": return "This invitation link is invalid.";
    default: return "Something went wrong. Try again or contact your workspace admin.";
  }
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
