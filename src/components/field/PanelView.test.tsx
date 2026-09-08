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

	it('rotula como "hoje" o KPI de follow-ups vencidos', () => {
		// mata: remover o rótulo "hoje" do KPI — ele vem de
		// groupAgenda(agenda, new Date()) e não muda com a janela escolhida,
		// mas divide o grid com três KPIs que mudam (a Emenda 1 esqueceu este
		// quarto bloco "hoje")
		render(<PanelView {...base} />);
		expect(screen.getByText('Follow-ups vencidos · hoje')).toBeInTheDocument();
	});

	it('rotula como "hoje" o card de saldo negativo', () => {
		// mata: remover o rótulo "hoje" do card — divergências são foto de
		// agora (Emenda 1), como o funil e o saldo da tabela
		render(<PanelView {...base} negatives={[{ sku: 'CAM-1620', name: 'Camarão 16/20', qty: -4 }]} />);
		expect(screen.getByText(/^Saldo negativo/).closest('section')).toHaveTextContent(/hoje/i);
	});

	it('não mostra valor estimado de amostras quando não houve amostra nenhuma', () => {
		// mata: mostrar "~US$ 0,00 (est.)" com zero solto quando totalQty é 0 —
		// contra a regra "vazio não é zero" que a própria tela aplica em outros
		// blocos
		render(<PanelView {...base} samples={{ totalQty: 0, cost: 0, skusTotal: 0, skusWithoutCost: 0, byContact: [] }} />);
		expect(screen.queryByText(/\(est\./i)).not.toBeInTheDocument();
	});

	it('marca o valor estimado do KPI de amostras como parcial quando há SKU sem custo', () => {
		// mata: mostrar "US$ 0,00" (ou qualquer valor) com cara de fato fechado
		// quando há amostra mas nenhum/nem todo SKU tem custo conhecido
		render(<PanelView {...base} samples={{ totalQty: 5, cost: 0, skusTotal: 1, skusWithoutCost: 1, byContact: [] }} />);
		expect(screen.getByText(/\(est\., parcial\)/i)).toBeInTheDocument();
	});

	it('marca a linha por contato como parcial quando SampleContactRow.partial é true', () => {
		// mata: nunca renderizar `row.partial` — campo morto que a tela devia
		// usar (o contato apareceria com um custo com cara de total fechado)
		render(
			<PanelView
				{...base}
				samples={{
					totalQty: 5,
					cost: 10,
					skusTotal: 2,
					skusWithoutCost: 1,
					byContact: [{ key: 'client:c1', name: 'Popeye Seafood', qty: 5, cost: 10, partial: true }],
				}}
			/>,
		);
		expect(screen.getByText(/Popeye Seafood/).closest('div')).toHaveTextContent(/\(parcial\)/);
	});

	it('marca o total de "Recebido por fornecedor" como parcial quando SupplierReceivedRow.partial é true', () => {
		// mata: somar as linhas com custo e não declarar isso — o card exibiria
		// um total incompleto com cara de valor fechado
		render(
			<PanelView
				{...base}
				bySupplier={[{ supplierId: 's1', name: 'Noronha Pescados', qty: 140, cost: 200, partial: true }]}
			/>,
		);
		expect(screen.getByText(/Noronha Pescados/).closest('div')).toHaveTextContent(/\(parcial\)/);
	});

	it('mostra a frase de vazio em "Recebido x vendido" quando há produto mas nenhum movimento no período', () => {
		// mata: testar `rows.length === 0` (só verdade com catálogo vazio) — um
		// tenant com produtos e sem recebimento/venda no período veria a
		// tabela inteira zerada em vez desta frase
		render(
			<PanelView
				{...base}
				rows={[
					{
						sku: 'CAM-1620', name: 'Camarão 16/20', received: 0, sold: 0, balance: 200,
						supplierName: null, multipleSuppliers: false,
					},
				]}
			/>,
		);
		expect(screen.getByText(/Nenhum recebimento nem venda no período/i)).toBeInTheDocument();
	});

	it('mostra a tabela de "Recebido x vendido" quando há movimento no período', () => {
		// mata: manter a condição sempre verdadeira ao corrigi-la (a tabela
		// nunca apareceria mesmo com movimento real)
		render(
			<PanelView
				{...base}
				rows={[
					{
						sku: 'CAM-1620', name: 'Camarão 16/20', received: 500, sold: 0, balance: 200,
						supplierName: 'Noronha Pescados', multipleSuppliers: false,
					},
				]}
			/>,
		);
		expect(screen.queryByText(/Nenhum recebimento nem venda no período/i)).not.toBeInTheDocument();
		expect(screen.getByText('Camarão 16/20')).toBeInTheDocument();
	});
});
