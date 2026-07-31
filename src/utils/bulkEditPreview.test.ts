import { describe, it, expect } from 'vitest';
import { computeBulkEditPreview, formatBulkFieldValue } from './bulkEditPreview';
import type { Product } from '../types';

const p = (over: Partial<Product>): Product => ({
  id: over.id ?? 'x',
  name: 'n',
  sku: 's',
  status: 'A',
  location: 'L',
  qty: 0,
  ...over,
});

describe('computeBulkEditPreview', () => {
  it('price vazio apaga só os que tinham valor', () => {
    const r = computeBulkEditPreview('price', null, [
      p({ id: 'a', price: undefined }),
      p({ id: 'b', price: 25 }),
      p({ id: 'c', price: 30 }),
      p({ id: 'd', price: 30 }),
    ]);
    expect(r.changedCount).toBe(3);
    expect(r.destructiveCount).toBe(3);
    expect(r.unchangedCount).toBe(1);
    expect(r.groups.every((g) => (g.destructive ? g.to === null && g.changed : true))).toBe(true);
  });

  it('agrupa por transição e não conta sem-mudança como mudança', () => {
    const r = computeBulkEditPreview('price', 30, [
      p({ id: 'a', price: undefined }),
      p({ id: 'b', price: 25 }),
      p({ id: 'c', price: 30 }),
      p({ id: 'd', price: 30 }),
    ]);
    expect(r.groups).toHaveLength(3);
    expect(r.changedCount).toBe(2);
    expect(r.unchangedCount).toBe(2);
    expect(r.destructiveCount).toBe(0);
    expect(r.groups.find((g) => !g.changed)?.count).toBe(2);
  });

  it('is_active nunca é destrutivo e agrupa undefined à parte', () => {
    const r = computeBulkEditPreview('is_active', false, [
      p({ id: 'a', is_active: true }),
      p({ id: 'b', is_active: false }),
      p({ id: 'c', is_active: undefined }),
    ]);
    expect(r.destructiveCount).toBe(0);
    expect(r.changedCount).toBe(2);
    expect(r.groups).toHaveLength(3);
  });

  it('string: agrupa e nunca marca destrutivo', () => {
    const r = computeBulkEditPreview('status', 'B', [
      p({ id: 'a', status: 'A' }),
      p({ id: 'b', status: 'B' }),
    ]);
    expect(r.changedCount).toBe(1);
    expect(r.unchangedCount).toBe(1);
    expect(r.destructiveCount).toBe(0);
  });

  it('location agrupa por transição', () => {
    const r = computeBulkEditPreview('location', 'Loja 2', [
      p({ id: 'a', location: 'Loja 1' }),
      p({ id: 'b', location: 'Loja 2' }),
      p({ id: 'c', location: 'Loja 1' }),
    ]);
    expect(r.groups).toHaveLength(2);
    expect(r.changedCount).toBe(2);
    expect(r.unchangedCount).toBe(1);
  });

  it('seleção vazia → grupos vazios e contadores zero', () => {
    const r = computeBulkEditPreview('price', 30, []);
    expect(r.groups).toEqual([]);
    expect(r.changedCount).toBe(0);
    expect(r.unchangedCount).toBe(0);
    expect(r.destructiveCount).toBe(0);
  });

  it('ordena grupos alterados antes dos sem-mudança', () => {
    const r = computeBulkEditPreview('price', 30, [
      p({ id: 'a', price: 30 }),
      p({ id: 'b', price: 25 }),
    ]);
    expect(r.groups[0].changed).toBe(true);
    expect(r.groups[r.groups.length - 1].changed).toBe(false);
  });

  it('no apagar, destrutivos vêm antes do sem-mudança', () => {
    const r = computeBulkEditPreview('price', null, [
      p({ id: 'a', price: undefined }),
      p({ id: 'b', price: 25 }),
    ]);
    expect(r.groups[0].destructive).toBe(true);
    expect(r.groups[r.groups.length - 1].changed).toBe(false);
  });
});

describe('formatBulkFieldValue', () => {
  it('price', () => {
    expect(formatBulkFieldValue('price', null)).toBe('—');
    expect(formatBulkFieldValue('price', 30)).toBe('R$ 30');
  });
  it('min', () => {
    expect(formatBulkFieldValue('min', null)).toBe('—');
    expect(formatBulkFieldValue('min', 5)).toBe('5');
  });
  it('is_active', () => {
    expect(formatBulkFieldValue('is_active', true)).toBe('Ativo');
    expect(formatBulkFieldValue('is_active', false)).toBe('Inativo');
    expect(formatBulkFieldValue('is_active', undefined)).toBe('—');
  });
  it('status/location vazio vira —', () => {
    expect(formatBulkFieldValue('status', '')).toBe('—');
    expect(formatBulkFieldValue('location', 'Loja 1')).toBe('Loja 1');
  });
});
