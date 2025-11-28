import type { ReactNode } from 'react';

type WithChildren = {
	children: ReactNode;
};

const merge = (base: string, extra?: string) => (extra ? `${base} ${extra}` : base);

export const Section = ({ children, className }: WithChildren & { className?: string }) => (
	<section className={merge('mt-12', className)}>{children}</section>
);

type CardProps = WithChildren & {
	className?: string;
	/** Quando false, desabilita o efeito de hover/zoom */
	interactive?: boolean;
};

export const Card = ({ children, className, interactive = true }: CardProps) => {
	const base = 'rounded-[24px] bg-[#F5F5F7] p-8';
	const interactiveClasses =
		'transition-transform duration-200 ease-out hover:-translate-y-1 hover:scale-[1.01] hover:shadow-[0_24px_60px_rgba(0,0,0,0.12)]';

	return <div className={merge(`${base} ${interactive ? interactiveClasses : ''}`, className)}>{children}</div>;
};

export const Title = ({ children, className }: WithChildren & { className?: string }) => (
	<h2 className={merge('text-3xl font-semibold tracking-tight text-[#1A1A1A]', className)}>{children}</h2>
);

export const Metric = ({
	value,
	label,
	detail,
	prefix,
	suffix,
}: {
	value: string | number;
	label: string;
	detail?: string;
	prefix?: string;
	suffix?: string;
}) => (
	<div className="flex flex-col gap-2">
		<p className="text-4xl font-semibold tracking-tight text-[#1A1A1A] sm:text-5xl">
			{prefix}
			{value}
			{suffix}
		</p>
		<p className="text-base font-medium text-[#1A1A1A]">{label}</p>
		<p className="text-sm text-[#8a8a8a] leading-snug min-h-[2.75rem]">
			{detail || '\u00A0'}
		</p>
	</div>
);

export const ListItem = ({ children, className }: WithChildren & { className?: string }) => (
	<div className={merge('flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm', className)}>
		{children}
	</div>
);
