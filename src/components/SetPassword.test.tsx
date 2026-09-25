import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabaseClient', () => ({
	supabase: { auth: { updateUser: vi.fn() } },
}));

const { default: SetPassword } = await import('./SetPassword');

describe('SetPassword', () => {
	it.each([
		['convite', '/set-password?invite_token=abc'],
		['recuperação', '/set-password'],
	])('usa texto neutro no fluxo de %s', (_flow, url) => {
		// mata: o texto antigo, "concluir a recuperação", que o convidado lia
		// numa conta que nunca teve senha (BUG-9). O convite sem invite_token
		// chega em /set-password igual à recuperação, então o texto tem de
		// servir aos dois.
		render(
			<MemoryRouter initialEntries={[url]}>
				<SetPassword />
			</MemoryRouter>,
		);
		expect(screen.getByRole('heading', { name: 'Definir senha' })).toBeInTheDocument();
		expect(screen.getByText('Defina sua senha para acessar sua conta.')).toBeInTheDocument();
		expect(screen.queryByText(/recuperação/i)).not.toBeInTheDocument();
	});
});
