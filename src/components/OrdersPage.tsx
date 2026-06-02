import { useMemo, useState } from 'react';
import type { Client, Seller } from '../types';
import type { SalesOrder } from '../services/dashboardService';
import { voidSaleOrder } from '../services/salesService';
import { Card, Section } from './ui/Primitives';
import { ConfirmDialog } from './products/ConfirmDialog';

type OrdersPageProps = {
	salesOrders: SalesOrder[];
	clientes: Client[];
	vendedores: Seller[];
	tenantId?: string;
	isAdmin: boolean;
	/** Parent flips the row to 'voided' and refreshes affected product stock. */
	onVoided: (orderId: string) => void;
};

const formatDate = (value?: string) => {
	if (!value) return '—';
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return '—';
	return parsed.toLocaleDateString('pt-BR', { dateStyle: 'short' });
};

const formatBRL = (value?: number) =>
	typeof value === 'number' && Number.isFinite(value)
		? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
		: '—';

const OrdersPage = ({ salesOrders, clientes, vendedores, tenantId, isAdmin, onVoided }: OrdersPageProps) => {
	const [confirmOrder, setConfirmOrder] = useState<SalesOrder | null>(null);
	const [voidingId, setVoidingId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Recent-first by sold_at.
	const orders = useMemo(
		() =>
			[...salesOrders].sort((a, b) => {
				const ta = a.sold_at ? new Date(a.sold_at).getTime() : 0;
				const tb = b.sold_at ? new Date(b.sold_at).getTime() : 0;
				return tb - ta;
			}),
		[salesOrders],
	);

	const clientName = (order: SalesOrder) => {
		const match = clientes.find(
			(c) =>
				(order.client_id && c.id === order.client_id) ||
				(order.client_external_id && c.externalId === order.client_external_id),
		);
		return match?.nome ?? '—';
	};

	const sellerName = (order: SalesOrder) => {
		const match = vendedores.find(
			(s) =>
				(order.seller_id && s.id === order.seller_id) ||
				(order.seller_external_id && s.externalId === order.seller_external_id),
		);
		return match?.nome ?? '—';
	};

	const handleConfirm = async () => {
		const order = confirmOrder;
		setConfirmOrder(null);
		if (!order || !tenantId) return;
		setError(null);
		setVoidingId(order.id);
		try {
			await voidSaleOrder({ tenantId, orderId: order.id });
			onVoided(order.id);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Não foi possível estornar o pedido.');
		} finally {
			setVoidingId(null);
		}
	};

	return (
		<>
			<Section>
				{error && (
					<div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
						{error}
					</div>
				)}
				<Card interactive={false} className="border border-border/30 bg-muted">
					{orders.length === 0 ? (
						<p className="py-10 text-center text-sm text-muted-foreground">
							Nenhum pedido registrado ainda.
						</p>
					) : (
						<div className="max-h-[480px] overflow-auto">
							<table className="min-w-full divide-y divide-black/5 text-sm">
								<thead className="bg-muted text-left text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
									<tr>
										<th className="px-4 py-3">Pedido</th>
										<th className="px-4 py-3">Data</th>
										<th className="px-4 py-3">Cliente</th>
										<th className="px-4 py-3">Vendedor</th>
										<th className="px-4 py-3 text-right">Total</th>
										<th className="px-4 py-3">Status</th>
										{isAdmin && <th className="px-4 py-3 text-right">Ações</th>}
									</tr>
								</thead>
								<tbody className="divide-y divide-border/30 bg-card">
									{orders.map((order) => {
										const isVoided = order.status === 'voided';
										return (
											<tr key={order.id} className="hover:bg-muted/60">
												<td className="px-4 py-3 font-semibold text-foreground">{order.order_number}</td>
												<td className="px-4 py-3 text-foreground">{formatDate(order.sold_at)}</td>
												<td className="px-4 py-3 text-foreground">{clientName(order)}</td>
												<td className="px-4 py-3 text-foreground">{sellerName(order)}</td>
												<td className="px-4 py-3 text-right text-foreground">{formatBRL(order.total_amount)}</td>
												<td className="px-4 py-3">
													<span
														className={
															isVoided
																? 'inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700'
																: 'inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700'
														}
													>
														{isVoided ? 'Estornada' : 'Registrada'}
													</span>
												</td>
												{isAdmin && (
													<td className="px-4 py-3 text-right">
														{!isVoided && (
															<button
																type="button"
																onClick={() => setConfirmOrder(order)}
																disabled={voidingId === order.id}
																className="rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
															>
																{voidingId === order.id ? 'Estornando…' : 'Estornar'}
															</button>
														)}
													</td>
												)}
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</Card>
			</Section>

			<ConfirmDialog
				open={confirmOrder !== null}
				title={confirmOrder ? `Estornar pedido ${confirmOrder.order_number}?` : 'Estornar pedido?'}
				message="O estoque dos itens será devolvido. Esta ação não pode ser desfeita."
				confirmLabel="Estornar"
				cancelLabel="Cancelar"
				destructive
				onConfirm={handleConfirm}
				onCancel={() => setConfirmOrder(null)}
			/>
		</>
	);
};

export default OrdersPage;
