import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Verify the caller is authenticated
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // The Supabase API gateway already validated the JWT signature before
  // this function runs. We can safely decode the payload to extract the
  // user ID and email without an extra API round-trip.
  const token = authHeader.replace("Bearer ", "");
  let userId: string;
  let userEmail: string | undefined;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    userId = payload.sub;
    userEmail = payload.email;
    if (!userId) throw new Error("missing sub claim");
  } catch {
    return new Response(JSON.stringify({ error: "Malformed token" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Parse and validate the request body
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const tenantId = payload.tenantId;
  if (!tenantId || typeof tenantId !== "string") {
    return new Response(JSON.stringify({ error: "Missing tenantId" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Use service-role client to verify admin membership (bypasses RLS)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: membership, error: memberError } = await supabaseAdmin
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memberError || !membership || membership.role !== "admin") {
    return new Response(
      JSON.stringify({ error: "Forbidden: admin role required" }),
      {
        status: 403,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  // Validate required fields
  const status = payload.status;
  if (!status || typeof status !== "string" || !status.trim()) {
    return new Response(
      JSON.stringify({ error: "Missing or empty 'status' field" }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  // Forward to n8n webhook (URL stored as Edge Function secret, never in client code)
  const webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
  if (!webhookUrl) {
    console.error("N8N_WEBHOOK_URL secret not configured");
    return new Response(
      JSON.stringify({ error: "Webhook not configured" }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const n8nResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        submittedBy: userEmail,
        submittedById: userId,
      }),
    });

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error("n8n webhook error:", errorText);
      return new Response(
        JSON.stringify({ error: "Webhook forwarding failed" }),
        {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Failed to reach webhook:", err);
    return new Response(
      JSON.stringify({ error: "Failed to reach webhook" }),
      {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }
});
