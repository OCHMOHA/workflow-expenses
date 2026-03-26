import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type DeleteUserRequest = {
  user_id: string;
};

type DbRole = "COLLABORATEUR" | "RESPONSABLE" | "RESPONSABLE_N2" | "ADMINISTRATEUR";

function normalizeRole(roleRaw: unknown): DbRole | null {
  const s = (roleRaw ?? "").toString().trim();
  const lower = s.toLowerCase();
  if (lower === "collaborateur" || s === "COLLABORATEUR") return "COLLABORATEUR";
  if (lower === "responsable" || s === "RESPONSABLE") return "RESPONSABLE";
  if (
    lower === "responsable_n2" ||
    s === "RESPONSABLE_N2" ||
    lower === "responsable niveau 2" ||
    lower === "responsable niveau2" ||
    lower === "responsable niveau ii" ||
    lower === "responsable niveauii"
  )
    return "RESPONSABLE_N2";
  if (lower === "administrateur" || s === "ADMINISTRATEUR") return "ADMINISTRATEUR";
  return null;
}

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function jsonCors(origin: string | null, data: unknown, init?: ResponseInit) {
  return json(data, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...corsHeaders(origin),
    },
  });
}

const corsHeaders = (origin: string | null) => {
  const o = origin ?? "";
  const allowed = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];
  const allowOrigin = allowed.includes(o) ? o : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders(origin),
    });
  }

  const unauthorized = (message = "Unauthorized") => jsonCors(origin, { error: message }, { status: 401 });
  const forbidden = (message = "Forbidden") => jsonCors(origin, { error: message }, { status: 403 });
  const badRequest = (message: string) => jsonCors(origin, { error: message }, { status: 400 });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(origin),
      },
    });
  }

  const supabaseUrl = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(origin),
      },
    });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return unauthorized("Missing bearer token");
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData?.user) {
    return unauthorized("Invalid token");
  }

  const callerId = callerData.user.id;
  const { data: callerProfile, error: profileError } = await callerClient
    .from("profiles")
    .select("id, role")
    .eq("id", callerId)
    .maybeSingle();

  if (profileError) {
    return jsonCors(origin, { error: `Database error fetching caller profile: ${profileError.message}` }, { status: 500 });
  }

  const role = normalizeRole(callerProfile?.role);
  if (role !== "ADMINISTRATEUR") {
    return forbidden("Only administrateur can delete users");
  }

  let payload: DeleteUserRequest;
  try {
    payload = (await req.json()) as DeleteUserRequest;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const userId = (payload.user_id ?? "").toString().trim();
  if (!userId) return badRequest("user_id is required");

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Cleanup dependent rows that commonly reference profiles.id.
  // This prevents auth.admin.deleteUser from failing due to FK constraints.
  const { error: depensesSaisisseurErr } = await adminClient
    .from("depenses")
    .delete()
    .eq("saisisseur_id", userId);
  if (depensesSaisisseurErr) {
    return jsonCors(origin, { error: `Database cleanup failed (depenses.saisisseur_id): ${depensesSaisisseurErr.message}` }, { status: 500 });
  }

  const { error: depensesValideurErr } = await adminClient
    .from("depenses")
    .update({ valideur_id: null, reglee_par: null })
    .or(`valideur_id.eq.${userId},reglee_par.eq.${userId}`);
  if (depensesValideurErr) {
    return jsonCors(origin, { error: `Database cleanup failed (depenses.valideur_id/reglee_par): ${depensesValideurErr.message}` }, { status: 500 });
  }

  const { error: notificationsErr } = await adminClient
    .from("notifications")
    .delete()
    .eq("user_id", userId);
  if (notificationsErr) {
    return jsonCors(origin, { error: `Database cleanup failed (notifications.user_id): ${notificationsErr.message}` }, { status: 500 });
  }

  const { error: delError } = await adminClient.auth.admin.deleteUser(userId);
  if (delError) {
    return jsonCors(origin, { error: `Auth delete failed: ${delError.message}` }, { status: 500 });
  }

  const { error: profileDelError } = await adminClient.from("profiles").delete().eq("id", userId);
  if (profileDelError) {
    return jsonCors(origin, { error: `Database error deleting user profile: ${profileDelError.message}` }, { status: 500 });
  }

  return jsonCors(origin, { ok: true });
});
