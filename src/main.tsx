import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { TenantProvider } from './context/TenantContext';
import { ThemeProvider } from './context/ThemeContext';
import { PlatformAdminProvider } from './context/PlatformAdminContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<BrowserRouter>
			<TenantProvider>
				<ThemeProvider>
					<PlatformAdminProvider>
						<App />
					</PlatformAdminProvider>
				</ThemeProvider>
			</TenantProvider>
		</BrowserRouter>
	</React.StrictMode>,
);
