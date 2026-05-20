// src/components/products/BulkResultDialog.tsx
import type { BulkResult } from '../../utils/bulk';

type Props = {
  open: boolean;
  result: BulkResult | null;
  action: 'updated' | 'deleted';
  onClose: () => void;
};

export const BulkResultDialog = ({ open, result, action, onClose }: Props) => {
  if (!open || !result) return null;
  const total = result.succeeded + result.failed.length;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg bg-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">{action === 'updated' ? 'Update' : 'Delete'} complete</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {result.succeeded} of {total} products {action}.
          {result.failed.length > 0 && ` ${result.failed.length} failed.`}
        </p>
        {result.failed.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-foreground">Show failures</summary>
            <ul className="mt-2 max-h-48 overflow-auto rounded border border-border bg-muted/30 p-2 text-xs text-foreground">
              {result.failed.map((f) => (
                <li key={f.id} className="py-0.5">
                  <span className="font-mono">{f.id}</span>: {f.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
