// Área administrativa da campanha de apadrinhamento.
// Mesmo com verify_jwt=false na implantação, TODAS as operações (inclusive GET)
// exigem JWT válido do Supabase Auth e vínculo ativo em equipe_ong.
// Esta função não aceita chave service_role do navegador.
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const SITE_ORIGIN = "https://mateuscrlopes.github.io";
const URL = Deno.env.get("SUPABASE_URL") ?? "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(URL, KEY, { auth: { persistSession:false, autoRefreshToken:false } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const states = ["em_contato","confirmado","cancelado"];
const cors=(origin:string|null)=>({
  "Access-Control-Allow-Origin":origin===SITE_ORIGIN?SITE_ORIGIN:SITE_ORIGIN,
  "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
  "Cache-Control":"no-store",
  "Vary":"Origin",
});
function send(body:Record<string,unknown>,status:number,origin:string|null) {
  return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8",...cors(origin)}});
}
const str=(value:unknown,max:number)=>typeof value==="string"&&value.length<=max?value.trim():null;
const optional=(value:unknown,max:number)=>value===null||value===undefined||value===""?null:str(value,max);
const validSize=(v:unknown)=>typeof v==="string"&&v.trim().length>=1&&v.trim().length<=20;

function validProfile(input:unknown) {
  if(!input||typeof input!=="object")return null;
  const p=input as Record<string,unknown>;
  const codigo=str(p.codigo,30),nome=optional(p.nome_exibicao,80);
  const idade=p.idade,roupa=str(p.tamanho_roupa,20),calcado=str(p.tamanho_calcado,20);
  const foto=optional(p.foto_url,1500);
  const publicado=p.publicacao_autorizada,ativo=p.ativo;
  const ordem=p.ordem;
  if(!codigo||codigo.length<2||!Number.isInteger(idade)||Number(idade)<0||Number(idade)>17
    ||!validSize(roupa)||!validSize(calcado)||typeof publicado!=="boolean"
    ||typeof ativo!=="boolean"||!Number.isInteger(ordem)||Math.abs(Number(ordem))>1000000
    ||(foto!==null&&!/^https:\/\/[^ ]+$/i.test(foto))
    ||(p.nome_exibicao!=null&&nome===null))return null;
  return {
    codigo,nome_exibicao:nome,idade:Number(idade),tamanho_roupa:roupa,
    tamanho_calcado:calcado,foto_url:foto,
    publicacao_autorizada:publicado,ativo,ordem:Number(ordem),
    atualizado_em:new Date().toISOString(),
  };
}
Deno.serve(async(req)=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
  if(origin&&origin!==SITE_ORIGIN)return send({mensagem:"Origem não autorizada."},403,origin);
  if(!URL||!KEY)return send({mensagem:"Serviço indisponível."},503,origin);
  const token=req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]??"";
  if(!token)return send({mensagem:"Autenticação necessária."},401,origin);
  const {data:{user},error:authError}=await admin.auth.getUser(token);
  if(authError||!user)return send({mensagem:"Sessão expirada. Entre novamente."},401,origin);
  const {data:team,error:teamError}=await admin.from("equipe_ong")
    .select("papel,ativo").eq("usuario_id",user.id).maybeSingle();
  if(teamError||!team||team.ativo!==true)return send({mensagem:"Acesso não autorizado para este usuário."},403,origin);

  if(req.method==="GET") {
    const [children,requests]=await Promise.all([
      admin.from("criancas").select("id,codigo,nome_exibicao,idade,tamanho_roupa,tamanho_calcado,foto_url,ativo,publicacao_autorizada,ordem,situacao").order("ordem",{ascending:true}).order("codigo").limit(500),
      admin.from("solicitacoes").select("id,crianca_id,nome_padrinho,telefone,email,situacao,criada_em,atualizada_em").order("criada_em",{ascending:false}).limit(1000)
    ]);
    if(children.error||requests.error)return send({mensagem:"Não foi possível carregar a gestão."},500,origin);
    return send({criancas:children.data??[],solicitacoes:requests.data??[],papel:team.papel},200,origin);
  }
  if(req.method!=="POST")return send({mensagem:"Método não permitido."},405,origin);
  const length=Number(req.headers.get("content-length")??0);
  if(length>25000)return send({mensagem:"Arquivo enviado muito grande."},413,origin);
  if(!(req.headers.get("content-type")??"").startsWith("application/json"))return send({mensagem:"Formato inválido."},415,origin);
  let body:Record<string,unknown>;
  try { body=await req.json(); if(!body||Array.isArray(body)||typeof body!=="object")throw Error(); }
  catch{return send({mensagem:"Dados inválidos."},400,origin);}

  if(body.acao==="salvar_crianca"){
    if(team.papel!=="administrador")return send({mensagem:"Operação restrita à administração."},403,origin);
    const profile=validProfile(body.perfil);
    if(!profile)return send({mensagem:"Revise os campos do perfil."},400,origin);
    let q;
    if(body.id){
      if(typeof body.id!=="string"||!uuid.test(body.id))return send({mensagem:"Identificador inválido."},400,origin);
      q=admin.from("criancas").update(profile).eq("id",body.id).select("id").single();
    }else q=admin.from("criancas").insert(profile).select("id").single();
    const {data,error}=await q;
    if(error)return send({mensagem:error.code==="23505"?"O código do perfil já existe.":"Não foi possível salvar o perfil."},409,origin);
    return send({sucesso:true,id:data?.id},200,origin);
  }
  if(body.acao==="atualizar_solicitacao"){
    if(typeof body.id!=="string"||!uuid.test(body.id)
      ||!["confirmado","cancelado"].includes(String(body.situacao))){
      return send({mensagem:"Solicitação ou situação inválida."},400,origin);
    }
    const {error}=await admin.rpc("atualizar_solicitacao",{
      p_solicitacao_id:body.id,p_nova_situacao:body.situacao,
    });
    if(error)return send({mensagem:"Não foi possível alterar a solicitação."},409,origin);
    return send({sucesso:true},200,origin);
  }
  return send({mensagem:"Ação não reconhecida."},400,origin);
});
