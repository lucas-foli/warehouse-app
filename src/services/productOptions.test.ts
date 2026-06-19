// src/services/productOptions.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeOptionValue } from './productOptions';

describe('normalizeOptionValue', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeOptionValue('  vitrine ')).toBe('VITRINE');
  });
  it('uppercases so casing cannot create duplicates', () => {
    expect(normalizeOptionValue('Gaveta')).toBe('GAVETA');
  });
  it('collapses internal runs of whitespace', () => {
    expect(normalizeOptionValue('loja   centro')).toBe('LOJA CENTRO');
  });
  it('returns empty string for blank input', () => {
    expect(normalizeOptionValue('   ')).toBe('');
  });
});
