// src/components/WorkspaceLockedWall.tsx
import { useTenant } from '../context/TenantContext';
import { supabase } from '../lib/supabaseClient';

interface Props { reason: 'expired' | 'locked'; }

const WorkspaceLockedWall = ({ reason }: Props) => {
	const { tenant } = useTenant();
	const handleLogout = async () => { await supabase.auth.signOut(); };

	return (
		<div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
			<div className="w-full max-w-xl rounded-[var(--radius-card)] border border-border/40 bg-card p-8 shadow-[var(--shadow-card)] text-center">
				<h1 className="text-xl font-semibold tracking-tight">
					{reason === 'expired' ? 'Subscription expired' : 'Workspace inactive'}
				</h1>
				<p className="mt-3 text-sm text-muted-foreground">
					Access to <strong>{tenant?.companyName ?? 'this workspace'}</strong> is currently disabled.
					Contact <a href="mailto:support@warehouse.app" className="underline">support@warehouse.app</a> to renew.
				</p>
				<button onClick={handleLogout}
					className="mt-6 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold uppercase tracking-[0.25em] text-primary-foreground hover:bg-primary/90">
					Sign out
				</button>
			</div>
		</div>
	);
};

export default WorkspaceLockedWall;
