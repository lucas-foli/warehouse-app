import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabaseClient';
import type { AuthMode } from '../types';
import { resolveMadeBySarkStorageUrl, resolveMadeBySarkUrl, resolveSarkLogoStorageUrl, translateAuthError } from '../utils/helpers';

const readSlugFromUrl = () => {
	if (typeof window === 'undefined') return '';
	const params = new URLSearchParams(window.location.search);
	return params.get('slug')?.trim() ?? '';
};

// The redirect must stay on the origin that initiated the flow: Supabase uses
// PKCE, and the code_verifier lives in localStorage which is per-origin. If we
// bounce the user to a different host (e.g. the apex instead of their tenant
// subdomain) the verifier is unavailable and the code exchange fails silently.
const resolveAuthRedirectBase = () => {
	if (typeof window === 'undefined') return '';
	return window.location.origin;
};

const resolveSlugForRedirect = () => {
	const fromQuery = readSlugFromUrl();
	if (fromQuery) return fromQuery.toLowerCase();

	const explicit = import.meta.env.VITE_TENANT_SLUG as string | undefined;
	if (explicit && explicit.trim()) return explicit.trim().toLowerCase();

	if (typeof window === 'undefined') return '';
	const hostname = window.location.hostname.toLowerCase();
	if (hostname === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
		return '';
	}

	const baseDomain = (import.meta.env.VITE_BASE_DOMAIN as string | undefined)?.trim().toLowerCase();
	if (baseDomain && hostname.endsWith(baseDomain)) {
		const remaining = hostname.slice(0, Math.max(0, hostname.length - baseDomain.length)).replace(/\.$/, '');
		const parts = remaining.split('.').filter(Boolean);
		return (parts[parts.length - 1] || '').toLowerCase();
	}

	const parts = hostname.split('.').filter(Boolean);
	if (parts.length >= 3) return parts[0];

	return '';
};

const resolveSignupHref = () => {
	const baseDomain = (import.meta.env.VITE_BASE_DOMAIN as string | undefined)?.trim();
	if (!baseDomain) return '/signup';
	return `https://${baseDomain}/signup`;
};

const LoginForm = ({ onSuccess }: { onSuccess: () => void }) => {
	const { companyName, logoUrl, uiPreset } = useTheme();
	const madeBySarkUrl = resolveMadeBySarkUrl();
	const madeByFallbackUrl = resolveMadeBySarkStorageUrl();
	const brandLogoFallback = resolveSarkLogoStorageUrl(uiPreset);
	const [brandLogoSrc, setBrandLogoSrc] = useState(logoUrl);
	const [madeBySrc, setMadeBySrc] = useState(madeBySarkUrl);
	const [mode, setMode] = useState<AuthMode>('signin');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [info, setInfo] = useState('');

	useEffect(() => {
		setBrandLogoSrc(logoUrl);
		setError('');
		setInfo('');
		setPassword('');
	}, [mode]);

	useEffect(() => {
		setBrandLogoSrc(logoUrl);
	}, [logoUrl]);

	useEffect(() => {
		setMadeBySrc(madeBySarkUrl);
	}, [madeBySarkUrl]);

	const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
		e.preventDefault();
		setError('');
		setLoading(true);

		const slugForRedirect = resolveSlugForRedirect();
		const redirectParams = new URLSearchParams();
		if (slugForRedirect) redirectParams.set('slug', slugForRedirect);
		const authRedirectBase = resolveAuthRedirectBase();
		const authRedirectTo = redirectParams.toString()
			? `${authRedirectBase}/?${redirectParams.toString()}`
			: `${authRedirectBase}/`;
		const validEmail = /.+@.+\..+/.test(email);
		const validPass = password.length >= 6;

		if (!validEmail) {
			setError('Informe um e-mail válido.');
			setLoading(false);
			return;
		}
		if (mode !== 'reset' && !validPass) {
			setError('A senha deve ter pelo menos 6 caracteres.');
			setLoading(false);
			return;
		}
		if (mode === 'reset') {
			const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
				redirectTo: authRedirectTo,
			});
			if (resetError) {
				setError(translateAuthError(resetError.message));
				setLoading(false);
				return;
			}
			setInfo('Enviamos um e-mail com instruções para logar no portal.');
			setLoading(false);
			return;
		}

		const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
		if (signInError) {
			setError(translateAuthError(signInError.message));
			setLoading(false);
			return;
		}

		onSuccess();
		setLoading(false);
	};

	const signupHref = resolveSignupHref();

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
					<div className="flex flex-col items-center gap-6 text-center">
						{brandLogoSrc ? (
							<img
								src={brandLogoSrc}
								alt={companyName}
								className="h-6 w-auto object-contain"
								onError={() => {
									if (brandLogoFallback && brandLogoSrc !== brandLogoFallback) {
										setBrandLogoSrc(brandLogoFallback);
									}
								}}
							/>
						) : (
							<div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
								{companyName.trim().slice(0, 1).toUpperCase()}
							</div>
						)}
						<div className="text-[11px] uppercase tracking-[0.35em] text-muted-foreground">{companyName} Portal</div>

						<button
							type="button"
							onClick={() => setMode(mode === 'reset' ? 'signin' : 'reset')}
							className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground transition hover:text-foreground">
							{mode === 'reset' ? 'Voltar para entrar' : 'Esqueci minha senha'}
						</button>
					</div>

					<form onSubmit={handleSubmit} className="mt-10 space-y-5">
						<label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground sm:text-[11px] sm:tracking-[0.3em]">
							E-mail
							<input
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="voce@empresa.com"
								className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
								autoComplete="email"
								required
							/>
						</label>

						{mode !== 'reset' && (
							<label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground sm:text-[11px] sm:tracking-[0.3em]">
								Senha
								<input
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder="••••••••"
									className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
									autoComplete="current-password"
									required
									minLength={6}
								/>
							</label>
						)}

						{error && !info && (
							<div className="whitespace-pre-line rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-red-600">
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
							{loading ? 'Processando…' : mode === 'reset' ? 'Enviar instruções' : 'Entrar'}
						</button>
					</form>

					<div className="mt-6 text-center text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
						Precisa de conta?{' '}
						<a href={signupHref} className="font-semibold text-foreground underline-offset-4 hover:underline">
							Solicitar acesso
						</a>
					</div>

					<footer className="flex items-center justify-center border-t border-border/20 bg-card px-6 py-4 sm:px-10">
						{madeBySrc ? (
							<img
								src={madeBySrc}
								alt="Made by SARK"
								className="h-6 w-auto object-contain sm:h-8 scale-[0.50]"
								onError={() => {
									if (madeByFallbackUrl && madeBySrc !== madeByFallbackUrl) {
										setMadeBySrc(madeByFallbackUrl);
									}
								}}
							/>
						) : (
							<span className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
								Made by SARK
							</span>
						)}
					</footer>
				</motion.div>
			</div>
		</div>
	);
};

export default LoginForm;
