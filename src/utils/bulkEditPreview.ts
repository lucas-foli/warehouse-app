// src/utils/bulkEditPreview.ts
import type { Product } from '../types';

export type BulkEditableField = 'status' | 'is_active' | 'location' | 'price' | 'min';

export interface BulkEditGroup {
  from: unknown;
  to: unknown;
  count: number;
  changed: boolean;
  destructive: boolean;
}

export interface BulkEditPreview {
  groups: BulkEditGroup[];
  changedCount: number;
  unchangedCount: number;
  destructiveCount: number;
}

// price/min: undefined e null são a mesma coisa ("—"). Demais campos ficam como estão.
const normalize = (field: BulkEditableField, v: unknown): unknown => {
  if (field === 'price' || field === 'min') return v == null ? null : v;
  return v;
};

// Chave estável de agrupamento que distingue null, undefined e '' entre si.
// Sentinelas textuais (sem NUL) que nenhum valor real de typeof/String pode produzir.
const keyOf = (v: unknown): string => {
  if (v === null) return 'null-sentinel';
  if (v === undefined) return 'undef-sentinel';
  return `${typeof v}:${String(v)}`;
};

export function computeBulkEditPreview(
  field: BulkEditableField,
  newValue: unknown,
  selected: Product[],
): BulkEditPreview {
  const to = normalize(field, newValue);
  const toKey = keyOf(to);
  const isNumeric = field === 'price' || field === 'min';

  const map = new Map<string, { from: unknown; count: number }>();
  for (const item of selected) {
    const from = normalize(field, item[field]);
    const key = keyOf(from);
    const entry = map.get(key);
    if (entry) entry.count += 1;
    else map.set(key, { from, count: 1 });
  }

  const groups: BulkEditGroup[] = [];
  for (const { from, count } of map.values()) {
    const changed = keyOf(from) !== toKey;
    const destructive = isNumeric && to === null && changed;
    groups.push({ from, to, count, changed, destructive });
  }

  const rank = (g: BulkEditGroup): number => (g.destructive ? 0 : g.changed ? 1 : 2);
  groups.sort((a, b) => rank(a) - rank(b));

  const sumWhere = (pred: (g: BulkEditGroup) => boolean): number =>
    groups.filter(pred).reduce((s, g) => s + g.count, 0);

  return {
    groups,
    changedCount: sumWhere((g) => g.changed),
    unchangedCount: sumWhere((g) => !g.changed),
    destructiveCount: sumWhere((g) => g.destructive),
  };
}

export function formatBulkFieldValue(field: BulkEditableField, value: unknown): string {
  if (field === 'price') return value == null ? '—' : `R$ ${(value as number).toLocaleString('pt-BR')}`;
  if (field === 'min') return value == null ? '—' : String(value);
  if (field === 'is_active') return value == null ? '—' : value ? 'Ativo' : 'Inativo';
  return value == null || value === '' ? '—' : String(value);
}
