import type { Session } from '@supabase/supabase-js';
import { motion } from 'framer-motion';
import { useState } from 'react';

const STATUS_UPDATE_WEBHOOK_URL =
	import.meta.env.VITE_STATUS_UPDATE_WEBHOOK_URL ?? 'https://n8n.go-fly.ai/webhook/product-location';
const STATUS_SUGGESTIONS = ['ESTOQUE', 'GAVETA', 'VM'];
const GMT3_OFFSET_MINUTES = -180;

type Props = {
	session: Session;
	onBack: () => void;
};

type Feedback = {
	type: 'success' | 'error';
	text: string;
};

const StatusUpdateForm = ({ session, onBack }: Props) => {
	const [barcodePhotos, setBarcodePhotos] = useState<File[]>([]);
	const [barcodeInput, setBarcodeInput] = useState('');
	const [barcodes, setBarcodes] = useState<string[]>([]);
	const [sku, setSku] = useState('');
	const [status, setStatus] = useState('');
	const [notes, setNotes] = useState('');
	const [feedback, setFeedback] = useState<Feedback | null>(null);
	const [submitting, setSubmitting] = useState(false);

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

		if (barcodes.length === 0 && barcodePhotos.length === 0) {
			setFeedback({
				type: 'error',
				text: 'Envie ao menos uma foto ou informe ao menos um código de barras.',
			});
			return;
		}

		if (!status.trim()) {
			setFeedback({ type: 'error', text: 'Informe o status desejado.' });
			return;
		}

		if (!STATUS_UPDATE_WEBHOOK_URL) {
			setFeedback({
				type: 'error',
				text: 'Configure VITE_STATUS_UPDATE_WEBHOOK_URL no .env para enviar o formulário.',
			});
			return;
		}

		const basePayload: Record<string, unknown> = {
			sku: sku.trim(),
			barcodes: barcodes.length > 0 ? barcodes : undefined,
			barcode: barcodes.length === 0 ? null : undefined,
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

			const response = await fetch(STATUS_UPDATE_WEBHOOK_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${session.access_token}`,
				},
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(errorText || 'Falha ao enviar dados.');
			}
		};

		setSubmitting(true);
		try {
			if (barcodePhotos.length === 0) {
				await sendPayload();
			} else {
				for (const photo of barcodePhotos) {
					await sendPayload(photo);
				}
			}

			setFeedback({
				type: 'success',
				text:
					barcodePhotos.length > 1
						? `Enviamos ${barcodePhotos.length} fotos com sucesso.`
						: 'Atualização enviada com sucesso.',
			});
			setSku('');
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

	const removeBarcode = (code: string) => {
		setBarcodes((prev) => prev.filter((item) => item !== code));
	};

	return (
		<div className="relative min-h-screen overflow-hidden bg-[#f9f9f7] text-[#121213]">
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(0,0,0,0.03),transparent_55%)]" />
				<div className="absolute -top-24 right-10 h-[320px] w-[320px] rounded-full bg-[#f0ece0] blur-3xl" />
				<div className="absolute -bottom-32 left-0 h-[360px] w-[360px] rounded-full bg-[#ebe7d9] blur-3xl" />
			</div>

			<div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-10">
				<motion.div
					initial={{ opacity: 0, y: 32 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, ease: 'easeOut' }}
					className="relative w-full max-w-3xl rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_30px_60px_rgba(0,0,0,0.08)] sm:rounded-[32px] sm:p-10">
					<div className="flex flex-col gap-4 text-center">
						<button
							type="button"
							onClick={onBack}
							className="self-start rounded-full border border-black/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f] transition hover:border-black/30 hover:text-black sm:tracking-[0.35em]">
							Voltar
						</button>
						<p className="text-[10px] uppercase tracking-[0.25em] text-[#6f6f6f] sm:text-xs sm:tracking-[0.3em]">
							Formulário interno
						</p>
						<h1 className="text-2xl font-semibold uppercase tracking-[0.3em] text-[#121213] sm:text-3xl sm:tracking-[0.4em]">
							Atualização Status Produto
						</h1>
						<p className="text-xs text-[#3b3b3b] sm:text-sm">
							Envie o código de barras e o status desejado. Os envios ficarão vinculados ao usuário{' '}
							<span className="font-semibold text-[#121213]">{userEmail}</span>.
						</p>
					</div>

					<form onSubmit={handleSubmit} className="mt-8 space-y-6 sm:mt-10">
						<div>
							<label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f] sm:text-[11px] sm:tracking-[0.35em]">
								Foto do código de barras
							</label>
							<div className="mt-2 flex flex-col gap-3 rounded-2xl border border-black/10 bg-[#f6f6f2] px-4 py-3 text-xs text-[#3b3b3b] sm:flex-row sm:items-center sm:text-sm">
								<label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-black/15 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#121213] transition hover:border-black/30 hover:text-black sm:text-xs sm:tracking-[0.35em]">
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
								<span className="truncate text-[11px] uppercase tracking-[0.2em] text-[#6f6f6f] sm:text-xs">
									{barcodePhotos.length > 0
										? `${barcodePhotos.length} arquivo${barcodePhotos.length > 1 ? 's' : ''} selecionado${
												barcodePhotos.length > 1 ? 's' : ''
										  }`
										: 'Nenhum arquivo selecionado'}
								</span>
							</div>
							<p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-[#8a8a8a] sm:text-xs">
								{barcodes.length === 0
									? 'Envie uma foto ou preencha os códigos abaixo.'
									: 'Opcional se os códigos já foram informados.'}
							</p>
						</div>

						<label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f] sm:text-[11px] sm:tracking-[0.35em]">
							Códigos de barras
							<div className="mt-2 space-y-3">
								<div className="flex flex-col gap-3 sm:flex-row">
									<input
										id="barcode-type-in"
										type="text"
										value={barcodeInput}
										onChange={handleBarcodeInputChange}
										onKeyDown={handleBarcodeKeyDown}
										placeholder="Escaneie com a pistola ou digite manualmente"
										className="flex-1 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#121213] outline-none transition focus:border-black/50 focus:ring-2 focus:ring-black/10 disabled:cursor-not-allowed disabled:opacity-50"
										autoComplete="off"
									/>
									<button
										type="button"
										onClick={() => addBarcodesFromValue(barcodeInput)}
										className="rounded-2xl border border-black/15 bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#121213] transition hover:border-black/30 hover:bg-[#f6f6f2] disabled:cursor-not-allowed disabled:opacity-40">
										Adicionar
									</button>
								</div>
								<p className="text-[10px] uppercase tracking-[0.2em] text-[#8a8a8a] sm:tracking-[0.3em]">
									Pressione Enter a cada leitura ou cole vários códigos separados por espaço, vírgula ou quebra de
									linha.
								</p>
								<p className="text-[10px] uppercase tracking-[0.2em] text-[#8a8a8a] sm:tracking-[0.25em]">
									{barcodePhotos.length === 0
										? 'Informe ao menos um código ou anexe a foto acima.'
										: 'Opcional se a foto já foi anexada.'}
								</p>
								{barcodes.length > 0 && (
									<div className="flex flex-wrap gap-2">
										{barcodes.map((code) => (
											<span
												key={code}
												className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-[#f6f6f2] px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#121213]">
												{code}
												<button
													type="button"
													onClick={() => removeBarcode(code)}
													className="text-[#6f6f6f] transition hover:text-[#121213] disabled:pointer-events-none disabled:opacity-40"
													aria-label={`Remover código ${code}`}>
													×
												</button>
											</span>
										))}
									</div>
								)}
							</div>
						</label>

						<label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f] sm:text-[11px] sm:tracking-[0.35em]">
							SKU
							<input
								type="number"
								value={sku}
								onChange={(event) => setSku(event.target.value)}
								placeholder="Informe o SKU"
								className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#121213] outline-none transition focus:border-black/50 focus:ring-2 focus:ring-black/10"
								required
							/>
						</label>

						<label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f] sm:text-[11px] sm:tracking-[0.35em]">
							Status*
							<select
								id="product-location-select"
								value={status}
								onChange={(event) => setStatus(event.target.value)}
								className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm uppercase tracking-[0.2em] text-[#121213] outline-none transition focus:border-black/50 focus:ring-2 focus:ring-black/10 disabled:cursor-not-allowed disabled:opacity-50"
								required>
								<option value="" disabled>
									Selecione um status
								</option>
								{STATUS_SUGGESTIONS.map((suggestion) => (
									<option key={suggestion} value={suggestion}>
										{suggestion}
									</option>
								))}
							</select>
						</label>

						<label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f] sm:text-[11px] sm:tracking-[0.35em]">
							Observações
							<textarea
								value={notes}
								onChange={(event) => setNotes(event.target.value)}
								placeholder="Informações adicionais (opcional)"
								className="mt-2 min-h-[120px] w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#121213] outline-none transition focus:border-black/50 focus:ring-2 focus:ring-black/10 disabled:cursor-not-allowed disabled:opacity-50"
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
								className="w-full rounded-2xl bg-[#121213] px-4 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-white shadow-[0_16px_30px_rgba(0,0,0,0.15)] transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 sm:tracking-[0.45em]"
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
