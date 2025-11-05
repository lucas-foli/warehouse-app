import type { Session } from '@supabase/supabase-js';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { supabase } from './lib/supabaseClient';

// 🔧 Link de embed do dashboard Power BI publicado (autenticação via Power BI)
const LOOKER_EMBED_URL = import.meta.env.VITE_LOOKER_EMBED_URL ?? '';

type AuthMode = 'signin' | 'signup' | 'reset';

const LoginForm = ({ onSuccess }: { onSuccess: () => void }) => {
	const [mode, setMode] = useState<AuthMode>('signin');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [passwordConfirm, setPasswordConfirm] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [info, setInfo] = useState('');

	const translateAuthError = (message: string) => {
		const normalized = message.toLowerCase();
		if (normalized.includes('invalid login credentials')) return 'E-mail ou senha inválidos.';
		if (normalized.includes('email not confirmed')) return 'Confirme seu e-mail antes de continuar.';
		if (normalized.includes('user already registered')) return 'Este e-mail já possui cadastro.';
		if (normalized.match(/^email address (.+) is invalid$/i)) return 'E-mail inválido.';
		if (normalized.includes('password should contain'))
			return 'A senha precisa ter\n• mínimo de 6 caracteres \n• 1 letra maiúscula\n• 1 letra minúscula\n• 1 número\n• 1 caractere especial';
		if (normalized.includes('password')) return 'Revise a senha informada e tente novamente.';
		if (normalized.includes('rate limit')) return 'Muitas tentativas recentes. Aguarde um instante e tente novamente.';
		return message.replace(/\\n/g, '\n');
	};

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
		<div className="relative min-h-screen overflow-hidden bg-[#060606] text-white">
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.04),transparent_55%)]" />
				<div className="absolute -top-32 right-10 h-[420px] w-[420px] rounded-full bg-[#1d3bff]/20 blur-3xl" />
				<div className="absolute -bottom-40 left-0 h-[460px] w-[460px] rounded-full bg-[#00f6ff]/20 blur-3xl" />
			</div>

			<div className="relative mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-4 py-16 sm:px-6 lg:px-10">
				<motion.div
					initial={{ opacity: 0, y: 24 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, ease: 'easeOut' }}
					className="w-full max-w-lg rounded-3xl border border-white/10 bg-black/70 p-10 shadow-[0_35px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl">
					<div className="flex flex-col items-center gap-6 text-center">
						<img
							src="/stanley-seeklogo.png"
							alt="Stanley logo"
							className="h-16 w-auto object-contain brightness-0 invert"
						/>
						<div className="text-[11px] uppercase tracking-[0.4em] text-white/60">Stanley Portal</div>

						<div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 text-xs font-semibold uppercase tracking-[0.3em]">
							<button
								type="button"
								onClick={() => setMode('signin')}
								className={`rounded-full px-5 py-2 transition ${
									!isSignup
										? 'bg-white text-black shadow-[0_10px_30px_rgba(0,0,0,0.35)]'
										: 'text-white/60 hover:text-white'
								}`}>
								Entrar
							</button>
							<button
								type="button"
								onClick={() => setMode('signup')}
								className={`rounded-full px-5 py-2 transition ${
									isSignup
										? 'bg-white text-black shadow-[0_10px_30px_rgba(0,0,0,0.35)]'
										: 'text-white/60 hover:text-white'
								}`}>
								Criar conta
							</button>
						</div>
						<button
							type="button"
							onClick={() => setMode('reset')}
							className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50 transition hover:text-white/80">
							Esqueci minha senha
						</button>
					</div>

					<form onSubmit={handleSubmit} className="mt-10 space-y-5">
						<label className="block text-left text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">
							E-mail
							<input
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="voce@empresa.com"
								className="mt-2 w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
								autoComplete="email"
								required
							/>
						</label>

						{mode !== 'reset' && (
							<label className="block text-left text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">
								Senha
								<input
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder="••••••••"
									className="mt-2 w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
									autoComplete={isSignup ? 'new-password' : 'current-password'}
									required
									minLength={6}
								/>
							</label>
						)}

						{mode === 'signup' && (
							<label className="block text-left text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">
								Confirmar senha
								<input
									type="password"
									value={passwordConfirm}
									onChange={(e) => setPasswordConfirm(e.target.value)}
									placeholder="Confirme sua senha"
									className="mt-2 w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
									autoComplete="new-password"
									required
									minLength={6}
								/>
							</label>
						)}

						{error && !info && (
							<div className="whitespace-pre-line rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-red-200">
								{error}
							</div>
						)}
						{info && (
							<div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
								{info}
							</div>
						)}

						<button
							type="submit"
							className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-black transition hover:bg-white/90 disabled:opacity-60"
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
				</motion.div>
			</div>
		</div>
	);
};

const Dashboard = ({ onLogout }: { onLogout: () => void }) => {
	const src = useMemo(() => LOOKER_EMBED_URL, []);
	const [ready, setReady] = useState(false);

	return (
		<div className="flex min-h-screen flex-col bg-[#04050B] text-white">
			<header className="flex items-center justify-between border-b border-white/10 bg-[#05060F] px-6 py-4 sm:px-10">
				<div className="flex items-center gap-4">
					<img
						src="/stanley-seeklogo.png"
						alt="Stanley logo"
						className="h-9 w-auto object-contain brightness-0 invert"
					/>
					<div>
						<p className="text-xs uppercase tracking-[0.35em] text-white/50">Stanley Portal</p>
						<h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
					</div>
				</div>
				<button
					type="button"
					onClick={onLogout}
					className="inline-flex rounded-full border border-white/15 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60 transition hover:border-white/30 hover:text-white">
					Sair
				</button>
			</header>

			<main className="flex flex-1 items-stretch px-4 py-6 sm:px-10 lg:px-16">
				<div className="relative w-full overflow-hidden rounded-[32px] border border-white/10 bg-white/5 shadow-[0_35px_90px_rgba(0,0,0,0.55)] backdrop-blur-lg">
					{!ready && (
						<div className="absolute inset-0 grid place-items-center bg-[#04050B]/80">
							<div className="space-y-4 text-center">
								<div className="h-12 w-12 animate-spin rounded-full border-2 border-white/25 border-t-white" />
								<p className="text-sm font-medium text-white/70">Carregando relatório…</p>
							</div>
						</div>
					)}

					<iframe
						title="Stanley_ES"
						src={src}
						className={`h-[calc(100vh-8rem)] min-h-[70vh] w-full border-0 transition-opacity duration-500 ${
							ready ? 'opacity-100' : 'opacity-0'
						}`}
						frameBorder="0"
						loading="lazy"
						onLoad={() => setReady(true)}
						allowFullScreen
					/>
				</div>
			</main>
		</div>
	);
};

const App = () => {
	const [session, setSession] = useState<Session | null>(null);
	const [checkingSession, setCheckingSession] = useState(true);

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

	const handleLogout = async () => {
		await supabase.auth.signOut();
		setSession(null);
	};

	const handleSuccessAuth = async () => {
		const { data } = await supabase.auth.getSession();
		setSession(data.session ?? null);
	};

	if (checkingSession) return null;

	if (!session) return <LoginForm onSuccess={handleSuccessAuth} />;
	return <Dashboard onLogout={handleLogout} />;
};

export default App;
