import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PanelView from './PanelView';

const base = {
	period: '30d' as const,
	onPeriodChange: vi.fn(),
	locationLabel: 'Todos os locais',
	activity: { total: 64, byChannel: { visit: 18, call: 12, whatsapp: 30, email: 4 } },
	newContacts: 5,
	overdueFollowUps: 3,
	funnel: { rows: [{ stage: 'active' as const, label: 'Ativo', count: 2 }], total: 2 },
	samples: { totalQty: 42, cost: 380, skusTotal: 10, skusWithoutCost: 3, byContact: [] },
	rows: [],
	bySupplier: [],
	negatives: [],
};

describe('PanelView', () => {
	it('avisa quando há SKU sem custo conhecido', () => {
		// mata: exibir o valor estimado sem a cobertura — o sócio leria US$ 380
		// como o custo total das amostras, e não como um total parcial
		render(<PanelView {...base} />);
		expect(screen.getByText(/3 de 10 SKUs sem custo conhecido/i)).toBeInTheDocument();
	});

	it('omite o aviso de cobertura quando todo SKU tem custo', () => {
		// mata: deixar o aviso fixo na tela (viraria ruído que ninguém lê)
		render(<PanelView {...base} samples={{ ...base.samples, skusWithoutCost: 0 }} />);
		expect(screen.queryByText(/sem custo conhecido/i)).not.toBeInTheDocument();
	});

	it('diz que o filtro de loja só afeta as vendas', () => {
		// mata: remover o rótulo — os números globais passariam por números da loja
		render(<PanelView {...base} locationLabel="Miami" />);
		expect(screen.getByText(/afeta apenas as vendas/i)).toBeInTheDocument();
	});

	it('mostra o card de divergência só quando há saldo negativo', () => {
		// mata: esconder sempre (a divergência voltaria a ser invisível) ou
		// mostrar sempre (card vazio dizendo que está tudo certo vira ruído)
		const { rerender } = render(<PanelView {...base} />);
		expect(screen.queryByText(/saldo negativo/i)).not.toBeInTheDocument();
		rerender(<PanelView {...base} negatives={[{ sku: 'CAM-1620', name: 'Camarão 16/20', qty: -4 }]} />);
		expect(screen.getByText(/saldo negativo/i)).toBeInTheDocument();
	});

	it('rotula como "hoje" o que não respeita a janela', () => {
		// mata: rotular o funil com o período escolhido (Emenda 1 da spec: funil,
		// saldo e divergências são foto de agora, não da janela)
		render(<PanelView {...base} />);
		expect(screen.getByText(/Funil por estágio/i).closest('section')).toHaveTextContent(/hoje/i);
	});
});
