import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useTenant } from '../context/TenantContext';
import { supabase } from '../lib/supabaseClient';
import { createInvitation } from '../services/invitations';
import { DEFAULT_UI_PRESET, getPresetTokens, type UiPresetId, UI_PRESETS } from '../theme/presets';
import { buildProductsFromCsvText, type ProductUpsertRow } from '../utils/csv';

interface OnboardingProps {
	onFinish: () => void;
}

const LOGO_BUCKET = 'tenant-logos';
const PRESET_OPTIONS: UiPresetId[] = ['warm', 'dark'];

const normalizePreset = (value?: string | null) => {
	const key = (value || DEFAULT_UI_PRESET).toLowerCase() as UiPresetId;
	return key === 'clean' ? 'warm' : key;
};

const Onboarding = ({ onFinish }: OnboardingProps) => {
	const { setTheme, primaryColor, secondaryColor, companyName, uiPreset } = useTheme();
	const { tenant, patchTenant } = useTenant();
	const [step, setStep] = useState<2 | 3 | 4>(2);
	const [inviteEmails, setInviteEmails] = useState<string[]>(['', '']);
	const [inviteError, setInviteError] = useState('');
	const [completing, setCompleting] = useState(false);
	const [localName, setLocalName] = useState(tenant ? companyName : '');
	const [localPrimary, setLocalPrimary] = useState(primaryColor);
	const [localSecondary, setLocalSecondary] = useState(secondaryColor);
	const [localPreset, setLocalPreset] = useState<UiPresetId>(normalizePreset(uiPreset));
	const [localLogo, setLocalLogo] = useState('');
	const [csvFile, setCsvFile] = useState<File | null>(null);
	const [previewData, setPreviewData] = useState<Record<string, string>[]>([]);
	const [csvRows, setCsvRows] = useState<ProductUpsertRow[]>([]);
	const [csvWarnings, setCsvWarnings] = useState<string[]>([]);
	const [csvError, setCsvError] = useState('');
	const [csvStats, setCsvStats] = useState<{ totalRows: number; validRows: number; skippedRows: number } | null>(null);
	const [loading, setLoading] = useState(false);
	const [savingIdentity, setSavingIdentity] = useState(false);
	const [identityError, setIdentityError] = useState('');
	const [importError, setImportError] = useState('');
	const [importedRows, setImportedRows] = useState<number | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [logoUploading, setLogoUploading] = useState(false);
	const [logoError, setLogoError] = useState('');
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const isCsvInvalid = Boolean(csvFile && csvRows.length === 0);
	const isFinishDisabled = loading || Boolean(csvError) || Boolean(importError) || isCsvInvalid || !tenant?.id;
	const isIdentityDisabled = savingIdentity || logoUploading || !localName.trim();

	useEffect(() => {
		if (!tenant) return;
		if (localName.trim()) return;
		setLocalName(tenant.companyName || companyName);
	}, [tenant, companyName, localName]);

	const handleIdentitySubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIdentityError('');
		setSavingIdentity(true);

		if (!tenant) {
			setSavingIdentity(false);
			setIdentityError('Tenant nao carregado ainda. Recarregue a pagina e tente novamente.');
			return;
		}

		const tenantLogo = tenant?.logoUrl?.trim() || '';
		const nextLogoUrl = localLogo || tenantLogo;
		const nextTokens = getPresetTokens(localPreset);

		const { error } = await supabase
			.from('tenants')
				.update({
					company_name: localName,
					logo_url: localLogo ? nextLogoUrl : tenantLogo || null,
				primary_color: localPrimary,
				secondary_color: localSecondary,
				ui_preset: localPreset,
				theme_tokens: nextTokens,
			})
			.eq('id', tenant.id);

		if (error) {
			setSavingIdentity(false);
			setIdentityError(error.message || 'Não foi possível salvar as configurações.');
			return;
		}

		patchTenant({
			companyName: localName,
			logoUrl: nextLogoUrl,
			primaryColor: localPrimary,
			secondaryColor: localSecondary,
			uiPreset: localPreset,
			themeTokens: nextTokens,
		});

		setTheme({
			companyName: localName,
			primaryColor: localPrimary,
			secondaryColor: localSecondary,
			logoUrl: nextLogoUrl,
			uiPreset: localPreset,
			themeTokens: nextTokens,
		});
		setStep(3);
		setSavingIdentity(false);
	};

	const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setLogoError('');
		if (!tenant?.id) {
			setLogoError('Tenant nao carregado ainda. Recarregue a pagina e tente novamente.');
			return;
		}

		const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
		const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
		const path = `${tenant.id}/${Date.now()}-${safeName}`;

		setLogoUploading(true);
		const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, {
			contentType: file.type || `image/${extension}`,
			upsert: true,
		});

		if (error) {
			setLogoError('Falha ao enviar logo. Verifique o bucket e tente novamente.');
			setLogoUploading(false);
			return;
		}

		const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
		setLocalLogo(data.publicUrl);
		setLogoUploading(false);
	};

	const readFileText = (file: File) =>
		new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result ?? ''));
			reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler arquivo.'));
			reader.readAsText(file);
		});

	const resetCsv = () => {
		setCsvFile(null);
		setPreviewData([]);
		setCsvRows([]);
		setCsvWarnings([]);
		setCsvStats(null);
		setCsvError('');
		setImportError('');
		setImportedRows(null);
	};

	const processCsvFile = async (file: File) => {
		setCsvError('');
		setImportError('');
		setImportedRows(null);
		setCsvWarnings([]);
		setCsvStats(null);

		if (!tenant?.id) {
			setCsvError('Tenant não carregado ainda. Recarregue a página e tente novamente.');
			return;
		}

		if (!file.name.toLowerCase().endsWith('.csv')) {
			setCsvError('Envie um arquivo .csv');
			return;
		}

		if (file.size > 10 * 1024 * 1024) {
			setCsvError('Arquivo muito grande (máximo 10MB).');
			return;
		}

		setCsvFile(file);
		try {
			const text = await readFileText(file);
			const result = buildProductsFromCsvText(text, tenant.id);
			setPreviewData(result.preview);
			setCsvRows(result.rows);
			setCsvWarnings(result.warnings);
			setCsvStats({ totalRows: result.totalRows, validRows: result.validRows, skippedRows: result.skippedRows });

			if (result.totalRows === 0) {
				setCsvError('CSV vazio ou inválido.');
				return;
			}

			if (result.validRows === 0) {
				setCsvError('Nenhuma linha válida encontrada. O CSV precisa ter colunas de SKU e nome.');
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Falha ao processar CSV.';
			setCsvError(message);
		}
	};

	const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		void processCsvFile(file);
	};

	const handleFinish = async () => {
		setLoading(true);
		setImportError('');

		try {
			if (!tenant?.id) {
				setImportError('Tenant não carregado ainda. Recarregue a página e tente novamente.');
				setLoading(false);
				return;
			}

			if (csvFile && csvRows.length === 0) {
				setImportError('CSV selecionado, mas sem linhas válidas para importar. Revise o arquivo e tente novamente.');
				setLoading(false);
				return;
			}

			if (csvRows.length > 0) {
				const chunkSize = 500;
				let uploaded = 0;

				for (let i = 0; i < csvRows.length; i += chunkSize) {
					const chunk = csvRows.slice(i, i + chunkSize);
					const { error } = await supabase
						.from('products')
						.upsert(chunk, { onConflict: 'tenant_id,sku', defaultToNull: false });
					if (error) {
						const message =
							error.message?.includes('there is no unique or exclusion constraint') ||
							error.message?.toLowerCase().includes('no unique')
								? 'Falta um índice único em (tenant_id, sku) na tabela products. Execute a migração/SQL que cria esse índice e tente novamente.'
								: error.message;
						throw new Error(message);
					}
					uploaded += chunk.length;
				}

				setImportedRows(uploaded);
			}

			setLoading(false);
			setStep(4);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Falha ao finalizar setup.';
			setImportError(message);
			setLoading(false);
		}
	};

	const handleComplete = async (opts: { sendInvites: boolean }) => {
		if (!tenant?.id) {
			setInviteError('Tenant not loaded — reload the page and try again.');
			return;
		}

		setCompleting(true);
		setInviteError('');

		const validEmailRe = /.+@.+\..+/;

		if (opts.sendInvites) {
			const cleaned = inviteEmails
				.map((e) => e.trim())
				.filter((e) => e.length > 0);
			const invalid = cleaned.find((e) => !validEmailRe.test(e));
			if (invalid) {
				setInviteError(`"${invalid}" is not a valid email.`);
				setCompleting(false);
				return;
			}

			const failures: string[] = [];
			for (const email of cleaned) {
				const result = await createInvitation({
					tenant_id: tenant.id,
					email,
					role: 'member',
				});
				if (!result.ok && result.error !== 'already_invited' && result.error !== 'already_member') {
					failures.push(`${email}: ${result.error}`);
				}
			}

			if (failures.length > 0) {
				setInviteError(`Some invites failed:\n${failures.join('\n')}`);
				setCompleting(false);
				return;
			}
		}

		const { error: onboardError } = await supabase
			.from('tenants')
			.update({ is_onboarded: true })
			.eq('id', tenant.id);
		if (onboardError) {
			setInviteError(onboardError.message || 'Failed to finish setup.');
			setCompleting(false);
			return;
		}

		patchTenant({ isOnboarded: true });
		setCompleting(false);
		onFinish();
	};

	const step2_Identity = (
		<div className="space-y-6">
			<div>
				<label className="block text-sm font-medium text-muted-foreground">Nome da Empresa</label>
				<input
					type="text"
					value={localName}
					onChange={(e) => setLocalName(e.target.value)}
					className="mt-1 block w-full rounded-md border border-input bg-card p-2 text-sm text-foreground shadow-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
				/>
			</div>

			<div className="grid grid-cols-2 gap-4">
				<div>
					<label className="block text-sm font-medium text-muted-foreground">Cor Primaria</label>
					<div className="mt-1 flex items-center gap-2">
						<input
							type="color"
							value={localPrimary}
							onChange={(e) => setLocalPrimary(e.target.value)}
							className="h-10 w-10 cursor-pointer rounded border p-1"
						/>
						<span className="text-xs text-muted-foreground">{localPrimary}</span>
					</div>
				</div>
				<div>
					<label className="block text-sm font-medium text-muted-foreground">Cor Secundaria</label>
					<div className="mt-1 flex items-center gap-2">
						<input
							type="color"
							value={localSecondary}
							onChange={(e) => setLocalSecondary(e.target.value)}
							className="h-10 w-10 cursor-pointer rounded border p-1"
						/>
						<span className="text-xs text-muted-foreground">{localSecondary}</span>
					</div>
				</div>
			</div>

			<div>
				<label className="block text-sm font-medium text-muted-foreground">Estilo (UI Preset)</label>
				<select
					value={localPreset}
					onChange={(e) => {
						const nextPreset = e.target.value as UiPresetId;
						setLocalPreset(nextPreset);
						setTheme({ uiPreset: nextPreset, themeTokens: getPresetTokens(nextPreset) });
					}}
					className="mt-1 block w-full cursor-pointer rounded-md border border-input bg-card p-2 text-sm text-foreground shadow-sm outline-none transition hover:border-border/70 focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
				>
					{PRESET_OPTIONS.map((key) => (
						<option key={key} value={key}>
							{UI_PRESETS[key].label}
						</option>
					))}
				</select>
			</div>

			<div>
				<label className="block text-sm font-medium text-muted-foreground">Logo (Upload)</label>
				<input
					type="file"
					accept="image/*"
					onChange={handleLogoUpload}
					className="mt-1 block w-full text-sm text-muted-foreground file:mr-4 file:rounded-full file:border-0 file:bg-muted file:px-4 file:py-2 file:text-sm file:font-semibold file:text-foreground hover:file:bg-muted/70"
				/>
				{logoUploading && <p className="mt-2 text-xs text-muted-foreground">Enviando logo...</p>}
				{logoError && (
					<p className="mt-2 text-xs text-red-600">{logoError}</p>
				)}
				{localLogo && (
					<div className="mt-4">
						<p className="text-xs text-muted-foreground mb-2">Preview:</p>
						<img src={localLogo} alt="Logo Preview" className="h-12 w-auto object-contain" />
					</div>
				)}
			</div>

			<button
				onClick={handleIdentitySubmit}
				disabled={isIdentityDisabled}
				className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring/25 disabled:opacity-60"
			>
				{savingIdentity ? 'Salvando…' : 'Proximo: Dados'}
			</button>

			{identityError && (
				<div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">
					{identityError}
				</div>
			)}
		</div>
	);

	const step3_Data = (
		<div className="space-y-6">
					<div>
						<label className="block text-sm font-medium text-muted-foreground">Upload de Dados (CSV)</label>
						<div
							className={`mt-1 flex justify-center rounded-md border-2 border-dashed px-6 pt-5 pb-6 ${
								isDragging ? 'border-ring/60 bg-muted/40' : 'border-border/40'
							}`}
							role="button"
							tabIndex={0}
							onClick={() => fileInputRef.current?.click()}
							onKeyDown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									fileInputRef.current?.click();
								}
							}}
							onDragOver={(e) => {
								e.preventDefault();
								setIsDragging(true);
							}}
							onDragLeave={() => setIsDragging(false)}
							onDrop={(e) => {
								e.preventDefault();
								setIsDragging(false);
								const file = e.dataTransfer.files?.[0];
								if (file) void processCsvFile(file);
							}}
						>
							<div className="space-y-1 text-center">
								<svg
									className="mx-auto h-12 w-12 text-muted-foreground"
								stroke="currentColor"
								fill="none"
								viewBox="0 0 48 48"
								aria-hidden="true"
						>
							<path
								d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
								strokeWidth={2}
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
							</svg>
								<div className="flex text-sm text-muted-foreground justify-center">
									<label
										htmlFor="file-upload"
										className="relative cursor-pointer rounded-md bg-card font-medium text-primary focus-within:outline-none focus-within:ring-2 focus-within:ring-ring/25 focus-within:ring-offset-2 hover:text-primary/90"
									>
										<span>Enviar arquivo</span>
										<input
											ref={fileInputRef}
											id="file-upload"
											name="file-upload"
											type="file"
											className="sr-only"
											onChange={handleCsvUpload}
											accept=".csv"
										/>
									</label>
									<p className="pl-1">ou arraste e solte</p>
								</div>
								<p className="text-xs text-muted-foreground">CSV até 10MB</p>
								{csvFile && (
									<div className="pt-2 text-xs text-muted-foreground">
										<span className="font-medium text-foreground">{csvFile.name}</span>
										{csvStats && (
											<span className="pl-2">
												{csvStats.validRows} válidas • {csvStats.skippedRows} ignoradas
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
							</div>
						</div>
					</div>

				{csvError && (
					<div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">
						{csvError}
					</div>
				)}

				{csvWarnings.length > 0 && (
					<div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
						<ul className="list-disc pl-5">
							{csvWarnings.map((w) => (
								<li key={w}>{w}</li>
							))}
						</ul>
					</div>
				)}

				{previewData.length > 0 && (
					<div className="mt-4">
						<h4 className="text-sm font-medium text-foreground">Preview dos dados</h4>
					<div className="mt-2 flex flex-col">
						<div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
							<div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
								<div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
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
											{previewData.map((row, i) => (
												<tr key={i}>
													{Object.values(row).slice(0, 4).map((val, j) => (
														<td key={j} className="whitespace-nowrap px-3 py-4 text-xs text-muted-foreground">
															{val}
														</td>
													))}
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						</div>
					</div>
				</div>
				)}

				{importedRows !== null && (
					<div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
						Importação concluída: {importedRows} produtos enviados.
					</div>
				)}

				{importError && (
					<div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">
						{importError}
					</div>
				)}

					<div className="flex justify-between gap-4">
						<button
							onClick={() => setStep(2)}
							className="w-full inline-flex justify-center rounded-md border border-border/40 shadow-sm px-4 py-2 bg-card text-base font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring/25 sm:text-sm"
						>
							Voltar
						</button>
							<button
								onClick={handleFinish}
								disabled={isFinishDisabled}
								className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring/25 sm:text-sm disabled:opacity-50"
							>
							{loading ? 'Salvando...' : 'Próximo: Convites'}
						</button>
					</div>
			</div>
		);

	const handleInviteEmailChange = (index: number, value: string) => {
		setInviteEmails((current) => {
			const next = [...current];
			next[index] = value;
			return next;
		});
	};

	const step4_Invites = (
		<div className="space-y-6">
			<div>
				<h3 className="text-base font-semibold text-foreground">Invite a teammate or two</h3>
				<p className="mt-1 text-sm text-muted-foreground">
					Optional — you can always invite people later from the Team page.
				</p>
			</div>

			<div className="space-y-3">
				{inviteEmails.map((value, idx) => (
					<input
						key={idx}
						type="email"
						value={value}
						onChange={(e) => handleInviteEmailChange(idx, e.target.value)}
						placeholder="teammate@company.com"
						className="block w-full rounded-md border border-input bg-card p-2 text-sm text-foreground shadow-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
					/>
				))}
			</div>

			{inviteError && (
				<div className="whitespace-pre-line rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">
					{inviteError}
				</div>
			)}

			<div className="flex justify-between gap-4">
				<button
					onClick={() => handleComplete({ sendInvites: false })}
					disabled={completing}
					className="w-full inline-flex justify-center rounded-md border border-border/40 shadow-sm px-4 py-2 bg-card text-base font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring/25 sm:text-sm disabled:opacity-50"
				>
					Skip for now
				</button>
				<button
					onClick={() => handleComplete({ sendInvites: true })}
					disabled={completing || inviteEmails.every((e) => e.trim() === '')}
					className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring/25 sm:text-sm disabled:opacity-50"
				>
					{completing ? 'Finishing…' : 'Send invites & finish'}
				</button>
			</div>
		</div>
	);

	return (
		<div className="min-h-screen bg-background text-foreground flex flex-col justify-center py-12 sm:px-6 lg:px-8">
			<div className="sm:mx-auto sm:w-full sm:max-w-md">
				<h2 className="mt-6 text-center text-3xl font-extrabold text-foreground">
					Bem-vindo ao Warehouse
				</h2>
				<p className="mt-2 text-center text-sm text-muted-foreground">
					Vamos configurar sua área de trabalho personalizada.
				</p>
			</div>

			<div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
				<div className="bg-card py-8 px-4 shadow-[var(--shadow-card)] sm:rounded-[var(--radius-card)] sm:px-10">
					<div className="mb-8">
						<nav aria-label="Progress">
							<ol role="list" className="flex items-center">
								<li className={`relative pr-6 sm:pr-12 ${step === 2 ? 'text-primary' : 'text-muted-foreground'}`}>
									<div className="absolute inset-0 flex items-center" aria-hidden="true">
										<div className="h-0.5 w-full bg-border/30"></div>
									</div>
									<a
										href="#"
										className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full shadow-sm ${
											step >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
										}`}
									>
										<span className="text-xs font-semibold" aria-hidden="true">1</span>
									</a>
									<span className="mt-2 absolute top-8 text-xs font-semibold">Identidade</span>
								</li>
								<li className={`relative pr-6 sm:pr-12 ${step === 3 ? 'text-primary' : 'text-muted-foreground'}`}>
									<div className="absolute inset-0 flex items-center" aria-hidden="true">
										<div className="h-0.5 w-full bg-border/30"></div>
									</div>
									<a
										href="#"
										className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full shadow-sm ${
											step >= 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
										}`}
									>
										<span className="text-xs font-semibold" aria-hidden="true">2</span>
									</a>
									<span className="mt-2 absolute top-8 text-xs font-semibold text-center w-full">Dados</span>
								</li>
								<li className={`relative ${step === 4 ? 'text-primary' : 'text-muted-foreground'}`}>
									<div className="absolute inset-0 flex items-center" aria-hidden="true">
										<div className="h-0.5 w-full bg-border/30"></div>
									</div>
									<a
										href="#"
										className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full shadow-sm ${
											step >= 4 ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
										}`}
									>
										<span className="text-xs font-semibold" aria-hidden="true">3</span>
									</a>
									<span className="mt-2 absolute top-8 text-xs font-semibold text-center w-full">Convites</span>
								</li>
							</ol>
						</nav>
					</div>

					{step === 2 ? step2_Identity : step === 3 ? step3_Data : step4_Invites}
				</div>
			</div>
		</div>
	);
};

export default Onboarding;
