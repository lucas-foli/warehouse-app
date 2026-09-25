import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog via Modal', () => {
	it('renderiza em dialog e fecha por Esc e por backdrop', () => {
		const onCancel = vi.fn();
		render(<ConfirmDialog open title="T" message="M" onConfirm={vi.fn()} onCancel={onCancel} />);

		expect(screen.getByRole('dialog')).toBeInTheDocument();
		fireEvent.keyDown(document, { key: 'Escape' });
		fireEvent.click(screen.getByTestId('modal-backdrop'));
		expect(onCancel).toHaveBeenCalled();
	});
});
