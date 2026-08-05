import { describe, it, expect } from 'vitest';
import { formatCurrency } from './currency';

describe('formatCurrency', () => {
  it('formata zero com centavos', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });
  it('formata valor com centavos', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
  });
  it('agrupa milhares com vírgula', () => {
    expect(formatCurrency(1000000)).toBe('$1,000,000.00');
  });
  it('formata estorno (negativo) com sinal', () => {
    expect(formatCurrency(-49.9)).toBe('-$49.90');
  });
  it('arredonda para 2 casas', () => {
    expect(formatCurrency(30)).toBe('$30.00');
  });
});
