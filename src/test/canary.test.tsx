import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('infra jsdom + testing-library', () => {
	it('renderiza um componente e acha o texto', () => {
		render(<button type="button">clique</button>);
		expect(screen.getByRole('button', { name: 'clique' })).toBeInTheDocument();
	});
});
