import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

// We deliberately use the implicit flow (hash-fragment tokens) instead of PKCE.
// In a multi-tenant setup each tenant lives on its own subdomain (acme.example.com),
// but Supabase's "Redirect URLs" allowlist usually only lists the apex / Site URL,
// and PKCE's code_verifier is stored in localStorage — which is per-origin. That
// combination means a password-reset or magic-link initiated on acme.example.com
// and redirected back through the apex can never complete: the verifier is on the
// wrong origin. With implicit flow the tokens ride in the URL fragment, which we
// can forward from the apex to the correct subdomain without losing anything.
export const supabase = createClient(url, anonKey, {
	auth: {
		autoRefreshToken: true,
		persistSession: true,
		detectSessionInUrl: true,
		flowType: 'implicit',
	},
});
