import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';

const open = (props = {}) =>
	render(
		<Modal open onClose={vi.fn()} {...props}>
			<h2 id="t">Título</h2>
			<button type="button">interno</button>
		</Modal>,
	);

describe('Modal', () => {
	it('não renderiza nada quando open=false', () => {
		render(
			<Modal open={false} onClose={vi.fn()}>
				<p>oi</p>
			</Modal>,
		);
		expect(screen.queryByText('oi')).not.toBeInTheDocument();
	});

	it('renderiza em portal, fora do container que o montou', () => {
		const { container } = open();
		// mata: voltar a renderizar inline (o conteúdo estaria dentro de container)
		expect(container).toBeEmptyDOMElement();
		expect(screen.getByRole('dialog')).toBeInTheDocument();
	});

	it('tem role=dialog + aria-modal, e aria-labelledby quando fornecido', () => {
		open({ labelledById: 't' });
		const dialog = screen.getByRole('dialog');
		// mata: remover a semântica de diálogo
		expect(dialog).toHaveAttribute('aria-modal', 'true');
		expect(dialog).toHaveAttribute('aria-labelledby', 't');
	});

	it('Esc chama onClose', () => {
		const onClose = vi.fn();
		open({ onClose });
		fireEvent.keyDown(document, { key: 'Escape' });
		// mata: remover o handler de Esc
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('clique no backdrop fecha; clique dentro do painel não', () => {
		const onClose = vi.fn();
		open({ onClose });
		fireEvent.click(screen.getByText('interno'));
		expect(onClose).not.toHaveBeenCalled(); // mata: fechar no clique interno
		fireEvent.click(screen.getByTestId('modal-backdrop'));
		expect(onClose).toHaveBeenCalledTimes(1); // mata: não fechar no backdrop
	});

	it('trava o scroll do body enquanto aberto e restaura ao desmontar', () => {
		const { unmount } = open();
		expect(document.body.style.overflow).toBe('hidden');
		unmount();
		// mata: não restaurar o overflow
		expect(document.body.style.overflow).toBe('');
	});

	it('restaura o foco ao elemento que abriu, ao desmontar', () => {
		const trigger = document.createElement('button');
		document.body.appendChild(trigger);
		trigger.focus();
		expect(document.activeElement).toBe(trigger);
		const { unmount } = open();
		// foco entrou no painel/conteúdo
		expect(trigger).not.toBe(document.activeElement);
		unmount();
		// mata: não restaurar o foco ao trigger
		expect(document.activeElement).toBe(trigger);
		trigger.remove();
	});

	it('Tab no último foca o primeiro; Shift+Tab no primeiro foca o último (focus trap)', () => {
		render(
			<Modal open onClose={vi.fn()}>
				<button type="button">primeiro</button>
				<button type="button">segundo</button>
			</Modal>,
		);
		const first = screen.getByText('primeiro');
		const last = screen.getByText('segundo');

		last.focus();
		expect(document.activeElement).toBe(last);
		fireEvent.keyDown(document, { key: 'Tab' });
		// mata: remover o bloco Tab / inverter first↔last
		expect(document.activeElement).toBe(first);

		first.focus();
		fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
		// mata: remover o bloco Tab / inverter first↔last
		expect(document.activeElement).toBe(last);
	});

	it('não rouba o foco do input quando o pai re-renderiza com onClose inline (não-memoizado)', () => {
		// Reproduz o wiring real do ProductFormModal: o estado do campo vive no pai,
		// que re-renderiza a cada tecla e passa um onClose inline (nova identidade a
		// cada render). Se o efeito do Modal depender de onClose, ele re-roda a cada
		// tecla, restaura o foco ao trigger e refoca o primeiro focável do painel —
		// roubando o foco do input e impedindo digitar mais de 1 caractere.
		// mata: voltar onClose para as deps do efeito principal ([open, onClose]).
		const Harness = () => {
			const [value, setValue] = useState('');
			return (
				<Modal open onClose={() => {}}>
					{/* Primeiro focável = botão "Fechar", como no ProductFormModal:
					    é para ele que o foco salta quando o efeito re-roda. */}
					<button type="button">Fechar</button>
					<input
						aria-label="nome"
						value={value}
						onChange={(e) => setValue(e.target.value)}
					/>
				</Modal>
			);
		};
		render(<Harness />);
		const input = screen.getByLabelText('nome') as HTMLInputElement;

		input.focus();
		expect(document.activeElement).toBe(input);

		fireEvent.change(input, { target: { value: 'a' } });
		fireEvent.change(input, { target: { value: 'ab' } });
		fireEvent.change(input, { target: { value: 'abc' } });

		expect(document.activeElement).toBe(input);
		expect(input.value).toBe('abc');
	});

	it('sem focáveis internos, Tab mantém o foco no painel e previne o comportamento padrão', () => {
		render(
			<Modal open onClose={vi.fn()}>
				<p>texto</p>
			</Modal>,
		);
		const dialog = screen.getByRole('dialog');
		expect(document.activeElement).toBe(dialog);

		// jsdom não move o foco nativamente em Tab, então a asserção
		// que realmente mata o ramo (`!items.length`) é sobre
		// defaultPrevented — não sobre document.activeElement sozinho.
		const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
		document.dispatchEvent(event);
		// mata: apagar o ramo !items.length
		expect(event.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(dialog);
	});

	it('toda modal é card centrado (sem bottom-sheet)', () => {
		open();
		const backdrop = screen.getByTestId('modal-backdrop');
		// mata: reintroduzir bottom-sheet (items-end) em qualquer modal
		expect(backdrop.className).toContain('items-center');
		expect(backdrop.className).not.toContain('items-end');
	});
});
