import type { Session } from '@supabase/supabase-js';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type Workspace = {
	id: string;
	slug: string;
	companyName: string;
};

const SLUG_RE = /^[a-z0-9-]{1,32}$/;

type Props = {
	session: Session;
	onLogout: () => void | Promise<void>;
};

const WorkspacePicker = ({ session, onLogout }: Props) => {
	const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [opening, setOpening] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			const { data: memberRows, error: memberError } = await supabase
				.from('tenant_members')
				.select('tenant_id')
				.eq('user_id', session.user.id);
			if (cancelled) return;
			if (memberError) {
				setError('Não foi possível carregar suas empresas.');
				setWorkspaces([]);
				return;
			}
			const tenantIds = (memberRows ?? [])
				.map((row) => (row as { tenant_id: string }).tenant_id)
				.filter((id): id is string => Boolean(id));
			if (tenantIds.length === 0) {
				setWorkspaces([]);
				return;
			}
			const { data: tenantRows, error: tenantError } = await supabase
				.from('tenants')
				.select('id, slug, company_name')
				.in('id', tenantIds);
			if (cancelled) return;
			if (tenantError) {
				setError('Não foi possível carregar suas empresas.');
				setWorkspaces([]);
				return;
			}
			const list: Workspace[] = (tenantRows ?? [])
				.map((row) => {
					const raw = row as { id?: string; slug?: string; company_name?: string };
					const slug = (raw.slug ?? '').trim().toLowerCase();
					if (!raw.id || !SLUG_RE.test(slug)) return null;
					return { id: raw.id, slug, companyName: raw.company_name?.trim() || slug };
				})
				.filter((w): w is Workspace => w !== null)
				.sort((a, b) => a.companyName.localeCompare(b.companyName));
			setWorkspaces(list);
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, [session.user.id]);

	const handleOpen = (slug: string) => {
		const baseDomain = (import.meta.env.VITE_BASE_DOMAIN as string | undefined)?.trim().toLowerCase();
		if (!baseDomain) {
			setError('Configuração de domínio ausente. Avise um administrador.');
			return;
		}
		setOpening(slug);
		// Hand the session tokens to the tenant subdomain via the URL hash so
		// Supabase there can detectSessionInUrl. We do NOT signOut on apex:
		// upstream observed that signOut races the destination's hash read.
		const hashParams = new URLSearchParams();
		hashParams.set('access_token', session.access_token);
		hashParams.set('refresh_token', session.refresh_token);
		hashParams.set('token_type', session.token_type);
		hashParams.set('expires_in', String(session.expires_in));
		if (session.expires_at) hashParams.set('expires_at', String(session.expires_at));

		const target = `${window.location.protocol}//${slug}.${baseDomain}/#${hashParams.toString()}`;
		window.location.replace(target);
	};

	const userEmail = session.user.email ?? '';
	const isLoading = workspaces === null;

	return (
		<div className="relative min-h-screen overflow-hidden bg-background text-foreground">
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--foreground)/0.06),transparent_60%)]" />
				<div className="absolute -top-24 right-10 h-[320px] w-[320px] rounded-full bg-accent/15 blur-3xl" />
				<div className="absolute -bottom-40 left-0 h-[360px] w-[360px] rounded-full bg-muted/60 blur-3xl" />
			</div>

			<div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-10">
				<motion.div
					initial={{ opacity: 0, y: 24 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, ease: 'easeOut' }}
					className="w-full max-w-xl rounded-[var(--radius-card)] border border-border/40 bg-card p-8 shadow-[var(--shadow-card)]">
					<div className="flex flex-col items-center gap-3 text-center">
						<div className="text-[11px] uppercase tracking-[0.35em] text-muted-foreground">Selecionar empresa</div>
						<h1 className="text-xl font-semibold tracking-tight">Escolha sua empresa</h1>
						{userEmail && (
							<p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{userEmail}</p>
						)}
					</div>

					<div className="mt-8 space-y-3">
						{isLoading && (
							<div className="rounded-2xl border border-border/40 bg-muted px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
								Carregando empresas…
							</div>
						)}

						{!isLoading && workspaces && workspaces.length === 0 && (
							<div className="rounded-2xl border border-border/40 bg-muted px-4 py-4 text-left text-sm text-foreground">
								<p className="font-semibold">Sua conta ainda não está vinculada a nenhuma empresa.</p>
								<p className="mt-2 text-xs text-muted-foreground">
									Peça a um administrador para te convidar, ou abra o convite recebido por e-mail.
								</p>
							</div>
						)}

						{!isLoading &&
							workspaces &&
							workspaces.map((workspace) => (
								<button
									key={workspace.id}
									type="button"
									disabled={opening !== null}
									onClick={() => handleOpen(workspace.slug)}
									className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/40 bg-card px-4 py-3 text-left text-sm font-semibold text-foreground transition hover:border-ring/60 hover:bg-muted disabled:opacity-60">
									<span className="flex flex-col">
										<span>{workspace.companyName}</span>
										<span className="text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
											{workspace.slug}
										</span>
									</span>
									<span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
										{opening === workspace.slug ? 'Abrindo…' : 'Abrir →'}
									</span>
								</button>
							))}

						{error && (
							<div className="whitespace-pre-line rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-red-600">
								{error}
							</div>
						)}
					</div>

					<div className="mt-8 flex justify-center">
						<button
							type="button"
							onClick={() => void onLogout()}
							className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground transition hover:text-foreground">
							Sair
						</button>
					</div>
				</motion.div>
			</div>
		</div>
	);
};

export default WorkspacePicker;
