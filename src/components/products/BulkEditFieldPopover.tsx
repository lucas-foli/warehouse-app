// src/components/products/BulkEditFieldPopover.tsx
import { useEffect, useState } from 'react';

export type BulkEditableField = 'status' | 'is_active' | 'location' | 'price' | 'min';

type Props = {
  open: boolean;
  count: number;
  statusOptions: string[];
  locationOptions: string[];
  onApply: (field: BulkEditableField, value: unknown) => void;
  onCancel: () => void;
};

export const BulkEditFieldPopover = ({
  open,
  count,
  statusOptions,
  locationOptions,
  onApply,
  onCancel,
}: Props) => {
  const [field, setField] = useState<BulkEditableField>('status');
  const [value, setValue] = useState<string>('');
  const [boolValue, setBoolValue] = useState<boolean>(true);

  // Reset the value when switching fields so dropdowns start on a valid option.
  useEffect(() => {
    if (field === 'status') setValue(statusOptions[0] ?? '');
    else if (field === 'location') setValue(locationOptions[0] ?? '');
    else setValue('');
  }, [field, statusOptions, locationOptions]);

  if (!open) return null;

  const submit = () => {
    if (field === 'is_active') return onApply(field, boolValue);
    if (field === 'price') return onApply(field, value === '' ? null : Number(value));
    if (field === 'min') return onApply(field, value === '' ? null : Number.parseInt(value, 10));
    return onApply(field, value);
  };

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">Edit field on {count} products</h3>

        <label className="mt-4 block text-sm font-medium text-foreground">Field</label>
        <select
          value={field}
          onChange={(e) => setField(e.target.value as BulkEditableField)}
          className={inputClass}
        >
          <option value="status">Status</option>
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
            onClick={submit}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
