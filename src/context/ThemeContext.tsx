/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useTenant } from './TenantContext';
import { supabase } from '../lib/supabaseClient';
import { DEFAULT_UI_PRESET, getPresetTokens, type ThemeTokens } from '../theme/presets';

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
	logoUrl: '/made-by-sark-black.jpeg',
	companyName: 'SARK',
	uiPreset: DEFAULT_UI_PRESET,
	themeTokens: getPresetTokens(DEFAULT_UI_PRESET),
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
		if (!parsed) return defaultTheme;
		return {
			...defaultTheme,
			...parsed,
			uiPreset: parsed.uiPreset || defaultTheme.uiPreset,
			themeTokens: parsed.themeTokens ? ({ ...defaultTheme.themeTokens, ...parsed.themeTokens } as ThemeTokens) : defaultTheme.themeTokens,
		};
	});

	useEffect(() => {
		if (!tenant) return;
		setThemeState({
			primaryColor: tenant.primaryColor,
			secondaryColor: tenant.secondaryColor,
			logoUrl: tenant.logoUrl,
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

			return { ...prev, ...newTheme, uiPreset: nextPreset, themeTokens: nextTokens };
		});

		if (!tenant) return;
		const payload: Record<string, unknown> = {};
		if (newTheme.companyName !== undefined) payload.company_name = newTheme.companyName;
		if (newTheme.logoUrl !== undefined) payload.logo_url = newTheme.logoUrl;
		if (newTheme.primaryColor !== undefined) payload.primary_color = newTheme.primaryColor;
		if (newTheme.secondaryColor !== undefined) payload.secondary_color = newTheme.secondaryColor;
		if (newTheme.uiPreset !== undefined) payload.ui_preset = newTheme.uiPreset;
		if (newTheme.themeTokens !== undefined) payload.theme_tokens = newTheme.themeTokens;

		patchTenant({
			companyName: newTheme.companyName ?? tenant.companyName,
			logoUrl: newTheme.logoUrl ?? tenant.logoUrl,
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
