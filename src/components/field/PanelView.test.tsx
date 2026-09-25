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
		// mata também: mostrar "custo desconhecido" quando não há amostra (vazio
		// não é desconhecido — não há custo nenhum a estimar)
		expect(screen.queryByText('custo desconhecido')).not.toBeInTheDocument();
	});

	it('marca o valor estimado do KPI de amostras como parcial quando a cobertura é parcial', () => {
		// mata: omitir o valor sempre que `skusWithoutCost > 0` — com algum custo
		// conhecido, o valor existe e deve aparecer, marcado como parcial
		render(<PanelView {...base} samples={{ totalQty: 5, cost: 10, skusTotal: 2, skusWithoutCost: 1, byContact: [] }} />);
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
					byContact: [{ key: 'client:c1', name: 'Popeye Seafood', qty: 5, cost: 10, partial: true, costKnown: true }],
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
				bySupplier={[{ supplierId: 's1', name: 'Noronha Pescados', qty: 140, cost: 200, partial: true, costKnown: true }]}
			/>,
		);
		expect(screen.getByText(/Noronha Pescados/).closest('div')).toHaveTextContent(/\(parcial\)/);
	});

	it('mostra a frase de vazio em "Recebido x vendido" quando não há linha', () => {
		// mata: renderizar a tabela vazia (só o cabeçalho) em vez da frase — o
		// filtro de movimento mora em buildReceivedVsSold, então "sem movimento"
		// chega aqui como lista vazia
		render(<PanelView {...base} rows={[]} />);
		expect(screen.getByText(/Nenhum recebimento nem venda no período/i)).toBeInTheDocument();
		expect(screen.queryByText('Produto')).not.toBeInTheDocument();
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

	it('diz "custo desconhecido" no KPI quando nenhum SKU de amostra tem custo', () => {
		// mata: o comportamento do BUG-21 — "~US$ 0,00 (est., parcial)" dava a um
		// desconhecido a aparência de um fato medido
		render(<PanelView {...base} samples={{ totalQty: 22, cost: 0, skusTotal: 4, skusWithoutCost: 4, byContact: [] }} />);
		expect(screen.getByText('custo desconhecido')).toBeInTheDocument();
		expect(screen.getByText('custo desconhecido').closest('div')).not.toHaveTextContent(/US\$/);
	});

	it('mostra só a quantidade na linha de contato sem custo conhecido', () => {
		// mata: mostrar o valor sempre que a linha existe ("6 un · US$ 0,00 (parcial)")
		render(
			<PanelView
				{...base}
				samples={{
					totalQty: 6,
					cost: 0,
					skusTotal: 1,
					skusWithoutCost: 1,
					byContact: [{ key: 'client:c1', name: 'Popeye Seafood', qty: 6, cost: 0, partial: true, costKnown: false }],
				}}
			/>,
		);
		const line = screen.getByText('Popeye Seafood').closest('div');
		expect(line).toHaveTextContent('6 un');
		expect(line).not.toHaveTextContent(/US\$/);
	});

	it('mostra US$ 0,00 no fornecedor quando o custo conhecido é zero', () => {
		// mata: manter o critério antigo da tela, `cost !== 0`, que escondia um
		// custo zero registrado como se fosse desconhecido; e marcar "(parcial)"
		// numa linha sem custo desconhecido
		render(
			<PanelView
				{...base}
				bySupplier={[{ supplierId: 's1', name: 'Noronha Pescados', qty: 10, cost: 0, partial: false, costKnown: true }]}
			/>,
		);
		expect(screen.getByText('Noronha Pescados').closest('div')).toHaveTextContent(/US\$\s0,00/);
		expect(screen.getByText('Noronha Pescados').closest('div')).not.toHaveTextContent(/parcial/);
	});

	it('mostra só a quantidade no fornecedor sem custo conhecido', () => {
		// mata: exibir "US$ 0,00" para fornecedor cujas linhas não têm custo
		render(
			<PanelView
				{...base}
				bySupplier={[{ supplierId: 's1', name: 'Noronha Pescados', qty: 40, cost: 0, partial: true, costKnown: false }]}
			/>,
		);
		const line = screen.getByText('Noronha Pescados').closest('div');
		expect(line).toHaveTextContent('40 un');
		expect(line).not.toHaveTextContent(/US\$/);
	});

	it('mostra US$ 0,00 na linha de contato quando o custo conhecido é zero', () => {
		// mata: decidir a linha por `row.cost !== 0` em vez de `row.costKnown` —
		// o critério antigo do fornecedor, que esconde um custo zero registrado;
		// e marcar "(parcial)" numa linha sem SKU desconhecido
		render(
			<PanelView
				{...base}
				samples={{
					totalQty: 2,
					cost: 0,
					skusTotal: 1,
					skusWithoutCost: 0,
					byContact: [{ key: 'client:c1', name: 'Popeye Seafood', qty: 2, cost: 0, partial: false, costKnown: true }],
				}}
			/>,
		);
		const line = screen.getByText('Popeye Seafood').closest('div');
		expect(line).toHaveTextContent(/US\$\s0,00/);
		expect(line).not.toHaveTextContent(/parcial/);
	});

	it('mostra ~US$ 0,00 (est.) no KPI quando todo SKU tem custo conhecido zero', () => {
		// mata: decidir o KPI por `samples.cost === 0` em vez da cobertura (um
		// custo zero registrado viraria "custo desconhecido"); e marcar
		// "parcial" com cobertura total
		render(<PanelView {...base} samples={{ totalQty: 2, cost: 0, skusTotal: 1, skusWithoutCost: 0, byContact: [] }} />);
		expect(screen.getByText(/~US\$\s0,00 \(est\.\)/)).toBeInTheDocument();
		expect(screen.queryByText('custo desconhecido')).not.toBeInTheDocument();
		expect(screen.queryByText(/parcial/)).not.toBeInTheDocument();
	});
});
