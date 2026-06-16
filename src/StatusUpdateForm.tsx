import type { Session } from '@supabase/supabase-js';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useTenant } from './context/TenantContext';
import { supabase } from './lib/supabaseClient';
import { listProductOptions } from './services/productOptions';
const GMT3_OFFSET_MINUTES = -180;

type Props = {
	session: Session;
	onBack: () => void;
};

type Feedback = {
	type: 'success' | 'error';
	text: string;
};

type Mode = 'barcode' | 'sku';

const StatusUpdateForm = ({ session, onBack }: Props) => {
	const { tenant } = useTenant();
	const [mode, setMode] = useState<Mode>('barcode');
	const [barcodePhotos, setBarcodePhotos] = useState<File[]>([]);
	const [barcodeInput, setBarcodeInput] = useState('');
	const [barcodes, setBarcodes] = useState<string[]>([]);
	const [skuInput, setSkuInput] = useState('');
	const [skus, setSkus] = useState<string[]>([]);
	const [status, setStatus] = useState('');
	const [notes, setNotes] = useState('');
	const [feedback, setFeedback] = useState<Feedback | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [ondeOptions, setOndeOptions] = useState<string[]>([]);
	const [ondeLoading, setOndeLoading] = useState(true);
	useEffect(() => {
		if (!tenant?.id) return;
		setOndeLoading(true);
		void listProductOptions(tenant.id, 'onde')
			.then(setOndeOptions)
			.catch(() => {})
			.finally(() => setOndeLoading(false));
	}, [tenant?.id]);

	const userEmail = session.user.email ?? 'Usuário autenticado';

	const fileToBase64 = (file: File) =>
		new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				if (typeof reader.result === 'string') {
					const [, data] = reader.result.split(',');
					resolve(data ?? reader.result);
				} else {
					reject(new Error('Erro ao converter arquivo.'));
				}
			};
			reader.onerror = () => reject(reader.error ?? new Error('Erro ao ler arquivo.'));
			reader.readAsDataURL(file);
		});

	const formatToOffsetIso = (date: Date, offsetMinutes: number) => {
		const offsetMillis = offsetMinutes * 60 * 1000;
		const adjusted = new Date(date.getTime() + offsetMillis);
		const isoWithoutZ = adjusted.toISOString().replace('Z', '');
		const sign = offsetMinutes >= 0 ? '+' : '-';
		const absOffset = Math.abs(offsetMinutes);
		const hours = String(Math.floor(absOffset / 60)).padStart(2, '0');
		const minutes = String(absOffset % 60).padStart(2, '0');
		return `${isoWithoutZ}${sign}${hours}:${minutes}`;
	};

	const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
		event.preventDefault();
		setFeedback(null);

		const hasBarcodes = barcodes.length > 0 || barcodePhotos.length > 0;
		const hasSkus = skus.length > 0;

		if (mode === 'barcode' && !hasBarcodes) {
			setFeedback({
				type: 'error',
				text: 'Envie ao menos uma foto ou informe ao menos um código de barras.',
			});
			return;
		}
		if (mode === 'sku' && !hasSkus) {
			setFeedback({
				type: 'error',
				text: 'Informe ao menos um SKU.',
			});
			return;
		}

		if (!status.trim()) {
			setFeedback({ type: 'error', text: 'Informe o status desejado.' });
			return;
		}


		const basePayload: Record<string, unknown> = {
			tenantId: tenant?.id,
			tenantSlug: tenant?.slug,
			mode,
			sku: skus.length === 1 ? skus[0] : undefined,
			skus: skus.length > 0 ? skus : undefined,
			barcodes: mode === 'barcode' && barcodes.length > 0 ? barcodes : undefined,
			barcode: mode === 'barcode' && barcodes.length === 0 ? null : undefined,
			status: status.trim(),
			notes: notes.trim() || null,
			submittedBy: userEmail,
			submittedById: session.user.id,
			submittedAt: formatToOffsetIso(new Date(), GMT3_OFFSET_MINUTES),
		};

		const sendPayload = async (photo?: File) => {
			const payload: Record<string, unknown> = { ...basePayload };
			if (photo) {
				const base64 = await fileToBase64(photo);
				payload.photo = {
					name: photo.name,
					type: photo.type || 'image/jpeg',
					base64,
				};
			}

			const { error } = await supabase.functions.invoke('proxy-webhook', {
				body: payload,
			});

			if (error) {
				throw new Error(error.message || 'Falha ao enviar dados.');
			}
		};

		setSubmitting(true);
		try {
			if (mode === 'barcode') {
				if (barcodePhotos.length === 0) {
					await sendPayload();
				} else {
					for (const photo of barcodePhotos) {
						await sendPayload(photo);
					}
				}
			} else {
				await sendPayload();
			}

			setFeedback({ type: 'success', text: 'Atualização enviada com sucesso.' });
			setSkus([]);
			setSkuInput('');
			setBarcodes([]);
			setBarcodeInput('');
			setStatus('');
			setNotes('');
			setBarcodePhotos([]);
		} catch (error) {
			setFeedback({
				type: 'error',
				text: error instanceof Error ? error.message : 'Erro desconhecido ao enviar formulário.',
			});
		} finally {
			setSubmitting(false);
		}
	};

	const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
		const files = event.target.files ? Array.from(event.target.files) : [];
		setBarcodePhotos(files);
	};

	const addBarcodesFromValue = (value: string) => {
		const sanitized = value
			.split(/[\n,;\s]+/)
			.map((code) => code.trim())
			.filter(Boolean);
		if (!sanitized.length) return;
		setBarcodes((prev) => {
			const next = [...prev];
			for (const code of sanitized) {
				if (!next.includes(code)) {
					next.push(code);
				}
			}
			return next;
		});
		setBarcodeInput('');
	};

	const handleBarcodeKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			addBarcodesFromValue(barcodeInput);
		}
	};

	const handleBarcodeInputChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
		setBarcodeInput(event.target.value);
	};

	const addSkusFromValue = (value: string) => {
		const sanitized = value
			.split(/[\n,;\s]+/)
			.map((code) => code.trim())
			.filter(Boolean);
		if (!sanitized.length) return;
		setSkus((prev) => {
			const next = [...prev];
			for (const code of sanitized) {
				if (!next.includes(code)) {
					next.push(code);
				}
			}
			return next;
		});
		setSkuInput('');
	};

	const handleSkuKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			addSkusFromValue(skuInput);
		}
	};

	const handleSkuInputChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
		setSkuInput(event.target.value);
	};

	const removeBarcode = (code: string) => {
		setBarcodes((prev) => prev.filter((item) => item !== code));
	};

	const removeSku = (code: string) => {
		setSkus((prev) => prev.filter((item) => item !== code));
	};

	return (
		<div className="relative min-h-screen overflow-hidden bg-background text-foreground">
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--foreground)/0.05),transparent_55%)]" />
				<div className="absolute -top-24 right-10 h-[320px] w-[320px] rounded-full bg-accent/15 blur-3xl" />
				<div className="absolute -bottom-32 left-0 h-[360px] w-[360px] rounded-full bg-muted/60 blur-3xl" />
			</div>

			<div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-10">
					<motion.div
					initial={{ opacity: 0, y: 32 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, ease: 'easeOut' }}
						className="relative w-full max-w-xl rounded-[var(--radius-card)] border border-border/40 bg-card p-8 shadow-[var(--shadow-card)] sm:p-10">
						<div className="flex flex-col gap-4 text-center">
						<button
								type="button"
								onClick={onBack}
								className="self-start rounded-full border border-border/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground transition hover:border-border/70 hover:text-foreground sm:tracking-[0.35em]">
								Voltar
							</button>
							<p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:text-xs sm:tracking-[0.3em]">
								Formulário interno
							</p>
							<h1 className="text-2xl font-semibold uppercase tracking-[0.3em] text-foreground sm:text-3xl sm:tracking-[0.4em]">
								Atualização Status Produto
							</h1>
							<p className="text-xs text-muted-foreground sm:text-sm">
								Envie o código de barras ou o SKU e o status desejado. Os envios ficarão vinculados ao usuário{' '}
								<span className="font-semibold text-foreground">{userEmail}</span>.
							</p>
							<div className="text-xs text-muted-foreground sm:text-sm">Escolha se vai enviar códigos de barra ou SKUs.</div>
							<div className="mx-auto inline-flex rounded-full border border-border/40 bg-muted p-[6px] text-xs font-semibold uppercase tracking-[0.25em] text-foreground">
								<button
									type="button"
									onClick={() => setMode('barcode')}
									className={`rounded-full px-4 py-2 transition ${
										mode === 'barcode'
											? 'bg-primary text-primary-foreground shadow-[0_10px_30px_hsl(var(--foreground)/0.14)]'
											: 'text-muted-foreground hover:text-foreground'
									}`}>
									Cod. Barras
								</button>
								<button
									type="button"
									onClick={() => setMode('sku')}
									className={`rounded-full px-4 py-2 transition ${
										mode === 'sku'
											? 'bg-primary text-primary-foreground shadow-[0_10px_30px_hsl(var(--foreground)/0.14)]'
											: 'text-muted-foreground hover:text-foreground'
									}`}>
									SKU
								</button>
							</div>
						</div>

					<form onSubmit={handleSubmit} className="mt-8 space-y-6 sm:mt-10">
						{mode === 'barcode' && (
							<>
									<div>
										<label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground sm:text-[11px] sm:tracking-[0.35em]">
											Foto do código de barras*
										</label>
										<div className="mt-2 flex flex-col gap-2 rounded-2xl border border-border/40 bg-muted px-3 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:text-sm">
											<label className="inline-flex w-full max-w-[190px] cursor-pointer items-center justify-center rounded-2xl border border-border/50 bg-card px-3 py-[9px] text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:border-border hover:text-foreground sm:max-w-[210px] sm:px-3 sm:py-[10px] sm:text-[11px] sm:tracking-[0.25em]">
												<input
													id="barcode-photo-upload"
													type="file"
												accept="image/*"
												multiple
												className="hidden"
												onChange={handleFileChange}
											/>
												Escolher arquivos
											</label>
											<span className="flex-1 truncate text-[11px] uppercase tracking-[0.15em] text-muted-foreground sm:text-xs">
												{barcodePhotos.length > 0
													? `${barcodePhotos.length} arquivo${barcodePhotos.length > 1 ? 's' : ''} selecionado${
														barcodePhotos.length > 1 ? 's' : ''
												  }`
												: 'Nenhum arquivo selecionado'}
										</span>
									</div>
										<p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/80 sm:tracking-[0.25em]">
											{barcodes.length === 0
												? 'Envie uma foto ou preencha os códigos abaixo.'
												: 'Opcional se os códigos já foram informados.'}
										</p>
									</div>

									<label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground sm:text-[11px] sm:tracking-[0.35em]">
										Códigos de barras*
										<div className="mt-2 space-y-3">
											<div className="flex flex-col gap-3 sm:flex-row">
												<input
												id="barcode-type-in"
												type="text"
												value={barcodeInput}
													onChange={handleBarcodeInputChange}
													onKeyDown={handleBarcodeKeyDown}
													placeholder="Escaneie com a pistola ou digite manualmente"
													className="flex-1 rounded-2xl border border-input bg-card px-4 py-3 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
													autoComplete="off"
												/>
												<button
													type="button"
													onClick={() => addBarcodesFromValue(barcodeInput)}
													className="rounded-2xl border border-border/50 bg-card px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-foreground transition hover:border-border hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">
													Adicionar
												</button>
											</div>
											<p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/80 sm:tracking-[0.25em]">
												Pressione Enter a cada leitura ou cole vários códigos separados por espaço, vírgula ou quebra de
												linha.
											</p>
											{barcodes.length > 0 && (
												<div className="flex flex-wrap gap-2">
													{barcodes.map((code) => (
														<span
															key={code}
															className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-foreground">
															{code}
															<button
																type="button"
																onClick={() => removeBarcode(code)}
																className="text-muted-foreground transition hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
																aria-label={`Remover código ${code}`}>
																×
															</button>
														</span>
												))}
											</div>
										)}
									</div>
								</label>
							</>
						)}

						{mode === 'sku' && (
							<label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground sm:text-[11px] sm:tracking-[0.35em]">
								SKU (um ou vários)*
								<div className="mt-2 space-y-3">
									<div className="flex flex-col gap-3 sm:flex-row">
										<input
											id="sku-type-in"
											type="number"
											value={skuInput}
											onChange={handleSkuInputChange}
											onKeyDown={handleSkuKeyDown}
											placeholder="Informe ou cole um ou vários SKUs"
											className="flex-1 rounded-2xl border border-input bg-card px-4 py-3 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
											autoComplete="off"
										/>
										<button
											type="button"
											onClick={() => addSkusFromValue(skuInput)}
											className="rounded-2xl border border-border/50 bg-card px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-foreground transition hover:border-border hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">
											Adicionar
										</button>
									</div>
									<p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/80 sm:tracking-[0.25em]">
										Pressione Enter para cadastrar ou cole vários SKUs separados por espaço, vírgula ou quebra de linha.
									</p>
									{skus.length > 0 && (
										<div className="flex flex-wrap gap-2">
											{skus.map((code) => (
												<span
													key={code}
													className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-foreground">
													{code}
													<button
														type="button"
														onClick={() => removeSku(code)}
														className="text-muted-foreground transition hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
														aria-label={`Remover SKU ${code}`}>
														×
													</button>
												</span>
											))}
										</div>
									)}
								</div>
							</label>
						)}

						<label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground sm:text-[11px] sm:tracking-[0.35em]">
							Onde*
							<select
								id="product-location-select"
								value={status}
								onChange={(event) => setStatus(event.target.value)}
								className="mt-2 w-full cursor-pointer rounded-2xl border border-input bg-card px-4 py-3 text-sm uppercase tracking-[0.2em] text-foreground outline-none transition hover:border-border/70 focus:border-ring/60 focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
								disabled={ondeLoading || submitting}
								required>
								<option value="" disabled>
									{ondeLoading ? 'Carregando…' : 'Selecione onde está'}
								</option>
								{ondeOptions.map((opt) => (
									<option key={opt} value={opt}>{opt}</option>
								))}
							</select>
						</label>

						<label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground sm:text-[11px] sm:tracking-[0.35em]">
							Observações
							<textarea
								value={notes}
								onChange={(event) => setNotes(event.target.value)}
								placeholder="Informações adicionais (opcional)"
								className="mt-2 min-h-[120px] w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
							/>
						</label>

						{feedback && (
							<div
								className={`rounded-2xl border px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] ${
									feedback.type === 'success'
										? 'border-emerald-300/60 bg-emerald-50 text-emerald-700'
										: 'border-red-300/60 bg-red-50 text-red-700'
								}`}>
								{feedback.text}
							</div>
						)}

							<div className="pt-2 sm:pt-0">
								<button
									type="submit"
									className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-primary-foreground shadow-[0_16px_30px_hsl(var(--foreground)/0.18)] transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:tracking-[0.45em]"
									disabled={submitting}>
									{submitting ? 'Enviando…' : 'Enviar'}
								</button>
							</div>
					</form>
				</motion.div>
			</div>
		</div>
	);
};

export default StatusUpdateForm;
