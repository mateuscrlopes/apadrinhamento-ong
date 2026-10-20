// Supabase Edge Function: campanha-publica
// Deploy with --no-verify-jwt because visitors are not authenticated.
// POST requires Cloudflare Turnstile verification; keep disabled until configured.
// Secret CLOUDFLARE_TURNSTILE_SECRET_KEY must be configured in Supabase.
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const SITE_ORIGIN = "https://mateuscrlopes.github.io";
const ADMIN_ORIGIN = SITE_ORIGIN;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TURNSTILE_SECRET = Deno.env.get("CLOUDFLARE_TURNSTILE_SECRET_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
// onboarding@resend.dev serve apenas para testes, e somente no e-mail da conta Resend.
// Em produção configurar RESEND_FROM_EMAIL com domínio remetente verificado.
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ??
  "Campanha de Apadrinhamento <onboarding@resend.dev>";
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


/**
 * Envia uma notificação somente após a reserva ter sido gravada no banco.
 * A fila foi criada atomicamente no INSERT da solicitação. O envio não
 * interfere no sucesso da reserva; falhas permanecem registradas para suporte.
 * Nunca inclui endereço de e-mail nem chaves de API no código público.
 */
async function notifyNewRequest(requestId: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.info("E-mail pendente: serviço de envio ainda não configurado.");
    return;
  }
  let attempted = false;
  try {
    const [settings, pending, request] = await Promise.all([
      client.from("configuracoes_email").select("destinatario,habilitado").eq("id",1).maybeSingle(),
      client.from("notificacoes_email").select("solicitacao_id,situacao,tentativas")
        .eq("solicitacao_id",requestId).maybeSingle(),
      client.from("solicitacoes")
        .select("id,nome_padrinho,telefone,email,crianca_id")
        .eq("id",requestId).maybeSingle(),
    ]);
    if (settings.error || pending.error || request.error) {
      console.error("Consulta de notificação falhou.");
      return;
    }
    if (!settings.data?.habilitado || !settings.data?.destinatario ||
        !pending.data || pending.data.situacao==="enviada" || !request.data) return;

    const {data:profile,error:profileError}=await client.from("criancas")
      .select("codigo,nome_exibicao").eq("id",request.data.crianca_id).maybeSingle();
    if (profileError || !profile) {
      console.error("Perfil da notificação não localizado.");
      return;
    }

    const details=[
      "Um novo interesse de apadrinhamento foi registrado na campanha da ONG.",
      "",
      "Perfil: "+(profile.nome_exibicao ? profile.nome_exibicao+" · " : "")+profile.codigo,
      "Interessado: "+request.data.nome_padrinho,
      "WhatsApp: "+request.data.telefone,
      "E-mail do interessado: "+(request.data.email||"Não informado"),
      "",
      "Abra o painel para acompanhar e confirmar o apadrinhamento:",
      "https://mateuscrlopes.github.io/apadrinhamento-ong/admin.html",
      "",
      "Mensagem automática da Campanha de Apadrinhamento."
    ].join("\n");

    attempted=true;
    const response=await fetch("https://api.resend.com/emails", {
      method:"POST",
      headers:{
        "Authorization":"Bearer "+RESEND_API_KEY,
        "Content-Type":"application/json",
        "Idempotency-Key":"ame-solicitacao-"+requestId,
      },
      body:JSON.stringify({
        from:RESEND_FROM_EMAIL,
        to:[settings.data.destinatario],
        subject:"Novo interesse de apadrinhamento — perfil "+profile.codigo,
        text:details,
      }),
      signal:AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      const status=response.status;
      console.error("Serviço de e-mail retornou HTTP "+status);
      await client.from("notificacoes_email")
        .update({situacao:"falha",tentativas:pending.data.tentativas+1,
          ultimo_erro:"RESEND_HTTP_"+status,atualizada_em:new Date().toISOString()})
        .eq("solicitacao_id",requestId);
      return;
    }
    const responseBody=await response.json();
    await client.from("notificacoes_email")
      .update({situacao:"enviada",tentativas:pending.data.tentativas+1,
        ultimo_erro:null,
        mensagem_provedor_id:typeof responseBody?.id==="string"?responseBody.id:null,
        atualizada_em:new Date().toISOString(),enviada_em:new Date().toISOString()})
      .eq("solicitacao_id",requestId);
    console.info("Notificação aceita pelo provedor de e-mail.");
  } catch (error) {
    console.error("Falha ao enviar notificação:",error instanceof Error?error.name:"erro");
    if (attempted) await client.from("notificacoes_email")
      .update({situacao:"falha",ultimo_erro:"FALHA_DE_CONEXAO",
        atualizada_em:new Date().toISOString()})
      .eq("solicitacao_id",requestId);
  }
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
      .select("id,codigo,nome_exibicao,idade,tamanho_roupa,tamanho_calcado,foto_storage_path,situacao")
      .eq("ativo", true).eq("publicacao_autorizada", true)
      .order("ordem", { ascending: true }).order("codigo", { ascending: true })
      .limit(500);
    if (error) {
      console.error("Consulta de perfis falhou", error.code);
      return respond({ mensagem: "Não foi possível carregar a campanha." }, 503, origin);
    }
    // Somente perfis publicados recebem links temporários para as fotos.
    // O bucket permanece privado, inclusive para os perfis ainda não publicados.
    const perfis = await Promise.all((data ?? []).map(async (profile) => {
      const { foto_storage_path, ...publicFields } = profile;
      let foto_url: string | null = null;
      if (foto_storage_path) {
        const { data: signed, error: signingError } = await client.storage
          .from("fotos-criancas-ame").createSignedUrl(foto_storage_path, 600);
        if (signingError) console.error("Falha ao assinar foto", signingError.message);
        foto_url = signed?.signedUrl ?? null;
      }
      return { ...publicFields, foto_url };
    }));
    return respond({ perfis }, 200, origin);
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

    const { data: requestId, error } = await client.rpc("registrar_interesse", {
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
    if (typeof requestId==="string") await notifyNewRequest(requestId);
    return respond({ sucesso: true, mensagem: "Interesse registrado com sucesso." }, 201, origin);
  } catch (error) {
    console.error("Falha no processamento", error instanceof Error ? error.name : "unknown");
    return respond({ mensagem: "Não foi possível processar os dados enviados." }, 400, origin);
  }
});
