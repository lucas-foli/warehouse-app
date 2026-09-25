import { describe, expect, it } from 'vitest';
import { resolveDashboardView } from './dashboardView';

describe('resolveDashboardView', () => {
	it('maps "/" to the overview dashboard', () => {
		expect(resolveDashboardView('/')).toEqual({ page: 'overview', surface: 'dashboard' });
	});

	it('maps "/products" to the products surface (still under overview)', () => {
		expect(resolveDashboardView('/products')).toEqual({ page: 'overview', surface: 'products' });
	});

	it('maps "/clients" to the clientes page on the dashboard surface', () => {
		expect(resolveDashboardView('/clients')).toEqual({ page: 'clientes', surface: 'dashboard' });
	});

	it('maps "/sellers" to the vendedores page', () => {
		expect(resolveDashboardView('/sellers')).toEqual({ page: 'vendedores', surface: 'dashboard' });
	});

	it('maps "/sales" to the vendas page', () => {
		expect(resolveDashboardView('/sales')).toEqual({ page: 'vendas', surface: 'dashboard' });
	});

	it('falls back to the overview dashboard for any unknown path', () => {
		// The catch-all route redirects unknown paths to "/", but the resolver
		// must still return a valid view if asked about one directly.
		expect(resolveDashboardView('/anything-else')).toEqual({ page: 'overview', surface: 'dashboard' });
	});

	it('mapeia /field para a aba campo', () => {
		// mata: rota nova sem case no resolver (cairia no default overview)
		expect(resolveDashboardView('/field')).toEqual({ page: 'campo', surface: 'dashboard' });
	});

	it('mantém "/" e "/products" na mesma page, separados só pelo surface', () => {
		// mata: unificar as duas rotas (a aba Produtos ficaria ativa no Dashboard também)
		const home = resolveDashboardView('/');
		const products = resolveDashboardView('/products');
		expect(home.page).toBe(products.page);
		expect(home.surface).not.toBe(products.surface);
	});
});
