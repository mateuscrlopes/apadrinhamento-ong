-- Migração aplicada no Supabase institucional da ONG.
-- O endereço de destino NÃO deve ser gravado neste repositório público.
-- Alterar o destinatário depois pelo SQL Editor ou painel de gestão,
-- mantendo as permissões de acesso restritas no banco.
create table if not exists public.configuracoes_email (
  id smallint primary key default 1 check (id = 1),
  destinatario text not null check (char_length(destinatario) between 5 and 180 and destinatario ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  habilitado boolean not null default false,
  atualizado_em timestamptz not null default now()
);
create table if not exists public.notificacoes_email (
  solicitacao_id uuid primary key references public.solicitacoes(id) on delete cascade,
  situacao text not null default 'pendente'
    check (situacao in ('pendente','enviada','falha')),
  tentativas smallint not null default 0 check (tentativas between 0 and 20),
  ultimo_erro text,
  mensagem_provedor_id text,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  enviada_em timestamptz
);
create index if not exists notificacoes_email_pendentes_idx
 on public.notificacoes_email(situacao,criada_em);
alter table public.configuracoes_email enable row level security;
alter table public.notificacoes_email enable row level security;
revoke all on public.configuracoes_email, public.notificacoes_email
 from public, anon, authenticated;
grant all on public.configuracoes_email, public.notificacoes_email to service_role;

create or replace function public.enfileirar_notificacao_email()
returns trigger
language plpgsql security invoker
set search_path = ''
as $$
begin
  insert into public.notificacoes_email(solicitacao_id)
  values (new.id)
  on conflict(solicitacao_id) do nothing;
  return new;
end;
$$;
revoke all on function public.enfileirar_notificacao_email()
from public, anon, authenticated;
grant execute on function public.enfileirar_notificacao_email() to service_role;
drop trigger if exists solicitacao_gera_notificacao on public.solicitacoes;
create trigger solicitacao_gera_notificacao
after insert on public.solicitacoes
for each row execute function public.enfileirar_notificacao_email();
