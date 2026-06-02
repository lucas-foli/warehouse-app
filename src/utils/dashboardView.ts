export type DashboardPage = 'overview' | 'clientes' | 'vendedores' | 'vendas';
export type DashboardSurface = 'dashboard' | 'products';

export interface DashboardView {
	page: DashboardPage;
	surface: DashboardSurface;
}

// Single source of truth mapping a URL path to the dashboard view it renders.
// Keeping this URL-derived (rather than snapshotting it into component state)
// is what lets the browser back/forward buttons work: every navigation —
// whether from an in-app button or a history pop — recomputes the view here.
export const resolveDashboardView = (pathname: string): DashboardView => {
	switch (pathname) {
		case '/products':
			return { page: 'overview', surface: 'products' };
		case '/clients':
			return { page: 'clientes', surface: 'dashboard' };
		case '/sellers':
			return { page: 'vendedores', surface: 'dashboard' };
		case '/sales':
			return { page: 'vendas', surface: 'dashboard' };
		case '/':
		default:
			return { page: 'overview', surface: 'dashboard' };
	}
};
