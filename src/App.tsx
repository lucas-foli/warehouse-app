import type { Session } from '@supabase/supabase-js';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { BiListCheck } from 'react-icons/bi';
import { LuLogOut } from 'react-icons/lu';
import './App.css';
import StatusUpdateForm from './StatusUpdateForm';
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
		<div className="relative min-h-screen overflow-hidden bg-[#f9f9f7] text-[#121213]">
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(0,0,0,0.04),transparent_60%)]" />
				<div className="absolute -top-24 right-10 h-[320px] w-[320px] rounded-full bg-[#f0ece0] blur-3xl" />
				<div className="absolute -bottom-40 left-0 h-[360px] w-[360px] rounded-full bg-[#ebe7d9] blur-3xl" />
			</div>

			<div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-10">
			<motion.div
				initial={{ opacity: 0, y: 24 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.5, ease: 'easeOut' }}
				className="w-full max-w-xl rounded-[28px] border border-black/10 bg-white p-8 shadow-[0_30px_60px_rgba(0,0,0,0.08)]">
				<div className="flex flex-col items-center gap-6 text-center">
					<img src="/Stanley Brandmark Horizontal.avif" alt="Stanley" className="h-6 w-auto object-contain" />
					<div className="text-[11px] uppercase tracking-[0.35em] text-[#6f6f6f]">Stanley Portal</div>

					<div className="inline-flex rounded-full border border-black/10 bg-[#f3f3f1] p-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#2b2b2b]">
						<button
							type="button"
							onClick={() => setMode('signin')}
							className={`rounded-full px-5 py-2 transition ${
								!isSignup
									? 'bg-[#121213] text-white shadow-[0_10px_30px_rgba(0,0,0,0.2)]'
									: 'text-[#6f6f6f] hover:text-black'
							}`}>Entrar</button>
						<button
							type="button"
							onClick={() => setMode('signup')}
							className={`rounded-full px-5 py-2 transition ${
								isSignup
									? 'bg-[#121213] text-white shadow-[0_10px_30px_rgba(0,0,0,0.2)]'
									: 'text-[#6f6f6f] hover:text-black'
							}`}>Criar conta</button>
					</div>
					<button
						type="button"
						onClick={() => setMode('reset')}
						className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#6f6f6f] transition hover:text-black">
							Esqueci minha senha
						</button>
					</div>

					<form onSubmit={handleSubmit} className="mt-10 space-y-5">
					<label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f] sm:text-[11px] sm:tracking-[0.3em]">
						E-mail
						<input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="voce@empresa.com"
							className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#121213] outline-none transition focus:border-black/50 focus:ring-2 focus:ring-black/10"
							autoComplete="email"
							required
						/>
					</label>

					{mode !== 'reset' && (
						<label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f] sm:text-[11px] sm:tracking-[0.3em]">
							Senha
							<input
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="••••••••"
								className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#121213] outline-none transition focus:border-black/50 focus:ring-2 focus:ring-black/10"
								autoComplete={isSignup ? 'new-password' : 'current-password'}
								required
								minLength={6}
							/>
						</label>
					)}

					{mode === 'signup' && (
						<label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f] sm:text-[11px] sm:tracking-[0.3em]">
							Confirmar senha
							<input
								type="password"
									value={passwordConfirm}
									onChange={(e) => setPasswordConfirm(e.target.value)}
									placeholder="Confirme sua senha"
								className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#121213] outline-none transition focus:border-black/50 focus:ring-2 focus:ring-black/10"
									autoComplete="new-password"
									required
									minLength={6}
								/>
							</label>
						)}

					{error && !info && (
						<div className="whitespace-pre-line rounded-2xl border border-red-300/40 bg-red-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-red-600">
							{error}
						</div>
					)}
					{info && (
						<div className="rounded-2xl border border-black/10 bg-[#f6f6f2] px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-[#2b2b2b]">
							{info}
						</div>
					)}

					<button
						type="submit"
						className="w-full rounded-2xl bg-[#121213] px-4 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-black/90 disabled:opacity-60"
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

					<footer className="flex items-center justify-center border-t border-black/5 bg-white px-6 py-4 sm:px-10">
						<img src="/made-by-sark.jpeg" alt="Made by SARK" className="h-6 w-auto object-contain sm:h-8 scale-90" />
					</footer>
				</motion.div>
			</div>
		</div>
	);
};

const Dashboard = ({ onLogout, onOpenStatusForm }: { onLogout: () => void; onOpenStatusForm: () => void }) => {
	const src = useMemo(() => LOOKER_EMBED_URL, []);
	const [ready, setReady] = useState(false);

	return (
		<div className="flex min-h-screen flex-col bg-[#f9f9f7] text-[#121213]">
			<header className="border-b border-black/5 bg-white">
				<div className="flex w-full flex-col gap-4 px-4 py-5 sm:px-10 lg:px-16">
					<div className="flex w-full flex-wrap items-center gap-4">
						<div className="flex items-center gap-5">
							<img
								src="/Stanley Brandmark Horizontal.avif"
								alt="Stanley"
								className="h-6 w-auto object-contain sm:h-7"
							/>
							<p className="text-[11px] uppercase tracking-[0.35em] text-[#6f6f6f]">Stanley Portal</p>
						</div>
						<div className="ml-auto flex items-center gap-3 text-[#2b2b2b]">
							<img
								src="/easynumbers.png"
								alt="EasyNumbers"
								className="pointer-events-none h-8 w-auto sm:h-10 scale-[5.75] z-[-0.5] mr-2"
							/>
							<button
								type="button"
								onClick={onOpenStatusForm}
								className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/15 text-xl transition hover:border-black/40"
								title="Atualizar status"
								aria-label="Atualizar status">
								<BiListCheck />
							</button>
							<button
								type="button"
								onClick={onLogout}
								className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/15 text-xl text-[#6f6f6f] transition hover:border-black/40 hover:text-black"
								title="Sair"
								aria-label="Sair">
								<LuLogOut />
							</button>
						</div>
					</div>
				</div>
			</header>

			<main className="flex flex-1 items-stretch px-4 py-6 sm:px-10 lg:px-16">
				<div className="relative w-full overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-[0_35px_70px_rgba(0,0,0,0.08)]">
					{!ready && (
						<div className="absolute inset-0 grid place-items-center bg-white/70">
							<div className="space-y-4 text-center text-[#121213]">
								<div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-black/10 border-t-black" />
								<p className="text-sm font-medium">Carregando relatório…</p>
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

			<footer className="flex items-center justify-center border-t border-black/5 bg-white px-6 py-4 text-xs uppercase tracking-[0.3em] text-[#6f6f6f] sm:px-10">
				<img src="/made-by-sark.jpeg" alt="Made by SARK" className="h-6 w-auto object-contain sm:h-8" />
			</footer>
		</div>
	);
};

const App = () => {
	const [session, setSession] = useState<Session | null>(null);
	const [checkingSession, setCheckingSession] = useState(true);
	const [view, setView] = useState<'dashboard' | 'statusForm'>('dashboard');

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
		setView('dashboard');
	};

	const handleSuccessAuth = async () => {
		const { data } = await supabase.auth.getSession();
		setSession(data.session ?? null);
		setView('dashboard');
	};

	if (checkingSession) return null;

	if (!session) return <LoginForm onSuccess={handleSuccessAuth} />;

	if (view === 'statusForm') {
		return <StatusUpdateForm session={session} onBack={() => setView('dashboard')} />;
	}

	return <Dashboard onLogout={handleLogout} onOpenStatusForm={() => setView('statusForm')} />;
};

export default App;
