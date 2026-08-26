import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const sizeClass: Record<ModalSize, string> = {
	sm: 'sm:max-w-md',
	md: 'sm:max-w-lg',
	lg: 'sm:max-w-2xl',
	xl: 'sm:max-w-3xl',
};

type ModalProps = {
	open: boolean;
	onClose: () => void;
	labelledById?: string;
	size?: ModalSize;
	mobileSheet?: boolean;
	children: ReactNode;
};

const FOCUSABLE =
	'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Modal = ({
	open,
	onClose,
	labelledById,
	size = 'md',
	mobileSheet = false,
	children,
}: ModalProps) => {
	const panelRef = useRef<HTMLDivElement>(null);
	const previouslyFocused = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (!open) return;

		previouslyFocused.current = (document.activeElement as HTMLElement | null) ?? null;
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		const panel = panelRef.current;
		const focusables = () => (panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)) : []);
		(focusables()[0] ?? panel)?.focus();

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onClose();
				return;
			}
			if (e.key === 'Tab' && panel) {
				const items = focusables();
				if (!items.length) {
					e.preventDefault();
					panel.focus();
					return;
				}
				const first = items[0];
				const last = items[items.length - 1];
				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault();
					last.focus();
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		};

		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('keydown', onKeyDown);
			document.body.style.overflow = prevOverflow;
			previouslyFocused.current?.focus?.();
		};
	}, [open, onClose]);

	if (!open) return null;

	const panelClass = mobileSheet
		? `absolute inset-x-0 bottom-0 flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-card shadow-xl sm:static sm:w-full ${sizeClass[size]} sm:max-h-[90vh] sm:rounded-[var(--radius-card)]`
		: `w-full ${sizeClass[size]} max-h-[90vh] overflow-y-auto rounded-[var(--radius-card)] bg-card shadow-xl`;

	return createPortal(
		<div
			data-testid="modal-backdrop"
			className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
			onClick={onClose}>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={labelledById}
				tabIndex={-1}
				className={panelClass}
				onClick={(e) => e.stopPropagation()}>
				{mobileSheet && (
					<div className="flex flex-shrink-0 justify-center py-3 sm:hidden">
						<div className="h-1 w-10 rounded-full bg-border" />
					</div>
				)}
				{children}
			</div>
		</div>,
		document.body,
	);
};
