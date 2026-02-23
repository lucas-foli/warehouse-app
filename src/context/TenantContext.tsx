/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { DEFAULT_UI_PRESET, getPresetTokens, type ThemeTokens } from '../theme/presets';

export type Tenant = {
	id: string;
	slug: string;
	companyName: string;
	logoUrl: string;
	primaryColor: string;
	secondaryColor: string;
	uiPreset: string;
	themeTokens: ThemeTokens;
	isOnboarded: boolean;
};

type TenantContextValue = {
	tenantSlug: string;
	tenant: Tenant | null;
	tenantLoading: boolean;
	tenantError: string | null;
	refreshTenant: () => Promise<void>;
	patchTenant: (partial: Partial<Tenant>) => void;
};

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

const resolveTenantSlug = () => {
	if (typeof window !== 'undefined') {
		const params = new URLSearchParams(window.location.search);
		const querySlug = params.get('slug')?.trim().toLowerCase();
		if (querySlug) return querySlug;
	}

	const explicit = import.meta.env.VITE_TENANT_SLUG as string | undefined;
	if (explicit && explicit.trim()) return explicit.trim().toLowerCase();

	const hostname = window.location.hostname.toLowerCase();
	const defaultSlug = (import.meta.env.VITE_DEFAULT_TENANT_SLUG as string | undefined)?.trim().toLowerCase() || 'default';

	if (hostname === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
		return defaultSlug;
	}

	const baseDomain = (import.meta.env.VITE_BASE_DOMAIN as string | undefined)?.trim().toLowerCase();
	if (baseDomain && hostname.endsWith(baseDomain)) {
		const remaining = hostname.slice(0, Math.max(0, hostname.length - baseDomain.length)).replace(/\.$/, '');
		const parts = remaining.split('.').filter(Boolean);
		return (parts[parts.length - 1] || defaultSlug).toLowerCase();
	}

	const parts = hostname.split('.').filter(Boolean);
	if (parts.length >= 3) return parts[0];

	return defaultSlug;
};

const mergeThemeTokens = (preset: string, raw: unknown): ThemeTokens => {
	const base = getPresetTokens(preset);
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;

	const merged = { ...base, ...(raw as Record<string, string>) } as ThemeTokens;
	if (preset.toLowerCase() === 'dark' && merged.primary === merged['primary-foreground']) {
		return { ...merged, 'primary-foreground': merged.background || base.background };
	}
	return merged;
};

const mapTenantRow = (row: Record<string, unknown>): Tenant => {
	const str = (key: string) => {
		const value = row[key];
		if (typeof value === 'string') return value;
		if (typeof value === 'number') return String(value);
		return '';
	};

	const bool = (key: string) => {
		const value = row[key];
		if (typeof value === 'boolean') return value;
		return Boolean(value);
	};

	const preset = str('ui_preset') || DEFAULT_UI_PRESET;

	return {
		id: str('id'),
		slug: str('slug'),
		companyName: str('company_name') || str('companyName') || 'Empresa',
		logoUrl: str('logo_url') || str('logoUrl'),
		primaryColor: str('primary_color') || str('primaryColor') || '#394e6b',
		secondaryColor: str('secondary_color') || str('secondaryColor') || '#46b280',
		uiPreset: preset,
		themeTokens: mergeThemeTokens(preset, row['theme_tokens']),
		isOnboarded: bool('is_onboarded') || bool('isOnboarded'),
	};
};

export const TenantProvider = ({ children }: { children: React.ReactNode }) => {
	const [tenantSlug] = useState(resolveTenantSlug);
	const [tenant, setTenant] = useState<Tenant | null>(null);
	const [tenantLoading, setTenantLoading] = useState(true);
	const [tenantError, setTenantError] = useState<string | null>(null);

	const patchTenant = useCallback((partial: Partial<Tenant>) => {
		setTenant((current) => (current ? { ...current, ...partial } : current));
	}, []);

	const refreshTenant = useCallback(async () => {
		setTenantError(null);
		setTenantLoading(true);
		try {
			// First try the full tenants table (works for authenticated members)
			const { data, error } = await supabase.from('tenants').select('*').eq('slug', tenantSlug).maybeSingle();

			if (data && !error) {
				setTenant(mapTenantRow(data));
				setTenantLoading(false);
				return;
			}

			// Fall back to the branding-only view (works for anon/pre-auth — login page theming)
			const { data: brandingData, error: brandingError } = await supabase
				.from('tenant_branding')
				.select('*')
				.eq('slug', tenantSlug)
				.maybeSingle();

			if (brandingError) throw brandingError;

			if (brandingData) {
				setTenant(mapTenantRow({ ...brandingData, id: '', is_onboarded: false }));
			} else {
				setTenant(null);
				setTenantError(`Tenant "${tenantSlug}" não encontrado.`);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Erro ao carregar tenant.';
			setTenant(null);
			setTenantError(message);
		} finally {
			setTenantLoading(false);
		}
	}, [tenantSlug]);

	useEffect(() => {
		void refreshTenant();
	}, [refreshTenant]);

	const value = useMemo<TenantContextValue>(
		() => ({ tenantSlug, tenant, tenantLoading, tenantError, refreshTenant, patchTenant }),
		[patchTenant, refreshTenant, tenant, tenantError, tenantLoading, tenantSlug],
	);

	return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
};

export const useTenant = () => {
	const context = useContext(TenantContext);
	if (context === undefined) {
		throw new Error('useTenant must be used within a TenantProvider');
	}
	return context;
};
