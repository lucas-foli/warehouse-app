import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { TenantProvider } from './context/TenantContext';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<BrowserRouter>
			<TenantProvider>
				<ThemeProvider>
					<App />
				</ThemeProvider>
			</TenantProvider>
		</BrowserRouter>
	</React.StrictMode>,
);
