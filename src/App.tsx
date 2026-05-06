import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './App.css';
import Dashboard from './components/Dashboard';
import DataImport from './components/DataImport';
import LoginForm from './components/LoginForm';
import Onboarding from './components/Onboarding';
import SignupPage from './components/SignupPage';
import SlugNotFound from './components/SlugNotFound';
import { useTenant } from './context/TenantContext';
import { supabase } from './lib/supabaseClient';
import StatusUpdateForm from './StatusUpdateForm';

const INVITE_STORAGE_KEY = 'warehouse_invite_code';

// When Supabase's "Redirect URLs" allowlist only accepts the apex (the common
// default), an email link initiated on acme.example.com gets sent back to
// https://example.com/#access_token=... — losing the tenant slug. This helper
// walks the user's memberships after the session is set, picks their tenant,
// and forwards to the correct subdomain carrying the same hash tokens so
// Supabase on the subdomain can re-establish the session there.
const forwardApexSessionToTenantSubdomain = async (session: Session) => {
	if (typeof window === 'undefined') return false;
	const baseDomain = (import.meta.env.VITE_BASE_DOMAIN as string | undefined)?.trim().toLowerCase();
	if (!baseDomain) return false;

	const hostname = window.location.hostname.toLowerCase();
	if (hostname !== baseDomain) return false;

	const { data: memberRow, error: memberError } = await supabase
		.from('tenant_members')
		.select('tenant_id')
		.eq('user_id', session.user.id)
		.limit(1)
		.maybeSingle();
	if (memberError || !memberRow?.tenant_id) return false;

	const { data: tenantRow, error: tenantError } = await supabase
		.from('tenants')
		.select('slug')
		.eq('id', memberRow.tenant_id)
		.maybeSingle();
	const slugRaw = tenantRow?.slug;
	if (tenantError || !slugRaw) return false;
	const slug = slugRaw.trim().toLowerCase();
	if (!/^[a-z0-9-]{1,32}$/.test(slug)) return false;

	const hashParams = new URLSearchParams();
	hashParams.set('access_token', session.access_token);
	hashParams.set('refresh_token', session.refresh_token);
	hashParams.set('token_type', session.token_type);
	hashParams.set('expires_in', String(session.expires_in));
	if (session.expires_at) hashParams.set('expires_at', String(session.expires_at));

	await supabase.auth.signOut({ scope: 'local' });

	const target = `${window.location.protocol}//${slug}.${baseDomain}/#${hashParams.toString()}`;
	window.location.replace(target);
	return true;
};

