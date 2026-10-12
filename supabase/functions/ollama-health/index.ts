import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import { ollamaConfig, ollamaHeaders } from "../_shared/ollama.ts";
import { tooMany } from "../_shared/rateLimit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse(req, { ok: false, message: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!supabaseUrl || !anonKey || !authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse(req, { ok: false, message: "Sign in before checking the AI service." }, 401);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return jsonResponse(req, { ok: false, message: "Your session has expired. Sign in again." }, 401);
  if (tooMany(`health:${userData.user.id}`, 20, 10 * 60 * 1000)) {
    return jsonResponse(req, { ok: false, message: "Too many status checks. Wait a moment and try again." }, 429);
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
  if (!profile || (profile.role !== "agent" && profile.role !== "admin")) {
    return jsonResponse(req, { ok: false, message: "Only support staff can check the AI service." }, 403);
  }

  const config = ollamaConfig();
  if ("error" in config) return jsonResponse(req, { ok: false, message: config.error });

  try {
    const response = await fetch(`${config.base}/api/tags`, {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: ollamaHeaders(config.apiKey),
    });
    if (!response.ok) {
      return jsonResponse(req, { ok: false, message: "The Ollama API is unreachable." });
    }
    const payload = await response.json();
    const names = Array.isArray(payload?.models)
      ? payload.models.map((model: { name?: string }) => model?.name ?? "")
      : [];
    const ready = names.some((name: string) => name === config.model || name.startsWith(`${config.model}:`));
    return jsonResponse(req, {
      ok: ready,
      message: ready
        ? "The Ollama API is reachable and the configured model is available."
        : "The Ollama API responded, but the configured model is not available.",
    });
  } catch {
    return jsonResponse(req, { ok: false, message: "The Ollama API is unreachable." });
  }
});
