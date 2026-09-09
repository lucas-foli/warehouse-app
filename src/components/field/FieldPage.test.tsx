import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { Product } from '../../types';

// O painel busca 4 fontes a mais (fieldService + receiptService); as demais
// sub-views (Agenda/Funil/Fornecedores) e os modais dependem de outras
// funções do mesmo módulo mesmo sem abrir — por isso reexportamos o módulo
// real (importOriginal) e só sobrescrevemos o que este teste precisa
// controlar.
const fetchInteractionsInWindowMock = vi.fn();

vi.mock('../../services/fieldService', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../services/fieldService')>();
	return {
		...actual,
		fetchFieldContacts: vi.fn().mockResolvedValue([]),
		fetchOpenAgenda: vi.fn().mockResolvedValue([]),
		fetchContactCreatedAts: vi.fn().mockResolvedValue([]),
		fetchInteractionsInWindow: (...args: unknown[]) => fetchInteractionsInWindowMock(...args),
	};
});

vi.mock('../../services/receiptService', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../services/receiptService')>();
	return {
		...actual,
		fetchReceipts: vi.fn().mockResolvedValue([]),
		fetchReceiptItems: vi.fn().mockResolvedValue([]),
	};
});

const { default: FieldPage } = await import('./FieldPage');

const baseProps = {
	tenantId: 't1',
	products: [] as Product[],
	onReload: vi.fn(),
	locationFilter: 'all' as const,
	orders: [],
	salesItems: [],
};

describe('FieldPage — painel: falha de carga não trava em "Carregando…" para sempre', () => {
	it('mostra erro próprio do painel (não o "Carregando…" eterno) quando os fetches falham, e "Tentar de novo" refaz a carga', async () => {
		// mata: remover `setPanelError`/o estado de erro do painel (voltaria a
		// ficar preso em "Carregando…" para sempre) OU fazer "Tentar de novo"
		// chamar `reloadField` em vez de re-disparar os fetches do painel (o
		// clique limparia o erro sem nunca popular panelData de novo)
		fetchInteractionsInWindowMock.mockRejectedValueOnce(new Error('falha de rede'));

		render(
			<MemoryRouter>
				<FieldPage {...baseProps} />
			</MemoryRouter>,
		);

		// Espera a carga inicial (contatos/agenda) terminar e abre o Painel.
		const painelTab = await screen.findByRole('button', { name: 'Painel' });
		fireEvent.click(painelTab);

		// A falha do painel precisa terminar em erro visível, nunca em
		// "Carregando…" indefinido.
		const tryAgainButtons = await waitFor(() => {
			const buttons = screen.getAllByText('Tentar de novo');
			expect(buttons.length).toBeGreaterThan(0);
			return buttons;
		});
		expect(screen.getByText('Não foi possível carregar o painel.')).toBeInTheDocument();
		expect(screen.queryByText('Carregando…')).not.toBeInTheDocument();

		// O botão do painel (não o do erro geral de contatos/agenda, que aqui
		// não existe) refaz a carga: desta vez os fetches resolvem.
		fetchInteractionsInWindowMock.mockResolvedValueOnce([]);
		const panelRetryButton = tryAgainButtons[tryAgainButtons.length - 1];
		fireEvent.click(panelRetryButton);

		await waitFor(() => {
			expect(screen.getByText('Recebido x vendido por produto')).toBeInTheDocument();
		});
		expect(screen.queryByText('Não foi possível carregar o painel.')).not.toBeInTheDocument();
	});
});

describe('FieldPage — smoke', () => {
	it('abre a sub-view Painel e carrega normalmente quando os fetches funcionam', async () => {
		fetchInteractionsInWindowMock.mockResolvedValueOnce([]);
		render(
			<MemoryRouter>
				<FieldPage {...baseProps} />
			</MemoryRouter>,
		);
		const painelTab = await screen.findByRole('button', { name: 'Painel' });
		fireEvent.click(painelTab);
		await waitFor(() => {
			expect(within(document.body).getByText('Recebido x vendido por produto')).toBeInTheDocument();
		});
	});
});
