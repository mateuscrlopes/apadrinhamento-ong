-- Arquivamento reversível de perfis e interesses, sem alterar a situação.
-- Aplicar somente no projeto ONG - Apadrinhamento.
begin;

alter table public.criancas
  add column if not exists arquivado_em timestamptz;

alter table public.solicitacoes
  add column if not exists arquivado_em timestamptz;

-- Impede que alguém registre interesse num perfil arquivado mesmo que
-- tenha guardado o UUID antes de ele desaparecer da vitrine pública.
create or replace function public.registrar_interesse(
  p_crianca_id uuid,
  p_nome text,
  p_telefone text,
  p_email text,
  p_autorizou_contato boolean
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_crianca public.criancas%rowtype;
  v_id uuid;
begin
  if p_autorizou_contato is distinct from true
     or char_length(trim(coalesce(p_nome,''))) not between 3 and 120
     or char_length(regexp_replace(coalesce(p_telefone,''), '[^0-9]', '', 'g')) not between 10 and 13
     or (nullif(trim(coalesce(p_email,'')), '') is not null
         and (char_length(p_email) > 180 or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
  then
    raise exception 'DADOS_INVALIDOS' using errcode = 'P0001';
  end if;

  select * into v_crianca
  from public.criancas where id = p_crianca_id for update;

  if not found or not v_crianca.ativo or not v_crianca.publicacao_autorizada
     or v_crianca.arquivado_em is not null
     or v_crianca.situacao <> 'disponivel' then
    raise exception 'PERFIL_INDISPONIVEL' using errcode = 'P0001';
  end if;

  insert into public.solicitacoes
    (crianca_id, nome_padrinho, telefone, email, autorizou_contato)
  values
    (p_crianca_id, trim(p_nome), trim(p_telefone),
     nullif(trim(coalesce(p_email,'')), ''), true)
  returning id into v_id;

  update public.criancas set situacao = 'em_contato', atualizado_em = now()
  where id = p_crianca_id;
  return v_id;
end;
$$;

revoke all on function public.registrar_interesse(uuid,text,text,text,boolean)
  from public, anon, authenticated;
grant execute on function public.registrar_interesse(uuid,text,text,text,boolean)
  to service_role;

commit;
