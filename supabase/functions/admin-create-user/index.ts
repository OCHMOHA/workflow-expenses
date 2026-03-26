import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type CreateUserRequest = {
  username: string;
  password: string;
  matricule?: string;
  nom_complet?: string;
  role:
    | "collaborateur"
    | "responsable"
    | "responsable niveau 2"
    | "administrateur"
    | "COLLABORATEUR"
    | "RESPONSABLE"
    | "RESPONSABLE_N2"
    | "ADMINISTRATEUR";
};

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

function normalizeRole(roleRaw: unknown): CreateUserRequest["role"] | null {
  const s = (roleRaw ?? "").toString().trim();
  const lower = s.toLowerCase();
  if (lower === "collaborateur" || s === "COLLABORATEUR") return "COLLABORATEUR";
  if (lower === "responsable" || s === "RESPONSABLE") return "RESPONSABLE";
  if (lower === "responsable niveau 2" || s === "RESPONSABLE_N2") return "responsable niveau 2";
  if (lower === "administrateur" || s === "ADMINISTRATEUR") return "ADMINISTRATEUR";
  return null;
}

type DbRole = "COLLABORATEUR" | "RESPONSABLE" | "responsable niveau 2" | "ADMINISTRATEUR";

function json(data: unknown, init?: ResponseInit) {
  const origin = (init?.headers as Record<string, string> | undefined)?.Origin ?? null;
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
      ...(init?.headers ?? {}),
    },
  });
}

function badRequest(message: string) {
  return json({ error: message }, { status: 400 });
}

function unauthorized(message = "Unauthorized") {
  return json({ error: message }, { status: 401 });
}

function forbidden(message = "Forbidden") {
  return json({ error: message }, { status: 403 });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders(origin),
    });
  }

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
    return json({ error: "Server misconfigured" }, { status: 500 });
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
    return json({ error: profileError.message }, { status: 500 });
  }

  const callerRole = normalizeRole(callerProfile?.role) as DbRole | null;
  if (callerRole !== "ADMINISTRATEUR") {
    return forbidden("Only administrateur can create users");
  }

  let payload: CreateUserRequest;
  try {
    payload = (await req.json()) as CreateUserRequest;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const username = (payload.username ?? "").toString().trim().toLowerCase();
  const password = (payload.password ?? "").toString();
  const nextRole = normalizeRole(payload.role) as DbRole | null;

  if (!username) return badRequest("username is required");
  if (!password || password.length < 6) return badRequest("password must be at least 6 characters");
  if (!nextRole) {
    return badRequest("Invalid role");
  }

  const email = `${username}@asa.local`;

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });

  if (createError || !created?.user) {
    return json({ error: createError?.message ?? "Failed to create user" }, { status: 500 });
  }

  const newUserId = created.user.id;
  const matricule = payload.matricule ?? null;
  const nomComplet = payload.nom_complet ?? null;

  const { error: upsertError } = await adminClient
    .from("profiles")
    .upsert(
      {
        id: newUserId,
        username,
        matricule,
        nom_complet: nomComplet,
        role: nextRole,
      },
      { onConflict: "id" },
    );

  if (upsertError) {
    return json(
      { error: upsertError.message, user_id: newUserId, email },
      { status: 500 },
    );
  }

  return json({ user_id: newUserId, email, username });
});
