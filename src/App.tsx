import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './App.css';
import Dashboard from './components/Dashboard';
import DataImport from './components/DataImport';
import LoginForm from './components/LoginForm';
import Onboarding from './components/Onboarding';
import SetPassword from './components/SetPassword';
import DemoRequestPage from './components/DemoRequestPage';
import RequestAccessPage from './components/RequestAccessPage';
import SlugNotFound from './components/SlugNotFound';
import WorkspacePicker from './components/WorkspacePicker';
import AcceptInvitePage from './components/AcceptInvitePage';
import MembersPage from './components/members/MembersPage';
import WorkspaceLockedWall from './components/WorkspaceLockedWall';
import AdminLayout from './components/admin/AdminLayout';
import RequestsPage from './components/admin/RequestsPage';
import TenantSettingsLayout from './components/settings/TenantSettingsLayout';
import JoinRequestsPage from './components/settings/JoinRequestsPage';
import { useTenant } from './context/TenantContext';
import { supabase } from './lib/supabaseClient';
import StatusUpdateForm from './StatusUpdateForm';

const isOnApex = () => {
	if (typeof window === 'undefined') return false;
	const baseDomain = (import.meta.env.VITE_BASE_DOMAIN as string | undefined)?.trim().toLowerCase();
	if (!baseDomain) return false;
	return window.location.hostname.toLowerCase() === baseDomain;
};

