import type { Client } from '../types';

export const countNewClientsThisMonth = (clients: Client[], reference: Date): number => {
	const m = reference.getUTCMonth();
	const y = reference.getUTCFullYear();
	return clients.filter((c) => {
		if (!c.created_at) return false;
		const d = new Date(c.created_at);
		return !Number.isNaN(d.getTime()) && d.getUTCMonth() === m && d.getUTCFullYear() === y;
	}).length;
};
