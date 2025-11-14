import type { Session } from '@supabase/supabase-js';
import { motion } from 'framer-motion';
import { useState } from 'react';

const STATUS_UPDATE_WEBHOOK_URL =
	import.meta.env.VITE_STATUS_UPDATE_WEBHOOK_URL ?? 'https://n8n.go-fly.ai/webhook/product-location';
const STATUS_SUGGESTIONS = ['ESTOQUE', 'VM/GAVETA'];
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
		<div className="relative min-h-screen overflow-hidden bg-[#030712] text-white">
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.03),transparent_50%)]" />
				<div className="absolute -top-32 right-10 h-[420px] w-[420px] rounded-full bg-[#FFB9A3]/20 blur-3xl" />
				<div className="absolute -bottom-40 left-0 h-[460px] w-[460px] rounded-full bg-[#00f6ff]/15 blur-3xl" />
			</div>

			<div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-4 py-16 sm:px-6 lg:px-10">
				<motion.div
					initial={{ opacity: 0, y: 32 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, ease: 'easeOut' }}
					className="relative w-full max-w-2xl rounded-[32px] border border-white/10 bg-gradient-to-br from-[#070707]/90 via-[#0B0C11]/90 to-[#09090E]/90 p-10 shadow-[0_35px_90px_rgba(0,0,0,0.65)] backdrop-blur-2xl">
					<div className="flex flex-col gap-4 text-center">
						<button
							type="button"
							onClick={onBack}
							className="self-start rounded-full border border-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-white/60 transition hover:border-white/30 hover:text-white">
							Voltar
						</button>
						<p className="text-xs uppercase tracking-[0.3em] text-white/60">Formulário interno</p>
						<h1 className="text-3xl font-semibold uppercase tracking-[0.4em] text-white">Atualização Status Produto</h1>
						<p className="text-sm text-white/70">
							Envie o código de barras e o status desejado. Os envios ficarão vinculados ao usuário{' '}
							<span className="font-semibold text-white">{userEmail}</span>.
						</p>
					</div>

					<form onSubmit={handleSubmit} className="mt-10 space-y-6">
						<div>
							<label className="block text-left text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">
								Foto do código de barras
							</label>
							<div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
								<label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white transition hover:border-white/30 hover:text-white">
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
								<span className="truncate text-xs uppercase tracking-[0.2em] text-white/50">
									{barcodePhotos.length > 0
										? `${barcodePhotos.length} arquivo${barcodePhotos.length > 1 ? 's' : ''} selecionado${
												barcodePhotos.length > 1 ? 's' : ''
										  }`
										: 'Nenhum arquivo selecionado'}
								</span>
							</div>
						</div>

						<label className="block text-left text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">
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
										className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50"
										autoComplete="off"
									/>
									<button
										type="button"
										onClick={() => addBarcodesFromValue(barcodeInput)}
										className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-white transition hover:border-white/30 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40">
										Adicionar
									</button>
								</div>
								<p className="text-[10px] uppercase tracking-[0.3em] text-white/40">
									Pressione Enter a cada leitura ou cole vários códigos separados por espaço, vírgula ou quebra de
									linha.
								</p>
								{barcodes.length > 0 && (
									<div className="flex flex-wrap gap-2">
										{barcodes.map((code) => (
											<span
												key={code}
												className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-white">
												{code}
												<button
													type="button"
													onClick={() => removeBarcode(code)}
													className="text-white/60 transition hover:text-white disabled:pointer-events-none disabled:opacity-40"
													aria-label={`Remover código ${code}`}>
													×
												</button>
											</span>
										))}
									</div>
								)}
							</div>
						</label>

						<label className="block text-left text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">
							Status
							<select
								id="product-location-select"
								value={status}
								onChange={(event) => setStatus(event.target.value)}
								className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm uppercase tracking-[0.2em] text-white outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50"
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

						<label className="block text-left text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">
							Observações
							<textarea
								value={notes}
								onChange={(event) => setNotes(event.target.value)}
								placeholder="Informações adicionais (opcional)"
								className="mt-2 min-h-[120px] w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50"
							/>
						</label>

						{feedback && (
							<div
								className={`rounded-2xl border px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] ${
									feedback.type === 'success'
										? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
										: 'border-red-400/30 bg-red-400/10 text-red-200'
								}`}>
								{feedback.text}
							</div>
						)}

						<button
							type="submit"
							className="w-full rounded-2xl bg-gradient-to-r from-white via-white to-[#ffd9cd] px-4 py-3 text-sm font-semibold uppercase tracking-[0.45em] text-black shadow-[0_18px_45px_rgba(0,0,0,0.35)] transition hover:translate-y-[-1px] hover:shadow-[0_22px_55px_rgba(0,0,0,0.45)] disabled:cursor-not-allowed disabled:opacity-50"
							disabled={submitting}>
							{submitting ? 'Enviando…' : 'Enviar'}
						</button>
					</form>
				</motion.div>
			</div>
		</div>
	);
};

export default StatusUpdateForm;
