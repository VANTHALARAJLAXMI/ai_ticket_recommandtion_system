import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import { tooMany } from "../_shared/rateLimit.ts";

function clean(value: unknown, max: number) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse(req, { ok: false, message: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey || !authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse(req, { ok: false, message: "Sign in as an admin before adding an agent." }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData.user;
  if (userError || !user) {
    return jsonResponse(req, { ok: false, message: "Your session has expired. Sign in again." }, 401);
  }
  if (tooMany(`create-agent:${user.id}`, 8, 10 * 60 * 1000)) {
    return jsonResponse(req, { ok: false, message: "Too many attempts. Wait a few minutes and try again." }, 429);
  }

  const { data: caller } = await userClient
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!caller || caller.role !== "admin" || caller.is_active === false) {
    return jsonResponse(req, { ok: false, message: "Only an admin can add an agent." }, 403);
  }

  let body: { full_name?: string; email?: string; password?: string };
  try {
    const text = await req.text();
    if (text.length > 2000) return jsonResponse(req, { ok: false, message: "The request is too large." }, 400);
    body = text ? JSON.parse(text) : {};
  } catch {
    return jsonResponse(req, { ok: false, message: "The request could not be read." }, 400);
  }

  const fullName = clean(body.full_name, 80);
  const email = clean(body.email, 160).toLowerCase();
  const password = String(body.password ?? "");
  if (fullName.length < 2) {
    return jsonResponse(req, { ok: false, message: "Enter a name between 2 and 80 characters." }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse(req, { ok: false, message: "Enter a valid email address." }, 400);
  }
  if (password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return jsonResponse(req, { ok: false, message: "Use at least 8 characters, including a letter and a number." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (created.error || !created.data.user) {
    const message = String(created.error?.message || "");
    if (/already|exists|registered/i.test(message)) {
      return jsonResponse(req, { ok: false, message: "An account with this email already exists." }, 409);
    }
    return jsonResponse(req, { ok: false, message: "The agent account could not be created." }, 400);
  }

  const userId = created.data.user.id;
  const profile = {
    id: userId,
    email,
    full_name: fullName,
    role: "agent",
    is_active: true,
  };
  const saved = await admin
    .from("profiles")
    .upsert(profile, { onConflict: "id" })
    .select("id, full_name, email, role")
    .maybeSingle();

  if (saved.error || saved.data?.role !== "agent") {
    await admin.auth.admin.deleteUser(userId);
    return jsonResponse(req, { ok: false, message: "The agent account could not be created." }, 500);
  }

  return jsonResponse(req, { ok: true, agent: saved.data });
});
