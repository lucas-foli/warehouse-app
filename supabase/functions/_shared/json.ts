// supabase/functions/_shared/json.ts
export function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
      ...(init.headers as Record<string, string> | undefined ?? {}),
    },
  });
}

export function errorResponse(
  code: string,
  status = 400,
  extraHeaders: Record<string, string> = {},
): Response {
  return jsonResponse({ error: code }, { status }, extraHeaders);
}
