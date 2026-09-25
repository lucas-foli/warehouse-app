import { Modal } from '../ui/Modal';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  return (
    <Modal open={open} onClose={onCancel} size="sm" labelledById="confirm-title">
      <div className="p-6">
        <h3 id="confirm-title" className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              destructive
                ? 'rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700'
                : 'rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};
