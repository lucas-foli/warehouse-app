/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useTenant } from './TenantContext';
import { supabase } from '../lib/supabaseClient';
import { DEFAULT_UI_PRESET, getPresetTokens, type ThemeTokens } from '../theme/presets';
import { isLocalhost, resolveSarkLogoLocalUrl, resolveSarkLogoStorageUrl, resolveSarkLogoUrl } from '../utils/helpers';

interface Theme {
	primaryColor: string;
	secondaryColor: string;
	logoUrl: string;
	companyName: string;
	uiPreset: string;
	themeTokens: ThemeTokens;
}

interface ThemeContextType extends Theme {
	setTheme: (theme: Partial<Theme>) => void;
	resetTheme: () => void;
}

const defaultTheme: Theme = {
	primaryColor: '#394e6b',
	secondaryColor: '#46b280',
	logoUrl: '',
	companyName: 'SARK',
	uiPreset: DEFAULT_UI_PRESET,
	themeTokens: getPresetTokens(DEFAULT_UI_PRESET),
};

const resolveDefaultLogo = (preset: string) => resolveSarkLogoUrl(preset);

const isDefaultLogo = (url: string) => {
	if (!url) return true;
	if (!isLocalhost() && url.startsWith('/')) return true;
	const storageBlack = resolveSarkLogoStorageUrl('warm');
	const storageWhite = resolveSarkLogoStorageUrl('dark');
	const localBlack = resolveSarkLogoLocalUrl('warm');
	const localWhite = resolveSarkLogoLocalUrl('dark');
	if (url === storageBlack || url === storageWhite || url === localBlack || url === localWhite) return true;
	return url.includes('made-by-sark');
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const applyThemeToDocument = (theme: Theme) => {
	const root = document.documentElement;
	root.style.setProperty('--primary-color', theme.primaryColor);
	root.style.setProperty('--secondary-color', theme.secondaryColor);

	for (const [key, value] of Object.entries(theme.themeTokens)) {
		if (typeof value === 'string') root.style.setProperty(`--${key}`, value);
	}
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
	const { tenant, patchTenant } = useTenant();
	const [theme, setThemeState] = useState<Theme>(() => {
		const stored = localStorage.getItem('app_theme');
		const parsed = stored ? (JSON.parse(stored) as Partial<Theme>) : null;
		if (!parsed) {
			return {
				...defaultTheme,
				logoUrl: resolveDefaultLogo(defaultTheme.uiPreset),
			};
		}
		return {
			...defaultTheme,
			...parsed,
			uiPreset: parsed.uiPreset || defaultTheme.uiPreset,
			themeTokens: parsed.themeTokens
				? ({ ...defaultTheme.themeTokens, ...parsed.themeTokens } as ThemeTokens)
				: defaultTheme.themeTokens,
			logoUrl:
				parsed.logoUrl && parsed.logoUrl.trim() && !isDefaultLogo(parsed.logoUrl)
					? parsed.logoUrl
					: resolveDefaultLogo(parsed.uiPreset || defaultTheme.uiPreset),
		};
	});

	useEffect(() => {
		if (!tenant) return;
		const resolvedLogo =
			tenant.logoUrl?.trim() && !isDefaultLogo(tenant.logoUrl)
				? tenant.logoUrl
				: resolveDefaultLogo(tenant.uiPreset || DEFAULT_UI_PRESET);
		setThemeState({
			primaryColor: tenant.primaryColor,
			secondaryColor: tenant.secondaryColor,
			logoUrl: resolvedLogo,
			companyName: tenant.companyName,
			uiPreset: tenant.uiPreset,
			themeTokens: tenant.themeTokens,
		});
	}, [tenant]);

	useEffect(() => {
		localStorage.setItem('app_theme', JSON.stringify(theme));

		applyThemeToDocument(theme);
	}, [theme]);

	const setTheme = (newTheme: Partial<Theme>) => {
		setThemeState((prev) => {
			const nextPreset = newTheme.uiPreset ?? prev.uiPreset;
			const presetTokens = getPresetTokens(nextPreset);
			const nextTokens = newTheme.themeTokens
				? ({ ...presetTokens, ...newTheme.themeTokens } as ThemeTokens)
				: prev.uiPreset !== nextPreset
					? presetTokens
					: prev.themeTokens;
			const currentLogo = newTheme.logoUrl ?? prev.logoUrl;
			const nextLogo =
				newTheme.logoUrl !== undefined
					? newTheme.logoUrl
					: isDefaultLogo(currentLogo) || !currentLogo
						? resolveDefaultLogo(nextPreset)
						: currentLogo;

			return { ...prev, ...newTheme, uiPreset: nextPreset, themeTokens: nextTokens, logoUrl: nextLogo };
		});

		if (!tenant) return;
		const payload: Record<string, unknown> = {};
		if (newTheme.companyName !== undefined) payload.company_name = newTheme.companyName;
		if (newTheme.logoUrl !== undefined) payload.logo_url = newTheme.logoUrl;
		if (newTheme.primaryColor !== undefined) payload.primary_color = newTheme.primaryColor;
		if (newTheme.secondaryColor !== undefined) payload.secondary_color = newTheme.secondaryColor;
		if (newTheme.uiPreset !== undefined) payload.ui_preset = newTheme.uiPreset;
		if (newTheme.themeTokens !== undefined) payload.theme_tokens = newTheme.themeTokens;

		const resolvedLogo =
			newTheme.logoUrl !== undefined
				? newTheme.logoUrl
				: tenant.logoUrl?.trim()
					? tenant.logoUrl
					: resolveDefaultLogo(newTheme.uiPreset ?? tenant.uiPreset);

		patchTenant({
			companyName: newTheme.companyName ?? tenant.companyName,
			logoUrl: resolvedLogo,
			primaryColor: newTheme.primaryColor ?? tenant.primaryColor,
			secondaryColor: newTheme.secondaryColor ?? tenant.secondaryColor,
			uiPreset: newTheme.uiPreset ?? tenant.uiPreset,
			themeTokens: newTheme.themeTokens ? ({ ...tenant.themeTokens, ...newTheme.themeTokens } as ThemeTokens) : tenant.themeTokens,
		});

		if (Object.keys(payload).length === 0) return;

		void supabase.from('tenants').update(payload).eq('id', tenant.id);
	};

	const resetTheme = () => {
		setThemeState(defaultTheme);
		localStorage.removeItem('app_theme');

		if (!tenant) return;
		patchTenant({
			companyName: defaultTheme.companyName,
			logoUrl: defaultTheme.logoUrl,
			primaryColor: defaultTheme.primaryColor,
			secondaryColor: defaultTheme.secondaryColor,
			uiPreset: defaultTheme.uiPreset,
			themeTokens: defaultTheme.themeTokens,
		});
		void supabase
			.from('tenants')
			.update({
				company_name: defaultTheme.companyName,
				logo_url: defaultTheme.logoUrl,
				primary_color: defaultTheme.primaryColor,
				secondary_color: defaultTheme.secondaryColor,
				ui_preset: defaultTheme.uiPreset,
				theme_tokens: defaultTheme.themeTokens,
			})
			.eq('id', tenant.id);
	};

	return (
		<ThemeContext.Provider value={{ ...theme, setTheme, resetTheme }}>
			{children}
		</ThemeContext.Provider>
	);
};

export const useTheme = () => {
	const context = useContext(ThemeContext);
	if (context === undefined) {
		throw new Error('useTheme must be used within a ThemeProvider');
	}
	return context;
};
