# Campanha de Apadrinhamento — ONG

Sistema independente da campanha de apadrinhamento, hospedado pelo GitHub Pages e preparado para incorporação no Wix da ONG. **Projeto real, ainda em configuração:** não divulgar para interessados até concluir a homologação.

## Onde acessar

- [Vitrine pública](https://mateuscrlopes.github.io/apadrinhamento-ong/)
- [Área de gestão](https://mateuscrlopes.github.io/apadrinhamento-ong/admin.html)
- [Projeto Supabase institucional](https://supabase.com/dashboard/project/wsixoeonopxejapfxjms)
- [Verificações da API no GitHub Actions](https://github.com/mateuscrlopes/apadrinhamento-ong/actions)

## O que está instalado

- [x] Banco `criancas`, `solicitacoes` e `equipe_ong`, com RLS habilitado e acesso público às tabelas revogado.
- [x] Reserva atômica, evitando interesse duplicado pelo mesmo perfil.
- [x] Função `campanha-publica` publicada, com leitura de perfis autorizados e validação do Turnstile no registro de interesse.
- [x] Função `campanha-admin` publicada, com validação de JWT e lista de autorizados em `equipe_ong`.
- [x] Vitrine e formulário em `index.html`.
- [x] Painel `admin.html`: login, inclusão e alteração de perfis, consulta e confirmação/cancelamento de solicitações.
- [x] Teste automatizado de consulta pública e negação de acesso administrativo sem autenticação.
- [ ] Cadastrar primeiro usuário autorizado em Supabase Auth e autorizar seu acesso administrativo.
- [ ] Configurar Cloudflare Turnstile (chave pública no frontend e segredo exclusivamente no Supabase).
- [ ] Homologar fluxo completo pelo navegador: login, cadastro, apadrinhamento, confirmação e liberação.
- [ ] Acrescentar envio de e-mail institucional para novas solicitações e histórico das notificações.
- [ ] Construir envio de fotos autorizado diretamente pelo painel (atualmente aceita somente URL HTTPS de imagem).
- [ ] Aprovar aviso de privacidade, dados e fotografias; inserir somente perfis reais autorizados.
- [ ] Incorporar a vitrine ao Wix e testar dispositivos móveis.

## Como cadastrar o primeiro administrador

A autorização para acessar o dashboard precisa existir em **duas camadas**: usuário em Supabase Auth e vínculo ativo na tabela `equipe_ong`.

1. Entre no [Supabase institucional](https://supabase.com/dashboard/project/wsixoeonopxejapfxjms).
2. Em **Authentication → Users**, use **Add user / Invite user** para cadastrar o e-mail institucional autorizado. Não crie contas com senhas compartilhadas.
3. Após o usuário aparecer em Authentication, abra **SQL Editor** neste MESMO projeto e execute o SQL abaixo, substituindo o endereço pelo e-mail cadastrado:

```sql
insert into public.equipe_ong (usuario_id, papel, ativo)
select id, 'administrador', true
from auth.users
where lower(email) = lower('EMAIL_DA_PESSOA_AUTORIZADA@ONG.ORG')
on conflict (usuario_id) do update
  set papel = excluded.papel, ativo = true;
```

4. No SQL Editor, confirme o registro com:

```sql
select e.usuario_id, e.papel, e.ativo
from public.equipe_ong e;
```

5. A pessoa já convidada pode abrir o [painel administrativo](https://mateuscrlopes.github.io/apadrinhamento-ong/admin.html) e entrar com e-mail e senha do Supabase Auth.
6. **Importante:** acesso de administrador autoriza cadastrar perfis com dados sensíveis. A ONG deve revisar quem possui essa autorização.

## Ativar o apadrinhamento público

A vitrine consulta a API e exibe apenas `ativo=true` e `publicacao_autorizada=true`. O recebimento de solicitações está intencionalmente **desligado** em `js/config.js` (`submissionsEnabled:false`).

Antes de ligar:

1. Criar o widget Cloudflare Turnstile para `mateuscrlopes.github.io` (action `apadrinhar`).
2. Configurar o **secret** `CLOUDFLARE_TURNSTILE_SECRET_KEY` em Supabase → Edge Functions → Secrets. Jamais incluí-lo no GitHub.
3. Preencher `turnstileSiteKey` com **chave pública** no `js/config.js`.
4. Testar que uma solicitação é criada e bloqueia o perfil, e que a segunda falha (HTTP 409), além dos casos de erro de captcha.
5. Só depois definir `submissionsEnabled:true` em `js/config.js`.

## Estrutura

- `index.html`: vitrine.
- `admin.html`: gestão protegida.
- `js/config.js`: configuração **pública**.
- `database/instalacao.sql`: estrutura inicial (já executada neste projeto; não reexecutar em outros bancos).
- `supabase/functions/campanha-publica/index.ts`: API pública, Turnstile e reserva atômica.
- `supabase/functions/campanha-admin/index.ts`: API protegida para gestão.
- `supabase/config.toml`: declara verificação de JWT feita no próprio serviço.
- `.github/workflows/verificar-api.yml`: testes de consulta pública e bloqueio de acesso administrativo.

## Segurança e privacidade

- O GitHub é **público**. Não gravar dados pessoais, senhas, tokens ou chaves privilegiadas nele.
- A chave de API **publicável** do Supabase no frontend não é segredo; segurança depende das regras RLS e das checagens de autorização no servidor.
- A lista de interessados, seus contatos e os perfis não publicados não são acessíveis sem login de membro da equipe.
- Não incluir sobrenomes completos, endereços, instituições de ensino ou fotografias sem autorização apropriada.
- A ONG precisa definir aviso de privacidade, conservação e exclusão de dados e colaboradores com acesso.
