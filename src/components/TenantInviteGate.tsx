import { useState } from 'react';
import { useTenant } from '../context/TenantContext';
import { supabase } from '../lib/supabaseClient';

const INVITE_STORAGE_KEY = 'warehouse_invite_code';

const mapInviteError = (message: string) => {
	const normalized = message.toLowerCase();
	if (normalized.includes('slug_too_long')) return 'Este link esta invalido. Peça um novo convite.';
	if (normalized.includes('slug_required')) return 'Este link esta incompleto. Peça um novo convite.';
	if (normalized.includes('slug_taken')) return 'Este endereco ja esta em uso.';
	if (normalized.includes('invalid_invite')) return 'Convite invalido ou expirado.';
	if (normalized.includes('invite_slug_mismatch')) return 'Este convite nao corresponde a este link.';
	if (normalized.includes('invite_exhausted')) return 'Este convite ja foi utilizado.';
	if (normalized.includes('not_authenticated')) return 'Voce precisa estar logado.';
	return message;
};

const TenantInviteGate = ({ initialInviteCode }: { initialInviteCode?: string }) => {
	const { tenantSlug, refreshTenant } = useTenant();
	const [companyName, setCompanyName] = useState('');
	const [inviteCode, setInviteCode] = useState(initialInviteCode ?? '');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [info, setInfo] = useState('');

	const slugTooLong = tenantSlug.length > 32;

	const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
		event.preventDefault();
		setError('');
		setInfo('');

		if (slugTooLong) {
			setError('Este link esta invalido. Peça um novo convite.');
			return;
		}

		const trimmedInvite = inviteCode.trim();
		if (!trimmedInvite) {
			setError('Informe o codigo do convite.');
			return;
		}

		setLoading(true);
		const { error: rpcError } = await supabase.rpc('create_tenant_with_invite', {
			invite_code: trimmedInvite,
			slug: tenantSlug,
			company_name: companyName.trim(),
		});

		if (rpcError) {
			setError(mapInviteError(rpcError.message));
			setLoading(false);
			return;
		}

		setInfo('Empresa criada. Continue o onboarding.');
		await refreshTenant();
		if (typeof window !== 'undefined') {
			window.localStorage.removeItem(INVITE_STORAGE_KEY);
		}
		setLoading(false);
	};

	return (
		<div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
			<div className="w-full max-w-xl rounded-[var(--radius-card)] border border-border/40 bg-card p-8 shadow-[var(--shadow-card)]">
				<h1 className="text-xl font-semibold tracking-tight">Seja bem-vindo ao seu gestor</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Vamos preparar o seu portal. Informe o nome da sua empresa e o convite, caso não esteja preenchido.
				</p>

				<form onSubmit={handleSubmit} className="mt-6 space-y-4">
					<label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground sm:text-[11px] sm:tracking-[0.3em]">
						Nome da empresa
						<input
							type="text"
							value={companyName}
							onChange={(e) => setCompanyName(e.target.value)}
							placeholder="Ex: Maxpharma"
							className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
						/>
					</label>

					<label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground sm:text-[11px] sm:tracking-[0.3em]">
						Codigo do convite
						<input
							type="text"
							value={inviteCode}
							onChange={(e) => setInviteCode(e.target.value)}
							placeholder="Ex: ABCD-1234"
							className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
						/>
					</label>

					{error && (
						<div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-red-600">
							{error}
						</div>
					)}
					{info && (
						<div className="rounded-2xl border border-border/40 bg-muted px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-foreground">
							{info}
						</div>
					)}

					<button
						type="submit"
						className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
						disabled={loading}>
						{loading ? 'Criando...' : 'Comecar'}
					</button>
				</form>
			</div>
		</div>
	);
};

export default TenantInviteGate;
