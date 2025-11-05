import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import './App.css';

// 🔧 Link de embed do dashboard Power BI publicado (autenticação via Power BI)
const EMBED_URL =
	'https://app.powerbi.com/reportEmbed?reportId=af602dae-86d8-4ab1-afb7-dba13cb281ee&autoAuth=true&ctid=6a0d4330-1fa7-4bd3-8736-ea1ce81b5a79';

// ⚠️ Exemplo didático: autenticação fake usando localStorage
const FAKE_AUTH_KEY = 'app_demo_token' as const;
const saveToken = (token: string) => localStorage.setItem(FAKE_AUTH_KEY, token);
const getToken = () => localStorage.getItem(FAKE_AUTH_KEY);
const clearToken = () => localStorage.removeItem(FAKE_AUTH_KEY);

type AuthMode = 'signin' | 'signup';

const LoginForm = ({ onSuccess }: { onSuccess: (t: string) => void }) => {
	const [mode, setMode] = useState<AuthMode>('signin');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [passwordConfirm, setPasswordConfirm] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		setError('');
		setPasswordConfirm('');
	}, [mode]);

	const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
		e.preventDefault();
		setError('');
		setLoading(true);

		const validEmail = /.+@.+\..+/.test(email);
		const validPass = password.length >= 6;

		await new Promise((r) => setTimeout(r, 500));

		if (!validEmail) {
			setError('Informe um e-mail válido.');
			setLoading(false);
			return;
		}
		if (!validPass) {
			setError('A senha deve ter pelo menos 6 caracteres.');
			setLoading(false);
			return;
		}
		if (mode === 'signup' && password !== passwordConfirm) {
			setError('As senhas precisam coincidir.');
			setLoading(false);
			return;
		}

		const fakeJwt = btoa(JSON.stringify({ sub: email, mode, iat: Date.now() }));
		saveToken(fakeJwt);
		onSuccess(fakeJwt);
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
						<img src="/stanley-seeklogo.png" alt="Stanley logo" className="h-16 w-auto object-contain brightness-0 invert" />
						<div className="text-[11px] uppercase tracking-[0.4em] text-white/60">Stanley Portal</div>

						<div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 text-xs font-semibold uppercase tracking-[0.3em]">
							<button
								type="button"
								onClick={() => setMode('signin')}
								className={`rounded-full px-5 py-2 transition ${
									!isSignup ? 'bg-white text-black shadow-[0_10px_30px_rgba(0,0,0,0.35)]' : 'text-white/60 hover:text-white'
								}`}>
								Entrar
							</button>
							<button
								type="button"
								onClick={() => setMode('signup')}
								className={`rounded-full px-5 py-2 transition ${
									isSignup ? 'bg-white text-black shadow-[0_10px_30px_rgba(0,0,0,0.35)]' : 'text-white/60 hover:text-white'
								}`}>
								Criar conta
							</button>
						</div>
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

						{isSignup && (
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

						{error && (
							<div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-red-200">
								{error}
							</div>
						)}

						<button
							type="submit"
							className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-black transition hover:bg-white/90 disabled:opacity-60"
							disabled={loading}>
							{loading ? 'Processando…' : isSignup ? 'Criar acesso' : 'Entrar'}
						</button>
					</form>
				</motion.div>
			</div>
		</div>
	);
};

const Dashboard = ({ onLogout }: { onLogout: () => void }) => {
	const src = useMemo(() => EMBED_URL, []);
	const [ready, setReady] = useState(false);

	return (
		<div className="flex min-h-screen flex-col bg-[#04050B] text-white">
			<header className="flex items-center justify-between border-b border-white/10 bg-[#05060F] px-6 py-4 sm:px-10">
				<div className="flex items-center gap-4">
					<img src="/stanley-seeklogo.png" alt="Stanley logo" className="h-9 w-auto object-contain brightness-0 invert" />
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
						className={`h-[calc(100vh-8rem)] min-h-[70vh] w-full border-0 transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`}
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
	const [token, setToken] = useState<string | null>(null);

	useEffect(() => {
		setToken(getToken());
	}, []);

	const handleLogout = () => {
		clearToken();
		setToken(null);
	};

	if (!token) return <LoginForm onSuccess={(t) => setToken(t)} />;
	return <Dashboard onLogout={handleLogout} />;
};

export default App;
