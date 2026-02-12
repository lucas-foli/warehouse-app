import { useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import {
	buildProductsFromCsvText,
	buildClientsFromCsvText,
	buildSalesItemsFromCsvText,
	buildSalesOrdersFromCsvText,
	buildSellersFromCsvText,
	type CsvImportResult,
	type ProductUpsertRow,
	type SalesItemUpsertRow,
	type SalesOrderUpsertRow,
} from '../utils/csv';

type Props = {
	onBack: () => void;
};

type ImportKind = 'products' | 'clients' | 'sellers' | 'orders' | 'items';

type ImportConfig = {
	label: string;
	description: string;
	table: string;
	onConflict: string;
};

type CsvGuide = {
	required: string[];
	optional: string[];
	example: string;
	notes?: string[];
};

const IMPORT_CONFIG: Record<ImportKind, ImportConfig> = {
	products: {
		label: 'Produtos',
		description: 'Importe a tabela mestre de produtos (SKU, nome, foto e status).',
		table: 'products',
		onConflict: 'tenant_id,sku',
	},
	clients: {
		label: 'Clientes',
		description: 'Importe clientes com nome, contato e cidade.',
		table: 'clients',
		onConflict: 'tenant_id,external_id',
	},
	sellers: {
		label: 'Vendedores',
		description: 'Importe vendedores para gerar performance.',
		table: 'sellers',
		onConflict: 'tenant_id,external_id',
	},
	orders: {
		label: 'Vendas (Pedidos)',
		description: 'Importe pedidos com cliente, vendedor e valor.',
		table: 'sales_orders',
		onConflict: 'tenant_id,order_number',
	},
	items: {
		label: 'Itens de venda',
		description: 'Importe itens por pedido para ranking de produtos.',
		table: 'sales_items',
		onConflict: 'tenant_id,order_number,sku',
	},
};

const CSV_GUIDE: Record<ImportKind, CsvGuide> = {
	products: {
		required: ['sku', 'name'],
		optional: ['barcode', 'status', 'is_active', 'location', 'qty', 'min', 'price', 'total_sold', 'image_url'],
		example: 'sku,name,barcode,status,is_active,location,qty,min,price,total_sold,image_url',
		notes: [
			'Use este arquivo antes de importar itens de venda.',
			'`is_active=false` bloqueia o SKU para novas vendas.',
		],
	},
	clients: {
		required: ['name'],
		optional: ['external_id', 'email', 'phone', 'city', 'last_purchase_at'],
		example: 'name,external_id,email,phone,city,last_purchase_at',
		notes: ['external_id e recomendado para cruzar pedidos. Se nao vier, usamos email/telefone/nome.'],
	},
	sellers: {
		required: ['name'],
		optional: ['external_id', 'email'],
		example: 'name,external_id,email',
		notes: ['external_id e recomendado para vincular pedidos ao vendedor.'],
	},
	orders: {
		required: ['order_number'],
		optional: ['client_external_id', 'seller_external_id', 'status', 'total_amount', 'sold_at'],
		example: 'order_number,client_external_id,seller_external_id,status,total_amount,sold_at',
		notes: ['Use os mesmos external_id dos CSVs de clientes e vendedores para vincular.'],
	},
	items: {
		required: ['order_number', 'sku'],
		optional: ['qty', 'unit_price', 'total_price'],
		example: 'order_number,sku,qty,unit_price,total_price',
		notes: [
			'Se total_price estiver vazio, calculamos unit_price x qty (qty padrao = 1).',
			'Somente SKUs cadastrados e ativos em produtos sao aceitos.',
		],
	},
};

const chunk = <T,>(items: T[], size: number) => {
	const batches: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		batches.push(items.slice(i, i + size));
	}
	return batches;
};

const normalizeDateInput = (value?: string) => {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	const parsed = new Date(trimmed);
	if (Number.isNaN(parsed.getTime())) return trimmed;
	return parsed.toISOString();
};

