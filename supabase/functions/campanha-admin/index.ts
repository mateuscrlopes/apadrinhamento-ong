// Área administrativa da campanha de apadrinhamento.
// Mesmo com verify_jwt=false na implantação, TODAS as operações (inclusive GET)
// exigem JWT válido do Supabase Auth e vínculo ativo em equipe_ong.
// Esta função não aceita chave service_role do navegador.
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const SITE_ORIGIN = "https://mateuscrlopes.github.io";
const INVITE_URL = `${SITE_ORIGIN}/apadrinhamento-ong/convite.html`;
const URL = Deno.env.get("SUPABASE_URL") ?? "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(URL, KEY, { auth: { persistSession:false, autoRefreshToken:false } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = "fotos-criancas-ame";
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ??
  "Campanha de Apadrinhamento <onboarding@resend.dev>";
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
const validEmail=(v:unknown)=>typeof v==="string"&&v.length<=254&&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

function validProfile(input:unknown) {
  if(!input||typeof input!=="object")return null;
  const p=input as Record<string,unknown>;
  const codigo=str(p.codigo,30),nome=optional(p.nome_exibicao,80);
  const idade=p.idade,roupa=str(p.tamanho_roupa,20),calcado=str(p.tamanho_calcado,20);
  // Fotos enviadas pelo painel usam armazenamento privado. As fotos públicas
  // já importadas são preservadas quando a equipe altera os demais campos.
  const publicado=p.publicacao_autorizada,ativo=p.ativo;
  const ordem=p.ordem;
  if(!codigo||codigo.length<2||!Number.isInteger(idade)||Number(idade)<0||Number(idade)>17
    ||!validSize(roupa)||!validSize(calcado)||typeof publicado!=="boolean"
    ||typeof ativo!=="boolean"||!Number.isInteger(ordem)||Math.abs(Number(ordem))>1000000
    ||(p.nome_exibicao!=null&&nome===null))return null;
  return {
    codigo,nome_exibicao:nome,idade:Number(idade),tamanho_roupa:roupa,
    tamanho_calcado:calcado,
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
      admin.from("criancas").select("id,codigo,nome_exibicao,idade,tamanho_roupa,tamanho_calcado,foto_storage_path,foto_url,ativo,publicacao_autorizada,ordem,situacao,arquivado_em").order("ordem",{ascending:true}).order("codigo").limit(500),
      admin.from("solicitacoes").select("id,crianca_id,nome_padrinho,telefone,email,situacao,criada_em,atualizada_em,arquivado_em").order("criada_em",{ascending:false}).limit(1000)
    ]);
    if(children.error||requests.error)return send({mensagem:"Não foi possível carregar a gestão."},500,origin);
    // Links temporários somente após autenticação e verificação de membro ativo.
    const perfis = await Promise.all((children.data??[]).map(async(child)=>{
      const {foto_storage_path,foto_url:storedPhotoUrl,...fields}=child;
      let foto_url: string | null = null;
      if(foto_storage_path){
        const {data:signed}=await admin.storage.from(BUCKET).createSignedUrl(foto_storage_path,600);
        foto_url=signed?.signedUrl??null;
      } else if(typeof storedPhotoUrl==="string" &&
        /^https:\/\/mateuscrlopes\.github\.io\/apadrinhamento-ong\/assets\/perfis\/natal26-\d{2}\.webp$/.test(storedPhotoUrl)) {
        foto_url=storedPhotoUrl;
      }
      return {...fields,foto_url};
    }));
    let equipe: Array<Record<string,unknown>> | undefined;
    let pedidos_acesso: Array<Record<string,unknown>> | undefined;
    if(team.papel==="administrador"){
      const {data:members,error:membersError}=await admin.from("equipe_ong")
        .select("usuario_id,papel,ativo,criado_em").order("criado_em").limit(100);
      if(membersError)return send({mensagem:"Não foi possível carregar a equipe."},500,origin);
      const {data:registered,error:registeredError}=await admin.auth.admin.listUsers({page:1,perPage:1000});
      if(registeredError)return send({mensagem:"Não foi possível carregar os pedidos de acesso."},500,origin);
      const memberIds=new Set((members??[]).map(member=>member.usuario_id));
      // Metadata indica apenas que a pessoa pediu acesso; nunca dá permissão.
      // O acesso depende exclusivamente do vínculo ativo em equipe_ong.
      pedidos_acesso=(registered.users??[])
        .filter(account=>account.user_metadata?.ame_acesso_pendente===true&&!memberIds.has(account.id))
        .map(account=>({id:account.id,email:account.email??"E-mail indisponível",
          email_confirmado:!!account.email_confirmed_at,criado_em:account.created_at}));
      equipe=await Promise.all((members??[]).map(async(member)=>{
        const {data}=await admin.auth.admin.getUserById(member.usuario_id);
        return {email:data.user?.email??"E-mail indisponível",papel:member.papel,
          ativo:member.ativo,criado_em:member.criado_em};
      }));
    }
    return send({criancas:perfis,solicitacoes:requests.data??[],papel:team.papel,
      equipe,pedidos_acesso},200,origin);
  }
  if(req.method!=="POST")return send({mensagem:"Método não permitido."},405,origin);
  const contentType=(req.headers.get("content-type")??"").toLowerCase();
  const length=Number(req.headers.get("content-length")??0);

  // A foto pode ser enviada diretamente do painel sem tornar o bucket público.
  if(contentType.startsWith("multipart/form-data")){
    if(team.papel!=="administrador")
      return send({mensagem:"Somente administradores podem enviar fotografias."},403,origin);
    if(length>MAX_PHOTO_BYTES+100000)
      return send({mensagem:"Foto acima de 4 MB."},413,origin);

    let form:FormData;
    try { form=await req.formData(); }
    catch { return send({mensagem:"Envio de foto inválido."},400,origin); }
    if(form.get("acao")!=="enviar_foto")
      return send({mensagem:"Ação de envio inválida."},400,origin);
    const id=form.get("crianca_id"), foto=form.get("foto");
    if(typeof id!=="string"||!uuid.test(id)||!(foto instanceof File))
      return send({mensagem:"Selecione um perfil e uma fotografia válidos."},400,origin);
    if(foto.size<100 || foto.size>MAX_PHOTO_BYTES)
      return send({mensagem:"A fotografia deve ter no máximo 4 MB."},413,origin);

    const allowed:Record<string,string>={
      "image/jpeg":"jpg","image/png":"png","image/webp":"webp"
    };
    const extension=allowed[foto.type];
    if(!extension)return send({mensagem:"Use uma foto JPG, PNG ou WebP."},415,origin);
    const bytes=new Uint8Array(await foto.arrayBuffer());
    const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
    const webp=bytes.length>=12&&
      String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&
      String.fromCharCode(...bytes.slice(8,12))==="WEBP";
    const valid=extension==="jpg"?jpg:extension==="png"?png:webp;
    if(!valid)return send({mensagem:"O arquivo não parece ser uma imagem válida."},415,origin);

    const {data:record,error:findError}=await admin.from("criancas")
      .select("id,foto_storage_path").eq("id",id).maybeSingle();
    if(findError||!record)return send({mensagem:"Perfil não encontrado."},404,origin);

    const path=id+"/"+crypto.randomUUID()+"."+extension;
    const {error:uploadError}=await admin.storage.from(BUCKET).upload(path,bytes,{
      contentType:foto.type,upsert:false,cacheControl:"300"
    });
    if(uploadError){
      console.error("Falha ao armazenar foto",uploadError.message);
      return send({mensagem:"Não foi possível armazenar a fotografia."},500,origin);
    }
    const {data:saved,error:saveError}=await admin.from("criancas")
      .update({foto_storage_path:path,foto_url:null,atualizado_em:new Date().toISOString()})
      .eq("id",id).select("id").maybeSingle();
    if(saveError||!saved){
      await admin.storage.from(BUCKET).remove([path]);
      return send({mensagem:"Foto enviada, mas não foi possível vinculá-la ao perfil."},500,origin);
    }
    if(record.foto_storage_path && record.foto_storage_path!==path){
      const {error:deleteOldError}=await admin.storage.from(BUCKET)
        .remove([record.foto_storage_path]);
      if(deleteOldError)console.error("Falha ao limpar foto substituída",deleteOldError.message);
    }
    return send({sucesso:true,mensagem:"Foto salva com segurança."},200,origin);
  }
  const jsonLength=Number(req.headers.get("content-length")??0);
  if(jsonLength>25000)return send({mensagem:"Solicitação muito grande."},413,origin);
  if(!(req.headers.get("content-type")??"").startsWith("application/json"))return send({mensagem:"Formato inválido."},415,origin);
  let body:Record<string,unknown>;
  try { body=await req.json(); if(!body||Array.isArray(body)||typeof body!=="object")throw Error(); }
  catch{return send({mensagem:"Dados inválidos."},400,origin);}

  if(body.acao==="aprovar_usuario"){
    if(team.papel!=="administrador")
      return send({mensagem:"Somente administradores podem aprovar acessos."},403,origin);
    if(typeof body.usuario_id!=="string"||!uuid.test(body.usuario_id)
      ||!["administrador","operador"].includes(String(body.papel)))
      return send({mensagem:"Usuário ou permissão inválidos."},400,origin);
    const {data:account,error:accountError}=await admin.auth.admin.getUserById(body.usuario_id);
    if(accountError||!account.user||account.user.user_metadata?.ame_acesso_pendente!==true)
      return send({mensagem:"Este usuário não possui um pedido de acesso válido."},404,origin);
    if(!account.user.email_confirmed_at)
      return send({mensagem:"A pessoa precisa confirmar o e-mail antes da aprovação."},409,origin);
    const {error:approveError}=await admin.from("equipe_ong").upsert({
      usuario_id:account.user.id,papel:body.papel,ativo:true
    },{onConflict:"usuario_id"});
    if(approveError)return send({mensagem:"Não foi possível aprovar este acesso."},500,origin);
    return send({sucesso:true,mensagem:"Acesso aprovado. A pessoa já pode entrar com a senha que criou."},200,origin);
  }

  // Somente administradores podem convidar integrantes. Cada pessoa define
  // sua própria senha em uma página de aceite; nenhuma senha passa pelo painel.
  if(body.acao==="convidar_usuario"){
    if(team.papel!=="administrador")
      return send({mensagem:"Somente administradores podem convidar usuários."},403,origin);
    if(!validEmail(body.email)||!["administrador","operador"].includes(String(body.papel)))
      return send({mensagem:"Informe um e-mail e uma permissão válidos."},400,origin);
    const email=(body.email as string).trim().toLowerCase();
    const papel=body.papel as "administrador"|"operador";
    // Se um convite anterior venceu, uma conta Auth pode já existir. Nesse
    // caso, um novo link individual permite terminar a ativação da senha.
    let linkType:"invite"|"magiclink"="invite";
    let {data:invitation,error:inviteError}=await admin.auth.admin.generateLink({type:"invite",email});
    if(inviteError&&/already|registered|exists/i.test(inviteError.message)){
      linkType="magiclink";
      const retry=await admin.auth.admin.generateLink({type:"magiclink",email});
      invitation=retry.data;
      inviteError=retry.error;
    }
    if(inviteError){
      console.error("Falha ao gerar convite",inviteError.message);
      return send({mensagem:"Não foi possível criar o convite. Tente novamente."},502,origin);
    }
    const userId=invitation.user?.id;
    const tokenHash=invitation.properties?.hashed_token;
    if(!userId||!tokenHash)return send({mensagem:"Não foi possível preparar o acesso."},502,origin);
    const {error:membershipError}=await admin.from("equipe_ong").upsert({
      usuario_id:userId,papel,ativo:true
    },{onConflict:"usuario_id"});
    if(membershipError){
      console.error("Falha ao vincular convite à equipe",membershipError.code);
      return send({mensagem:"A conta foi criada, mas não foi possível autorizar o acesso. Contate o administrador."},500,origin);
    }
    // O fragmento não é enviado ao servidor HTTP do GitHub Pages.
    const convite_link=`${INVITE_URL}#token_hash=${encodeURIComponent(tokenHash)}&type=${linkType}`;
    let enviado=false;
    if(RESEND_API_KEY){
      try{
        const response=await fetch("https://api.resend.com/emails",{
          method:"POST",
          headers:{"Authorization":"Bearer "+RESEND_API_KEY,"Content-Type":"application/json"},
          body:JSON.stringify({
            from:RESEND_FROM_EMAIL,to:[email],
            subject:"Convite para o painel da Campanha de Natal — AME",
            text:[
              "Olá!",
              "",
              "Você foi convidado(a) para acessar o painel da Campanha de Natal da AME.",
              "Use o link abaixo para escolher sua senha e ativar seu acesso:",
              convite_link,
              "",
              "Este convite é individual, temporário e deve ser usado apenas por você.",
              "Se não reconhece este convite, ignore esta mensagem."
            ].join("\n")
          }),
          signal:AbortSignal.timeout(10000)
        });
        enviado=response.ok;
        if(!response.ok)console.error("E-mail de convite não enviado",response.status);
      }catch(error){
        console.error("E-mail de convite indisponível",error instanceof Error?error.name:"Erro");
      }
    }
    return send({sucesso:true,convite_link,enviado,
      mensagem:enviado
        ?"Convite enviado. Você também pode copiar o link para compartilhar diretamente."
        :"Convite criado. Copie o link e encaminhe à pessoa convidada."},200,origin);
  }

  // Teste de envio restrito ao administrador; destinatário vem apenas do banco.
  // Uma tentativa a cada dois minutos evita e-mails repetidos por engano.
  if(body.acao==="enviar_email_teste"){
    if(team.papel!=="administrador")
      return send({mensagem:"Somente administradores podem testar e-mails."},403,origin);
    if(!RESEND_API_KEY)
      return send({mensagem:"RESEND_API_KEY ainda não está disponível no servidor."},503,origin);
    const cutoff=new Date(Date.now()-120000).toISOString();
    const {data:settings,error:settingsError}=await admin.from("configuracoes_email")
      .update({ultimo_teste_em:new Date().toISOString()})
      .eq("id",1).eq("habilitado",true)
      .or("ultimo_teste_em.is.null,ultimo_teste_em.lt."+cutoff)
      .select("destinatario").maybeSingle();
    if(settingsError)return send({mensagem:"Não foi possível consultar a configuração de e-mail."},500,origin);
    if(!settings)return send({mensagem:"Aguarde dois minutos para outro teste ou revise o destinatário configurado."},429,origin);
    let response:Response;
    try{
      response=await fetch("https://api.resend.com/emails",{
        method:"POST",
        headers:{"Authorization":"Bearer "+RESEND_API_KEY,"Content-Type":"application/json"},
        body:JSON.stringify({
          from:RESEND_FROM_EMAIL,
          to:[settings.destinatario],
          subject:"Teste de notificações — Campanha de Apadrinhamento",
          text:[
            "Olá!",
            "",
            "Este é um e-mail de teste do sistema de apadrinhamento da ONG.",
            "O serviço de notificações foi conectado ao endereço configurado.",
            "",
            "Nenhuma criança foi publicada e nenhuma solicitação de apadrinhamento foi criada para este teste.",
            "",
            "Painel administrativo:",
            "https://mateuscrlopes.github.io/apadrinhamento-ong/admin.html",
            "",
            "Mensagem automática de teste."
          ].join("\n")
        }),
        signal:AbortSignal.timeout(10000)
      });
    }catch(error){
      console.error("Erro na conexão com Resend",error instanceof Error?error.name:"Erro");
      return send({mensagem:"Não foi possível conectar ao serviço de e-mail. Tente novamente em dois minutos."},502,origin);
    }
    if(!response.ok){
      console.error("Resend rejeitou teste",response.status);
      const explanation=response.status===403||response.status===422
        ?"Confira se o destinatário corresponde à conta de teste do Resend e se o remetente está permitido."
        :"Confira a chave RESEND_API_KEY e os limites de envio do Resend.";
      return send({mensagem:"Resend retornou HTTP "+response.status+". "+explanation},502,origin);
    }
    return send({sucesso:true,mensagem:"O Resend aceitou o e-mail de teste. Confira sua caixa de entrada e spam."},200,origin);
  }
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
  if(body.acao==="definir_arquivamento"){
    const tipo=body.tipo;
    if((tipo!=="crianca"&&tipo!=="solicitacao")
      ||typeof body.id!=="string"||!uuid.test(body.id)
      ||typeof body.arquivado!=="boolean")
      return send({mensagem:"Escolha um registro e uma operação válidos."},400,origin);
    if(tipo==="crianca"&&team.papel!=="administrador")
      return send({mensagem:"Somente administradores podem arquivar perfis."},403,origin);
    // Não excluir nem alterar a situação do apadrinhamento: arquivamento é reversível.
    const tabela=tipo==="crianca"?"criancas":"solicitacoes";
    const {data,error}=await admin.from(tabela)
      .update({arquivado_em:body.arquivado?new Date().toISOString():null})
      .eq("id",body.id).select("id").maybeSingle();
    if(error)return send({mensagem:"Não foi possível alterar o arquivamento."},500,origin);
    if(!data)return send({mensagem:"Registro não encontrado."},404,origin);
    return send({sucesso:true},200,origin);
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
