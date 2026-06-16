// src/components/settings/ProductOptionsPage.tsx
//
// Tenant admin management of the per-tenant "Onde" (placement) and "Local"
// (store) value lists. Members can read these; only admins can add/remove
// (enforced by RLS on tenant_product_options).
import { useEffect, useState } from 'react';
import { useTenant } from '../../context/TenantContext';
import {
  addProductOption,
  listProductOptionRows,
  removeProductOption,
  type ProductOption,
  type ProductOptionKind,
} from '../../services/productOptions';

const LISTS: { kind: ProductOptionKind; title: string; hint: string }[] = [
  { kind: 'onde', title: 'Onde (local físico do produto)', hint: 'Ex.: ESTOQUE, GAVETA, VITRINE' },
  { kind: 'local', title: 'Local (loja)', hint: 'Ex.: LOJA PRINCIPAL, BRASÍLIA SHOPPING' },
];

const OptionList = ({ kind, title, hint }: { kind: ProductOptionKind; title: string; hint: string }) => {
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? '';
  const [rows, setRows] = useState<ProductOption[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!tenantId) return;
    try {
      setRows(await listProductOptionRows(tenantId, kind));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar.');
    }
  };

  useEffect(() => { void load(); }, [tenantId, kind]);

  const handleAdd = async () => {
    if (!tenantId || !draft.trim()) return;
    setBusy(true);
    setError('');
    const res = await addProductOption(tenantId, kind, draft);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setDraft('');
    void load();
  };

  const handleRemove = async (id: string) => {
    setBusy(true);
    setError('');
    const res = await removeProductOption(id);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    void load();
  };

  return (
    <section className="rounded-2xl border border-border/40 bg-card p-5">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>

      <div className="mt-4 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAdd(); } }}
          placeholder="Novo valor"
          className="flex-1 rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring/60"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={busy || !draft.trim()}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          Adicionar
        </button>
      </div>

      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}

      <ul className="mt-4 flex flex-wrap gap-2">
        {rows.length === 0 && <li className="text-xs text-muted-foreground">Nenhum valor ainda.</li>}
        {rows.map((row) => (
          <li key={row.id} className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-muted px-3 py-1 text-xs uppercase tracking-[0.15em]">
            {row.value}
            <button
              type="button"
              onClick={() => handleRemove(row.id)}
              disabled={busy}
              aria-label={`Remover ${row.value}`}
              className="text-muted-foreground hover:text-red-600">
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

const ProductOptionsPage = () => (
  <div className="space-y-6">
    {LISTS.map((l) => <OptionList key={l.kind} {...l} />)}
  </div>
);

export default ProductOptionsPage;
