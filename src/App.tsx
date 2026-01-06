import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';
import DataImport from './components/DataImport';
import LoginForm from './components/LoginForm';
import Onboarding from './components/Onboarding';
import TenantInviteGate from './components/TenantInviteGate';
import { useTenant } from './context/TenantContext';
import { supabase } from './lib/supabaseClient';
import StatusUpdateForm from './StatusUpdateForm';

const App = () => {
	const { tenant, tenantLoading, tenantError, refreshTenant } = useTenant();
	const [session, setSession] = useState<Session | null>(null);
	const [checkingSession, setCheckingSession] = useState(true);
	const [view, setView] = useState<'dashboard' | 'statusForm' | 'importData'>('dashboard');
	const [membershipRole, setMembershipRole] = useState<'admin' | 'member' | null>(null);
	const [checkingMembership, setCheckingMembership] = useState(false);

	useEffect(() => {
		let isMounted = true;
		supabase.auth.getSession().then(({ data }) => {
			if (isMounted) {
				setSession(data.session ?? null);
				setCheckingSession(false);
			}
		});

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, currentSession) => {
			setSession(currentSession);
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
		setView('dashboard');
	};

	const handleSuccessAuth = async () => {
		const { data } = await supabase.auth.getSession();
		setSession(data.session ?? null);
		setView('dashboard');
	};

	if (checkingSession || tenantLoading) return null;

	if (!session) return <LoginForm onSuccess={handleSuccessAuth} />;

	if (tenantError) {
		return <TenantInviteGate />;
	}

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

	if (view === 'statusForm') {
		return <StatusUpdateForm session={session} onBack={() => setView('dashboard')} />;
	}

	if (view === 'importData') {
		return <DataImport onBack={() => setView('dashboard')} />;
	}

	return (
		<Dashboard
			onLogout={handleLogout}
			onOpenStatusForm={() => setView('statusForm')}
			onOpenImport={() => setView('importData')}
			canImport={membershipRole === 'admin'}
		/>
	);
};

export default App;
