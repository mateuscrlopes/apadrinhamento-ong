// Supabase Edge Function: campanha-publica
// Deploy with --no-verify-jwt because visitors are not authenticated.
// POST requires Cloudflare Turnstile verification; keep disabled until configured.
// Secret CLOUDFlARE_TURNSTILE_SECRET_KEY must be configured in Supabase.
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const SITE_ORIGIN = "https://mateuscrlopes.github.io";
const ADMIN_ORIGIN = SITE_ORIGIN;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TURNSTILE_SECRET = Deno.env.get("CLOUDFLARE_TURNSTILE_SECRET_KEY") ?? "";
const client = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function cors(origin: string | null) {
  const approved = origin === SITE_ORIGIN || origin === ADMIN_ORIGIN;
  return {
    "Access-Control-Allow-Origin": approved ? origin! : SITE_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}
function respond(body: Record<string, unknown>, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors(origin) },
  });
}
function safeString(value: unknown, max: number) {
  return typeof value === "string" && value.length <= max ? value.trim() : "";
}
async function validateTurnstile(token: string) {
  if (!TURNSTILE_SECRET || !token) return false;
  const params = new URLSearchParams();
  params.set("secret", TURNSTILE_SECRET);
  params.set("response", token);
  const request = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", body: params,
  });
  if (!request.ok) return false;
  const outcome = await request.json();
  return outcome.success === true
    && outcome.hostname === "mateuscrlopes.github.io"
    && outcome.action === "apadrinhar";
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (origin && origin !== SITE_ORIGIN) {
    return respond({ mensagem: "Origem não autorizada." }, 403, origin);
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return respond({ mensagem: "Serviço em preparação." }, 503, origin);
  }
  if (req.method === "GET") {
    const { data, error } = await client.from("criancas")
      .select("id,codigo,nome_exibicao,idade,tamanho_roupa,tamanho_calcado,foto_url,situacao")
      .eq("ativo", true).eq("publicacao_autorizada", true)
      .order("ordem", { ascending: true }).order("codigo", { ascending: true })
      .limit(500);
    if (error) {
      console.error("Consulta de perfis falhou", error.code);
      return respond({ mensagem: "Não foi possível carregar a campanha." }, 503, origin);
    }
    return respond({ perfis: data ?? [] }, 200, origin);
  }

  if (req.method !== "POST") return respond({ mensagem: "Método inválido." }, 405, origin);
  if (!TURNSTILE_SECRET) {
    return respond({ mensagem: "Inscrições temporariamente indisponíveis." }, 503, origin);
  }
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return respond({ mensagem: "Formato inválido." }, 415, origin);
  }
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > 8192) return respond({ mensagem: "Solicitação muito grande." }, 413, origin);

  try {
    const body = await req.json();
    if (!body || body.acao !== "solicitar" || typeof body !== "object") {
      return respond({ mensagem: "Solicitação inválida." }, 400, origin);
    }
    // Campo invisível de detecção de preenchimento automático por robôs.
    if (body.website) {
      return respond({ mensagem: "Solicitação inválida." }, 400, origin);
    }
    const id = safeString(body.crianca_id, 40);
    const nome = safeString(body.nome, 120);
    const telefone = safeString(body.telefone, 22);
    const email = safeString(body.email ?? "", 180);
    const token = safeString(body.turnstile_token, 2500);
    if (!/^[a-f0-9]{8}-[a-f0-9-]{27,36}$/i.test(id) ||
        nome.length < 3 || (telefone.replace(/\D/g, "").length < 10) ||
        body.autorizou_contato !== true || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return respond({ mensagem: "Confira os dados do formulário." }, 400, origin);
    }
    if (!await validateTurnstile(token)) {
      return respond({ mensagem: "Não foi possível validar a proteção do formulário. Tente novamente." }, 403, origin);
    }

    const { error } = await client.rpc("registrar_interesse", {
      p_crianca_id: id, p_nome: nome, p_telefone: telefone,
      p_email: email, p_autorizou_contato: true,
    });
    if (error) {
      if (String(error.message).includes("PERFIL_INDISPONIVEL") ||
          error.code === "23505") {
        return respond({ mensagem: "Este perfil já recebeu outro interesse. Escolha outro disponível." }, 409, origin);
      }
      if (String(error.message).includes("DADOS_INVALIDOS")) {
        return respond({ mensagem: "Confira os dados do formulário." }, 400, origin);
      }
      console.error("Falha ao registrar interesse", error.code);
      return respond({ mensagem: "Não conseguimos concluir a solicitação. Tente novamente." }, 500, origin);
    }
    return respond({ sucesso: true, mensagem: "Interesse registrado com sucesso." }, 201, origin);
  } catch (error) {
    console.error("Falha no processamento", error instanceof Error ? error.name : "unknown");
    return respond({ mensagem: "Não foi possível processar os dados enviados." }, 400, origin);
  }
});
