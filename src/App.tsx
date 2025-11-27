import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';
import LoginForm from './components/LoginForm';
import { supabase } from './lib/supabaseClient';
import StatusUpdateForm from './StatusUpdateForm';

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