const App = () => {
	const { tenant, tenantLoading, tenantError, refreshTenant } = useTenant();
	const [session, setSession] = useState<Session | null>(null);
	const [checkingSession, setCheckingSession] = useState(true);
	const [membershipRole, setMembershipRole] = useState<'admin' | 'member' | null>(null);
	const [checkingMembership, setCheckingMembership] = useState(false);
	const [membershipVersion, setMembershipVersion] = useState(0);
	// Synchronously flip checkingMembership=true so the next render after a
	// bump returns null instead of briefly rendering "Acesso não autorizado"
	// during the gap between commit and the re-fired membership effect.
	const bumpMembership = useCallback(() => {
		setCheckingMembership(true);
		setMembershipVersion((v) => v + 1);
	}, []);
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

		const finalizeCallback = async () => {
			await supabase.auth.getSession();
			window.location.replace(`${window.location.origin}/`);
		};

		void finalizeCallback();
	}, []);

	useEffect(() => {
		let isMounted = true;

		// Captured once at mount: whether the page loaded with a recovery hash.
		// Used to skip apex→tenant forwarding for recovery flows even if the
		// initial getSession() resolves before the PASSWORD_RECOVERY event fires.
		const initialHadRecoveryHash =
			typeof window !== 'undefined' && /type=recovery/.test(window.location.hash);

		// Same idea for invite hashes (inviteUserByEmail magic-link). Supabase
		// authenticates the user but never sets a password, so we route to
		// /set-password before completing the invite flow. The invite token in
		// the URL search params (?token=…) is captured here before any navigate
		// replaces it.
		const initialHadInviteHash =
			typeof window !== 'undefined' && /type=invite/.test(window.location.hash);
		const initialInviteToken =
			typeof window !== 'undefined'
				? new URL(window.location.href).searchParams.get('token')
				: null;

		const buildSetPasswordTarget = (token: string | null) =>
			token ? `/set-password?invite_token=${encodeURIComponent(token)}` : '/set-password';

		const cleanAuthHashFromUrl = () => {
			if (typeof window === 'undefined') return;
			const hash = window.location.hash;
			if (hash && /access_token=/.test(hash)) {
				const cleanUrl = window.location.pathname + window.location.search;
				window.history.replaceState(null, document.title, cleanUrl);
			}
		};

		const acceptSessionLocally = (nextSession: Session | null) => {
			if (!isMounted) return;
			setSession(nextSession);
			setCheckingSession(false);
		};

		const handleSession = (nextSession: Session | null) => {
			acceptSessionLocally(nextSession);
		};

		supabase.auth.getSession().then(({ data }) => {
			if (data.session) cleanAuthHashFromUrl();
			if (initialHadRecoveryHash && data.session) {
				acceptSessionLocally(data.session);
				navigate('/set-password', { replace: true });
				return;
			}
			if (initialHadInviteHash && data.session) {
				acceptSessionLocally(data.session);
				navigate(buildSetPasswordTarget(initialInviteToken), { replace: true });
				return;
			}
			handleSession(data.session ?? null);
		});

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((event, currentSession) => {
			// Read invite signals BEFORE cleanAuthHashFromUrl strips the hash and
			// before any navigate replaces the URL search params.
			const isInviteHash =
				typeof window !== 'undefined' && /type=invite/.test(window.location.hash);
			const inviteToken =
				typeof window !== 'undefined'
					? new URL(window.location.href).searchParams.get('token')
					: null;

			// Clean the URL hash only AFTER Supabase has read tokens from it (race fix).
			if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'PASSWORD_RECOVERY') {
				cleanAuthHashFromUrl();
			}

			if (event === 'PASSWORD_RECOVERY') {
				acceptSessionLocally(currentSession);
				navigate('/set-password', { replace: true });
				return;
			}

			if (event === 'SIGNED_IN' && isInviteHash) {
				acceptSessionLocally(currentSession);
				navigate(buildSetPasswordTarget(inviteToken), { replace: true });
				return;
			}

			// Generic SIGNED_IN (e.g. email/password login) keeps the user on the
			// current route. Without flipping the guard synchronously, the next
			// render lands a frame where session is set but membershipRole is
			// still null — flashing "Acesso não autorizado" before the
			// membership effect resolves. Mirrors bumpMembership above.
			if (event === 'SIGNED_IN') {
				setCheckingMembership(true);
			}

			handleSession(currentSession);
		});

		return () => {
			isMounted = false;
			subscription.unsubscribe();
		};
	}, [navigate]);

	useEffect(() => {
		let isMounted = true;

		const loadMembership = async () => {
			const userId = session?.user.id;
			const tenantId = tenant?.id;

			if (!userId || !tenantId) {
				setMembershipRole(null);
				// Reset the guard here too: bumpMembership() callers flip
				// checkingMembership=true, and without this reset the early
				// return would leave it stuck and freeze the UI.
				setCheckingMembership(false);
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
	}, [session?.user.id, tenant?.id, membershipVersion]);

	const handleLogout = async () => {
		await supabase.auth.signOut();
		setSession(null);
		navigate('/');
	};

	const handleSuccessAuth = async () => {
		const { data } = await supabase.auth.getSession();
		setSession(data.session ?? null);
	};

	if (checkingSession) return null;

	if (location.pathname === '/set-password') {
		if (!session) return <LoginForm onSuccess={handleSuccessAuth} />;
		return <SetPassword />;
	}

	// Route to AcceptInvitePage BEFORE the tenantLoading guard. The accept
	// flow calls refreshTenant() mid-flight, which flips tenantLoading=true
	// briefly. If this gate ran first, AcceptInvitePage would unmount during
	// the refresh and remount when it resolves — wiping its useRef guards
	// and firing the accept_tenant_invitation POST a second time.
	if (location.pathname === '/accept-invite') return <AcceptInvitePage onAccepted={bumpMembership} />;

	if (tenantLoading) return null;

	const onApex = isOnApex();

	// Platform admin surface — APEX ONLY. The platform admin manages every
	// tenant; rendering it from a tenant subdomain would put cross-tenant
	// controls inside a tenant's branded context. Tenant-scoped admin tooling
	// lives at <slug>.warehouse.go-fly.ai/settings/* instead.
	const isAdminRoute = location.pathname.startsWith('/admin');
	if (isAdminRoute && onApex) {
		if (!session) return <LoginForm onSuccess={handleSuccessAuth} />;
		return (
			<Routes>
				<Route element={<AdminLayout />}>
					<Route path="/admin/requests" element={<RequestsPage />} />
					<Route path="/admin" element={<Navigate to="/admin/requests" replace />} />
				</Route>
			</Routes>
		);
	}

	const isAuthCallback = typeof window !== 'undefined' && location.pathname.startsWith('/auth/callback');
	if (isAuthCallback) return null;

	// Apex marketing surface. /demo is the live route; /signup is preserved as
	// a redirect so any external link still works.
	if (onApex && location.pathname === '/demo') {
		return <DemoRequestPage />;
	}
	if (onApex && location.pathname === '/signup') {
		return <Navigate to="/demo" replace />;
	}

	// Tenant-scoped join request form — subdomain only.
	if (!onApex && location.pathname === '/request-access') {
		return <RequestAccessPage />;
	}

	// Authenticated users on the apex domain must explicitly pick a workspace.
	// Without this gate, the tenant lookup falls back to VITE_DEFAULT_TENANT_SLUG
	// and a logged-in visitor lands inside whichever tenant the default points at.
	if (session && onApex) {
		return <WorkspacePicker session={session} onLogout={handleLogout} />;
	}

	if (tenantError) {
		if (typeof window !== 'undefined' && location.pathname === '/signup' && onApex) {
			return <Navigate to="/demo" replace />;
		}
		if (typeof window !== 'undefined' && location.pathname === '/demo' && onApex) {
			return <DemoRequestPage />;
		}
		return <SlugNotFound />;
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

	const grantedUntil = tenant.grantedUntil ? new Date(tenant.grantedUntil) : null;
	const isExpired = !grantedUntil || grantedUntil <= new Date();
	if (isExpired) {
		return <WorkspaceLockedWall reason={grantedUntil ? 'expired' : 'locked'} />;
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
			<Route
					path="/members"
					element={<MembersPage canInvite={isAdmin} />}
				/>
				{isAdmin && (
					<Route element={<TenantSettingsLayout />}>
						<Route path="/settings/join-requests" element={<JoinRequestsPage />} />
						<Route path="/settings" element={<Navigate to="/settings/join-requests" replace />} />
					</Route>
				)}
				<Route path="*" element={<Navigate to="/" replace />} />
		</Routes>
	);
};

export default App;
