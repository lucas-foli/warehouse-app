import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { translateAuthError } from '../utils/helpers';

const SetPassword = () => {
	const navigate = useNavigate();
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [info, setInfo] = useState('');

	const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
		e.preventDefault();
		setError('');
		setInfo('');

		if (password.length < 6) {
			setError('A senha precisa ter pelo menos 6 caracteres.');
			return;
		}
		if (password !== confirmPassword) {
			setError('As senhas precisam coincidir.');
			return;
		}

		setLoading(true);
		const { error: updateError } = await supabase.auth.updateUser({ password });
		setLoading(false);

		if (updateError) {
			setError(translateAuthError(updateError.message));
			return;
		}

		setInfo('Senha atualizada. Redirecionando...');
		navigate('/', { replace: true });
	};

	return (
		<div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
			<form
				onSubmit={handleSubmit}
				className="w-full max-w-md rounded-[var(--radius-card)] border border-border/40 bg-card p-8 shadow-[var(--shadow-card)] space-y-4">
				<div className="space-y-1">
					<h1 className="text-xl font-semibold tracking-tight">Definir nova senha</h1>
					<p className="text-sm text-muted-foreground">Escolha uma nova senha para concluir a recuperação.</p>
				</div>

				<label className="block text-sm">
					<span className="mb-1 block">Nova senha</span>
					<input
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						autoComplete="new-password"
						required
						minLength={6}
						className="w-full rounded-2xl border border-border/40 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
					/>
				</label>

				<label className="block text-sm">
					<span className="mb-1 block">Confirmar nova senha</span>
					<input
						type="password"
						value={confirmPassword}
						onChange={(e) => setConfirmPassword(e.target.value)}
						autoComplete="new-password"
						required
						minLength={6}
						className="w-full rounded-2xl border border-border/40 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
					/>
				</label>

				{error && <p className="text-sm text-destructive">{error}</p>}
				{info && <p className="text-sm text-muted-foreground">{info}</p>}

				<button
					type="submit"
					disabled={loading}
					className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold uppercase tracking-[0.25em] text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
					{loading ? 'Salvando...' : 'Salvar nova senha'}
				</button>
			</form>
		</div>
	);
};

export default SetPassword;
