// src/services/productOptions.ts
import { supabase } from '../lib/supabaseClient';

export type ProductOptionKind = 'onde' | 'local';

export interface ProductOption {
  id: string;
  tenant_id: string;
  kind: ProductOptionKind;
  value: string;
  sort_order: number;
}

/**
 * Normalize a user-entered option value: trim, collapse internal whitespace,
 * uppercase. Uppercasing keeps the case-sensitive DB unique index from letting
 * "Estoque" and "ESTOQUE" coexist. Returns '' for blank input (caller rejects).
 */
export function normalizeOptionValue(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

export async function listProductOptions(
  tenantId: string,
  kind: ProductOptionKind,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('tenant_product_options')
    .select('value, sort_order')
    .eq('tenant_id', tenantId)
    .eq('kind', kind)
    .order('sort_order', { ascending: true })
    .order('value', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => row.value as string);
}

export async function listProductOptionRows(
  tenantId: string,
  kind: ProductOptionKind,
): Promise<ProductOption[]> {
  const { data, error } = await supabase
    .from('tenant_product_options')
    .select('id, tenant_id, kind, value, sort_order')
    .eq('tenant_id', tenantId)
    .eq('kind', kind)
    .order('sort_order', { ascending: true })
    .order('value', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProductOption[];
}

export async function addProductOption(
  tenantId: string,
  kind: ProductOptionKind,
  rawValue: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const value = normalizeOptionValue(rawValue);
  if (!value) return { ok: false, error: 'Informe um valor.' };
  const { error } = await supabase
    .from('tenant_product_options')
    .insert({ tenant_id: tenantId, kind, value });
  if (error) {
    if (error.code === '23505') return { ok: false, error: `"${value}" já existe.` };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removeProductOption(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from('tenant_product_options')
    .delete()
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
