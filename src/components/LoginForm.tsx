import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabaseClient';
import type { AuthMode } from '../types';
import { translateAuthError } from '../utils/helpers';

const LoginForm = ({ onSuccess }: { onSuccess: () => void }) => {
	const { companyName, logoUrl } = useTheme();
	const [mode, setMode] = useState<AuthMode>('signin');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [passwordConfirm, setPasswordConfirm] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [info, setInfo] = useState('');

	useEffect(() => {
		setError('');
		setInfo('');
		setPasswordConfirm('');
		setPassword('');
	}, [mode]);

	const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
		e.preventDefault();
		setError('');
		setLoading(true);

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
		if (mode === 'signup' && password !== passwordConfirm) {
			setError('As senhas precisam coincidir.');
			setLoading(false);
			return;
		}

		if (mode === 'reset') {
			const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
				redirectTo: `${window.location.origin}/auth/callback`,
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

		if (mode === 'signup') {
			const { error: signUpError, data } = await supabase.auth.signUp({ email, password });
			if (signUpError) {
				setInfo('');
				setError(translateAuthError(signUpError.message));
				setLoading(false);
				return;
			}

			const userAlreadyExists = data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;

			if (userAlreadyExists) {
				setMode('signin');
				setInfo('Este e-mail já está cadastrado. Utilize sua senha para entrar.');
				setError('');
				setLoading(false);
				return;
			}

			if (data.session) {
				onSuccess();
				setLoading(false);
				return;
			}

			setInfo(
				data.user?.email_confirmed_at ? 'Conta criada com sucesso.' : 'Verifique seu e-mail para confirmar o cadastro.',
			);
			setError('');
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

	const isSignup = mode === 'signup';

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
						{logoUrl ? (
							<img src={logoUrl} alt={companyName} className="h-6 w-auto object-contain" />
						) : (
							<div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
								{companyName.trim().slice(0, 1).toUpperCase()}
							</div>
						)}
						<div className="text-[11px] uppercase tracking-[0.35em] text-muted-foreground">{companyName} Portal</div>

						<div className="inline-flex rounded-full border border-border/40 bg-muted p-1 text-xs font-semibold uppercase tracking-[0.25em] text-foreground">
							<button
								type="button"
								onClick={() => setMode('signin')}
								className={`rounded-full px-5 py-2 transition ${
									!isSignup
										? 'bg-primary text-primary-foreground shadow-[0_10px_30px_hsl(var(--foreground)/0.18)]'
										: 'text-muted-foreground hover:text-foreground'
								}`}>
								Entrar
							</button>
							<button
								type="button"
								onClick={() => setMode('signup')}
								className={`rounded-full px-5 py-2 transition ${
									isSignup
										? 'bg-primary text-primary-foreground shadow-[0_10px_30px_hsl(var(--foreground)/0.18)]'
										: 'text-muted-foreground hover:text-foreground'
								}`}>
								Criar conta
							</button>
						</div>
						<button
							type="button"
							onClick={() => setMode('reset')}
							className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground transition hover:text-foreground">
							Esqueci minha senha
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
									autoComplete={isSignup ? 'new-password' : 'current-password'}
									required
									minLength={6}
								/>
							</label>
						)}

						{mode === 'signup' && (
							<label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground sm:text-[11px] sm:tracking-[0.3em]">
								Confirmar senha
								<input
									type="password"
									value={passwordConfirm}
									onChange={(e) => setPasswordConfirm(e.target.value)}
									placeholder="Confirme sua senha"
									className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
									autoComplete="new-password"
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
							{loading
								? 'Processando…'
								: mode === 'signup'
								? 'Criar acesso'
								: mode === 'reset'
								? 'Enviar instruções'
								: 'Entrar'}
						</button>
					</form>

					<footer className="flex items-center justify-center border-t border-border/20 bg-card px-6 py-4 sm:px-10">
						<img
							src="/made-by-sark.jpeg"
							alt="Made by SARK"
							className="h-6 w-auto object-contain sm:h-8 scale-[0.50]"
						/>
					</footer>
				</motion.div>
			</div>
		</div>
	);
};

export default LoginForm;