const normalizeKey = (value: string) => value.trim().toUpperCase();

const isInactiveStatus = (status?: string) => {
	const normalized = (status ?? '').trim().toLowerCase();
	if (!normalized) return false;
	return ['inativo', 'inativa', 'inactive', 'desativado', 'desativada', 'arquivado', 'archived'].includes(normalized);
};

const summarizeValues = (values: string[], limit = 8) => {
	const unique = Array.from(new Set(values.filter(Boolean)));
	if (unique.length <= limit) return unique.join(', ');
	return `${unique.slice(0, limit).join(', ')}... (+${unique.length - limit})`;
};

const DataImport = ({ onBack }: Props) => {
	const { tenant } = useTenant();
	const tenantId = tenant?.id;
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const [kind, setKind] = useState<ImportKind>('clients');
	const [csvFile, setCsvFile] = useState<File | null>(null);
	const [previewData, setPreviewData] = useState<Record<string, string>[]>([]);
	const [csvRows, setCsvRows] = useState<unknown[]>([]);
	const [csvWarnings, setCsvWarnings] = useState<string[]>([]);
	const [csvStats, setCsvStats] = useState<{ totalRows: number; validRows: number; skippedRows: number } | null>(null);
	const [csvError, setCsvError] = useState('');
	const [importError, setImportError] = useState('');
	const [importedRows, setImportedRows] = useState<number | null>(null);
	const [loading, setLoading] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const [clearBeforeImport, setClearBeforeImport] = useState(false);

	const config = IMPORT_CONFIG[kind];
	const csvGuide = CSV_GUIDE[kind];
	const isCsvInvalid = Boolean(csvFile && csvRows.length === 0);
	const isImportDisabled = loading || Boolean(csvError) || Boolean(importError) || !csvFile || isCsvInvalid;

	const resetCsv = () => {
		setCsvFile(null);
		setPreviewData([]);
		setCsvRows([]);
		setCsvWarnings([]);
		setCsvStats(null);
		setCsvError('');
		setImportError('');
		setImportedRows(null);
		setClearBeforeImport(false);
	};

	const parseResult = (text: string): CsvImportResult<unknown> => {
		if (!tenantId) {
			return { preview: [], rows: [], totalRows: 0, validRows: 0, skippedRows: 0, warnings: ['Tenant nao carregado.'] };
		}
		switch (kind) {
			case 'products':
				return buildProductsFromCsvText(text, tenantId) as CsvImportResult<unknown>;
			case 'clients':
				return buildClientsFromCsvText(text, tenantId) as CsvImportResult<unknown>;
			case 'sellers':
				return buildSellersFromCsvText(text, tenantId) as CsvImportResult<unknown>;
			case 'orders':
				return buildSalesOrdersFromCsvText(text, tenantId) as CsvImportResult<unknown>;
			case 'items':
				return buildSalesItemsFromCsvText(text, tenantId) as CsvImportResult<unknown>;
		}
	};

	const readFileText = (file: File) =>
		new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result ?? ''));
			reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler arquivo.'));
			reader.readAsText(file);
		});

	const processCsvFile = async (file: File) => {
		setCsvError('');
		setImportError('');
		setImportedRows(null);
		setCsvWarnings([]);
		setCsvStats(null);

		if (!tenantId) {
			setCsvError('Tenant nao carregado ainda. Recarregue a pagina e tente novamente.');
			return;
		}

		if (!file.name.toLowerCase().endsWith('.csv')) {
			setCsvError('Envie um arquivo .csv');
			return;
		}

		if (file.size > 10 * 1024 * 1024) {
			setCsvError('Arquivo muito grande (maximo 10MB).');
			return;
		}

		setCsvFile(file);
		try {
			const text = await readFileText(file);
			const result = parseResult(text);
			setPreviewData(result.preview);
			setCsvRows(result.rows);
			setCsvWarnings(result.warnings);
			setCsvStats({ totalRows: result.totalRows, validRows: result.validRows, skippedRows: result.skippedRows });

			if (result.totalRows === 0) {
				setCsvError('CSV vazio ou invalido.');
				return;
			}

			if (result.validRows === 0) {
				setCsvError('Nenhuma linha valida encontrada. Revise o arquivo e tente novamente.');
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Falha ao processar CSV.';
			setCsvError(message);
		}
	};

	const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;
		void processCsvFile(file);
	};

	const fetchIdMap = async (
		table: 'clients' | 'sellers' | 'sales_orders' | 'products',
		key: 'external_id' | 'order_number' | 'sku',
		values: string[],
	) => {
		const map = new Map<string, string>();
		if (!tenantId) return map;
		const uniqueValues = Array.from(new Set(values.filter(Boolean)));
		const batches = chunk(uniqueValues, 200);
		for (const batch of batches) {
			const { data, error } = await supabase.from(table).select(`id, ${key}`).eq('tenant_id', tenantId).in(key, batch);
			if (error) throw error;
			(data ?? []).forEach((row: Record<string, string>) => {
				const rowKey = row[key];
				if (rowKey) map.set(normalizeKey(rowKey), row.id);
			});
		}
		return map;
	};

	const fetchProductsBySku = async (values: string[]) => {
		const map = new Map<string, { id: string; isActive: boolean }>();
		if (!tenantId) return map;
		const uniqueValues = Array.from(new Set(values.filter(Boolean)));
		const batches = chunk(uniqueValues, 200);

		for (const batch of batches) {
			let data: Record<string, unknown>[] | null = null;
			const primary = await supabase
				.from('products')
				.select('id, sku, is_active, status')
				.eq('tenant_id', tenantId)
				.in('sku', batch);

			if (primary.error) {
				if (primary.error.message.toLowerCase().includes('is_active')) {
					const fallback = await supabase
						.from('products')
						.select('id, sku, status')
						.eq('tenant_id', tenantId)
						.in('sku', batch);
					if (fallback.error) throw fallback.error;
					data = fallback.data as Record<string, unknown>[] | null;
				} else {
					throw primary.error;
				}
			} else {
				data = primary.data as Record<string, unknown>[] | null;
			}

			(data ?? []).forEach((row) => {
				const sku = String(row.sku ?? '').trim();
				const id = String(row.id ?? '').trim();
				if (!sku || !id) return;
				const status = String(row.status ?? '').trim();
				const isActiveValue = row.is_active;
				const isActive =
					typeof isActiveValue === 'boolean' ? isActiveValue : status ? !isInactiveStatus(status) : true;
				map.set(normalizeKey(sku), { id, isActive });
			});
		}
		return map;
	};

	const upsertRows = async (rows: Record<string, unknown>[]) => {
		const batches = chunk(rows, 500);
		let uploaded = 0;
		for (const batch of batches) {
			const { error } = await supabase.from(config.table).upsert(batch, { onConflict: config.onConflict });
			if (error) throw error;
			uploaded += batch.length;
		}
		return uploaded;
	};

	const handleImport = async () => {
		if (!tenantId || csvRows.length === 0) return;
		setLoading(true);
		setImportError('');

		try {
			if (clearBeforeImport) {
				if (kind === 'orders') {
					const { error: itemError } = await supabase.from('sales_items').delete().eq('tenant_id', tenantId);
					if (itemError) throw itemError;
				}
				const { error: clearError } = await supabase.from(config.table).delete().eq('tenant_id', tenantId);
				if (clearError) throw clearError;
			}

			if (kind === 'products') {
				const sanitized = (csvRows as ProductUpsertRow[]).map((row) => {
					const imageUrl = String(row.image_url ?? row.image ?? '').trim();
					return {
						...row,
						sku: normalizeKey(row.sku),
						name: String(row.name ?? '').trim(),
						barcode: row.barcode?.trim() || undefined,
						status: row.status?.trim() || undefined,
						location: row.location?.trim() || undefined,
						image_url: imageUrl || undefined,
						image: imageUrl || undefined,
					};
				});
				const uploaded = await upsertRows(sanitized as Record<string, unknown>[]);
				setImportedRows(uploaded);
				setLoading(false);
				return;
			}

			if (kind === 'clients' || kind === 'sellers') {
				const sanitized = (csvRows as Array<Record<string, unknown>>).map((row) => {
					const rawExternal = String(row.external_id ?? '').trim();
					return {
						...row,
						external_id: rawExternal ? normalizeKey(rawExternal) : rawExternal,
						name: String(row.name ?? '').trim(),
					};
				});
				const uploaded = await upsertRows(sanitized);
				setImportedRows(uploaded);
				setLoading(false);
				return;
			}

			if (kind === 'orders') {
				const rows = (csvRows as SalesOrderUpsertRow[]).map((row) => ({
					...row,
					order_number: normalizeKey(row.order_number),
					client_external_id: row.client_external_id ? normalizeKey(row.client_external_id) : undefined,
					seller_external_id: row.seller_external_id ? normalizeKey(row.seller_external_id) : undefined,
					status: row.status?.trim() || undefined,
				}));
				const clientKeys = rows.map((row) => row.client_external_id || '').filter(Boolean);
				const sellerKeys = rows.map((row) => row.seller_external_id || '').filter(Boolean);
				const clientMap = clientKeys.length ? await fetchIdMap('clients', 'external_id', clientKeys) : new Map();
				const sellerMap = sellerKeys.length ? await fetchIdMap('sellers', 'external_id', sellerKeys) : new Map();

				const payload = rows.map((row) => ({
					...row,
					client_id: row.client_external_id ? clientMap.get(row.client_external_id) ?? null : null,
					seller_id: row.seller_external_id ? sellerMap.get(row.seller_external_id) ?? null : null,
					sold_at: normalizeDateInput(row.sold_at),
				}));

				const uploaded = await upsertRows(payload as Record<string, unknown>[]);
				setImportedRows(uploaded);
				setLoading(false);
				return;
			}

			const rows = (csvRows as SalesItemUpsertRow[]).map((row) => ({
				...row,
				order_number: normalizeKey(row.order_number),
				sku: row.sku ? normalizeKey(row.sku) : undefined,
			}));
			const orderNumbers = rows.map((row) => row.order_number).filter(Boolean);
			const skus = rows.map((row) => row.sku || '').filter(Boolean);
			const orderMap = orderNumbers.length ? await fetchIdMap('sales_orders', 'order_number', orderNumbers) : new Map();
			const productMap = skus.length ? await fetchProductsBySku(skus) : new Map();

			const unknownSkus: string[] = [];
			const inactiveSkus: string[] = [];
			for (const sku of skus) {
				const product = productMap.get(sku);
				if (!product) {
					unknownSkus.push(sku);
					continue;
				}
				if (!product.isActive) inactiveSkus.push(sku);
			}

			if (unknownSkus.length || inactiveSkus.length) {
				const messageParts: string[] = [];
				if (unknownSkus.length) {
					messageParts.push(`SKUs nao cadastrados: ${summarizeValues(unknownSkus)}`);
				}
				if (inactiveSkus.length) {
					messageParts.push(`SKUs inativos: ${summarizeValues(inactiveSkus)}`);
				}
				throw new Error(`${messageParts.join(' | ')}. Importe/ative os produtos e tente novamente.`);
			}

			const payload = rows.map((row) => {
				const qty = row.qty ?? 1;
				const total = row.total_price ?? (row.unit_price ? row.unit_price * qty : undefined);
				return {
					...row,
					qty,
					total_price: total,
					order_id: orderMap.get(row.order_number) ?? null,
					product_id: row.sku ? productMap.get(row.sku)?.id ?? null : null,
				};
			});

			const uploaded = await upsertRows(payload as Record<string, unknown>[]);
			setImportedRows(uploaded);
			setLoading(false);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Falha ao importar dados.';
			setImportError(message);
			setLoading(false);
		}
	};

	const importOptions = useMemo(
		() =>
			(Object.keys(IMPORT_CONFIG) as ImportKind[]).map((key) => ({
				value: key,
				label: IMPORT_CONFIG[key].label,
			})),
		[],
	);

	const clearHint = useMemo(() => {
		if (kind === 'orders') return 'Limpa pedidos e itens deste tenant.';
		if (kind === 'items') return 'Limpa todos os itens de venda antes do import.';
		if (kind === 'products') return 'Limpa a tabela mestre de produtos deste tenant antes do import.';
		return 'Limpa os dados deste tipo antes do import.';
	}, [kind]);

	return (
		<div className="min-h-screen bg-background text-foreground flex flex-col justify-center px-4 py-10 sm:px-6 sm:py-12 lg:px-10">
			<div className="mx-auto w-full max-w-xl sm:max-w-2xl lg:max-w-3xl">
				<h2 className="mt-6 text-center text-3xl font-extrabold text-foreground">Importar dados</h2>
				<p className="mt-2 text-center text-sm text-muted-foreground">
					Carregue arquivos CSV para alimentar as metricas.
				</p>
			</div>

			<div className="mt-8 mx-auto w-full max-w-xl sm:max-w-2xl lg:max-w-3xl">
				<div className="bg-card py-8 px-4 shadow-[var(--shadow-card)] sm:rounded-[var(--radius-card)] sm:px-8 lg:px-10">
					<div className="space-y-6">
						<div>
							<label className="block text-sm font-medium text-muted-foreground">Tipo de importacao</label>
							<select
								value={kind}
								onChange={(event) => {
									setKind(event.target.value as ImportKind);
									resetCsv();
								}}
								className="mt-1 block w-full cursor-pointer rounded-md border border-input bg-card p-2 text-sm text-foreground shadow-sm outline-none transition hover:border-border/70 focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
							>
								{importOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
							<p className="mt-2 text-xs text-muted-foreground">{config.description}</p>
						</div>

						<div>
							<label className="block text-sm font-medium text-muted-foreground">Upload de Dados (CSV)</label>
							<div
								className={`mt-1 flex justify-center rounded-md border-2 border-dashed px-6 pt-5 pb-6 ${
									isDragging ? 'border-ring/60 bg-muted/40' : 'border-border/40'
								}`}
								role="button"
								tabIndex={0}
								onClick={() => fileInputRef.current?.click()}
								onKeyDown={(event) => {
									if (event.key === 'Enter' || event.key === ' ') {
										event.preventDefault();
										fileInputRef.current?.click();
									}
								}}
								onDragOver={(event) => {
									event.preventDefault();
									setIsDragging(true);
								}}
								onDragLeave={() => setIsDragging(false)}
								onDrop={(event) => {
									event.preventDefault();
									setIsDragging(false);
									const file = event.dataTransfer.files?.[0];
									if (file) void processCsvFile(file);
								}}
							>
								<div className="space-y-1 text-center">
									<p className="text-sm text-muted-foreground">Enviar arquivo ou arraste e solte</p>
									<p className="text-xs text-muted-foreground">CSV ate 10MB</p>
									{csvFile && (
										<div className="pt-2 text-xs text-muted-foreground">
											<span className="font-medium text-foreground">{csvFile.name}</span>
											{csvStats && (
												<span className="pl-2">
													{csvStats.validRows} validas • {csvStats.skippedRows} ignoradas
												</span>
											)}
										</div>
									)}
									{csvFile && (
										<div className="pt-2">
											<button
												type="button"
												onClick={(event) => {
													event.stopPropagation();
													resetCsv();
												}}
												className="text-xs font-medium text-primary hover:text-primary/90"
											>
												Remover arquivo
											</button>
										</div>
									)}
									<input
										ref={fileInputRef}
										id="file-upload"
										name="file-upload"
										type="file"
										className="sr-only"
										onChange={handleCsvUpload}
										accept=".csv"
									/>
								</div>
							</div>
						</div>

						<div className="rounded-md border border-border/40 bg-muted/30 px-3 py-3 text-xs text-muted-foreground leading-relaxed">
							<p className="text-sm font-medium text-foreground">Como deve ser o CSV</p>
							<p className="mt-1">
								Cabecalho obrigatorio:{' '}
								<span className="font-medium text-foreground break-all">{csvGuide.required.join(', ')}</span>
								{csvGuide.optional.length > 0 ? (
									<>
										{' '}
										• Opcionais:{' '}
										<span className="font-medium text-foreground break-all">{csvGuide.optional.join(', ')}</span>
									</>
								) : null}
							</p>
							<p className="mt-1">
								Exemplo de cabecalho:{' '}
								<span className="font-medium text-foreground break-all">{csvGuide.example}</span>
							</p>
							{csvGuide.notes?.map((note) => (
								<p key={note} className="mt-1">
									{note}
								</p>
							))}
							<p className="mt-1">
								Aceitamos variacoes nos nomes das colunas (ex: nome, pedido). Separador pode ser virgula,
								ponto e virgula ou tab. Numeros aceitam ponto ou virgula.
							</p>
						</div>

						<div className="rounded-md border border-border/40 bg-muted/30 px-3 py-3">
							<label className="flex items-start gap-3 text-sm text-foreground">
								<input
									type="checkbox"
									className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-ring/25"
									checked={clearBeforeImport}
									onChange={(event) => setClearBeforeImport(event.target.checked)}
								/>
								<span>
									<span className="font-medium">Limpar dados antes de importar</span>
									<span className="mt-1 block text-xs text-muted-foreground">
										{clearHint} Use com cuidado.
									</span>
								</span>
							</label>
						</div>

						{csvError && (
							<div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">
								{csvError}
							</div>
						)}

						{csvWarnings.length > 0 && (
							<div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
								<ul className="list-disc pl-5">
									{csvWarnings.map((warning) => (
										<li key={warning}>{warning}</li>
									))}
								</ul>
							</div>
						)}

						{previewData.length > 0 && (
							<div className="mt-4">
								<h4 className="text-sm font-medium text-foreground">Preview dos dados</h4>
								<div className="mt-2 overflow-x-auto">
									<table className="min-w-full divide-y divide-border/40">
										<thead className="bg-muted">
											<tr>
												{Object.keys(previewData[0]).slice(0, 4).map((key) => (
													<th key={key} scope="col" className="px-3 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
														{key}
													</th>
												))}
											</tr>
										</thead>
										<tbody className="divide-y divide-border/30 bg-card">
											{previewData.map((row, index) => (
												<tr key={index}>
													{Object.values(row).slice(0, 4).map((val, cellIdx) => (
														<td key={cellIdx} className="whitespace-nowrap px-3 py-4 text-xs text-muted-foreground">
															{val}
														</td>
													))}
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						)}

						{importedRows !== null && (
							<div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
								Importacao concluida: {importedRows} registros enviados.
							</div>
						)}

						{importError && (
							<div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">
								{importError}
							</div>
						)}

						<div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
							<button
								type="button"
								onClick={onBack}
								className="w-full inline-flex justify-center rounded-md border border-border/40 shadow-sm px-4 py-2 bg-card text-base font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring/25 sm:text-sm"
							>
								Voltar
							</button>
							<button
								type="button"
								onClick={handleImport}
								disabled={isImportDisabled}
								className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring/25 sm:text-sm disabled:opacity-50"
							>
								{loading ? 'Importando...' : 'Importar CSV'}
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default DataImport;
