import { describe, expect, it } from 'vitest';
import { buildClearWarning } from './importClearWarning';

describe('buildClearWarning', () => {
	it('plural + kind clients fala em cliente', () => {
		expect(buildClearWarning('clients', 12)).toBe(
			'Isso vai desvincular 12 vendas — elas ficarão sem cliente.',
		);
	});
	it('plural + kind sellers fala em vendedor', () => {
		expect(buildClearWarning('sellers', 3)).toBe(
			'Isso vai desvincular 3 vendas — elas ficarão sem vendedor.',
		);
	});
	it('singular usa "1 venda" e "ela ficará"', () => {
		expect(buildClearWarning('clients', 1)).toBe(
			'Isso vai desvincular 1 venda — ela ficará sem cliente.',
		);
	});
});
