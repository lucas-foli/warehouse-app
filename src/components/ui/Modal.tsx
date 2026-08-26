import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const sizeClass: Record<ModalSize, string> = {
	sm: 'max-w-md',
	md: 'max-w-lg',
	lg: 'max-w-2xl',
	xl: 'max-w-3xl',
};

type ModalProps = {
	open: boolean;
	onClose: () => void;
	labelledById?: string;
	size?: ModalSize;
	children: ReactNode;
};

const FOCUSABLE =
	'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Modal = ({
	open,
	onClose,
	labelledById,
	size = 'md',
	children,
}: ModalProps) => {
	const panelRef = useRef<HTMLDivElement>(null);
	const previouslyFocused = useRef<HTMLElement | null>(null);
	const onCloseRef = useRef(onClose);
	useEffect(() => {
		onCloseRef.current = onClose;
	});

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
				onCloseRef.current();
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
	}, [open]);

	if (!open) return null;

	return createPortal(
		<div
			data-testid="modal-backdrop"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
			onClick={onClose}>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={labelledById}
				tabIndex={-1}
				className={`flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-[var(--radius-card)] bg-card shadow-xl ${sizeClass[size]}`}
				onClick={(e) => e.stopPropagation()}>
				{children}
			</div>
		</div>,
		document.body,
	);
};
