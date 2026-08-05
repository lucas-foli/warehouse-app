import { describe, it, expect } from 'vitest';
import { countNewClientsThisMonth } from './newClientsThisMonth';
import type { Client } from '../types';

const client = (created_at?: string): Client => ({
  id: '1', nome: 'X', cidade: '—', ultimaCompra: '', created_at,
});

describe('countNewClientsThisMonth', () => {
  const ref = new Date('2026-08-15T12:00:00Z');
  it('retorna 0 quando ninguém foi criado no mês', () => {
    expect(countNewClientsThisMonth([client('2026-07-31T23:00:00Z')], ref)).toBe(0);
  });
  it('conta clientes criados no mês/ano de referência', () => {
    const clients = [client('2026-08-01T00:00:00Z'), client('2026-08-20T00:00:00Z'), client('2026-07-01T00:00:00Z')];
    expect(countNewClientsThisMonth(clients, ref)).toBe(2);
  });
  it('ignora clientes sem created_at', () => {
    expect(countNewClientsThisMonth([client(undefined), client('2026-08-05T00:00:00Z')], ref)).toBe(1);
  });
});
