// Maps structured error codes returned by Edge Functions (in the JSON body
// `{ error: <code>, message: ... }`) to user-facing strings.
//
// Supabase's `functions.invoke` collapses any non-2xx response into a
// `FunctionsHttpError` whose `.message` is the literal string
// "Edge Function returned a non-2xx status code". The actual error code lives
// only on the response body (`error.context`), so callers must read it
// asynchronously to surface anything useful.

const EDGE_ERROR_MESSAGES: Record<string, string> = {
	slug_taken: 'That workspace URL is already taken. Please choose a different one.',
	already_processed: 'This request has already been reviewed.',
	already_invited: 'This person already has a pending invitation.',
	already_member: 'This person is already a member of this workspace.',
	invalid_token: 'This invitation link is invalid.',
	expired: 'This invitation has expired. Ask an admin to send a new one.',
	revoked: 'This invitation has been revoked. Ask an admin to send a new one.',
	already_accepted: 'This invitation has already been accepted.',
	email_mismatch:
		'This invitation was sent to a different email address. Sign in with the correct account.',
};

export const EDGE_ERROR_FALLBACK = 'Something went wrong. Please try again.';

export const messageForEdgeErrorCode = (code: string | null | undefined): string => {
	if (!code) return EDGE_ERROR_FALLBACK;
	return EDGE_ERROR_MESSAGES[code] ?? EDGE_ERROR_FALLBACK;
};

export const parseEdgeErrorCode = async (error: unknown): Promise<string | null> => {
	const response = extractResponse(error);
	if (response) {
		const code = await readErrorCode(response);
		if (code) return code;
	}

	if (error && typeof error === 'object' && 'message' in error) {
		const message = (error as { message?: unknown }).message;
		if (typeof message === 'string') {
			const normalized = message.toLowerCase();
			for (const code of Object.keys(EDGE_ERROR_MESSAGES)) {
				if (normalized.includes(code)) return code;
			}
		}
	}

	return null;
};

const extractResponse = (error: unknown): Response | null => {
	if (!error || typeof error !== 'object') return null;
	const context = (error as { context?: unknown }).context;
	if (context instanceof Response) return context;
	return null;
};

const readErrorCode = async (response: Response): Promise<string | null> => {
	try {
		const text = await response.clone().text();
		if (!text) return null;
		const parsed = JSON.parse(text) as { error?: unknown };
		return typeof parsed.error === 'string' ? parsed.error : null;
	} catch {
		return null;
	}
};
