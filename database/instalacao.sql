-- Instalação inicial da campanha de apadrinhamento da ONG
-- Projeto: wsixoeonopxejapfxjms
-- IMPORTANTE: não executar no LifeOS ou no Nordestrip.
-- Banco destinado a dados reais: use somente informações autorizadas pela ONG.
begin;

create table if not exists public.criancas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (char_length(codigo) between 2 and 30),
  nome_exibicao text check (nome_exibicao is null or char_length(nome_exibicao) <= 80),
  idade integer not null check (idade between 0 and 17),
  tamanho_roupa text not null check (char_length(tamanho_roupa) between 1 and 20),
  tamanho_calcado text not null check (char_length(tamanho_calcado) between 1 and 20),
  foto_url text check (foto_url is null or foto_url ~ '^https://'),
  publicacao_autorizada boolean not null default false,
  ativo boolean not null default true,
  ordem integer not null default 0,
  situacao text not null default 'disponivel'
    check (situacao in ('disponivel', 'em_contato', 'confirmado')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.solicitacoes (
  id uuid primary key default gen_random_uuid(),
  crianca_id uuid not null references public.criancas(id),
  nome_padrinho text not null check (char_length(nome_padrinho) between 3 and 120),
  telefone text not null check (char_length(telefone) between 10 and 22),
  email text check (email is null or char_length(email) <= 180),
  autorizou_contato boolean not null check (autorizou_contato),
  situacao text not null default 'em_contato'
    check (situacao in ('em_contato','confirmado','cancelado')),
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

-- Defesa adicional, mesmo que duas solicitações cheguem no mesmo instante.
create unique index if not exists uma_solicitacao_ativa_por_crianca
  on public.solicitacoes(crianca_id)
  where situacao in ('em_contato','confirmado');
create index if not exists idx_solicitacoes_criada_em
  on public.solicitacoes(criada_em desc);

create table if not exists public.equipe_ong (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  papel text not null default 'operador'
    check (papel in ('administrador','operador')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Bloquear acesso direto a todas as tabelas pela API pública.
alter table public.criancas enable row level security;
alter table public.solicitacoes enable row level security;
alter table public.equipe_ong enable row level security;
revoke all on table public.criancas, public.solicitacoes, public.equipe_ong
  from public, anon, authenticated;
grant all on table public.criancas, public.solicitacoes, public.equipe_ong
  to service_role;

-- Reserva atômica: verificação e criação dentro da mesma transação.
-- Função privilegiada propositalmente restrita ao service_role; o navegador NÃO pode invocá-la.
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

-- Transição atômica de situação, com histórico preservado.
create or replace function public.atualizar_solicitacao(
  p_solicitacao_id uuid,
  p_nova_situacao text
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_solicitacao public.solicitacoes%rowtype;
begin
  if p_nova_situacao not in ('confirmado','cancelado') then
    raise exception 'TRANSICAO_INVALIDA' using errcode = 'P0001';
  end if;
  select * into v_solicitacao from public.solicitacoes
    where id = p_solicitacao_id for update;
  if not found or v_solicitacao.situacao = 'cancelado' then
    raise exception 'SOLICITACAO_INDISPONIVEL' using errcode = 'P0001';
  end if;
  if v_solicitacao.situacao = 'confirmado' and p_nova_situacao = 'confirmado' then
    return;
  end if;

  update public.solicitacoes
    set situacao = p_nova_situacao, atualizada_em = now()
    where id = p_solicitacao_id;

  update public.criancas set
    situacao = case when p_nova_situacao = 'cancelado' then 'disponivel' else 'confirmado' end,
    atualizado_em = now()
    where id = v_solicitacao.crianca_id;
end;
$$;

-- PostgreSQL concede EXECUTE a PUBLIC por padrão: revogar explicitamente.
revoke all on function public.registrar_interesse(uuid,text,text,text,boolean)
  from public, anon, authenticated;
revoke all on function public.atualizar_solicitacao(uuid,text)
  from public, anon, authenticated;
grant execute on function public.registrar_interesse(uuid,text,text,text,boolean)
  to service_role;
grant execute on function public.atualizar_solicitacao(uuid,text)
  to service_role;

commit;
