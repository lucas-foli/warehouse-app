export type UiPresetId = 'clean' | 'warm' | 'dark';

export type ThemeTokens = {
	background: string;
	foreground: string;
	card: string;
	'card-foreground': string;
	border: string;
	input: string;
	ring: string;
	primary: string;
	secondary: string;
	'primary-foreground': string;
	'secondary-foreground': string;
	muted: string;
	'muted-foreground': string;
	accent: string;
	'accent-foreground': string;
	'font-sans': string;
	'radius-card': string;
	'shadow-card': string;
};

export const DEFAULT_UI_PRESET: UiPresetId = 'clean';

export const UI_PRESETS: Record<UiPresetId, { label: string; tokens: ThemeTokens }> = {
	clean: {
		label: 'Default (Stanley)',
		tokens: {
			// Matches the original "Stanley Portal" look (light warm background, black CTAs)
			background: '60 14% 97%',
			foreground: '240 3% 7%',
			card: '0 0% 100%',
			'card-foreground': '240 3% 7%',
			border: '0 0% 90%',
			input: '0 0% 92%',
			ring: '240 3% 7%',
			primary: '240 3% 7%',
			secondary: '240 11% 96%',
			'primary-foreground': '216 100% 98%',
			'secondary-foreground': '240 3% 7%',
			muted: '240 11% 96%',
			'muted-foreground': '0 0% 44%',
			accent: '45 35% 91%',
			'accent-foreground': '240 3% 7%',
			'font-sans': "'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
			'radius-card': '24px',
			'shadow-card': '0 24px 60px rgba(0, 0, 0, 0.12)',
		},
	},
	warm: {
		label: 'Warm',
		tokens: {
			background: '36 33% 96%',
			foreground: '24 26% 12%',
			card: '0 0% 100%',
			'card-foreground': '24 26% 12%',
			border: '30 20% 88%',
			input: '30 20% 92%',
			ring: '20 90% 48%',
			primary: '24 26% 12%',
			secondary: '34 25% 93%',
			'primary-foreground': '0 0% 100%',
			'secondary-foreground': '24 26% 12%',
			muted: '34 25% 93%',
			'muted-foreground': '24 12% 42%',
			accent: '36 90% 60%',
			'accent-foreground': '24 26% 12%',
			'font-sans': "'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
			'radius-card': '24px',
			'shadow-card': '0 24px 60px rgba(0, 0, 0, 0.14)',
		},
	},
	dark: {
		label: 'Dark',
		tokens: {
			background: '222 47% 8%',
			foreground: '210 40% 98%',
			card: '222 47% 11%',
			'card-foreground': '210 40% 98%',
			border: '215 20% 20%',
			input: '215 20% 18%',
			ring: '214 60% 55%',
			primary: '210 40% 98%',
			secondary: '222 40% 14%',
			'primary-foreground': '222 47% 8%',
			'secondary-foreground': '210 40% 98%',
			muted: '222 40% 14%',
			'muted-foreground': '215 20% 70%',
			accent: '214 70% 50%',
			'accent-foreground': '210 40% 98%',
			'font-sans': "'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
			'radius-card': '24px',
			'shadow-card': '0 24px 70px rgba(0, 0, 0, 0.55)',
		},
	},
};

export const getPresetTokens = (preset?: string | null): ThemeTokens => {
	const key = (preset || DEFAULT_UI_PRESET).toLowerCase() as UiPresetId;
	return UI_PRESETS[key]?.tokens ?? UI_PRESETS[DEFAULT_UI_PRESET].tokens;
};