const App = () => {
	const { tenant, tenantLoading, tenantError, refreshTenant } = useTenant();
	const [session, setSession] = useState<Session | null>(null);
	const [checkingSession, setCheckingSession] = useState(true);
	const [membershipRole, setMembershipRole] = useState<'admin' | 'member' | null>(null);
	const [checkingMembership, setCheckingMembership] = useState(false);
	const [forwardingSession, setForwardingSession] = useState(false);
	const navigate = useNavigate();
	const location = useLocation();

	useEffect(() => {
		if (typeof window === 'undefined') return;
		if (window.location.pathname.startsWith('/auth/callback')) return;

		const params = new URLSearchParams(window.location.search);
		const slug = params.get('slug')?.trim().toLowerCase();
		if (!slug) return;
		if (!/^[a-z0-9-]{1,32}$/.test(slug)) return;

		const baseDomain = (import.meta.env.VITE_BASE_DOMAIN as string | undefined)?.trim().toLowerCase();
		if (!baseDomain) return;

		const hostname = window.location.hostname.toLowerCase();
		if (hostname !== baseDomain) return;

		params.delete('slug');
		const query = params.toString();
		const target = `${window.location.protocol}//${slug}.${baseDomain}${window.location.pathname}${
			query ? `?${query}` : ''
		}${window.location.hash}`;
		window.location.replace(target);
	}, []);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		if (window.location.pathname.startsWith('/auth/callback')) return;

		const params = new URLSearchParams(window.location.search);
		const slug = params.get('slug')?.trim().toLowerCase();
		if (!slug) return;

		const hostname = window.location.hostname.toLowerCase();
		const currentSubdomain = hostname.split('.').filter(Boolean)[0] ?? '';
		if (slug !== currentSubdomain) return;

		params.delete('slug');
		const query = params.toString();
		const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
		window.history.replaceState(null, document.title, cleanUrl);
	}, []);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		if (!url.pathname.startsWith('/auth/callback')) return;

		const inviteFromUrl = url.searchParams.get('invite')?.trim() ?? '';
		const storedInvite = window.localStorage.getItem(INVITE_STORAGE_KEY) ?? '';
		const inviteCode = inviteFromUrl || storedInvite;

		if (inviteCode) {
			window.localStorage.setItem(INVITE_STORAGE_KEY, inviteCode);
		}

		const finalizeCallback = async () => {
			await supabase.auth.getSession();
			const target = inviteCode
				? `${window.location.origin}/?invite=${encodeURIComponent(inviteCode)}`
				: `${window.location.origin}/`;
			window.location.replace(target);
		};

		void finalizeCallback();
	}, []);

	// Strip auth tokens from URL hash (Supabase puts them there on magic link / recovery flows)
	useEffect(() => {
		if (typeof window === 'undefined') return;
		const hash = window.location.hash;
		if (hash && /access_token=/.test(hash)) {
			// Supabase client reads these automatically via detectSessionInUrl;
			// we just need to clean the URL so tokens aren't visible / logged / shared.
			const cleanUrl = window.location.pathname + window.location.search;
			window.history.replaceState(null, document.title, cleanUrl);
		}
	}, []);

	useEffect(() => {
		let isMounted = true;

		const handleSession = async (nextSession: Session | null) => {
			if (!isMounted) return;
			if (nextSession) {
				const forwarded = await forwardApexSessionToTenantSubdomain(nextSession);
				if (forwarded) {
					if (isMounted) setForwardingSession(true);
					return;
				}
			}
			if (!isMounted) return;
			setSession(nextSession);
			setCheckingSession(false);
		};

		supabase.auth.getSession().then(({ data }) => {
			void handleSession(data.session ?? null);
		});

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, currentSession) => {
			void handleSession(currentSession);
		});

		return () => {
			isMounted = false;
			subscription.unsubscribe();
		};
	}, []);

	useEffect(() => {
		let isMounted = true;

		const loadMembership = async () => {
			const userId = session?.user.id;
			const tenantId = tenant?.id;

			if (!userId || !tenantId) {
				setMembershipRole(null);
				return;
			}

			setCheckingMembership(true);
			const { data, error } = await supabase
				.from('tenant_members')
				.select('role')
				.eq('tenant_id', tenantId)
				.eq('user_id', userId)
				.maybeSingle();

			if (!isMounted) return;

			if (error) {
				setMembershipRole(null);
				setCheckingMembership(false);
				return;
			}

			setMembershipRole((data?.role as 'admin' | 'member' | undefined) ?? null);
			setCheckingMembership(false);
		};

		void loadMembership();

		return () => {
			isMounted = false;
		};
	}, [session?.user.id, tenant?.id]);

	const handleLogout = async () => {
		await supabase.auth.signOut();
		setSession(null);
		navigate('/');
	};

	const handleSuccessAuth = async () => {
		const { data } = await supabase.auth.getSession();
		setSession(data.session ?? null);
	};

	if (forwardingSession || checkingSession || tenantLoading) return null;

	const inviteCode = typeof window !== 'undefined'
		? new URLSearchParams(window.location.search).get('invite')?.trim() ||
			window.localStorage.getItem(INVITE_STORAGE_KEY) ||
			''
		: '';

	const isAuthCallback = typeof window !== 'undefined' && location.pathname.startsWith('/auth/callback');
	if (isAuthCallback) return null;

	if (tenantError) {
		if (typeof window !== 'undefined' && location.pathname === '/signup') {
			return <SignupPage />;
		}
		if (!inviteCode) return <SlugNotFound />;
		if (!session) return <LoginForm onSuccess={handleSuccessAuth} />;
		return <Onboarding onFinish={() => void refreshTenant()} inviteCode={inviteCode} />;
	}

	if (!session) return <LoginForm onSuccess={handleSuccessAuth} />;

	if (!tenant) {
		return (
			<div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
				<div className="w-full max-w-xl rounded-[var(--radius-card)] border border-border/40 bg-card p-8 shadow-[var(--shadow-card)]">
					<h1 className="text-xl font-semibold tracking-tight">Configuração pendente</h1>
					<p className="mt-2 text-sm text-muted-foreground">Não foi possível carregar a empresa deste subdomínio.</p>
				</div>
			</div>
		);
	}

	if (checkingMembership) return null;

	if (!membershipRole) {
		return (
			<div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
				<div className="w-full max-w-xl rounded-[var(--radius-card)] border border-border/40 bg-card p-8 shadow-[var(--shadow-card)]">
					<h1 className="text-xl font-semibold tracking-tight">Acesso não autorizado</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Sua conta não tem acesso a <span className="font-semibold">{tenant.companyName}</span>. Peça para um administrador
						adicionar seu usuário.
					</p>
					<button
						type="button"
						onClick={handleLogout}
						className="mt-6 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold uppercase tracking-[0.25em] text-primary-foreground hover:bg-primary/90">
						Sair
					</button>
				</div>
			</div>
		);
	}

	if (!tenant.isOnboarded) {
		if (membershipRole !== 'admin') {
			return (
				<div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
					<div className="w-full max-w-xl rounded-[var(--radius-card)] border border-border/40 bg-card p-8 shadow-[var(--shadow-card)]">
						<h1 className="text-xl font-semibold tracking-tight">Setup em andamento</h1>
						<p className="mt-2 text-sm text-muted-foreground">
							Um administrador ainda precisa finalizar a configuração de <span className="font-semibold">{tenant.companyName}</span>.
						</p>
						<button
							type="button"
							onClick={handleLogout}
							className="mt-6 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold uppercase tracking-[0.25em] text-primary-foreground hover:bg-primary/90">
							Sair
						</button>
					</div>
				</div>
			);
		}

		return <Onboarding onFinish={() => void refreshTenant()} />;
	}

	const isAdmin = membershipRole === 'admin';

	return (
		<Routes>
			<Route
				path="/"
				element={
					<Dashboard
						onLogout={handleLogout}
						onOpenStatusForm={() => navigate('/status-update')}
						onOpenImport={() => navigate('/import')}
						canImport={isAdmin}
						canOpenStatusForm={isAdmin}
					/>
				}
			/>
			<Route
				path="/products"
				element={
					<Dashboard
						onLogout={handleLogout}
						onOpenStatusForm={() => navigate('/status-update')}
						onOpenImport={() => navigate('/import')}
						canImport={isAdmin}
						canOpenStatusForm={isAdmin}
						initialSurface="products"
					/>
				}
			/>
			<Route
				path="/clients"
				element={
					<Dashboard
						onLogout={handleLogout}
						onOpenStatusForm={() => navigate('/status-update')}
						onOpenImport={() => navigate('/import')}
						canImport={isAdmin}
						canOpenStatusForm={isAdmin}
						initialPage="clientes"
					/>
				}
			/>
			<Route
				path="/sellers"
				element={
					<Dashboard
						onLogout={handleLogout}
						onOpenStatusForm={() => navigate('/status-update')}
						onOpenImport={() => navigate('/import')}
						canImport={isAdmin}
						canOpenStatusForm={isAdmin}
						initialPage="vendedores"
					/>
				}
			/>
			{isAdmin && (
				<Route
					path="/status-update"
					element={<StatusUpdateForm session={session} onBack={() => navigate('/')} />}
				/>
			)}
			{isAdmin && (
				<Route
					path="/import"
					element={<DataImport onBack={() => navigate('/')} />}
				/>
			)}
			<Route path="*" element={<Navigate to="/" replace />} />
		</Routes>
	);
};

export default App;
