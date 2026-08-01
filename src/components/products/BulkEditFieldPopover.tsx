// src/components/products/BulkEditFieldPopover.tsx
import { useEffect, useState } from 'react';
import type { Product } from '../../types';
import {
  computeBulkEditPreview,
  formatBulkFieldValue,
  type BulkEditPreview,
} from '../../utils/bulkEditPreview';

// O tipo mora no util (camada pura); re-exportado para não quebrar quem importa daqui.
export type { BulkEditableField } from '../../utils/bulkEditPreview';
import type { BulkEditableField } from '../../utils/bulkEditPreview';

type Props = {
  open: boolean;
  count: number;
  statusOptions: string[];
  locationOptions: string[];
  selectedProducts: Product[];
  onApply: (field: BulkEditableField, value: unknown) => void;
  onCancel: () => void;
};

export const BulkEditFieldPopover = ({
  open,
  count,
  statusOptions,
  locationOptions,
  selectedProducts,
  onApply,
  onCancel,
}: Props) => {
  const [field, setField] = useState<BulkEditableField>('status');
  const [value, setValue] = useState<string>('');
  const [boolValue, setBoolValue] = useState<boolean>(true);
  const [step, setStep] = useState<'edit' | 'preview'>('edit');
  const [pending, setPending] = useState<unknown>(null);
  const [preview, setPreview] = useState<BulkEditPreview | null>(null);

  // Reset the value when switching fields so dropdowns start on a valid option.
  useEffect(() => {
    if (field === 'status') setValue(statusOptions[0] ?? '');
    else if (field === 'location') setValue(locationOptions[0] ?? '');
    else setValue('');
  }, [field, statusOptions, locationOptions]);

  // Reabrir o popover sempre começa no passo de edição.
  useEffect(() => {
    if (open) setStep('edit');
  }, [open]);

  if (!open) return null;

  // Parse + validação na fronteira: entrada numérica inválida (NaN) não avança.
  const parseValue = (): { ok: true; value: unknown } | { ok: false } => {
    if (field === 'is_active') return { ok: true, value: boolValue };
    if (field === 'price') {
      if (value === '') return { ok: true, value: null };
      const n = Number(value);
      return Number.isNaN(n) ? { ok: false } : { ok: true, value: n };
    }
    if (field === 'min') {
      if (value === '') return { ok: true, value: null };
      const n = Number.parseInt(value, 10);
      return Number.isNaN(n) ? { ok: false } : { ok: true, value: n };
    }
    return { ok: true, value };
  };

  const parsed = parseValue();
  const canReview = parsed.ok;

  const goToPreview = () => {
    if (!parsed.ok) return;
    setPending(parsed.value);
    setPreview(computeBulkEditPreview(field, parsed.value, selectedProducts));
    setStep('preview');
  };

  const confirm = () => onApply(field, pending);

  const inputClass =
    'mt-1 w-full rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground';

  const renderValueControl = () => {
    if (field === 'is_active') {
      return (
        <select
          value={String(boolValue)}
          onChange={(e) => setBoolValue(e.target.value === 'true')}
          className={inputClass}
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      );
    }

    // Status and Location are constrained to the values already present in the
    // catalog, so editing them is a pick from a dropdown rather than free text.
    if (field === 'status' && statusOptions.length > 0) {
      return (
        <select value={value} onChange={(e) => setValue(e.target.value)} className={inputClass}>
          {statusOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }
    if (field === 'location' && locationOptions.length > 0) {
      return (
        <select value={value} onChange={(e) => setValue(e.target.value)} className={inputClass}>
          {locationOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        type={field === 'price' || field === 'min' ? 'number' : 'text'}
        className={inputClass}
      />
    );
  };

  const renderEdit = () => (
    <>
      <h3 className="text-lg font-semibold text-foreground">Edit field on {count} products</h3>

      <label className="mt-4 block text-sm font-medium text-foreground">Field</label>
      <select
        value={field}
        onChange={(e) => setField(e.target.value as BulkEditableField)}
        className={inputClass}
      >
        <option value="status">Onde</option>
        <option value="is_active">Active</option>
        <option value="location">Location</option>
        <option value="price">Price</option>
        <option value="min">Min stock</option>
      </select>

      <label className="mt-4 block text-sm font-medium text-foreground">Value</label>
      {renderValueControl()}

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={goToPreview}
          disabled={!canReview}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          Revisar
        </button>
      </div>
    </>
  );

  const renderPreview = () => {
    const data = preview;
    if (!data) return null;
    const hasDestructive = data.destructiveCount > 0;
    const nothingChanges = data.changedCount === 0;

    return (
      <>
        <h3 className="text-lg font-semibold text-foreground">Revisar alterações</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {count} produtos · campo {field}
        </p>

        {hasDestructive && (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">
            <span aria-hidden="true">⚠</span>
            <span>Vai apagar o valor de {data.destructiveCount} produtos</span>
          </div>
        )}

        <div className="mt-3 max-h-64 overflow-auto">
          {data.groups.map((g, i) => (
            <div
              key={i}
              className={`flex items-center justify-between border-t border-border py-2.5 text-sm text-foreground ${
                g.changed ? '' : 'opacity-50'
              }`}
            >
              <span>
                {formatBulkFieldValue(field, g.from)}{' '}
                <span className={g.destructive ? 'text-red-600' : 'text-muted-foreground'}>→</span>{' '}
                <span className={`font-medium ${g.destructive ? 'text-red-600' : ''}`}>
                  {formatBulkFieldValue(field, g.to)}
                </span>
                {!g.changed && <span className="text-xs"> · sem mudança</span>}
              </span>
              <span className="text-muted-foreground">{g.count} produtos</span>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
          <span className="text-xs text-muted-foreground">
            {data.changedCount} alterados · {data.unchangedCount} sem mudança
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep('edit')}
              className="rounded border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={nothingChanges}
              className={
                hasDestructive
                  ? 'rounded border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-500/20 disabled:opacity-40'
                  : 'rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40'
              }
            >
              Confirmar
            </button>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-xl">
        {step === 'edit' ? renderEdit() : renderPreview()}
      </div>
    </div>
  );
};
