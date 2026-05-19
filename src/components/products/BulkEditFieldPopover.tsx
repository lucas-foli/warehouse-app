// src/components/products/BulkEditFieldPopover.tsx
import { useState } from 'react';

export type BulkEditableField = 'status' | 'is_active' | 'location' | 'price' | 'min';

type Props = {
  open: boolean;
  count: number;
  onApply: (field: BulkEditableField, value: unknown) => void;
  onCancel: () => void;
};

export const BulkEditFieldPopover = ({ open, count, onApply, onCancel }: Props) => {
  const [field, setField] = useState<BulkEditableField>('status');
  const [value, setValue] = useState<string>('');
  const [boolValue, setBoolValue] = useState<boolean>(true);
  if (!open) return null;

  const submit = () => {
    if (field === 'is_active') return onApply(field, boolValue);
    if (field === 'price') return onApply(field, value === '' ? null : Number(value));
    if (field === 'min') return onApply(field, value === '' ? null : Number.parseInt(value, 10));
    return onApply(field, value);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold">Edit field on {count} products</h3>

        <label className="mt-4 block text-sm font-medium">Field</label>
        <select
          value={field}
          onChange={(e) => setField(e.target.value as BulkEditableField)}
          className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm"
        >
          <option value="status">Status</option>
          <option value="is_active">Active</option>
          <option value="location">Location</option>
          <option value="price">Price</option>
          <option value="min">Min stock</option>
        </select>

        <label className="mt-4 block text-sm font-medium">Value</label>
        {field === 'is_active' ? (
          <select
            value={String(boolValue)}
            onChange={(e) => setBoolValue(e.target.value === 'true')}
            className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm"
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        ) : (
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            type={field === 'price' || field === 'min' ? 'number' : 'text'}
            className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm"
          />
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
